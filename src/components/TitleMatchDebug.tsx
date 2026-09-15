import { cleanTitle } from '../sensory/clean';
import { WINDOWS, type TopData, type Window } from '../data/topItems';
import type { Norms } from '../sensory/score';

type Row = {
  window: Window;
  title: string;
  matched: { token: string; lemma: string }[];
  unmatched: string[];
};

export function TitleMatchDebug({ data, norms }: { data: TopData; norms: Norms }) {
  const rows: Row[] = WINDOWS.flatMap((window) =>
    data[window].tracks.map((track) => {
      const { matched, unmatched } = cleanTitle(track.name, norms.words);
      return { window, title: track.name, matched, unmatched };
    }),
  );

  return (
    <details className="card" style={{ marginTop: 16 }}>
      <summary>Title match debug ({rows.length} tracks)</summary>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th>Window</th>
              <th>Title</th>
              <th>Matched (token → lemma)</th>
              <th>Unmatched</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td>{row.window}</td>
                <td>{row.title}</td>
                <td>
                  {row.matched.length === 0
                    ? '—'
                    : row.matched.map((m) => `${m.token}→${m.lemma}`).join(', ')}
                </td>
                <td style={{ color: row.unmatched.length ? 'var(--danger)' : undefined }}>
                  {row.unmatched.join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
