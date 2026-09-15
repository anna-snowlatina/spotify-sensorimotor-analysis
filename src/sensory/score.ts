import { cleanTitle, type WordVectors } from './clean';

export type Norms = {
  dims: string[];
  words: WordVectors;
  mean: number[];
  sd: number[];
};

export type TrackScore = {
  id: string;
  title: string;
  rank: number;
  /** null if zero tokens matched */
  vector: number[] | null;
  matched: { token: string; lemma: string }[];
  unmatched: string[];
};

export type Coverage = {
  scoredTracks: number;
  totalTracks: number;
  matchedTokens: number;
  totalTokens: number;
  tokenShare: number;
};

function meanVector(vectors: number[][], dims: number): number[] {
  const sum = new Array<number>(dims).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dims; i++) sum[i] += v[i];
  }
  return sum.map((s) => s / vectors.length);
}

/** Mean of matched word vectors for one title. Null when nothing matched. */
export function scoreTrack(
  id: string,
  title: string,
  rank: number,
  norms: Pick<Norms, 'words' | 'dims'>,
): TrackScore {
  const { matched, unmatched } = cleanTitle(title, norms.words);
  const vector =
    matched.length === 0
      ? null
      : meanVector(
          matched.map((m) => norms.words[m.lemma]),
          norms.dims.length,
        );
  return { id, title, rank, vector, matched, unmatched };
}

export function scoreTracks(
  tracks: { id: string; name: string; rank: number }[],
  norms: Pick<Norms, 'words' | 'dims'>,
): TrackScore[] {
  return tracks.map((t) => scoreTrack(t.id, t.name, t.rank, norms));
}

/**
 * Mean of non-null track vectors. With rankWeighted, uses w = 1/sqrt(rank) as the weight
 * for each scored track instead of an unweighted mean. Null if nothing was scored.
 */
export function windowProfile(
  scores: TrackScore[],
  dims: number,
  rankWeighted = false,
): number[] | null {
  const scored = scores.filter((s): s is TrackScore & { vector: number[] } => s.vector !== null);
  if (scored.length === 0) return null;

  if (!rankWeighted) {
    return meanVector(
      scored.map((s) => s.vector),
      dims,
    );
  }

  const weights = scored.map((s) => 1 / Math.sqrt(s.rank));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const sum = new Array<number>(dims).fill(0);
  scored.forEach((s, i) => {
    for (let d = 0; d < dims; d++) sum[d] += s.vector[d] * weights[i];
  });
  return sum.map((v) => v / totalWeight);
}

export function windowCoverage(scores: TrackScore[]): Coverage {
  const scoredTracks = scores.filter((s) => s.vector !== null).length;
  const matchedTokens = scores.reduce((n, s) => n + s.matched.length, 0);
  const totalTokens = scores.reduce((n, s) => n + s.matched.length + s.unmatched.length, 0);
  return {
    scoredTracks,
    totalTracks: scores.length,
    matchedTokens,
    totalTokens,
    tokenShare: totalTokens === 0 ? 0 : matchedTokens / totalTokens,
  };
}
