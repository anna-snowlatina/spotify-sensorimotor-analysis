import { WINDOWS, type Window } from '../data/topItems';
import { WINDOW_COLOR } from '../sensory/windowColors';

const SIZE = 340;
const CENTER = SIZE / 2;
const OUTER_R = 130;
const INNER_R = 20;
const PERCEPTUAL_COUNT = 6; // Auditory, Gustatory, Haptic, Interoceptive, Olfactory, Visual

type Props = {
  dims: string[];
  /** z-scored profile per window; null if that window had no scored tracks. */
  profiles: Record<Window, number[] | null>;
};

function angleFor(index: number, total: number): number {
  return -Math.PI / 2 + (index / total) * 2 * Math.PI;
}

function pointAt(angle: number, radius: number): [number, number] {
  return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)];
}

export function SensoryRadar({ dims, profiles }: Props) {
  const domainMax = Math.max(
    2,
    ...WINDOWS.flatMap((w) => profiles[w] ?? []).map((v) => Math.abs(v)),
  );

  function radiusFor(z: number): number {
    const clamped = Math.max(-domainMax, Math.min(domainMax, z));
    return INNER_R + ((clamped + domainMax) / (2 * domainMax)) * (OUTER_R - INNER_R);
  }
  const zeroRadius = radiusFor(0);

  const axisPoints = dims.map((_, i) => pointAt(angleFor(i, dims.length), OUTER_R));
  const zeroRingPoints = dims.map((_, i) => pointAt(angleFor(i, dims.length), zeroRadius));

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Sensory radar</h3>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ maxWidth: '100%', height: 'auto' }}>
        {/* zero ring */}
        <polygon
          points={zeroRingPoints.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="var(--border)"
          strokeDasharray="4,3"
        />
        <text x={CENTER + zeroRadius + 4} y={CENTER - 4} fontSize={10} fill="var(--text)">
          average English word
        </text>

        {/* axes */}
        {dims.map((dim, i) => {
          const [x, y] = axisPoints[i];
          const isGroupBoundary = i === PERCEPTUAL_COUNT - 1 || i === dims.length - 1;
          return (
            <g key={dim}>
              <line
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                stroke={isGroupBoundary ? 'var(--text)' : 'var(--border)'}
                strokeWidth={isGroupBoundary ? 1.5 : 1}
              />
              <text
                x={CENTER + (OUTER_R + 14) * Math.cos(angleFor(i, dims.length))}
                y={CENTER + (OUTER_R + 14) * Math.sin(angleFor(i, dims.length))}
                fontSize={11}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--text-h)"
              >
                {dim}
              </text>
            </g>
          );
        })}

        {/* divider between perceptual and action groups */}
        {(() => {
          const boundaryAngle =
            (angleFor(PERCEPTUAL_COUNT - 1, dims.length) + angleFor(PERCEPTUAL_COUNT, dims.length)) / 2;
          const [x1, y1] = pointAt(boundaryAngle, INNER_R);
          const [x2, y2] = pointAt(boundaryAngle, OUTER_R + 6);
          return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text)" strokeDasharray="2,4" opacity={0.5} />;
        })()}

        {/* window shapes */}
        {WINDOWS.map((w) => {
          const profile = profiles[w];
          if (!profile) return null;
          const points = profile.map((z, i) => pointAt(angleFor(i, dims.length), radiusFor(z)));
          return (
            <polygon
              key={w}
              points={points.map((p) => p.join(',')).join(' ')}
              fill={WINDOW_COLOR[w]}
              fillOpacity={0.12}
              stroke={WINDOW_COLOR[w]}
              strokeWidth={2}
            />
          );
        })}
      </svg>

      <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
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
            {!profiles[w] && ' (no data)'}
          </span>
        ))}
      </div>
    </div>
  );
}
