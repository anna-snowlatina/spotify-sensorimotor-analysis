import { useMemo, useState } from 'react';
import { scaleLinear } from 'd3';
import { WINDOWS, type TopData, type Window } from '../data/topItems';
import { scoreTracks, type Norms, type TrackScore } from '../sensory/score';
import { zScore, pca } from '../sensory/stats';
import { WINDOW_COLOR } from '../sensory/windowColors';

const WIDTH = 480;
const HEIGHT = 400;
const PAD = 32;

type PlottedTrack = {
  window: Window;
  score: TrackScore;
  x: number;
  y: number;
};

function topLoadingLabel(loading: number[], dims: string[]): string {
  const withIndex = loading.map((v, i) => ({ dim: dims[i], v }));
  withIndex.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  return withIndex
    .slice(0, 2)
    .map((d) => `${d.dim}${d.v >= 0 ? '+' : '−'}`)
    .join(', ');
}

/** The dimension with the strongest loading in the given direction (for describing a PC axis's poles). */
function polarityDim(loading: number[], dims: string[], positive: boolean): string {
  let bestIdx = 0;
  for (let i = 1; i < loading.length; i++) {
    if (positive ? loading[i] > loading[bestIdx] : loading[i] < loading[bestIdx]) bestIdx = i;
  }
  return dims[bestIdx];
}

/** Plain-language read of where a window's tracks sit on average in PCA space. */
function interpretWindowPosition(
  meanPc1: number,
  meanPc2: number,
  loadings: number[][],
  dims: string[],
): string {
  const NEAR = 0.2;
  const pc1Word =
    Math.abs(meanPc1) < NEAR ? 'near average on PC1' : `toward ${polarityDim(loadings[0], dims, meanPc1 > 0)} on PC1`;
  const pc2Word =
    Math.abs(meanPc2) < NEAR ? 'near average on PC2' : `toward ${polarityDim(loadings[1], dims, meanPc2 > 0)} on PC2`;
  return `tracks sit ${pc1Word} and ${pc2Word}, on average`;
}

export function SensoryScatter({ data, norms }: { data: TopData; norms: Norms }) {
  const [selected, setSelected] = useState<PlottedTrack | null>(null);

  const { points, pcaResult, windowMeans } = useMemo(() => {
    const entries: { window: Window; score: TrackScore }[] = [];
    for (const w of WINDOWS) {
      for (const score of scoreTracks(data[w].tracks, norms)) {
        if (score.vector) entries.push({ window: w, score });
      }
    }
    const zVectors = entries.map((e) => zScore(e.score.vector!, norms.mean, norms.sd));
    const result = pca(zVectors, 2);

    const xs = result.scores.map((s) => s[0]);
    const ys = result.scores.map((s) => s[1]);
    const xScale = scaleLinear()
      .domain([Math.min(...xs, -1), Math.max(...xs, 1)])
      .range([PAD, WIDTH - PAD]);
    const yScale = scaleLinear()
      .domain([Math.min(...ys, -1), Math.max(...ys, 1)])
      .range([HEIGHT - PAD, PAD]);

    const plotted: PlottedTrack[] = entries.map((e, i) => ({
      window: e.window,
      score: e.score,
      x: xScale(result.scores[i][0]),
      y: yScale(result.scores[i][1]),
    }));

    const windowMeans: Partial<Record<Window, { pc1: number; pc2: number }>> = {};
    for (const w of WINDOWS) {
      const indices = entries.map((e, i) => (e.window === w ? i : -1)).filter((i) => i >= 0);
      if (indices.length === 0) continue;
      windowMeans[w] = {
        pc1: indices.reduce((s, i) => s + result.scores[i][0], 0) / indices.length,
        pc2: indices.reduce((s, i) => s + result.scores[i][1], 0) / indices.length,
      };
    }

    return { points: plotted, pcaResult: result, windowMeans };
  }, [data, norms]);

  if (points.length === 0) {
    return (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Sensory scatter</h3>
        <p>No scored titles to plot.</p>
      </div>
    );
  }

  const pc1Label = `PC1: ${topLoadingLabel(pcaResult.loadings[0], norms.dims)}`;
  const pc2Label = `PC2: ${topLoadingLabel(pcaResult.loadings[1], norms.dims)}`;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Sensory scatter</h3>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ maxWidth: '100%', height: 'auto' }}>
          <line x1={PAD} y1={HEIGHT / 2} x2={WIDTH - PAD} y2={HEIGHT / 2} stroke="var(--border)" />
          <line x1={WIDTH / 2} y1={PAD} x2={WIDTH / 2} y2={HEIGHT - PAD} stroke="var(--border)" />
          <text x={WIDTH - PAD} y={HEIGHT / 2 - 6} textAnchor="end" fontSize={11} fill="var(--text)">
            {pc1Label}
          </text>
          <text x={WIDTH / 2 + 6} y={PAD + 4} fontSize={11} fill="var(--text)">
            {pc2Label}
          </text>

          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={selected === p ? 7 : 4}
              fill={WINDOW_COLOR[p.window]}
              opacity={0.75}
              stroke={selected === p ? 'var(--text-h)' : 'none'}
              strokeWidth={2}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelected(p)}
            />
          ))}
        </svg>

        <div style={{ flex: '1 1 200px', minWidth: 200, fontSize: 13 }}>
          <h4 style={{ margin: '0 0 4px' }}>What this shows</h4>
          <p style={{ margin: '0 0 4px' }}>
            Horizontal axis ({pc1Label}); vertical axis ({pc2Label}). Click a point for word-level
            detail.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {WINDOWS.map((w) => {
              const mean = windowMeans[w];
              return (
                <li key={w} style={{ marginBottom: 6 }}>
                  <span style={{ color: WINDOW_COLOR[w], fontWeight: 600 }}>{w.replace('_', ' ')}</span>
                  {': '}
                  {mean
                    ? interpretWindowPosition(mean.pc1, mean.pc2, pcaResult.loadings, norms.dims)
                    : 'no scored titles for this window.'}
                </li>
              );
            })}
          </ul>
        </div>

        {selected && (
          <div className="card" style={{ minWidth: 220, flex: '1 1 220px' }}>
            <button type="button" onClick={() => setSelected(null)} style={{ float: 'right' }}>
              ×
            </button>
            <h4 style={{ marginTop: 0 }}>{selected.score.title}</h4>
            <p style={{ fontSize: 12, color: 'var(--text)' }}>
              {selected.window.replace('_', ' ')} · rank #{selected.score.rank}
            </p>
            <p style={{ fontSize: 13 }}>Matched words and their biggest contributions:</p>
            <ul style={{ fontSize: 13, paddingLeft: 18 }}>
              {selected.score.matched.map((m) => {
                const vector = norms.words[m.lemma];
                const top = norms.dims
                  .map((dim, i) => ({ dim, v: vector[i] }))
                  .sort((a, b) => b.v - a.v)
                  .slice(0, 2);
                return (
                  <li key={m.token}>
                    {m.token} → {m.lemma}: {top.map((t) => `${t.dim} (${t.v.toFixed(1)})`).join(', ')}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: 13, marginTop: 8, flexWrap: 'wrap' }}>
        {WINDOWS.map((w) => (
          <span key={w} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                background: WINDOW_COLOR[w],
                display: 'inline-block',
              }}
            />
            {w.replace('_', ' ')}
          </span>
        ))}
      </div>
    </div>
  );
}
