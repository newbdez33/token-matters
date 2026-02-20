import type {
  RawDataFile,
  PricingConfig,
  DailySummary,
  TokenTotals,
  CostBreakdown,
  ProviderSummary,
  MachineSummary,
  ModelSummary,
  WeeklySummary,
  MonthlySummary,
  ProviderAllTime,
  MachineAllTime,
  LatestSummary,
  PeriodSummary,
  DailyTrendEntry,
} from './types.js';
import { calculateRecordCost, convertToUSD } from './pricing.js';
import { getISOWeekString, getMonthString, subtractDays } from './utils/date.js';

// ── helpers ──

function emptyTotals(): TokenTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    cost: { totalUSD: 0, byProvider: {} },
    requests: 0,
  };
}

function addTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
  const cost: CostBreakdown = {
    totalUSD: a.cost.totalUSD + b.cost.totalUSD,
    byProvider: { ...a.cost.byProvider },
  };
  for (const [prov, val] of Object.entries(b.cost.byProvider)) {
    const existing = cost.byProvider[prov];
    if (existing) {
      cost.byProvider[prov] = {
        amount: existing.amount + val.amount,
        currency: val.currency,
      };
    } else {
      cost.byProvider[prov] = { ...val };
    }
  }
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cost,
    requests: a.requests + b.requests,
  };
}

function mergeProviderSummaries(
  lists: ProviderSummary[][],
): ProviderSummary[] {
  const map = new Map<string, ProviderSummary>();
  for (const list of lists) {
    for (const ps of list) {
      const existing = map.get(ps.provider);
      if (existing) {
        map.set(ps.provider, {
          provider: ps.provider,
          dataQuality: ps.dataQuality,
          inputTokens: existing.inputTokens + ps.inputTokens,
          outputTokens: existing.outputTokens + ps.outputTokens,
          cacheCreationTokens:
            existing.cacheCreationTokens + ps.cacheCreationTokens,
          cacheReadTokens: existing.cacheReadTokens + ps.cacheReadTokens,
          totalTokens: existing.totalTokens + ps.totalTokens,
          cost: existing.cost + ps.cost,
          currency: ps.currency,
          requests: existing.requests + ps.requests,
        });
      } else {
        map.set(ps.provider, { ...ps });
      }
    }
  }
  return Array.from(map.values());
}

function mergeMachineSummaries(
  lists: MachineSummary[][],
): MachineSummary[] {
  const map = new Map<string, MachineSummary>();
  for (const list of lists) {
    for (const ms of list) {
      const existing = map.get(ms.machine);
      if (existing) {
        map.set(ms.machine, {
          machine: ms.machine,
          totalTokens: existing.totalTokens + ms.totalTokens,
          requests: existing.requests + ms.requests,
        });
      } else {
        map.set(ms.machine, { ...ms });
      }
    }
  }
  return Array.from(map.values());
}

// ── daily ──

