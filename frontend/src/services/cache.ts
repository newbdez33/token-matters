import Dexie, { type EntityTable } from 'dexie';

interface CacheEntry {
  key: string;
  data: string;
  fetchedAt: number;
  accessedAt: number;
}

const db = new Dexie('TokenMattersCache') as Dexie & {
  cache: EntityTable<CacheEntry, 'key'>;
};

db.version(1).stores({
  cache: 'key, fetchedAt, accessedAt',
});

const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes stale threshold
const CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getCached<T>(key: string): Promise<T | null> {
  const entry = await db.cache.get(key);
  if (!entry) return null;
  await db.cache.update(key, { accessedAt: Date.now() });
  return JSON.parse(entry.data) as T;
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  const now = Date.now();
  await db.cache.put({
    key,
    data: JSON.stringify(data),
    fetchedAt: now,
    accessedAt: now,
  });
}

export async function isFresh(key: string): Promise<boolean> {
  const entry = await db.cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < MAX_AGE_MS;
}

/**
 * Stale-while-revalidate: a cached entry is returned immediately; once
 * it is older than MAX_AGE_MS it is refreshed in the background. The
 * refreshed data is written back to the cache AND handed to
 * `onRevalidated`, so callers that keep the result in UI state can
 * swap it in — otherwise the page keeps showing the previous visit's
 * numbers until the next reload. A failed refresh is silent: the
 * stale entry stays and `onRevalidated` is never called.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  onRevalidated?: (data: T) => void,
): Promise<T> {
  const cached = await getCached<T>(key);
  const fresh = await isFresh(key);

  if (cached && fresh) return cached;

  if (cached) {
    fetcher()
      .then(async (data) => {
        await setCache(key, data);
        onRevalidated?.(data);
      })
      .catch(() => {});
    return cached;
  }

  // no cache: fetch and store
  const data = await fetcher();
  await setCache(key, data);
  return data;
}

export async function clearCache(): Promise<void> {
  await db.cache.clear();
}

export async function cleanupOldEntries(): Promise<number> {
  const cutoff = Date.now() - CLEANUP_AGE_MS;
  return db.cache.where('accessedAt').below(cutoff).delete();
}

export async function getCacheStats(): Promise<{ count: number; oldestAccess: number | null }> {
  const count = await db.cache.count();
  const oldest = await db.cache.orderBy('accessedAt').first();
  return { count, oldestAccess: oldest?.accessedAt ?? null };
}
