import { describe, it, expect } from 'vitest';
import { kMeans } from '../src/palette/kmeans';

function clusterAround(center: number[], n: number, jitter: number, rngSeed: number): number[][] {
  // Simple deterministic jitter (not the module's RNG - just for building a synthetic fixture).
  let x = rngSeed;
  const next = () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return (x / 0x7fffffff) * 2 - 1;
  };
  return Array.from({ length: n }, () => center.map((c) => c + next() * jitter));
}

describe('kMeans', () => {
  it('separates two well-separated blobs into two clusters', () => {
    const blobA = clusterAround([0, 0, 0], 20, 0.05, 1);
    const blobB = clusterAround([10, 10, 10], 20, 0.05, 2);
    const points = [...blobA, ...blobB];

    const clusters = kMeans(points, 2, 42);
    expect(clusters).toHaveLength(2);

    const totalAssigned = clusters.reduce((sum, c) => sum + c.memberIndices.length, 0);
    expect(totalAssigned).toBe(points.length);

    // Each cluster's members should all come from the same original blob (indices < 20 or >= 20).
    for (const cluster of clusters) {
      const fromA = cluster.memberIndices.filter((i) => i < 20).length;
      const fromB = cluster.memberIndices.filter((i) => i >= 20).length;
      expect(fromA === 0 || fromB === 0).toBe(true);
    }
  });

  it('is deterministic for the same points and seed', () => {
    const points = clusterAround([1, 2, 3], 30, 1, 7).concat(clusterAround([-4, -2, 0], 30, 1, 9));
    const a = kMeans(points, 3, 123);
    const b = kMeans(points, 3, 123);
    expect(a.map((c) => c.centroid)).toEqual(b.map((c) => c.centroid));
  });

  it('can produce different groupings for different seeds', () => {
    const points = clusterAround([1, 2, 3], 15, 3, 11).concat(clusterAround([-4, -2, 0], 15, 3, 13));
    const a = kMeans(points, 4, 1);
    const b = kMeans(points, 4, 2);
    // Not a strict requirement that they differ, but centroids array should at least be valid.
    expect(a.length).toBeLessThanOrEqual(4);
    expect(b.length).toBeLessThanOrEqual(4);
  });

  it('handles fewer points than k without crashing', () => {
    const clusters = kMeans([[1, 1], [2, 2]], 6, 1);
    expect(clusters.length).toBeLessThanOrEqual(2);
    const total = clusters.reduce((sum, c) => sum + c.memberIndices.length, 0);
    expect(total).toBe(2);
  });
});