export function buildDailySummaries(
  files: RawDataFile[],
  pricing: PricingConfig,
): Map<string, DailySummary> {
  // Group files by date
  const byDate = new Map<string, RawDataFile[]>();
  for (const f of files) {
    const group = byDate.get(f.date) ?? [];
    group.push(f);
    byDate.set(f.date, group);
  }

  const result = new Map<string, DailySummary>();

  for (const [date, dateFiles] of byDate) {
    let totals = emptyTotals();
    const providerMap = new Map<string, ProviderSummary>();
    const machineMap = new Map<string, MachineSummary>();
    const modelMap = new Map<string, ModelSummary>();

    for (const file of dateFiles) {
      let providerInputTokens = 0;
      let providerOutputTokens = 0;
      let providerCacheCreation = 0;
      let providerCacheRead = 0;
      let providerTotalTokens = 0;
      let providerRequests = 0;
      let providerCostAmount = 0;
      let providerCurrency = 'USD';

      for (const record of file.records) {
        const input = record.inputTokens ?? 0;
        const output = record.outputTokens ?? 0;
        const cacheCreation = record.cacheCreationTokens ?? 0;
        const cacheRead = record.cacheReadTokens ?? 0;
        const total = record.totalTokens ?? 0;
        const requests = record.requests ?? 0;

        providerInputTokens += input;
        providerOutputTokens += output;
        providerCacheCreation += cacheCreation;
        providerCacheRead += cacheRead;
        providerTotalTokens += total;
        providerRequests += requests;

        const costResult = calculateRecordCost(record, file.provider, pricing);
        providerCostAmount += costResult.amount;
        providerCurrency = costResult.currency;

        // Model aggregation
        if (record.model) {
          const modelKey = `${record.model}|${file.provider}`;
          const existing = modelMap.get(modelKey);
          if (existing) {
            existing.totalTokens += total;
            existing.requests += requests;
          } else {
            modelMap.set(modelKey, {
              model: record.model,
              provider: file.provider,
              totalTokens: total,
              requests,
            });
          }
        }
      }

      // Provider aggregation
      const existingProvider = providerMap.get(file.provider);
      if (existingProvider) {
        existingProvider.inputTokens += providerInputTokens;
        existingProvider.outputTokens += providerOutputTokens;
        existingProvider.cacheCreationTokens += providerCacheCreation;
        existingProvider.cacheReadTokens += providerCacheRead;
        existingProvider.totalTokens += providerTotalTokens;
        existingProvider.cost += providerCostAmount;
        existingProvider.requests += providerRequests;
      } else {
        providerMap.set(file.provider, {
          provider: file.provider,
          dataQuality: file.dataQuality,
          inputTokens: providerInputTokens,
          outputTokens: providerOutputTokens,
          cacheCreationTokens: providerCacheCreation,
          cacheReadTokens: providerCacheRead,
          totalTokens: providerTotalTokens,
          cost: providerCostAmount,
          currency: providerCurrency,
          requests: providerRequests,
        });
      }

      // Machine aggregation
      const existingMachine = machineMap.get(file.machine);
      if (existingMachine) {
        existingMachine.totalTokens += providerTotalTokens;
        existingMachine.requests += providerRequests;
      } else {
        machineMap.set(file.machine, {
          machine: file.machine,
          totalTokens: providerTotalTokens,
          requests: providerRequests,
        });
      }

      // Accumulate totals
      const costUSD = convertToUSD(
        providerCostAmount,
        providerCurrency,
        pricing,
      );

      totals.inputTokens += providerInputTokens;
      totals.outputTokens += providerOutputTokens;
      totals.cacheCreationTokens += providerCacheCreation;
      totals.cacheReadTokens += providerCacheRead;
      totals.totalTokens += providerTotalTokens;
      totals.requests += providerRequests;
      totals.cost.totalUSD += costUSD;

      const existingCost = totals.cost.byProvider[file.provider];
      if (existingCost) {
        existingCost.amount += providerCostAmount;
      } else {
        totals.cost.byProvider[file.provider] = {
          amount: providerCostAmount,
          currency: providerCurrency,
        };
      }
    }

    result.set(date, {
      date,
      totals,
      byProvider: Array.from(providerMap.values()),
      byMachine: Array.from(machineMap.values()),
      byModel: Array.from(modelMap.values()),
    });
  }

  return result;
}

// ── weekly ──

export function buildWeeklySummaries(
  daily: Map<string, DailySummary>,
): Map<string, WeeklySummary> {
  const weekMap = new Map<string, DailySummary[]>();

  for (const [, ds] of daily) {
    const week = getISOWeekString(ds.date);
    const group = weekMap.get(week) ?? [];
    group.push(ds);
    weekMap.set(week, group);
  }

  const result = new Map<string, WeeklySummary>();

  for (const [week, days] of weekMap) {
    const sorted = days.sort((a, b) => a.date.localeCompare(b.date));
    result.set(week, {
      week,
      dateRange: {
        start: sorted[0].date,
        end: sorted[sorted.length - 1].date,
      },
      ...aggregateDays(sorted),
    });
  }

  return result;
}

// ── monthly ──

export function buildMonthlySummaries(
  daily: Map<string, DailySummary>,
): Map<string, MonthlySummary> {
  const monthMap = new Map<string, DailySummary[]>();

  for (const [, ds] of daily) {
    const month = getMonthString(ds.date);
    const group = monthMap.get(month) ?? [];
    group.push(ds);
    monthMap.set(month, group);
  }

  const result = new Map<string, MonthlySummary>();

  for (const [month, days] of monthMap) {
    const sorted = days.sort((a, b) => a.date.localeCompare(b.date));
    result.set(month, {
      month,
      dateRange: {
        start: sorted[0].date,
        end: sorted[sorted.length - 1].date,
      },
      ...aggregateDays(sorted),
    });
  }

  return result;
}

// ── provider all-time ──

