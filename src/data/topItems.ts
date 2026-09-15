import { spotifyFetch } from '../api/spotify';
import { readCache, writeCache } from './cache';

export type Window = 'long_term' | 'medium_term' | 'short_term';

export const WINDOWS: Window[] = ['long_term', 'medium_term', 'short_term'];

export type RankedItem = {
  id: string;
  name: string;
  rank: number;
  imageUrl?: string;
  artistNames?: string[];
};

export type TopData = Record<Window, { artists: RankedItem[]; tracks: RankedItem[] }>;

const CACHE_KEY = 'taste-drift:top-data';

// Raw response shapes. Fields the Feb 2026 migration removed (followers, popularity on
// artists and tracks) are intentionally left off rather than typed-and-ignored, so any
// accidental use is a compile error. `images` and `genres` are kept optional per the
// handover's instruction to degrade gracefully if a field goes missing later.
type SpotifyImage = { url: string; height: number | null; width: number | null };

type SpotifyArtist = {
  id: string;
  name: string;
  images?: SpotifyImage[];
  genres?: string[];
};

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album?: { images?: SpotifyImage[] };
};

type TopItemsResponse<T> = { items: T[] };

async function fetchTopArtists(window: Window): Promise<RankedItem[]> {
  const res = await spotifyFetch<TopItemsResponse<SpotifyArtist>>(
    `/me/top/artists?time_range=${window}&limit=50`,
  );
  return res.items.map((artist, index) => ({
    id: artist.id,
    name: artist.name,
    rank: index + 1,
    imageUrl: artist.images?.[0]?.url,
  }));
}

async function fetchTopTracks(window: Window): Promise<RankedItem[]> {
  const res = await spotifyFetch<TopItemsResponse<SpotifyTrack>>(
    `/me/top/tracks?time_range=${window}&limit=50`,
  );
  return res.items.map((track, index) => ({
    id: track.id,
    name: track.name,
    rank: index + 1,
    imageUrl: track.album?.images?.[0]?.url,
    artistNames: track.artists.map((a) => a.name),
  }));
}

/**
 * Fills in missing artist images by falling back to the album art of that artist's
 * highest-ranked track in the same window's track list. Artists still without an image
 * are left undefined; the UI falls back to an initials placeholder.
 */
function backfillArtistImages(artists: RankedItem[], tracks: RankedItem[]): RankedItem[] {
  return artists.map((artist) => {
    if (artist.imageUrl) return artist;
    const bestTrack = tracks
      .filter((t) => t.artistNames?.includes(artist.name))
      .sort((a, b) => a.rank - b.rank)[0];
    return bestTrack?.imageUrl ? { ...artist, imageUrl: bestTrack.imageUrl } : artist;
  });
}

async function fetchWindow(window: Window): Promise<{ artists: RankedItem[]; tracks: RankedItem[] }> {
  const [artists, tracks] = await Promise.all([fetchTopArtists(window), fetchTopTracks(window)]);
  return { artists: backfillArtistImages(artists, tracks), tracks };
}

async function fetchAllTopData(): Promise<TopData> {
  const entries = await Promise.all(WINDOWS.map(async (w) => [w, await fetchWindow(w)] as const));
  return Object.fromEntries(entries) as TopData;
}

/**
 * Loads TopData, using the 6-hour localStorage cache unless `forceRefresh` is set.
 */
export async function loadTopData(forceRefresh = false): Promise<TopData> {
  if (!forceRefresh) {
    const cached = readCache<TopData>(CACHE_KEY);
    if (cached) return cached;
  }
  const data = await fetchAllTopData();
  writeCache(CACHE_KEY, data);
  return data;
}

export { CACHE_KEY };
