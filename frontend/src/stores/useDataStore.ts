import { create } from 'zustand';
import type {
  SummaryMeta,
  LatestSummary,
  DailySummary,
  WeeklySummary,
  MonthlySummary,
  ProviderAllTime,
  MachineAllTime,
} from '@/types/summary';
import { api, getCredentials } from '@/services/api';
import { fetchWithCache } from '@/services/cache';

/**
 * Prefix every cache key with the current user's email so two
 * accounts using the same browser don't read each other's
 * summaries. Falls back to `anon` only as a defensive default —
 * the data store should never run without creds because the
 * sign-in modal blocks the UI until they're set.
 */
function userKey(): string {
  return getCredentials()?.user ?? 'anon';
}

interface DataStore {
  meta: SummaryMeta | null;
  latest: LatestSummary | null;
  dailyCache: Record<string, DailySummary>;
  weeklyCache: Record<string, WeeklySummary>;
  monthlyCache: Record<string, MonthlySummary>;
  providerCache: Record<string, ProviderAllTime>;
  machineCache: Record<string, MachineAllTime>;
  isLoading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  fetchDaily: (date: string) => Promise<DailySummary>;
  fetchWeekly: (week: string) => Promise<WeeklySummary>;
  fetchMonthly: (month: string) => Promise<MonthlySummary>;
  fetchProvider: (id: string) => Promise<ProviderAllTime>;
  fetchMachine: (id: string) => Promise<MachineAllTime>;
}

export const useDataStore = create<DataStore>((set, get) => ({
  meta: null,
  latest: null,
  dailyCache: {},
  weeklyCache: {},
  monthlyCache: {},
  providerCache: {},
  machineCache: {},
  isLoading: false,
  error: null,

  initialize: async () => {
    if (get().latest) return; // already initialized
    set({ isLoading: true, error: null });
    try {
      const u = userKey();
      const [meta, latest] = await Promise.all([
        fetchWithCache(`${u}:meta`, api.getMeta),
        fetchWithCache(`${u}:latest`, api.getLatest),
      ]);
      set({ meta, latest, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
    }
  },

  fetchDaily: async (date: string) => {
    const cached = get().dailyCache[date];
    if (cached) return cached;
    const data = await fetchWithCache(`${userKey()}:daily:${date}`, () => api.getDaily(date));
    set((s) => ({ dailyCache: { ...s.dailyCache, [date]: data } }));
    return data;
  },

  fetchWeekly: async (week: string) => {
    const cached = get().weeklyCache[week];
    if (cached) return cached;
    const data = await fetchWithCache(`${userKey()}:weekly:${week}`, () => api.getWeekly(week));
    set((s) => ({ weeklyCache: { ...s.weeklyCache, [week]: data } }));
    return data;
  },

  fetchMonthly: async (month: string) => {
    const cached = get().monthlyCache[month];
    if (cached) return cached;
    const data = await fetchWithCache(`${userKey()}:monthly:${month}`, () => api.getMonthly(month));
    set((s) => ({ monthlyCache: { ...s.monthlyCache, [month]: data } }));
    return data;
  },

  fetchProvider: async (id: string) => {
    const cached = get().providerCache[id];
    if (cached) return cached;
    const data = await fetchWithCache(`${userKey()}:provider:${id}`, () => api.getProvider(id));
    set((s) => ({ providerCache: { ...s.providerCache, [id]: data } }));
    return data;
  },

  fetchMachine: async (id: string) => {
    const cached = get().machineCache[id];
    if (cached) return cached;
    const data = await fetchWithCache(`${userKey()}:machine:${id}`, () => api.getMachine(id));
    set((s) => ({ machineCache: { ...s.machineCache, [id]: data } }));
    return data;
  },
}));
