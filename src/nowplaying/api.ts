import { spotifyFetchRaw } from '../api/spotify';

export type NowPlaying =
  | { state: 'idle' }
  | { state: 'unavailable'; reason: 'ad' | 'private' | 'unknown' }
  | {
      state: 'playing' | 'paused';
      id: string;
      kind: 'track' | 'episode';
      title: string;
      subtitle: string; // artists (track) or show name (episode)
      artUrlLarge?: string;
      artUrlSmall?: string;
      spotifyUrl: string;
      progressMs: number;
      durationMs: number;
      fetchedAt: number;
      /** ISRC, track items only (used for third-party tempo lookups). */
      isrc?: string;
    };

type SpotifyImage = { url: string; height: number | null; width: number | null };

type RawTrackItem = {
  id: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album?: { images?: SpotifyImage[] };
  external_urls: { spotify: string };
  external_ids?: { isrc?: string };
};

type RawEpisodeItem = {
  id: string;
  name: string;
  duration_ms: number;
  images?: SpotifyImage[];
  show?: { name: string };
  external_urls: { spotify: string };
};

type CurrentlyPlayingResponse = {
  is_playing: boolean;
  progress_ms: number | null;
  currently_playing_type: 'track' | 'episode' | 'ad' | 'unknown';
  item: RawTrackItem | RawEpisodeItem | null;
};

function normalize(json: CurrentlyPlayingResponse | null): NowPlaying {
  if (!json) return { state: 'idle' };

  if (json.currently_playing_type === 'ad') {
    return { state: 'unavailable', reason: 'ad' };
  }

  if (!json.item) {
    // A null item with an unrecognized type usually means a private session or a local file
    // neither of which the API distinguishes explicitly here.
    return { state: 'unavailable', reason: 'unknown' };
  }

  const kind: 'track' | 'episode' = json.currently_playing_type === 'episode' ? 'episode' : 'track';
  const fetchedAt = Date.now();

  if (kind === 'track') {
    const item = json.item as RawTrackItem;
    const images = item.album?.images ?? [];
    return {
      state: json.is_playing ? 'playing' : 'paused',
      id: item.id,
      kind: 'track',
      title: item.name,
      subtitle: item.artists.map((a) => a.name).join(', '),
      artUrlLarge: images[0]?.url,
      artUrlSmall: images[images.length - 1]?.url,
      spotifyUrl: item.external_urls.spotify,
      progressMs: json.progress_ms ?? 0,
      durationMs: item.duration_ms,
      fetchedAt,
      isrc: item.external_ids?.isrc,
    };
  }

  const item = json.item as RawEpisodeItem;
  const images = item.images ?? [];
  return {
    state: json.is_playing ? 'playing' : 'paused',
    id: item.id,
    kind: 'episode',
    title: item.name,
    subtitle: item.show?.name ?? '',
    artUrlLarge: images[0]?.url,
    artUrlSmall: images[images.length - 1]?.url,
    spotifyUrl: item.external_urls.spotify,
    progressMs: json.progress_ms ?? 0,
    durationMs: item.duration_ms,
    fetchedAt,
  };
}

/** Fetches and normalizes the currently-playing item. Throws SpotifyAuthError/RateLimitError/QuotaError on failure. */
export async function fetchNowPlaying(): Promise<NowPlaying> {
  const res = await spotifyFetchRaw('/me/player/currently-playing?additional_types=track,episode');
  if (res.status === 204) return { state: 'idle' };
  const json = (await res.json()) as CurrentlyPlayingResponse;
  return normalize(json);
}
