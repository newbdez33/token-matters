/**
 * Verifies the build-time-credentials path. Lives in its own file
 * so the env stubs run BEFORE the api module is first imported —
 * `HAS_ENV_CREDS` is a module-load-time const, so flipping it
 * inside the existing api.test.ts (which already imported api.ts
 * with empty env) wouldn't take effect.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

// Stub the dynamic Dexie import inside clearCredentials.
vi.mock('@/services/cache', () => ({
  clearCache: vi.fn(async () => {}),
}));

// Map-backed localStorage polyfill (jsdom's default doesn't fully
// implement removeItem/clear in this vitest config).
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

beforeAll(() => {
  vi.stubEnv('VITE_TB_USER', 'env-user@example.com');
  vi.stubEnv('VITE_TB_TOKEN', 'env-token-abcdef');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  for (const k of Object.keys(memoryStore)) delete memoryStore[k];
});

describe('build-time credentials (VITE_TB_USER + VITE_TB_TOKEN)', () => {
  it('hasEnvCredentials() returns true when both env vars are set', async () => {
    const mod = await import('./api');
    expect(mod.hasEnvCredentials()).toBe(true);
  });

  it('getCredentials() returns the env pair, ignoring localStorage', async () => {
    const mod = await import('./api');
    // Even if someone wrote to localStorage, env wins.
    mod.setCredentials('local-user@example.com', 'local-token');
    expect(mod.getCredentials()).toEqual({
      user: 'env-user@example.com',
      token: 'env-token-abcdef',
    });
  });

  it('fetches use the env pair in the query string', async () => {
    const mod = await import('./api');
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
    await mod.api.getMeta();
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('user=env-user%40example.com');
    expect(url).toContain('token=env-token-abcdef');
  });
});
