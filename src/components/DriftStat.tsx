import { useMemo } from 'react';
import type { TopData } from '../data/topItems';
import { scoreTracks, windowProfile, type Norms } from '../sensory/score';
import { zScore, minkowskiDistance } from '../sensory/stats';

export function DriftStat({ data, norms }: { data: TopData; norms: Norms }) {
  const result = useMemo(() => {
    const longScores = scoreTracks(data.long_term.tracks, norms);
    const shortScores = scoreTracks(data.short_term.tracks, norms);
    const longProfile = windowProfile(longScores, norms.dims.length);
    const shortProfile = windowProfile(shortScores, norms.dims.length);
    if (!longProfile || !shortProfile) return null;

    const longZ = zScore(longProfile, norms.mean, norms.sd);
    const shortZ = zScore(shortProfile, norms.mean, norms.sd);
    const distance = minkowskiDistance(shortZ, longZ, 3);

    const diffs = norms.dims.map((dim, i) => ({ dim, diff: shortZ[i] - longZ[i] }));
    diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const topMovers = diffs.slice(0, 2);

    return { distance, topMovers };
  }, [data, norms]);

  if (!result) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Drift</h3>
        <p>Not enough scored titles in both windows to compute drift.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Drift</h3>
      <p style={{ fontSize: 32, margin: '4px 0', color: 'var(--text-h)' }}>
        {result.distance.toFixed(2)}
      </p>
      <p style={{ fontSize: 13 }}>
        Minkowski distance (p=3) between the short-term and long-term sensory profiles across all
        11 dimensions. Moved most on:{' '}
        {result.topMovers
          .map((m) => `${m.dim} (${m.diff >= 0 ? '+' : ''}${m.diff.toFixed(2)})`)
          .join(', ')}
        .
      </p>
    </div>
  );
}
