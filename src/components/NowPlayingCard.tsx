import type { NowPlaying } from '../nowplaying/api';
import spotifyLogo from '../assets/spotify-logo.svg';

const ART_SIZE = 'min(42vmin, 440px)';

function ArtworkAttribution() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 }}>
      <img src={spotifyLogo} alt="" style={{ height: 14, width: 'auto' }} />
      <span style={{ fontSize: 11, color: 'var(--text)' }}>via Spotify</span>
    </div>
  );
}

export function NowPlayingCard({
  nowPlaying,
  lastArtUrl,
}: {
  nowPlaying: NowPlaying;
  /** Last known artwork, shown dimmed while idle (nothing playing) or temporarily unavailable. */
  lastArtUrl?: string;
}) {
  if (nowPlaying.state === 'idle') {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text)' }}>
        {lastArtUrl ? (
          <img
            src={lastArtUrl}
            alt=""
            style={{
              width: ART_SIZE,
              height: ART_SIZE,
              objectFit: 'contain',
              borderRadius: 8,
              margin: '0 auto 12px',
              display: 'block',
              opacity: 0.4,
            }}
          />
        ) : (
          <div
            style={{
              width: ART_SIZE,
              height: ART_SIZE,
              maxWidth: 200,
              maxHeight: 200,
              borderRadius: 8,
              background: 'var(--bg-raised)',
              margin: '0 auto 12px',
              opacity: 0.4,
            }}
          />
        )}
        <p>Nothing playing</p>
      </div>
    );
  }

  if (nowPlaying.state === 'unavailable') {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text)' }}>
        {lastArtUrl ? (
          <img
            src={lastArtUrl}
            alt=""
            style={{
              width: ART_SIZE,
              height: ART_SIZE,
              objectFit: 'contain',
              borderRadius: 8,
              margin: '0 auto 12px',
              display: 'block',
              opacity: 0.3,
            }}
          />
        ) : (
          <div
            style={{
              width: ART_SIZE,
              height: ART_SIZE,
              maxWidth: 200,
              maxHeight: 200,
              borderRadius: 8,
              background: 'var(--bg-raised)',
              margin: '0 auto 12px',
              opacity: 0.3,
            }}
          />
        )}
        <p style={{ fontSize: 13 }}>
          {nowPlaying.reason === 'ad' ? 'Advertisement' : 'Playback unavailable'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      {nowPlaying.artUrlLarge && (
        // Per Spotify's branding guidelines: shown unmodified (no crop/distort/overlay),
        // no playback controls drawn over it, corners rounded no more than 8px.
        <img
          src={nowPlaying.artUrlLarge}
          alt=""
          style={{
            width: ART_SIZE,
            height: ART_SIZE,
            objectFit: 'contain',
            borderRadius: 8,
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            display: 'block',
            margin: '0 auto 16px',
          }}
        />
      )}
      <a
        href={nowPlaying.spotifyUrl}
        target="_blank"
        rel="noreferrer"
        style={{ color: 'var(--text-h)', fontWeight: 700, textDecoration: 'none' }}
      >
        {nowPlaying.title}
      </a>
      <p style={{ margin: '4px 0 0', color: 'var(--text)', fontSize: 13 }}>{nowPlaying.subtitle}</p>
      {nowPlaying.state === 'paused' && (
        <p style={{ margin: '4px 0 0', color: 'var(--text)', fontSize: 12 }}>Paused</p>
      )}
      <a href={nowPlaying.spotifyUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
        <ArtworkAttribution />
      </a>
    </div>
  );
}
