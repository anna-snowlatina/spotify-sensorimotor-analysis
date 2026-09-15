type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function readCache<T>(key: string, ttlMs = SIX_HOURS_MS): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.fetchedAt > ttlMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, fetchedAt: Date.now() };
  localStorage.setItem(key, JSON.stringify(entry));
}

export function clearCache(key: string): void {
  localStorage.removeItem(key);
}

export function cacheAgeMs(key: string): number | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as CacheEntry<unknown>;
    return Date.now() - entry.fetchedAt;
  } catch {
    return null;
  }
}