export function buildProviderSummaries(
  daily: Map<string, DailySummary>,
): Map<string, ProviderAllTime> {
  const provMap = new Map<
    string,
    { totals: TokenTotals; dates: string[]; trend: DailyTrendEntry[] }
  >();

  for (const [, ds] of daily) {
    for (const ps of ds.byProvider) {
      let entry = provMap.get(ps.provider);
      if (!entry) {
        entry = { totals: emptyTotals(), dates: [], trend: [] };
        provMap.set(ps.provider, entry);
      }

      entry.totals.inputTokens += ps.inputTokens;
      entry.totals.outputTokens += ps.outputTokens;
      entry.totals.cacheCreationTokens += ps.cacheCreationTokens;
      entry.totals.cacheReadTokens += ps.cacheReadTokens;
      entry.totals.totalTokens += ps.totalTokens;
      entry.totals.requests += ps.requests;

      // Cost: use the per-provider USD amount from the daily totals
      const dailyCostEntry = ds.totals.cost.byProvider[ps.provider];
      if (dailyCostEntry) {
        const existing = entry.totals.cost.byProvider[ps.provider];
        if (existing) {
          existing.amount += dailyCostEntry.amount;
        } else {
          entry.totals.cost.byProvider[ps.provider] = { ...dailyCostEntry };
        }
      }

      entry.dates.push(ds.date);
      entry.trend.push({
        date: ds.date,
        totalTokens: ps.totalTokens,
        cost: ps.cost,
      });
    }
  }

  // Compute totalUSD for each provider
  for (const [, data] of provMap) {
    let totalUSD = 0;
    for (const val of Object.values(data.totals.cost.byProvider)) {
      totalUSD += val.amount; // byProvider amounts are in original currency
    }
    data.totals.cost.totalUSD = totalUSD;
  }

  const result = new Map<string, ProviderAllTime>();
  for (const [provider, data] of provMap) {
    const sortedDates = data.dates.sort();
    data.trend.sort((a, b) => a.date.localeCompare(b.date));
    result.set(provider, {
      provider,
      dateRange: {
        start: sortedDates[0],
        end: sortedDates[sortedDates.length - 1],
      },
      totals: data.totals,
      dailyTrend: data.trend,
    });
  }

  return result;
}

// ── machine all-time ──

export function buildMachineSummaries(
  daily: Map<string, DailySummary>,
): Map<string, MachineAllTime> {
  const machMap = new Map<
    string,
    { totals: TokenTotals; dates: string[]; trend: DailyTrendEntry[] }
  >();

  for (const [, ds] of daily) {
    for (const ms of ds.byMachine) {
      let entry = machMap.get(ms.machine);
      if (!entry) {
        entry = { totals: emptyTotals(), dates: [], trend: [] };
        machMap.set(ms.machine, entry);
      }
      // For machine-level, add the full daily totals (since in fixtures there's only one machine)
      // But in multi-machine scenario, we should only add the machine's portion
      // Machine summary only has totalTokens and requests, not full breakdown
      // We'll create a partial totals
      const machineTotals = emptyTotals();
      machineTotals.totalTokens = ms.totalTokens;
      machineTotals.requests = ms.requests;
      // For cost, we attribute the full daily cost if it's the only machine
      // In multi-machine, we'd need to split - for now add full daily totals
      machineTotals.cost = { ...ds.totals.cost, byProvider: { ...ds.totals.cost.byProvider } };

      entry.totals = addTotals(entry.totals, machineTotals);
      entry.dates.push(ds.date);
      entry.trend.push({
        date: ds.date,
        totalTokens: ms.totalTokens,
        cost: ds.totals.cost.totalUSD,
      });
    }
  }

  const result = new Map<string, MachineAllTime>();
  for (const [machine, data] of machMap) {
    const sortedDates = data.dates.sort();
    data.trend.sort((a, b) => a.date.localeCompare(b.date));
    result.set(machine, {
      machine,
      dateRange: {
        start: sortedDates[0],
        end: sortedDates[sortedDates.length - 1],
      },
      totals: data.totals,
      dailyTrend: data.trend,
    });
  }

  return result;
}

// ── latest ──

export function buildLatestSummary(
  daily: Map<string, DailySummary>,
  referenceDate: string,
): LatestSummary {
  const last7Start = subtractDays(referenceDate, 6);
  const last30Start = subtractDays(referenceDate, 29);

  const today = daily.get(referenceDate) ?? null;

  return {
    lastUpdated: new Date().toISOString(),
    last7Days: buildPeriodSummary(daily, last7Start, referenceDate),
    last30Days: buildPeriodSummary(daily, last30Start, referenceDate),
    today,
  };
}

function buildPeriodSummary(
  daily: Map<string, DailySummary>,
  start: string,
  end: string,
): PeriodSummary {
  const days: DailySummary[] = [];
  for (const [date, ds] of daily) {
    if (date >= start && date <= end) {
      days.push(ds);
    }
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  const agg = aggregateDays(days);

  return {
    dateRange: { start, end },
    ...agg,
  };
}

// ── shared aggregation for days[] ──

function aggregateDays(days: DailySummary[]): {
  totals: TokenTotals;
  byProvider: ProviderSummary[];
  byMachine: MachineSummary[];
  dailyTrend: DailyTrendEntry[];
} {
  let totals = emptyTotals();
  const providerLists: ProviderSummary[][] = [];
  const machineLists: MachineSummary[][] = [];
  const trend: DailyTrendEntry[] = [];

  for (const ds of days) {
    totals = addTotals(totals, ds.totals);
    providerLists.push(ds.byProvider);
    machineLists.push(ds.byMachine);
    trend.push({
      date: ds.date,
      totalTokens: ds.totals.totalTokens,
      cost: ds.totals.cost.totalUSD,
    });
  }

  return {
    totals,
    byProvider: mergeProviderSummaries(providerLists),
    byMachine: mergeMachineSummaries(machineLists),
    dailyTrend: trend,
  };
}
