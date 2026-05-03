import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  api,
  ApiAuthError,
  setCredentials,
  clearCredentials,
  getCredentials,
  onAuthError,
} from './api';

// Stub the dynamic import inside clearCredentials so jsdom doesn't
// try to spin up IndexedDB. We don't care what cache.clearCache does
// in this suite — it's an async fire-and-forget side effect.
vi.mock('@/services/cache', () => ({
  clearCache: vi.fn(async () => {}),
}));

// jsdom's localStorage provider in this vitest setup ships
// without `clear()` and `removeItem()` actually persisting; back
// it with a Map-based polyfill so credentials helpers behave like
// they would in the browser.
const memoryStore: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => (k in memoryStore ? memoryStore[k] : null),
    setItem: (k: string, v: string) => {
      memoryStore[k] = v;
    },
    removeItem: (k: string) => {
      delete memoryStore[k];
    },
    clear: () => {
      for (const k of Object.keys(memoryStore)) delete memoryStore[k];
    },
    key: (i: number) => Object.keys(memoryStore)[i] ?? null,
    get length() {
      return Object.keys(memoryStore).length;
    },
  },
  configurable: true,
  writable: true,
});

const ZERO_COST = { totalUSD: 0, byProvider: {} };

const SAMPLE_DAILY = {
  date: '2026-04-29',
  totals: {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    cost: ZERO_COST,
    requests: 0,
  },
  byProvider: [],
  byMachine: [],
  byModel: [],
};

beforeEach(() => {
  clearCredentials();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('credentials helpers', () => {
  it('round-trip get/set/clear', () => {
    expect(getCredentials()).toBeNull();
    setCredentials('alice@gcu.co.jp', 'tok123');
    expect(getCredentials()).toEqual({ user: 'alice@gcu.co.jp', token: 'tok123' });
    clearCredentials();
    expect(getCredentials()).toBeNull();
  });

  it('hasEnvCredentials() reflects whether VITE_TB_USER + VITE_TB_TOKEN were baked in', async () => {
    // Default test env doesn't set them, so the running module
    // reports false. The positive case is covered by a separate
    // test file (api.env-creds.test.ts) that re-imports the
    // module with stubbed env vars — `import.meta.env` is read
    // at module load, so we can't flip it after the fact in this
    // suite.
    const { hasEnvCredentials } = await import('./api');
    expect(hasEnvCredentials()).toBe(false);
  });
});

describe('api fetch', () => {
  it('throws ApiAuthError when no creds in localStorage', async () => {
    await expect(api.getMeta()).rejects.toBeInstanceOf(ApiAuthError);
  });

  it('appends ?user= and ?token= to the URL', async () => {
    setCredentials('alice@gcu.co.jp', 'tok123');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        lastUpdated: '2026-04-29T00:00:00Z',
        dateRange: { start: '2026-04-29', end: '2026-04-29' },
        providers: [],
        machines: [],
        models: [],
        dailyFiles: [],
        weeklyFiles: [],
        monthlyFiles: [],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.getMeta();
    const calledUrl = fetchMock.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('user=alice%40gcu.co.jp');
    expect(calledUrl).toContain('token=tok123');
  });

  it('throws ApiAuthError on 401 from server (token revoked etc.)', async () => {
    setCredentials('alice@gcu.co.jp', 'tok123');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      }),
    );
    await expect(api.getDaily('2026-04-29')).rejects.toBeInstanceOf(ApiAuthError);
  });

  it('throws plain Error on non-401 failure', async () => {
    setCredentials('alice@gcu.co.jp', 'tok123');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    await expect(api.getDaily('2026-04-29')).rejects.toThrow(/500/);
  });

  it('emits onAuthError to subscribers when fetch sees 401', async () => {
    setCredentials('alice@gcu.co.jp', 'tok123');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      }),
    );
    const listener = vi.fn();
    const unsubscribe = onAuthError(listener);
    await expect(api.getDaily('2026-04-29')).rejects.toBeInstanceOf(ApiAuthError);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('emits onAuthError when no creds in localStorage either', async () => {
    const listener = vi.fn();
    const unsubscribe = onAuthError(listener);
    await expect(api.getMeta()).rejects.toBeInstanceOf(ApiAuthError);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does NOT emit onAuthError on 5xx (so non-auth failures stay scoped)', async () => {
    setCredentials('alice@gcu.co.jp', 'tok123');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    const listener = vi.fn();
    const unsubscribe = onAuthError(listener);
    await expect(api.getDaily('2026-04-29')).rejects.toThrow(/500/);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('runs the response through recomputeCosts', async () => {
    setCredentials('alice@gcu.co.jp', 'tok123');
    const dailyWithRealTokens = {
      ...SAMPLE_DAILY,
      totals: {
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 1_500_000,
        cost: ZERO_COST,
        requests: 10,
      },
      byProvider: [
        {
          provider: 'claude-code',
          dataQuality: 'exact',
          inputTokens: 1_000_000,
          outputTokens: 500_000,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 1_500_000,
          cost: 0,
          costUSD: 0,
          currency: 'USD',
          requests: 10,
        },
      ],
      byModel: [
        {
          model: 'claude-sonnet-4-6',
          provider: 'claude-code',
          totalTokens: 1_500_000,
          requests: 10,
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => dailyWithRealTokens,
      }),
    );
    const out = await api.getDaily('2026-04-29');
    // Cost was 0 on the wire — frontend must fill it.
    expect(out.totals.cost.totalUSD).toBeGreaterThan(0);
  });
});
