// Deezer: looked up by ISRC. Deezer's API does not send Access-Control-Allow-Origin (verified
// live), so browser requests go through the Vite dev-server proxy configured at /api/deezer
// (see vite.config.ts) instead of a public CORS proxy.

export type DeezerResult = { bpm: number | null };

type DeezerTrackResponse = { bpm?: number };

/** Only sends the ISRC — no other user data. Treats bpm: 0 as unknown. Returns null on failure/timeout. */
export async function lookupDeezer(isrc: string, timeoutMs = 3000): Promise<DeezerResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`/api/deezer/track/isrc:${encodeURIComponent(isrc)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as DeezerTrackResponse;
    if (typeof json.bpm !== 'number' || json.bpm === 0) return { bpm: null };
    return { bpm: json.bpm };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
