import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { login, isLoggedIn, hasScopes } from '../auth/pkce';
import { useNowPlaying } from '../nowplaying/useNowPlaying';
import { NowPlayingCard } from '../components/NowPlayingCard';
import { DebugOverlay } from '../components/DebugOverlay';
import { AmbientChrome } from '../components/AmbientChrome';
import { loadAndExtractPalette, NEUTRAL_PALETTE, type Palette } from '../palette/extract';
import { getCachedPalette, setCachedPalette } from '../palette/cache';
import type { NowPlaying } from '../nowplaying/api';
import { AmbientCanvas, type PlaybackPhase } from '../canvas/AmbientCanvas';
import { useTempo } from '../tempo/useTempo';
import { paceFactor, DEFAULT_BPM } from '../tempo/pace';
import spotifyLogo from '../assets/spotify-logo.svg';

const REQUIRED_SCOPES = ['user-read-currently-playing'];

function phaseFor(nowPlaying: NowPlaying): PlaybackPhase {
  if (nowPlaying.state === 'playing') return 'playing';
  if (nowPlaying.state === 'paused') return 'paused';
  return 'quiet'; // idle or unavailable
}

function activeId(nowPlaying: NowPlaying): string | null {
  return nowPlaying.state === 'playing' || nowPlaying.state === 'paused' ? nowPlaying.id : null;
}

function activeArtUrl(nowPlaying: NowPlaying): string | undefined {
  if (nowPlaying.state !== 'playing' && nowPlaying.state !== 'paused') return undefined;
  return nowPlaying.artUrlSmall ?? nowPlaying.artUrlLarge;
}

/**
 * Palette for the canvas: fresh extraction while playing/paused, the neutral palette when truly
 * idle, and the last real palette (just slowed via `phase`) while "unavailable" (ad/private/local
 * file) — per the states table, unavailable keeps the previous palette rather than resetting.
 */
