import { describe, it, expect } from 'vitest';
import { buildMeta } from '../../src/meta.js';
import type {
  DailySummary,
  WeeklySummary,
  MonthlySummary,
  TokenTotals,
} from '../../src/types.js';

function makeTotals(): TokenTotals {
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

function makeDaily(date: string): DailySummary {
  return {
    date,
    totals: makeTotals(),
    byProvider: [
      {
        provider: 'claude-code',
        dataQuality: 'exact',
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        cost: 0,
        currency: 'USD',
        requests: 0,
      },
    ],
    byMachine: [{ machine: 'test-machine', totalTokens: 0, requests: 0 }],
    byModel: [
      {
        model: 'claude-opus-4-6',
        provider: 'claude-code',
        totalTokens: 0,
        requests: 0,
      },
    ],
  };
}

describe('buildMeta', () => {
  it('builds meta with correct date range', () => {
    const daily = new Map<string, DailySummary>([
      ['2026-02-17', makeDaily('2026-02-17')],
      ['2026-02-19', makeDaily('2026-02-19')],
    ]);
    const weekly = new Map<string, WeeklySummary>();
    const monthly = new Map<string, MonthlySummary>();

    const meta = buildMeta(daily, weekly, monthly);
    expect(meta.dateRange.start).toBe('2026-02-17');
    expect(meta.dateRange.end).toBe('2026-02-19');
  });

  it('lists all providers', () => {
    const d = makeDaily('2026-02-17');
    d.byProvider.push({
      provider: 'glm-coding',
      dataQuality: 'partial',
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      cost: 0,
      currency: 'CNY',
      requests: 0,
    });
    const daily = new Map([['2026-02-17', d]]);
    const meta = buildMeta(daily, new Map(), new Map());
    expect(meta.providers).toContain('claude-code');
    expect(meta.providers).toContain('glm-coding');
  });

  it('lists all machines', () => {
    const daily = new Map([['2026-02-17', makeDaily('2026-02-17')]]);
    const meta = buildMeta(daily, new Map(), new Map());
    expect(meta.machines).toContain('test-machine');
  });

  it('lists all models', () => {
    const daily = new Map([['2026-02-17', makeDaily('2026-02-17')]]);
    const meta = buildMeta(daily, new Map(), new Map());
    expect(meta.models).toContain('claude-opus-4-6');
  });

  it('lists daily/weekly/monthly file keys', () => {
    const daily = new Map([
      ['2026-02-17', makeDaily('2026-02-17')],
      ['2026-02-18', makeDaily('2026-02-18')],
    ]);
    const weekly = new Map<string, WeeklySummary>([
      [
        '2026-W08',
        {
          week: '2026-W08',
          dateRange: { start: '2026-02-17', end: '2026-02-18' },
          totals: makeTotals(),
          byProvider: [],
          dailyTrend: [],
        },
      ],
    ]);
    const monthly = new Map<string, MonthlySummary>([
      [
        '2026-02',
        {
          month: '2026-02',
          dateRange: { start: '2026-02-17', end: '2026-02-18' },
          totals: makeTotals(),
          byProvider: [],
          dailyTrend: [],
        },
      ],
    ]);

    const meta = buildMeta(daily, weekly, monthly);
    expect(meta.dailyFiles).toEqual(['2026-02-17', '2026-02-18']);
    expect(meta.weeklyFiles).toEqual(['2026-W08']);
    expect(meta.monthlyFiles).toEqual(['2026-02']);
  });

  it('includes lastUpdated timestamp', () => {
    const daily = new Map([['2026-02-17', makeDaily('2026-02-17')]]);
    const meta = buildMeta(daily, new Map(), new Map());
    expect(meta.lastUpdated).toBeDefined();
    expect(new Date(meta.lastUpdated).getTime()).not.toBeNaN();
  });
});
