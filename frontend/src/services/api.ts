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

const STORAGE_KEYS = {
  user: 'tb.user',
  token: 'tb.token',
} as const;

export function getCredentials(): { user: string; token: string } | null {
  const user = localStorage.getItem(STORAGE_KEYS.user);
  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (!user || !token) return null;
  return { user, token };
}

export function setCredentials(user: string, token: string): void {
  localStorage.setItem(STORAGE_KEYS.user, user);
  localStorage.setItem(STORAGE_KEYS.token, token);
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEYS.user);
  localStorage.removeItem(STORAGE_KEYS.token);
}

function authQS(): string {
  const creds = getCredentials();
  if (!creds) throw new ApiAuthError('Missing user/token in localStorage');
  return `user=${encodeURIComponent(creds.user)}&token=${encodeURIComponent(creds.token)}`;
}

async function fetchJSON<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${BASE}/${path}${sep}${authQS()}`);
  if (res.status === 401) throw new ApiAuthError();
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
