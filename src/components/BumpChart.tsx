import { useMemo, useState } from 'react';
import { scaleLinear } from 'd3';
import type { RankedItem } from '../data/topItems';

export type BumpColumn = {
  key: string;
  label: string;
  artists: RankedItem[];
  tracks: RankedItem[];
};

type Mode = 'artists' | 'tracks';
type Category = 'stalwart' | 'newcomer' | 'faded' | 'other';

type ItemPoint = { columnKey: string; x: number; rank: number; y: number; item: RankedItem };

type PlottedItem = {
  id: string;
  name: string;
  category: Category;
  points: ItemPoint[];
  /** true if the item is absent from the last column after being present earlier */
  fadesOut: boolean;
};

const MARGIN = { top: 24, right: 60, bottom: 16, left: 24 };
const COLUMN_GAP = 260;
const ROW_HEIGHT = 22;
const IMG_SIZE = 20;
const STUB_LENGTH = 26;

const CATEGORY_COLOR: Record<Category, string> = {
  stalwart: '#1db954',
  newcomer: '#ff9f1c',
  faded: '#9aa0a6',
  other: '#6b6b6b',
};

/** stalwart = present in every column. newcomer = present only in the last column.
 *  faded = present in the first column, absent from the last. else other. */
function classify(presentIn: Set<string>, columnKeys: string[]): Category {
  if (presentIn.size === columnKeys.length) return 'stalwart';
  const first = columnKeys[0];
  const last = columnKeys[columnKeys.length - 1];
  if (presentIn.size === 1 && presentIn.has(last)) return 'newcomer';
  if (presentIn.has(first) && !presentIn.has(last)) return 'faded';
  return 'other';
}

function buildPlottedItems(
  columns: BumpColumn[],
  mode: Mode,
  displayLimit: number,
  yScale: (rank: number) => number,
  xForColumn: (key: string) => number,
): PlottedItem[] {
  const columnKeys = columns.map((c) => c.key);
  const byColumn = new Map<string, Map<string, RankedItem>>(
    columns.map((c) => [c.key, new Map(c[mode].map((i) => [i.id, i]))]),
  );

  const allIds = new Set<string>();
  for (const key of columnKeys) for (const id of byColumn.get(key)!.keys()) allIds.add(id);

  const plotted: PlottedItem[] = [];

  for (const id of allIds) {
    const presentIn = new Set<string>();
    let bestRank = Infinity;
    let name = '';
    for (const key of columnKeys) {
      const item = byColumn.get(key)!.get(id);
      if (item) {
        presentIn.add(key);
        bestRank = Math.min(bestRank, item.rank);
        name = item.name;
      }
    }
    if (bestRank > displayLimit) continue;

    const points: ItemPoint[] = columnKeys
      .filter((key) => byColumn.get(key)!.has(id))
      .map((key) => {
        const item = byColumn.get(key)!.get(id)!;
        return { columnKey: key, x: xForColumn(key), rank: item.rank, y: yScale(item.rank), item };
      });

    const category = classify(presentIn, columnKeys);
    const lastColumnKey = points[points.length - 1]?.columnKey;
    const fadesOut = lastColumnKey !== columnKeys[columnKeys.length - 1];

    plotted.push({ id, name, category, points, fadesOut });
  }

  // Draw stalwarts last (on top), muted items first.
  const order: Category[] = ['other', 'faded', 'newcomer', 'stalwart'];
  plotted.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  return plotted;
}

