import { create } from 'zustand';

type Granularity = 'daily' | 'weekly' | 'monthly';
type TrendRange = '7d' | '30d';

interface FilterStore {
  granularity: Granularity;
  trendRange: TrendRange;
  dateFrom: string | null;
  dateTo: string | null;

  setGranularity: (g: Granularity) => void;
  setTrendRange: (r: TrendRange) => void;
  setDateRange: (from: string | null, to: string | null) => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  granularity: 'daily',
  trendRange: '30d',
  dateFrom: null,
  dateTo: null,

  setGranularity: (granularity) => set({ granularity }),
  setTrendRange: (trendRange) => set({ trendRange }),
  setDateRange: (dateFrom, dateTo) => set({ dateFrom, dateTo }),
}));
