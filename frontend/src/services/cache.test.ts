import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchWithCache, clearCache, setCache, getCached, isFresh } from './cache';

const T0 = new Date('2026-09-29T00:00:00Z').getTime();
const FRESH_AGE = 4 * 60 * 1000; // inside the 5-minute window
const STALE_AGE = 6 * 60 * 1000; // past it

beforeEach(async () => {
  await clearCache();
  vi.spyOn(Date, 'now').mockReturnValue(T0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWithCache', () => {
  it('fetches and stores when nothing is cached', async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    await expect(fetchWithCache('k', fetcher)).resolves.toEqual({ n: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(getCached('k')).resolves.toEqual({ n: 1 });
  });

  it('serves a fresh entry without fetching', async () => {
    await setCache('k', { n: 1 });
    vi.spyOn(Date, 'now').mockReturnValue(T0 + FRESH_AGE);
    const fetcher = vi.fn().mockResolvedValue({ n: 2 });
    await expect(fetchWithCache('k', fetcher)).resolves.toEqual({ n: 1 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('serves a stale entry immediately, then hands the revalidated data to onRevalidated and stores it', async () => {
    await setCache('k', { n: 1 });
    vi.spyOn(Date, 'now').mockReturnValue(T0 + STALE_AGE);
    let resolveFetch!: (value: { n: number }) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<{ n: number }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const onRevalidated = vi.fn();

    await expect(fetchWithCache('k', fetcher, onRevalidated)).resolves.toEqual({ n: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onRevalidated).not.toHaveBeenCalled();

    resolveFetch({ n: 2 });
    await vi.waitFor(() => expect(onRevalidated).toHaveBeenCalledWith({ n: 2 }));
    await expect(getCached('k')).resolves.toEqual({ n: 2 });
    await expect(isFresh('k')).resolves.toBe(true);
  });

  it('keeps the stale entry and stays quiet when the background refresh fails', async () => {
    await setCache('k', { n: 1 });
    vi.spyOn(Date, 'now').mockReturnValue(T0 + STALE_AGE);
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const onRevalidated = vi.fn();

    await expect(fetchWithCache('k', fetcher, onRevalidated)).resolves.toEqual({ n: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onRevalidated).not.toHaveBeenCalled();
    await expect(getCached('k')).resolves.toEqual({ n: 1 });
  });
});
