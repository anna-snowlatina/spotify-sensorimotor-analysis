import type { CSSProperties } from 'react';
import { WINDOWS, type RankedItem, type TopData, type Window } from '../data/topItems';

type Mode = 'artists' | 'tracks';

const WINDOW_LABEL: Record<Window, string> = {
  long_term: 'Long term',
  medium_term: 'Medium term',
  short_term: 'Short term',
};

function displayName(item: RankedItem): string {
  return item.artistNames ? `${item.name} — ${item.artistNames.join(', ')}` : item.name;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

const AVATAR_SIZE = 24;

function Avatar({ item }: { item: RankedItem }) {
  const style: CSSProperties = {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
  };
  if (item.imageUrl) {
    return <img src={item.imageUrl} alt="" style={style} />;
  }
  return (
    <span
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-raised-hover)',
        color: 'var(--text-h)',
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      {initials(item.name)}
    </span>
  );
}

function narrativeFor(data: TopData, mode: Mode): string {
  const long5 = data.long_term[mode].slice(0, 5);
  const short5 = data.short_term[mode].slice(0, 5);
  const longIds = new Set(long5.map((i) => i.id));
  const shortIds = new Set(short5.map((i) => i.id));

  const newEntries = short5.filter((i) => !longIds.has(i.id));
  const dropped = long5.filter((i) => !shortIds.has(i.id));
  const label = mode === 'artists' ? 'artists' : 'tracks';

  if (newEntries.length === 0 && dropped.length === 0) {
    return `Your top 5 ${label} have stayed the same across long, medium, and short term.`;
  }

  const parts: string[] = [];
  if (newEntries.length > 0) {
    parts.push(`${newEntries.map((i) => i.name).join(', ')} ${newEntries.length === 1 ? 'is' : 'are'} new to your top 5 ${label} in the short term`);
  }
  if (dropped.length > 0) {
    parts.push(`${dropped.map((i) => i.name).join(', ')} ${dropped.length === 1 ? 'has' : 'have'} dropped out since the long term`);
  }
  return `${parts.join('; ')}.`;
}

function TopFiveList({ data, mode }: { data: TopData; mode: Mode }) {
  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      {WINDOWS.map((w) => (
        <div key={w} style={{ minWidth: 180 }}>
          <h4 style={{ margin: '0 0 4px' }}>{WINDOW_LABEL[w]}</h4>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
            {data[w][mode].slice(0, 5).map((item) => (
              <li
                key={item.id}
                style={
                  mode === 'artists'
                    ? { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }
                    : { marginBottom: 4 }
                }
              >
                {mode === 'artists' && <Avatar item={item} />}
                {displayName(item)}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function TopFiveSummary({ data }: { data: TopData }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Top 5, at a glance</h2>

      <h3 style={{ marginBottom: 4 }}>Artists</h3>
      <p style={{ fontSize: 13 }}>{narrativeFor(data, 'artists')}</p>
      <TopFiveList data={data} mode="artists" />

      <h3 style={{ margin: '16px 0 4px' }}>Tracks</h3>
      <p style={{ fontSize: 13 }}>{narrativeFor(data, 'tracks')}</p>
      <TopFiveList data={data} mode="tracks" />
    </div>
  );
}