function usePalette(nowPlaying: NowPlaying): Palette {
  const [palette, setPalette] = useState<Palette>(NEUTRAL_PALETTE);
  const lastPaletteRef = useRef<Palette>(NEUTRAL_PALETTE);
  const id = activeId(nowPlaying);
  const artUrl = activeArtUrl(nowPlaying);

  useEffect(() => {
    if (nowPlaying.state === 'idle') {
      setPalette(NEUTRAL_PALETTE);
      return;
    }
    if (nowPlaying.state === 'unavailable') {
      setPalette(lastPaletteRef.current);
      return;
    }
    if (!id || !artUrl) {
      setPalette(NEUTRAL_PALETTE);
      return;
    }

    const cached = getCachedPalette(id);
    if (cached) {
      lastPaletteRef.current = cached;
      setPalette(cached);
      return;
    }

    let cancelled = false;
    void loadAndExtractPalette(artUrl, id).then((result) => {
      if (cancelled) return;
      const resolved = result ?? NEUTRAL_PALETTE;
      if (result) setCachedPalette(id, result);
      lastPaletteRef.current = resolved;
      setPalette(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [nowPlaying.state, id, artUrl]);

  return palette;
}

/** Remembers the last playing/paused track's art, so "unavailable" can show it dimmed. */
function useLastArtUrl(nowPlaying: NowPlaying): string | undefined {
  const ref = useRef<string | undefined>(undefined);
  const url = activeArtUrl(nowPlaying);
  if (url) ref.current = url;
  return ref.current;
}

function tempoLabel(bpm: number | null, source: string): string {
  if (bpm === null) return '♩ —';
  const rounded = Math.round(bpm);
  if (source === 'override') return `♩ ${rounded} BPM (override)`;
  // Deezer's terms require following their trademark guidelines; ReccoBeats' terms don't
  // specify, but attributing both consistently is the conservative choice either way.
  if (source === 'deezer') return `♩ ${rounded} BPM · via Deezer`;
  if (source === 'reccobeats') return `♩ ${rounded} BPM · via ReccoBeats`;
  return `♩ ${rounded} BPM`;
}

function ReportLink() {
  return (
    <Link
      to="/report"
      className="primary"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        textDecoration: 'none',
        padding: '8px 20px',
        borderRadius: 500,
        fontWeight: 700,
        zIndex: 1,
      }}
    >
      Taste report →
    </Link>
  );
}

function ConnectOverlay({ reconnect }: { reconnect: boolean }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        textAlign: 'center',
      }}
    >
      <img src={spotifyLogo} alt="" style={{ height: 48, width: 'auto' }} />
      <p style={{ margin: 0 }}>
        {reconnect
          ? 'This page needs permissions your current session doesn’t have yet.'
          : 'Connect Spotify to see what’s playing.'}
      </p>
      <button
        type="button"
        className="primary"
        onClick={() => {
          login().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
        }}
      >
        {reconnect ? 'Reconnect Spotify' : 'Connect Spotify'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function ConnectedLanding() {
  const { nowPlaying, quotaPaused, debug } = useNowPlaying();
  const palette = usePalette(nowPlaying);
  const lastArtUrl = useLastArtUrl(nowPlaying);
  const [showDebug, setShowDebug] = useState(false);

  const trackId = activeId(nowPlaying);
  const isrc =
    (nowPlaying.state === 'playing' || nowPlaying.state === 'paused') && nowPlaying.kind === 'track'
      ? nowPlaying.isrc
      : undefined;
  const itemType =
    nowPlaying.state === 'playing' || nowPlaying.state === 'paused'
      ? nowPlaying.kind === 'track'
        ? ('track' as const)
        : ('episode' as const)
      : ('other' as const);
  const { tempo, cacheHit, applyOverride, clearOverride } = useTempo(trackId, isrc, itemType);
  const [breathEnabled, setBreathEnabled] = useState(true);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'd' || e.key === 'D') setShowDebug((v) => !v);
      else if (e.key === '[') applyOverride('half');
      else if (e.key === ']') applyOverride('double');
      else if (e.key === '\\') clearOverride();
      else if (e.key === 'b' || e.key === 'B') setBreathEnabled((v) => !v);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyOverride, clearOverride]);

  return (
    <>
      <AmbientCanvas palette={palette} phase={phaseFor(nowPlaying)} tempo={tempo} breathEnabled={breathEnabled} />
      {/* Track info stays visible for as long as it's relevant, unlike the auto-hiding chrome below. */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <NowPlayingCard nowPlaying={nowPlaying} lastArtUrl={lastArtUrl} />
        {(nowPlaying.state === 'playing' || nowPlaying.state === 'paused') && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text)', marginTop: 4 }}>
            {tempoLabel(tempo.bpm, tempo.source)}
          </p>
        )}
      </div>
      <AmbientChrome>
        <ReportLink />
        {quotaPaused && (
          <p
            style={{
              position: 'fixed',
              bottom: 16,
              right: 16,
              fontSize: 12,
              color: 'var(--text)',
              background: 'var(--bg-raised)',
              padding: '6px 12px',
              borderRadius: 8,
              zIndex: 1,
            }}
          >
            Spotify quota reached — paused
          </p>
        )}
      </AmbientChrome>
      {showDebug && (
        <DebugOverlay
          stats={debug}
          palette={palette}
          tempo={tempo}
          tempoCacheHit={cacheHit}
          paceFactorValue={paceFactor(tempo.bpm ?? DEFAULT_BPM)}
          breathEnabled={breathEnabled}
        />
      )}
    </>
  );
}

export default function LandingPage() {
  const loggedIn = isLoggedIn();
  const needsReconnect = loggedIn && !hasScopes(REQUIRED_SCOPES);
  const showConnect = !loggedIn || needsReconnect;

  return (
    <main
      style={{
        minHeight: '100svh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {showConnect ? (
        <>
          <AmbientCanvas palette={NEUTRAL_PALETTE} phase="quiet" />
          <ReportLink />
          <ConnectOverlay reconnect={needsReconnect} />
        </>
      ) : (
        <ConnectedLanding />
      )}
    </main>
  );
}
