// Generic k-means over number[][] points, with seeded k-means++ initialization.
// Deterministic for a given seed: same points + seed always produce the same clusters.

export type Cluster = {
  centroid: number[];
  /** indices into the input points array assigned to this cluster */
  memberIndices: number[];
};

/** mulberry32: small, fast, deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function squaredDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return sum;
}

function kMeansPlusPlusInit(points: number[][], k: number, rand: () => number): number[][] {
  const centroids: number[][] = [points[Math.floor(rand() * points.length)]];

  while (centroids.length < k) {
    const distances = points.map((p) => Math.min(...centroids.map((c) => squaredDistance(p, c))));
    const total = distances.reduce((a, b) => a + b, 0);
    if (total === 0) {
      // All remaining points coincide with existing centroids; pad with random picks.
      centroids.push(points[Math.floor(rand() * points.length)]);
      continue;
    }
    let target = rand() * total;
    let chosen = points[points.length - 1];
    for (let i = 0; i < points.length; i++) {
      target -= distances[i];
      if (target <= 0) {
        chosen = points[i];
        break;
      }
    }
    centroids.push(chosen);
  }

  return centroids;
}

function meanOf(points: number[][], dims: number): number[] {
  const sum = new Array<number>(dims).fill(0);
  for (const p of points) for (let i = 0; i < dims; i++) sum[i] += p[i];
  return sum.map((v) => v / points.length);
}

/**
 * Runs k-means for at most `maxIterations`, seeded deterministically so the same
 * points + seed always produce the same result.
 */
export function kMeans(points: number[][], k: number, seed: number, maxIterations = 10): Cluster[] {
  const dims = points[0]?.length ?? 0;
  const effectiveK = Math.min(k, points.length);
  const rand = mulberry32(seed);

  let centroids = kMeansPlusPlusInit(points, effectiveK, rand);
  let assignments = new Array<number>(points.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = squaredDistance(points[i], centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (assignments[i] !== best) changed = true;
      assignments[i] = best;
    }

    const grouped: number[][][] = Array.from({ length: centroids.length }, () => []);
    const groupedIndices: number[][] = Array.from({ length: centroids.length }, () => []);
    for (let i = 0; i < points.length; i++) {
      grouped[assignments[i]].push(points[i]);
      groupedIndices[assignments[i]].push(i);
    }

    centroids = centroids.map((old, c) => (grouped[c].length > 0 ? meanOf(grouped[c], dims) : old));

    if (!changed) break;
  }

  const finalGroups: number[][] = Array.from({ length: centroids.length }, () => []);
  for (let i = 0; i < points.length; i++) finalGroups[assignments[i]].push(i);

  return centroids.map((centroid, c) => ({ centroid, memberIndices: finalGroups[c] }));
}
