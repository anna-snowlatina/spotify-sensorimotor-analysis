import { describe, it, expect } from 'vitest';
import { zScore, minkowskiDistance, pca } from '../src/sensory/stats';

describe('zScore', () => {
  it('matches hand-computed values', () => {
    // x=[5,10], mean=[3,10], sd=[2,5] -> z=[(5-3)/2, (10-10)/5] = [1, 0]
    expect(zScore([5, 10], [3, 10], [2, 5])).toEqual([1, 0]);
  });

  it('returns 0 when sd is 0 instead of dividing by zero', () => {
    expect(zScore([7], [3], [0])).toEqual([0]);
  });
});

describe('minkowskiDistance', () => {
  it('matches a hand-computed p=3 case', () => {
    // |1-4|=3, |2-6|=4 -> (3^3 + 4^3)^(1/3) = (27+64)^(1/3) = 91^(1/3)
    const expected = Math.cbrt(91);
    expect(minkowskiDistance([1, 2], [4, 6], 3)).toBeCloseTo(expected, 10);
  });

  it('is zero for identical vectors', () => {
    expect(minkowskiDistance([1, 2, 3], [1, 2, 3], 3)).toBe(0);
  });

  it('matches Euclidean distance when p=2', () => {
    // |3-0|=3, |4-0|=4 -> (9+16)^(1/2) = 5
    expect(minkowskiDistance([3, 4], [0, 0], 2)).toBeCloseTo(5, 10);
  });
});

describe('pca', () => {
  it('recovers the dominant axis of perfectly correlated 2D data', () => {
    // Points lie exactly on y = x, so PC1 should align with (1/sqrt2, 1/sqrt2) up to sign,
    // and should explain ~100% of variance (PC2 explains ~0%).
    const data = [
      [-2, -2],
      [-1, -1],
      [0, 0],
      [1, 1],
      [2, 2],
    ];
    const result = pca(data, 2);
    expect(result.explainedVarianceRatio[0]).toBeCloseTo(1, 5);
    expect(result.explainedVarianceRatio[1]).toBeCloseTo(0, 5);

    const [lx, ly] = result.loadings[0];
    expect(Math.abs(lx)).toBeCloseTo(Math.abs(ly), 5);
    expect(Math.abs(lx)).toBeCloseTo(1 / Math.sqrt(2), 5);
  });
});
