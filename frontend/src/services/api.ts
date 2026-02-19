import type {
  SummaryMeta,
  LatestSummary,
  DailySummary,
  WeeklySummary,
  MonthlySummary,
  ProviderAllTime,
} from '@/types/summary';

const BASE = 'https://newbdez33.github.io/token-matters-summary/summary';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getMeta: () => fetchJSON<SummaryMeta>('meta.json'),
  getLatest: () => fetchJSON<LatestSummary>('latest.json'),
  getDaily: (date: string) => fetchJSON<DailySummary>(`daily/${date}.json`),
  getWeekly: (week: string) => fetchJSON<WeeklySummary>(`weekly/${week}.json`),
  getMonthly: (month: string) => fetchJSON<MonthlySummary>(`monthly/${month}.json`),
  getProvider: (id: string) => fetchJSON<ProviderAllTime>(`providers/${id}.json`),
};
