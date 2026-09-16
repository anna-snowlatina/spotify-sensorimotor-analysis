import type { Palette } from './extract';

const STORAGE_KEY = 'taste-drift:palette-cache';
const MAX_ENTRIES = 200;

const memoryCache = new Map<string, Palette>();

type StoredCache = { order: string[]; entries: Record<string, Palette> };

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
    // localStorage full or unavailable; the in-memory cache still works for this session.
  }
}

export function getCachedPalette(id: string): Palette | null {
  const fromMemory = memoryCache.get(id);
  if (fromMemory) return fromMemory;

  const stored = readStorage();
  const found = stored.entries[id];
  if (found) memoryCache.set(id, found);
  return found ?? null;
}

export function setCachedPalette(id: string, palette: Palette): void {
  memoryCache.set(id, palette);

  const stored = readStorage();
  stored.order = stored.order.filter((existingId) => existingId !== id);
  stored.order.push(id);
  stored.entries[id] = palette;

  while (stored.order.length > MAX_ENTRIES) {
    const oldest = stored.order.shift();
    if (oldest) delete stored.entries[oldest];
  }

  writeStorage(stored);
}