function pathFor(points: ItemPoint[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

function EndpointImage({ point, size }: { point: ItemPoint; size: number }) {
  const r = size / 2;
  if (point.item.imageUrl) {
    return (
      <image
        href={point.item.imageUrl}
        x={point.x - r}
        y={point.y - r}
        width={size}
        height={size}
        clipPath="url(#bump-circle-clip)"
      />
    );
  }
  return (
    <g>
      <circle cx={point.x} cy={point.y} r={r} fill="#444" />
      <text x={point.x} y={point.y} fontSize={size * 0.4} fill="#fff" textAnchor="middle" dominantBaseline="central">
        {initials(point.item.name)}
      </text>
    </g>
  );
}

export function BumpChart({
  columns,
  caption,
}: {
  columns: BumpColumn[];
  /** Optional caption shown under the header, e.g. the windows-overlap note. */
  caption?: string;
}) {
  const [mode, setMode] = useState<Mode>('artists');
  const [showAll, setShowAll] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const displayLimit = showAll ? 50 : 20;

  const width = MARGIN.left + MARGIN.right + COLUMN_GAP * (columns.length - 1);

  const xForColumn = (key: string) =>
    MARGIN.left + columns.findIndex((c) => c.key === key) * COLUMN_GAP;

  const plotted = useMemo(() => {
    // First pass to find the max rank we'll actually need to plot (may exceed displayLimit
    // when an item qualifies via one column but has a much worse rank in another).
    const maxRank = Math.max(
      displayLimit,
      ...columns.flatMap((c) => c[mode].filter((i) => i.rank <= displayLimit).map((i) => i.rank)),
    );
    const yScale = scaleLinear().domain([1, maxRank]).range([MARGIN.top, MARGIN.top + (maxRank - 1) * ROW_HEIGHT]);
    return buildPlottedItems(columns, mode, displayLimit, (rank) => yScale(rank), xForColumn);
  }, [columns, mode, displayLimit]);

  const maxY = plotted.length
    ? Math.max(...plotted.flatMap((p) => p.points.map((pt) => pt.y)))
    : MARGIN.top;
  const height = maxY + MARGIN.bottom + ROW_HEIGHT;

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <h2 style={{ margin: 0 }}>Bump chart</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            <input
              type="checkbox"
              checked={mode === 'tracks'}
              onChange={(e) => setMode(e.target.checked ? 'tracks' : 'artists')}
            />{' '}
            Show tracks (else artists)
          </label>
          <label>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />{' '}
            Show all 50 (else top 20)
          </label>
        </div>
      </div>

      {caption && <p style={{ fontSize: 13, color: 'var(--text)' }}>{caption}</p>}

      <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: 8, flexWrap: 'wrap' }}>
        {(Object.keys(CATEGORY_COLOR) as Category[]).map((cat) => (
          <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                background: CATEGORY_COLOR[cat],
                display: 'inline-block',
              }}
            />
            {cat}
          </span>
        ))}
      </div>

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: '100%', height: 'auto' }}>
        <defs>
          <clipPath id="bump-circle-clip">
            <circle cx={IMG_SIZE / 2} cy={IMG_SIZE / 2} r={IMG_SIZE / 2} />
          </clipPath>
          <linearGradient id="fade-gradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={CATEGORY_COLOR.faded} stopOpacity="0.8" />
            <stop offset="100%" stopColor={CATEGORY_COLOR.faded} stopOpacity="0" />
          </linearGradient>
        </defs>

        {columns.map((c) => (
          <text key={c.key} x={xForColumn(c.key)} y={14} textAnchor="middle" fontSize={13} fill="var(--text-h)">
            {c.label}
          </text>
        ))}

        {plotted.map((p) => {
          const isHovered = hoveredId === p.id;
          const isDimmed = hoveredId !== null && !isHovered;
          const color = CATEGORY_COLOR[p.category];
          const opacity = isDimmed ? 0.12 : p.category === 'other' ? 0.55 : 0.9;
          const strokeWidth = isHovered ? 3 : p.category === 'stalwart' ? 2.5 : 1.5;

          return (
            <g
              key={p.id}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: 'pointer' }}
            >
              {p.category === 'newcomer' && p.points.length > 0 && (
                <line
                  x1={p.points[0].x - STUB_LENGTH}
                  y1={p.points[0].y}
                  x2={p.points[0].x}
                  y2={p.points[0].y}
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeDasharray="3,3"
                  opacity={opacity}
                />
              )}

              <path d={pathFor(p.points)} fill="none" stroke={color} strokeWidth={strokeWidth} opacity={opacity} />

              {p.fadesOut && p.points.length > 0 && (
                <line
                  x1={p.points[p.points.length - 1].x}
                  y1={p.points[p.points.length - 1].y}
                  x2={p.points[p.points.length - 1].x + STUB_LENGTH}
                  y2={p.points[p.points.length - 1].y}
                  stroke="url(#fade-gradient)"
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                />
              )}

              {p.points.map((pt) => (
                <EndpointImage key={pt.columnKey} point={pt} size={isHovered ? IMG_SIZE * 1.3 : IMG_SIZE} />
              ))}

              {isHovered &&
                p.points.map((pt) => (
                  <text
                    key={`${pt.columnKey}-label`}
                    x={pt.x}
                    y={pt.y - IMG_SIZE}
                    textAnchor="middle"
                    fontSize={12}
                    fill="var(--text-h)"
                  >
                    {p.name} (#{pt.rank})
                  </text>
                ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
