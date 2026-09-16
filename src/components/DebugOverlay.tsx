import type { DebugStats } from '../nowplaying/useNowPlaying';

function formatWhen(ms: number | null): string {
  if (ms === null) return '—';
  const deltaS = Math.round((ms - Date.now()) / 1000);
  return deltaS <= 0 ? 'now' : `in ${deltaS}s`;
}

export function DebugOverlay({ stats }: { stats: DebugStats }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        background: 'rgba(0,0,0,0.8)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 14px',
        fontSize: 12,
        fontFamily: 'var(--mono)',
        color: 'var(--text-h)',
        zIndex: 1000,
      }}
    >
      <div>requests (session): {stats.requestsThisSession}</div>
      <div>requests (last hour): {stats.requestsLastHour}</div>
      <div>last status: {stats.lastStatus ?? '—'}</div>
      <div>next poll: {formatWhen(stats.nextPollAt)}</div>
    </div>
  );
}
