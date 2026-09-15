import { useMemo } from 'react';
import type { TopData } from '../data/topItems';
import { scoreTracks, windowProfile, type Norms } from '../sensory/score';
import { zScore, minkowskiDistance } from '../sensory/stats';

/** Roughly the per-dimension deviation implied by a Minkowski(p=3) distance over `n` equal-sized diffs. */
function averagePerDimensionShift(distance: number, n: number): number {
  return distance / Math.cbrt(n);
}

function magnitudeLabel(avgShift: number): string {
  if (avgShift < 0.3) return 'a minimal shift';
  if (avgShift < 0.6) return 'a modest shift';
  if (avgShift < 1.0) return 'a noticeable shift';
  return 'a substantial shift';
}

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

  const avgShift = averagePerDimensionShift(result.distance, norms.dims.length);
  const magnitude = magnitudeLabel(avgShift);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Drift</h3>
      <p style={{ fontSize: 32, margin: '4px 0', color: 'var(--accent)', fontWeight: 700 }}>
        {result.distance.toFixed(2)}
      </p>
      <p style={{ fontSize: 13 }}>
        <strong>What this is:</strong> Drift is the distance between your short-term and long-term
        sensory profiles, aggregated across all 11 Lancaster dimensions using a Minkowski (p=3)
        distance — a variant of Euclidean distance that weights the biggest individual movers more
        heavily than a simple average would.
      </p>
      <p style={{ fontSize: 13 }}>
        <strong>Reading this score:</strong> {result.distance.toFixed(2)} works out to roughly{' '}
        {magnitude} — about {avgShift.toFixed(2)} standard deviations of average per-dimension
        change (as a reference, ±1 sd is a typical "meaningfully different" shift on one
        dimension). It moved most on{' '}
        {result.topMovers
          .map((m) => `${m.dim} (${m.diff >= 0 ? '+' : ''}${m.diff.toFixed(2)})`)
          .join(' and ')}
        , meaning your short-term titles lean {result.topMovers[0].diff >= 0 ? 'more' : 'less'}{' '}
        toward {result.topMovers[0].dim.toLowerCase()} than your long-term titles do.
      </p>
    </div>
  );
}
