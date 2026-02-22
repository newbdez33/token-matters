import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { scanRawFiles } from '../../src/scanner.js';
import { dedupFiles } from '../../src/dedup.js';
import { loadPricing } from '../../src/pricing.js';
import {
  buildDailySummaries,
  buildWeeklySummaries,
  buildMonthlySummaries,
  buildProviderSummaries,
  buildMachineSummaries,
  buildLatestSummary,
} from '../../src/aggregator.js';
import type { PricingConfig, RawDataFile } from '../../src/types.js';

const FIXTURES_RAW = path.resolve(import.meta.dirname, '../fixtures/raw');
const PRICING_PATH = path.resolve(
  import.meta.dirname,
  '../fixtures/pricing.json',
);

let files: RawDataFile[];
let pricing: PricingConfig;

async function setup() {
  const rawFiles = await scanRawFiles(FIXTURES_RAW);
  files = dedupFiles(rawFiles);
  pricing = await loadPricing(PRICING_PATH);
}

describe('buildDailySummaries', () => {
  it('builds daily summaries keyed by date', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    // Dates: 2026-02-17 (claude-code deduped to newer + trae-pro),
    //        2026-02-18 (claude-code + glm-coding),
    //        2026-02-19 (claude-code)
    expect(daily.size).toBe(3);
    expect(daily.has('2026-02-17')).toBe(true);
    expect(daily.has('2026-02-18')).toBe(true);
    expect(daily.has('2026-02-19')).toBe(true);
  });

  it('uses deduped data for 2026-02-17 (newer file)', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const d17 = daily.get('2026-02-17')!;
    // Newer file has opus: 8000 input + haiku: 800 input + trae: 180000 input
    const claudeProvider = d17.byProvider.find(
      (p) => p.provider === 'claude-code',
    )!;
    expect(claudeProvider.inputTokens).toBe(8000 + 800);
  });

  it('calculates totals across providers', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const d18 = daily.get('2026-02-18')!;
    // Claude: 15483000 total + GLM: 5000000 total
    expect(d18.totals.totalTokens).toBe(15483000 + 5000000);
  });

  it('includes cost breakdown by provider', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const d17 = daily.get('2026-02-17')!;
    expect(d17.totals.cost.totalUSD).toBeGreaterThan(0);
    expect(d17.totals.cost.byProvider['claude-code']).toBeDefined();
    expect(d17.totals.cost.byProvider['claude-code'].currency).toBe('USD');
  });

  it('includes TRAE cost as zero', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const d17 = daily.get('2026-02-17')!;
    const traeCost = d17.totals.cost.byProvider['trae-pro'];
    expect(traeCost).toBeDefined();
    expect(traeCost.amount).toBe(0);
  });

  it('includes byMachine breakdown', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const d18 = daily.get('2026-02-18')!;
    expect(d18.byMachine).toHaveLength(1);
    expect(d18.byMachine[0].machine).toBe('test-machine');
  });

  it('includes byModel breakdown', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const d19 = daily.get('2026-02-19')!;
    expect(d19.byModel.length).toBe(2); // opus + sonnet
    const opus = d19.byModel.find((m) => m.model === 'claude-opus-4-6');
    expect(opus).toBeDefined();
    expect(opus!.provider).toBe('claude-code');
  });
});

describe('buildWeeklySummaries', () => {
  it('groups daily summaries by ISO week', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const weekly = buildWeeklySummaries(daily);
    // 2026-02-17 (Mon) through 2026-02-19 (Thu) are all in week 8
    expect(weekly.size).toBe(1);
    expect(weekly.has('2026-W08')).toBe(true);
  });

  it('aggregates totals across days in week', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const weekly = buildWeeklySummaries(daily);
    const w08 = weekly.get('2026-W08')!;
    expect(w08.totals.totalTokens).toBeGreaterThan(0);
    expect(w08.dailyTrend).toHaveLength(3);
  });

  it('includes date range', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const weekly = buildWeeklySummaries(daily);
    const w08 = weekly.get('2026-W08')!;
    expect(w08.dateRange.start).toBe('2026-02-17');
    expect(w08.dateRange.end).toBe('2026-02-19');
  });
});

describe('buildMonthlySummaries', () => {
  it('groups daily summaries by month', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const monthly = buildMonthlySummaries(daily);
    expect(monthly.size).toBe(1);
    expect(monthly.has('2026-02')).toBe(true);
  });

  it('aggregates totals across days in month', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const monthly = buildMonthlySummaries(daily);
    const feb = monthly.get('2026-02')!;
    expect(feb.totals.totalTokens).toBeGreaterThan(0);
    expect(feb.dailyTrend).toHaveLength(3);
  });
});

describe('buildProviderSummaries', () => {
  it('builds per-provider all-time summaries', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const providers = buildProviderSummaries(daily);
    expect(providers.size).toBe(3);
    expect(providers.has('claude-code')).toBe(true);
    expect(providers.has('glm-coding')).toBe(true);
    expect(providers.has('trae-pro')).toBe(true);
  });

  it('includes correct date range for provider', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const providers = buildProviderSummaries(daily);
    const claude = providers.get('claude-code')!;
    expect(claude.dateRange.start).toBe('2026-02-17');
    expect(claude.dateRange.end).toBe('2026-02-19');
  });
});

describe('buildMachineSummaries', () => {
  it('builds per-machine all-time summaries', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const machines = buildMachineSummaries(daily);
    expect(machines.size).toBe(1);
    expect(machines.has('test-machine')).toBe(true);
  });
});

describe('buildLatestSummary', () => {
  it('builds latest summary with 7d and 30d periods', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const latest = buildLatestSummary(daily, '2026-02-19');
    expect(latest.last7Days).toBeDefined();
    expect(latest.last30Days).toBeDefined();
    expect(latest.lastUpdated).toBeDefined();
  });

  it('includes today if available', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const latest = buildLatestSummary(daily, '2026-02-19');
    expect(latest.today).not.toBeNull();
    expect(latest.today!.date).toBe('2026-02-19');
  });

  it('falls back to most recent day if no data for reference date', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const latest = buildLatestSummary(daily, '2026-02-20');
    expect(latest.today).not.toBeNull();
    expect(latest.today!.date).toBe('2026-02-19');
  });

  it('7d period covers correct range', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const latest = buildLatestSummary(daily, '2026-02-19');
    expect(latest.last7Days.dateRange.start).toBe('2026-02-13');
    expect(latest.last7Days.dateRange.end).toBe('2026-02-19');
  });

  it('7d dailyTrend includes only days with data', async () => {
    await setup();
    const daily = buildDailySummaries(files, pricing);
    const latest = buildLatestSummary(daily, '2026-02-19');
    // Only 3 days have data in our fixtures (17, 18, 19)
    expect(latest.last7Days.dailyTrend.length).toBe(3);
  });
});
