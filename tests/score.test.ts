import { describe, it, expect } from 'vitest';
import { scoreTrack, scoreTracks, windowProfile, windowCoverage } from '../src/sensory/score';
import type { WordVectors } from '../src/sensory/clean';

const DIMS = 3;
const WORDS: WordVectors = {
  burn: [1, 2, 3],
  room: [3, 4, 5],
  fire: [9, 9, 9],
};

describe('scoreTrack', () => {
  it('averages matched word vectors', () => {
    const score = scoreTrack('t1', 'Burning Room', 1, { words: WORDS, dims: ['a', 'b', 'c'] });
    // burn=[1,2,3], room=[3,4,5] -> mean=[2,3,4]
    expect(score.vector).toEqual([2, 3, 4]);
  });

  it('returns null vector when nothing matches', () => {
    const score = scoreTrack('t2', 'Xyzzy', 1, { words: WORDS, dims: ['a', 'b', 'c'] });
    expect(score.vector).toBeNull();
  });
});

describe('windowProfile', () => {
  const scores = scoreTracks(
    [
      { id: 't1', name: 'Fire', rank: 1 },
      { id: 't2', name: 'Burning Room', rank: 4 },
      { id: 't3', name: 'Xyzzy', rank: 9 },
    ],
    { words: WORDS, dims: ['a', 'b', 'c'] },
  );

  it('averages non-null track vectors unweighted', () => {
    // fire=[9,9,9], burning room mean=[2,3,4] -> mean=[5.5,6,6.5]
    const profile = windowProfile(scores, DIMS, false);
    expect(profile).toEqual([5.5, 6, 6.5]);
  });

  it('applies rank weighting w=1/sqrt(rank) when enabled', () => {
    const w1 = 1 / Math.sqrt(1); // fire, rank 1
    const w2 = 1 / Math.sqrt(4); // burning room, rank 4
    const total = w1 + w2;
    const expected = [9, 9, 9].map((v, i) => (v * w1 + [2, 3, 4][i] * w2) / total);
    const profile = windowProfile(scores, DIMS, true);
    expect(profile).not.toBeNull();
    profile!.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 10));
  });

  it('returns null when no tracks score', () => {
    const noneScored = scoreTracks([{ id: 't1', name: 'Xyzzy', rank: 1 }], {
      words: WORDS,
      dims: ['a', 'b', 'c'],
    });
    expect(windowProfile(noneScored, DIMS)).toBeNull();
  });
});

describe('windowCoverage', () => {
  it('counts scored tracks and token share', () => {
    const scores = scoreTracks(
      [
        { id: 't1', name: 'Fire', rank: 1 }, // 1 matched token
        { id: 't2', name: 'Burning Room', rank: 2 }, // 2 matched tokens
        { id: 't3', name: 'Xyzzy Nonword', rank: 3 }, // 0 matched, 2 unmatched
      ],
      { words: WORDS, dims: ['a', 'b', 'c'] },
    );
    const coverage = windowCoverage(scores);
    expect(coverage.scoredTracks).toBe(2);
    expect(coverage.totalTracks).toBe(3);
    expect(coverage.matchedTokens).toBe(3);
    expect(coverage.totalTokens).toBe(5);
    expect(coverage.tokenShare).toBeCloseTo(3 / 5, 10);
  });
});
