// ReccoBeats: free, CORS-enabled, rate-limited. Treated as optional (small third party).
// Two calls: resolve the Spotify track ID to a ReccoBeats internal ID, then fetch that
// track's audio features. A track ReccoBeats doesn't know about comes back as an empty
// `content` array (observed live; not always a 404 as their docs imply), so both cases
// are treated the same way: unknown.

const BASE_URL = 'https://api.reccobeats.com/v1';

export type ReccoBeatsResult = { bpm: number | null; energy?: number; valence?: number };

type TrackLookupResponse = { content: { id: string }[] };
type AudioFeaturesResponse = { tempo?: number; energy?: number; valence?: number };

/** Only sends the Spotify track ID — no other user data. Returns null on any failure or timeout. */
export async function lookupReccoBeats(
  spotifyTrackId: string,
  timeoutMs = 3000,
): Promise<ReccoBeatsResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const trackRes = await fetch(`${BASE_URL}/track?ids=${encodeURIComponent(spotifyTrackId)}`, {
      signal: controller.signal,
    });
    if (!trackRes.ok) return null;
    const trackJson = (await trackRes.json()) as TrackLookupResponse;
    const reccoId = trackJson.content?.[0]?.id;
    if (!reccoId) return null;

    const featRes = await fetch(`${BASE_URL}/track/${reccoId}/audio-features`, {
      signal: controller.signal,
    });
    if (!featRes.ok) return null;
    const feat = (await featRes.json()) as AudioFeaturesResponse;

    return {
      bpm: typeof feat.tempo === 'number' ? feat.tempo : null,
      energy: feat.energy,
      valence: feat.valence,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
