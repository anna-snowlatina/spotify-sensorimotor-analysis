import { WINDOWS, type Window } from '../data/topItems';
import type { Coverage } from '../sensory/score';

export function CoverageNote({ coverage }: { coverage: Record<Window, Coverage> }) {
  return (
    <p style={{ fontSize: 13, color: 'var(--text)' }}>
      {WINDOWS.map((w, i) => {
        const c = coverage[w];
        return (
          <span key={w}>
            {i > 0 && ' · '}
            {w.replace('_', ' ')}: {c.scoredTracks}/{c.totalTracks} titles scored (
            {Math.round(c.tokenShare * 100)}% of tokens matched)
          </span>
        );
      })}
    </p>
  );
}
