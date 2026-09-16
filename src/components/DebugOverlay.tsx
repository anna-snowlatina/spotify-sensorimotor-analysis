import type { DebugStats } from '../nowplaying/useNowPlaying';
import type { Palette } from '../palette/extract';
import type { TempoInfo } from '../tempo/lookup';

function formatWhen(ms: number | null): string {
  if (ms === null) return '—';
  const deltaS = Math.round((ms - Date.now()) / 1000);
  return deltaS <= 0 ? 'now' : `in ${deltaS}s`;
}

function PaletteSwatches({ palette }: { palette: Palette }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
      <div
        title={`background ${palette.background}`}
        style={{ width: 16, height: 16, borderRadius: 4, background: palette.background, border: '1px solid #444' }}
      />
      {palette.colors.map((c, i) => (
        <div
          key={i}
          title={c}
          style={{ width: 16, height: 16, borderRadius: 4, background: c, border: '1px solid #444' }}
        />
      ))}
      {palette.isMonochrome && <span style={{ marginLeft: 4 }}>mono</span>}
    </div>
  );
}

export function DebugOverlay({
  stats,
  palette,
  tempo,
  tempoCacheHit,
  paceFactorValue,
  breathEnabled,
}: {
  stats: DebugStats;
  palette?: Palette;
  tempo?: TempoInfo;
  tempoCacheHit?: boolean;
  paceFactorValue?: number;
  breathEnabled?: boolean;
}) {
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
      {palette && <PaletteSwatches palette={palette} />}
      {tempo && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div>bpm: {tempo.bpm ?? '—'}</div>
          <div>source: {tempo.source}</div>
          <div>cache: {tempoCacheHit ? 'hit' : 'miss'}</div>
          {tempo.energy !== undefined && <div>energy: {tempo.energy.toFixed(2)}</div>}
          {tempo.valence !== undefined && <div>valence: {tempo.valence.toFixed(2)}</div>}
          {paceFactorValue !== undefined && <div>pace: {paceFactorValue.toFixed(2)}×</div>}
          {breathEnabled !== undefined && <div>breath: {breathEnabled ? 'on' : 'off'}</div>}
        </div>
      )}
    </div>
  );
}
