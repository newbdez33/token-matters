export type DataQuality = 'exact' | 'estimated' | 'partial';

export interface CostBreakdown {
  totalUSD: number;
  byProvider: Record<string, { amount: number; currency: string }>;
}

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cost: CostBreakdown;
  requests: number;
}

export interface ProviderSummary {
  provider: string;
  dataQuality: DataQuality;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cost: number;
  currency: string;
  requests: number;
}

export interface MachineSummary {
  machine: string;
  totalTokens: number;
  requests: number;
}

export interface ModelSummary {
  model: string;
  provider: string;
  totalTokens: number;
  requests: number;
}

export interface DailySummary {
  date: string;
  totals: TokenTotals;
  byProvider: ProviderSummary[];
  byMachine: MachineSummary[];
  byModel: ModelSummary[];
}

export interface DailyTrendEntry {
  date: string;
  totalTokens: number;
  cost: number;
}

export interface PeriodSummary {
  dateRange: { start: string; end: string };
  totals: TokenTotals;
  byProvider: ProviderSummary[];
  byMachine: MachineSummary[];
  dailyTrend: DailyTrendEntry[];
}

export interface WeeklySummary {
  week: string;
  dateRange: { start: string; end: string };
  totals: TokenTotals;
  byProvider: ProviderSummary[];
  byMachine: MachineSummary[];
  dailyTrend: DailyTrendEntry[];
}

export interface MonthlySummary {
  month: string;
  dateRange: { start: string; end: string };
  totals: TokenTotals;
  byProvider: ProviderSummary[];
  byMachine: MachineSummary[];
  dailyTrend: DailyTrendEntry[];
}

export interface ProviderAllTime {
  provider: string;
  dateRange: { start: string; end: string };
  totals: TokenTotals;
  dailyTrend: DailyTrendEntry[];
}

export interface MachineAllTime {
  machine: string;
  dateRange: { start: string; end: string };
  totals: TokenTotals;
  dailyTrend: DailyTrendEntry[];
}

export interface LatestSummary {
  lastUpdated: string;
  last7Days: PeriodSummary;
  last30Days: PeriodSummary;
  today: DailySummary | null;
}

export interface SummaryMeta {
  lastUpdated: string;
  dateRange: { start: string; end: string };
  providers: string[];
  machines: string[];
  models: string[];
  dailyFiles: string[];
  weeklyFiles: string[];
  monthlyFiles: string[];
}
