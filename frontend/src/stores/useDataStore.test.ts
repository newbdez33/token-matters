import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LatestSummary, SummaryMeta } from '@/types/summary';

vi.mock('@/services/api', () => ({
  api: { getMeta: vi.fn(), getLatest: vi.fn(), getDaily: vi.fn() },
  getCredentials: () => ({ user: 'alice@gcu.co.jp', token: 'tok' }),
}));
vi.mock('@/services/cache', () => ({ fetchWithCache: vi.fn() }));

import { fetchWithCache } from '@/services/cache';
import { useDataStore } from './useDataStore';

const META = { dateRange: { start: '2026-09-01', end: '2026-09-29' } } as unknown as SummaryMeta;
const STALE_LATEST = { lastUpdated: '2026-09-28T07:00:00Z' } as unknown as LatestSummary;
const FRESH_LATEST = { lastUpdated: '2026-09-29T07:00:00Z' } as unknown as LatestSummary;

type Fetcher<T> = () => Promise<T>;
type OnRevalidated<T> = (data: T) => void;

beforeEach(() => {
  useDataStore.setState({ meta: null, latest: null, dailyCache: {}, isLoading: false, error: null });
  vi.mocked(fetchWithCache).mockReset();
});

describe('useDataStore.initialize', () => {
  it('swaps in the revalidated summary once the stale cache refreshes in the background', async () => {
    vi.mocked(fetchWithCache).mockImplementation(
      async (key: string, _fetcher: Fetcher<unknown>, onRevalidated?: OnRevalidated<unknown>) => {
        if (key.endsWith(':latest')) {
          setTimeout(() => onRevalidated?.(FRESH_LATEST), 0);
          return STALE_LATEST;
        }
        return META;
      },
    );

    await useDataStore.getState().initialize();
    expect(useDataStore.getState().latest).toBe(STALE_LATEST);

    await vi.waitFor(() => expect(useDataStore.getState().latest).toBe(FRESH_LATEST));
    expect(useDataStore.getState().meta).toBe(META);
  });

  it('does not clobber a summary that was revalidated before the initial state landed', async () => {
    vi.mocked(fetchWithCache).mockImplementation(
      async (key: string, _fetcher: Fetcher<unknown>, onRevalidated?: OnRevalidated<unknown>) => {
        if (key.endsWith(':latest')) {
          onRevalidated?.(FRESH_LATEST);
          return STALE_LATEST;
        }
        return META;
      },
    );

    await useDataStore.getState().initialize();
    expect(useDataStore.getState().latest).toBe(FRESH_LATEST);
  });
});

describe('useDataStore.fetchDaily', () => {
  it('updates the day cache when the stale entry is revalidated', async () => {
    const stale = { date: '2026-09-29', totals: { totalTokens: 1 } };
    const fresh = { date: '2026-09-29', totals: { totalTokens: 2 } };
    vi.mocked(fetchWithCache).mockImplementation(
      async (_key: string, _fetcher: Fetcher<unknown>, onRevalidated?: OnRevalidated<unknown>) => {
        setTimeout(() => onRevalidated?.(fresh), 0);
        return stale;
      },
    );

    await expect(useDataStore.getState().fetchDaily('2026-09-29')).resolves.toBe(stale);
    await vi.waitFor(() =>
      expect(useDataStore.getState().dailyCache['2026-09-29']).toBe(fresh),
    );
  });
});
