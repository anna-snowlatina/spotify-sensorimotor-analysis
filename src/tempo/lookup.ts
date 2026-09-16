import { lookupReccoBeats } from './providers/reccobeats';
import { lookupDeezer } from './providers/deezer';
import { getCachedTempo, setCachedTempo, clearCachedTempo } from './cache';

export type TempoInfo = {
  bpm: number | null; // null = unknown
  energy?: number; // 0-1, ReccoBeats only
  valence?: number; // 0-1, ReccoBeats only
  source: 'reccobeats' | 'deezer' | 'override' | 'none';
};

const MIN_BPM = 50;
const MAX_BPM = 210;
const OCTAVE_RATIO_TOLERANCE = 0.03;

/** Tempo detectors often report half/double the true tempo; anything outside this range is noise. */
function validateBpm(bpm: number | null | undefined): number | null {
  if (typeof bpm !== 'number' || !Number.isFinite(bpm)) return null;
  if (bpm < MIN_BPM || bpm > MAX_BPM) return null;
  return bpm;
}

function isOctavePair(a: number, b: number): boolean {
  const ratio = a > b ? a / b : b / a;
  return Math.abs(ratio - 2) <= 2 * OCTAVE_RATIO_TOLERANCE;
}

export type LookupParams = {
  trackId: string;
  isrc?: string;
  /** Podcast episodes, ads, and other non-track items skip the lookup entirely. */
  itemType: 'track' | 'episode' | 'other';
};

/**
 * Resolves tempo for one song, in this order: manual override > cache > ReccoBeats/Deezer (run
 * in parallel, both within their own 3s timeout) > unknown. Only ever called once per song
 * change — never per poll — and callers should render at DEFAULT_BPM immediately rather than
 * waiting on this promise, easing to the real value once it resolves.
 */
export async function lookupTempo(params: LookupParams): Promise<TempoInfo> {
  if (params.itemType !== 'track') {
    return { bpm: null, source: 'none' };
  }

  const cached = getCachedTempo(params.trackId);
  if (cached) return cached;

  const [recco, deezer] = await Promise.all([
    lookupReccoBeats(params.trackId).catch(() => null),
    params.isrc ? lookupDeezer(params.isrc).catch(() => null) : Promise.resolve(null),
  ]);

  const reccoBpm = validateBpm(recco?.bpm ?? null);
  const deezerBpm = validateBpm(deezer?.bpm ?? null);

  let result: TempoInfo;
  if (reccoBpm !== null) {
    // If Deezer disagrees by roughly an octave, ReccoBeats still wins (per spec); otherwise
    // the two providers agreeing (or Deezer being unavailable) both lead to the same result.
    result = { bpm: reccoBpm, energy: recco?.energy, valence: recco?.valence, source: 'reccobeats' };
  } else if (deezerBpm !== null) {
    result = { bpm: deezerBpm, source: 'deezer' };
  } else {
    result = { bpm: null, source: 'none' };
  }

  setCachedTempo(params.trackId, result);
  return result;
}

/** `[` halves, `]` doubles the currently-known BPM for this track, taking priority on later plays. */
export function applyOctaveOverride(trackId: string, currentBpm: number, direction: 'half' | 'double'): TempoInfo {
  const bpm = direction === 'half' ? currentBpm / 2 : currentBpm * 2;
  const result: TempoInfo = { bpm, source: 'override' };
  setCachedTempo(trackId, result);
  return result;
}

/** `\` clears a manual override, letting normal lookup/cache rules apply again. */
export function clearOctaveOverride(trackId: string): void {
  clearCachedTempo(trackId);
}

export { isOctavePair, validateBpm };
