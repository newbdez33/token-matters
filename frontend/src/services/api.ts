import type {
  SummaryMeta,
  LatestSummary,
  DailySummary,
  WeeklySummary,
  MonthlySummary,
  ProviderAllTime,
  MachineAllTime,
} from '@/types/summary';
import { recomputeCosts } from '@/services/cost';

/**
 * Backend base URL. Configured via `VITE_TB_API_BASE` so prod and
 * preview can target different Workers (prod vs staging). The
 * fallback is the prod GCU Token Beats Worker.
 */
const BASE =
  (import.meta.env.VITE_TB_API_BASE as string | undefined) ??
  'https://token-beats-api.jacky-1a4.workers.dev/v1/summary';

/**
 * Thrown when the backend rejects our `?user=&token=` pair (401).
 * The app catches this to render the token-onboarding modal
 * instead of the generic "fetch failed" error.
 */
export class ApiAuthError extends Error {
  constructor(message = 'Backend rejected the user/token pair') {
    super(message);
    this.name = 'ApiAuthError';
  }
}

/**
 * Direct subscription registry for auth failures.
 *
 * The first iteration relied on `window.unhandledrejection` to
 * reach <App />, but every fetch path is wrapped in try/catch by
 * its caller (the data store, each lazy page) — the rejection
 * never escapes, so the listener never fires and the user is
 * stuck with a generic error and no way back to the sign-in
 * modal. Pushing the event from inside `fetchJSON` instead means
 * we don't depend on whether the caller swallowed the throw.
 */
type AuthErrorListener = () => void;
const authErrorListeners = new Set<AuthErrorListener>();

export function onAuthError(listener: AuthErrorListener): () => void {
  authErrorListeners.add(listener);
  return () => authErrorListeners.delete(listener);
}

function emitAuthError(): void {
  for (const l of authErrorListeners) l();
}

const STORAGE_KEYS = {
  user: 'tb.user',
  token: 'tb.token',
} as const;

/**
 * Build-time credentials, injected via Vite env (e.g. Cloudflare
 * Pages env vars). When BOTH are set, every fetch uses them and
 * the sign-in modal never appears — convenient for a single-user
 * personal deploy where you'd rather skip the typing step.
 *
 * SECURITY: anything in `import.meta.env.VITE_*` is bundled into
 * the public JS that the browser downloads. Anyone visiting the
 * site can read your token by opening devtools. Acceptable when:
 *   - the site is single-user and you control the deploy, AND
 *   - the token only has read access to your own data (which is
 *     the only thing api_tokens grants)
 * NOT acceptable on a shared / multi-user deployment — leave
 * VITE_TB_TOKEN unset and the localStorage + modal flow runs
 * instead.
 */
const ENV_USER = import.meta.env.VITE_TB_USER as string | undefined;
const ENV_TOKEN = import.meta.env.VITE_TB_TOKEN as string | undefined;
const HAS_ENV_CREDS = Boolean(ENV_USER && ENV_TOKEN);

export function getCredentials(): { user: string; token: string } | null {
  if (HAS_ENV_CREDS) return { user: ENV_USER!, token: ENV_TOKEN! };
  const user = localStorage.getItem(STORAGE_KEYS.user);
  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (!user || !token) return null;
  return { user, token };
}

export function setCredentials(user: string, token: string): void {
  // No-op when env creds are baked in: rotating them means
  // redeploying with a new VITE_TB_TOKEN, not typing into the
  // modal. We still write through to localStorage so a later
  // env-unset deploy keeps the same browser working.
  localStorage.setItem(STORAGE_KEYS.user, user);
  localStorage.setItem(STORAGE_KEYS.token, token);
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEYS.user);
  localStorage.removeItem(STORAGE_KEYS.token);
  // Drop the IndexedDB cache too: even with per-user key prefixes
  // (see useDataStore.userKey), leaving entries behind means the
  // next account on this browser pays the cleanup cost forever.
  // Imported lazily so cost.ts and tests don't pull in Dexie just
  // to compute a token.
  import('@/services/cache').then((m) => m.clearCache()).catch(() => {});
}

/**
 * True when the running deployment has VITE_TB_USER and
 * VITE_TB_TOKEN baked in. App.tsx checks this to skip the
 * sign-in modal entirely; if env creds get rejected (rotation,
 * revocation, typo at build time) the user still sees an
 * error banner instead of a phantom modal that won't help.
 */
export function hasEnvCredentials(): boolean {
  return HAS_ENV_CREDS;
}

function authQS(): string {
  const creds = getCredentials();
  if (!creds) throw new ApiAuthError('Missing user/token in localStorage');
  return `user=${encodeURIComponent(creds.user)}&token=${encodeURIComponent(creds.token)}`;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}${sep}${authQS()}`);
  } catch (err) {
    // authQS() throws ApiAuthError when localStorage has no creds —
    // surface that to subscribers before re-throwing.
    if (err instanceof ApiAuthError) emitAuthError();
    throw err;
  }
  if (res.status === 401) {
    emitAuthError();
    throw new ApiAuthError();
  }
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * The Token Beats backend always emits cost = 0 (it doesn't carry
 * pricing). The frontend is the source of truth for cost: every
 * fetch flows through `recomputeCosts()` so the dashboard sees the
 * locally-computed values, never the zeroed wire format.
 */
export const api = {
  getMeta: () => fetchJSON<SummaryMeta>('meta'),
  getLatest: async () => recomputeCosts(await fetchJSON<LatestSummary>('latest')),
  getDaily: async (date: string) =>
    recomputeCosts(await fetchJSON<DailySummary>(`daily/${date}`)),
  getWeekly: async (week: string) =>
    recomputeCosts(await fetchJSON<WeeklySummary>(`weekly/${week}`)),
  getMonthly: async (month: string) =>
    recomputeCosts(await fetchJSON<MonthlySummary>(`monthly/${month}`)),
  getProvider: async (id: string) =>
    recomputeCosts(await fetchJSON<ProviderAllTime>(`providers/${id}`)),
  getMachine: async (id: string) =>
    recomputeCosts(await fetchJSON<MachineAllTime>(`machines/${id}`)),
};
