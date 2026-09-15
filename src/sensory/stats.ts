/** z = (x - mean) / sd, elementwise. sd of 0 maps to z of 0 rather than dividing by zero. */
export function zScore(x: number[], mean: number[], sd: number[]): number[] {
  return x.map((v, i) => (sd[i] === 0 ? 0 : (v - mean[i]) / sd[i]));
}

/** Minkowski distance of order p between two equal-length vectors. */
export function minkowskiDistance(a: number[], b: number[], p = 3): number {
  const sum = a.reduce((acc, v, i) => acc + Math.abs(v - b[i]) ** p, 0);
  return sum ** (1 / p);
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

function norm(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

function matVec(matrix: number[][], v: number[]): number[] {
  return matrix.map((row) => dot(row, v));
}

/** Covariance matrix (d x d) of centered rows (n observations x d dimensions). */
function covarianceMatrix(centered: number[][], d: number): number[][] {
  const n = centered.length;
  const cov: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (const row of centered) {
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        cov[i][j] += row[i] * row[j];
      }
    }
  }
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) cov[i][j] /= denom;
  return cov;
}

/** Dominant eigenvector/eigenvalue of a symmetric matrix via power iteration. */
function powerIteration(matrix: number[][], iterations = 200): { vector: number[]; eigenvalue: number } {
  const d = matrix.length;
  let v: number[] = new Array<number>(d).fill(0).map((_, i) => (i === 0 ? 1 : 0.01));
  for (let iter = 0; iter < iterations; iter++) {
    const next = matVec(matrix, v);
    const n = norm(next);
    if (n === 0) break;
    v = next.map((x) => x / n);
  }
  const mv = matVec(matrix, v);
  const eigenvalue = dot(v, mv);
  return { vector: v, eigenvalue };
}

/** Subtracts eigenvalue * (v outer v) from the matrix so the next power iteration finds the next component. */
function deflate(matrix: number[][], vector: number[], eigenvalue: number): number[][] {
  const d = matrix.length;
  const result: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      result[i][j] = matrix[i][j] - eigenvalue * vector[i] * vector[j];
    }
  }
  return result;
}

export type PcaResult = {
  /** One row per input observation, `components` columns. */
  scores: number[][];
  /** One row per component, one column per original dimension. */
  loadings: number[][];
  /** Fraction of total variance explained by each component. */
  explainedVarianceRatio: number[];
};

/** PCA via covariance matrix + power iteration with deflation (no external library). */
export function pca(data: number[][], components = 2): PcaResult {
  const n = data.length;
  const d = data[0]?.length ?? 0;
  if (n === 0 || d === 0) {
    return { scores: [], loadings: [], explainedVarianceRatio: [] };
  }

  const colMeans = new Array<number>(d).fill(0);
  for (const row of data) for (let i = 0; i < d; i++) colMeans[i] += row[i] / n;
  const centered = data.map((row) => row.map((v, i) => v - colMeans[i]));

  let cov = covarianceMatrix(centered, d);
  const totalVariance = cov.reduce((sum, row, i) => sum + row[i], 0);

  const loadings: number[][] = [];
  const eigenvalues: number[] = [];
  const k = Math.min(components, d);
  for (let c = 0; c < k; c++) {
    const { vector, eigenvalue } = powerIteration(cov);
    loadings.push(vector);
    eigenvalues.push(Math.max(0, eigenvalue));
    cov = deflate(cov, vector, eigenvalue);
  }

  const scores = centered.map((row) => loadings.map((vec) => dot(row, vec)));
  const explainedVarianceRatio = eigenvalues.map((e) => (totalVariance === 0 ? 0 : e / totalVariance));

  return { scores, loadings, explainedVarianceRatio };
}
