import type { NowPlaying } from '../nowplaying/api';

export function NowPlayingCard({ nowPlaying }: { nowPlaying: NowPlaying }) {
  if (nowPlaying.state === 'idle') {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text)' }}>
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: 12,
            background: 'var(--bg-raised)',
            margin: '0 auto 12px',
            opacity: 0.5,
          }}
        />
        <p>Nothing playing</p>
      </div>
    );
  }

  if (nowPlaying.state === 'unavailable') {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text)' }}>
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: 12,
            background: 'var(--bg-raised)',
            margin: '0 auto 12px',
            opacity: 0.3,
          }}
        />
        <p style={{ fontSize: 13 }}>
          {nowPlaying.reason === 'ad' ? 'Advertisement' : 'Playback unavailable'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      {nowPlaying.artUrlLarge && (
        <img
          src={nowPlaying.artUrlLarge}
          alt=""
          style={{
            width: 'min(42vmin, 440px)',
            height: 'min(42vmin, 440px)',
            objectFit: 'cover',
            borderRadius: 12,
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
    </div>
  );
}
