import type { TempoInfo } from './lookup';

const STORAGE_KEY = 'taste-drift:tempo-cache';
const MAX_ENTRIES = 500;
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CacheEntry = { info: TempoInfo; cachedAt: number };
type StoredCache = { order: string[]; entries: Record<string, CacheEntry> };

function readStorage(): StoredCache {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { order: [], entries: {} };
    return JSON.parse(raw) as StoredCache;
  } catch {
    return { order: [], entries: {} };
  }
}

function writeStorage(cache: StoredCache): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage full or unavailable; lookups will just re-run more often this session.
  }
}

/**
 * Returns the cached TempoInfo, or null if there's no entry or a cached "unknown" (source:
 * 'none') result has passed its 7-day TTL. Known results and manual overrides never expire
 * here — they're just subject to normal LRU eviction at MAX_ENTRIES.
 */
export function getCachedTempo(trackId: string): TempoInfo | null {
  const stored = readStorage();
  const entry = stored.entries[trackId];
  if (!entry) return null;
  if (entry.info.source === 'none' && Date.now() - entry.cachedAt > MISS_TTL_MS) return null;
  return entry.info;
}

export function setCachedTempo(trackId: string, info: TempoInfo): void {
  const stored = readStorage();
  stored.order = stored.order.filter((id) => id !== trackId);
  stored.order.push(trackId);
  stored.entries[trackId] = { info, cachedAt: Date.now() };

  while (stored.order.length > MAX_ENTRIES) {
    const oldest = stored.order.shift();
    if (oldest) delete stored.entries[oldest];
  }

  writeStorage(stored);
}

export function clearCachedTempo(trackId: string): void {
  const stored = readStorage();
  stored.order = stored.order.filter((id) => id !== trackId);
  delete stored.entries[trackId];
  writeStorage(stored);
}
