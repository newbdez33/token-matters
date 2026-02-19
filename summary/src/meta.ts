import type {
  DailySummary,
  WeeklySummary,
  MonthlySummary,
  SummaryMeta,
} from './types.js';

export function buildMeta(
  daily: Map<string, DailySummary>,
  weekly: Map<string, WeeklySummary>,
  monthly: Map<string, MonthlySummary>,
): SummaryMeta {
  const dates = Array.from(daily.keys()).sort();
  const providers = new Set<string>();
  const machines = new Set<string>();
  const models = new Set<string>();

  for (const ds of daily.values()) {
    for (const p of ds.byProvider) providers.add(p.provider);
    for (const m of ds.byMachine) machines.add(m.machine);
    for (const m of ds.byModel) models.add(m.model);
  }

  return {
    lastUpdated: new Date().toISOString(),
    dateRange: {
      start: dates[0] ?? '',
      end: dates[dates.length - 1] ?? '',
    },
    providers: Array.from(providers).sort(),
    machines: Array.from(machines).sort(),
    models: Array.from(models).sort(),
    dailyFiles: dates,
    weeklyFiles: Array.from(weekly.keys()).sort(),
    monthlyFiles: Array.from(monthly.keys()).sort(),
  };
}
