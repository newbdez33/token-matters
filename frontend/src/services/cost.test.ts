import { describe, it, expect } from 'vitest';
import { recomputeCosts } from './cost';
import type {
  DailySummary,
  LatestSummary,
  ProviderAllTime,
} from '@/types/summary';

const ZERO_COST = { totalUSD: 0, byProvider: {} };

function makeDaily(): DailySummary {
  return {
    date: '2026-04-29',
    totals: {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 1_500_000,
      cost: ZERO_COST,
      requests: 10,
    },
    byProvider: [
      {
        provider: 'claude-code',
        dataQuality: 'exact',
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 1_500_000,
        cost: 0,
        costUSD: 0,
        currency: 'USD',
        requests: 10,
      },
    ],
    byMachine: [],
    byModel: [
      { model: 'claude-sonnet-4-6', provider: 'claude-code', totalTokens: 1_500_000, requests: 10 },
    ],
  };
}

describe('recomputeCosts', () => {
  it('fills cost on a DailySummary using the dominant model', () => {
    // claude-sonnet-4-6: input $3/MTok, output $15/MTok
    // → 1 * 3 + 0.5 * 15 = 3 + 7.5 = $10.50
    const out = recomputeCosts(makeDaily());
    expect(out.byProvider[0]!.costUSD).toBeCloseTo(10.5, 5);
    expect(out.byProvider[0]!.cost).toBeCloseTo(10.5, 5);
    expect(out.byProvider[0]!.currency).toBe('USD');
    expect(out.totals.cost.totalUSD).toBeCloseTo(10.5, 5);
    expect(out.totals.cost.byProvider['claude-code']).toEqual({
      amount: expect.closeTo(10.5, 5),
      currency: 'USD',
    });
  });

  it('does not mutate the input', () => {
    const input = makeDaily();
    const snapshot = JSON.stringify(input);
    recomputeCosts(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('walks LatestSummary fields', () => {
    const latest: LatestSummary = {
      lastUpdated: '2026-04-29T00:00:00Z',
      last7Days: {
        dateRange: { start: '2026-04-23', end: '2026-04-29' },
        totals: makeDaily().totals,
        byProvider: makeDaily().byProvider,
        byMachine: [],
        dailyTrend: [],
      },
      last30Days: {
        dateRange: { start: '2026-03-31', end: '2026-04-29' },
        totals: { ...makeDaily().totals, totalTokens: 0, inputTokens: 0, outputTokens: 0 },
        byProvider: [],
        byMachine: [],
        dailyTrend: [],
      },
      today: makeDaily(),
    };
    const out = recomputeCosts(latest);
    expect(out.last7Days.totals.cost.totalUSD).toBeCloseTo(10.5, 5);
    expect(out.today!.byProvider[0]!.costUSD).toBeCloseTo(10.5, 5);
    expect(out.last30Days.totals.cost.totalUSD).toBe(0);
  });

  it('handles ProviderAllTime without byProvider/byModel', () => {
    const p: ProviderAllTime = {
      provider: 'claude-code',
      dateRange: { start: '2026-04-01', end: '2026-04-29' },
      totals: {
        inputTokens: 2_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 2_000_000,
        cost: ZERO_COST,
        requests: 1,
      },
      dailyTrend: [],
    };
    const out = recomputeCosts(p);
    // No model hint → falls back to claude-code's `_default`
    // (sonnet pricing — see pricing.json). 2M input × $3/MTok = $6.
    expect(out.provider).toBe('claude-code');
    expect(out.totals.cost.totalUSD).toBeCloseTo(6, 5);
  });

  it('uses byModel on PeriodSummary to price the weighted sum across models', () => {
    // Mixing opus (input $15/MTok) and sonnet (input $3/MTok) on
    // a 7-day window. Without byModel every input M-token gets
    // priced at one tier (5x error). With byModel the split lets
    // us price each model's share at its real rate.
    const period = {
      dateRange: { start: '2026-04-23', end: '2026-04-29' },
      totals: {
        inputTokens: 1_500_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 1_500_000,
        cost: ZERO_COST,
        requests: 2,
      },
      byProvider: [
        {
          provider: 'claude-code',
          dataQuality: 'exact' as const,
          inputTokens: 1_500_000,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 1_500_000,
          cost: 0,
          costUSD: 0,
          currency: 'USD',
          requests: 2,
        },
      ],
      byMachine: [],
      byModel: [
        { model: 'claude-opus-4-6', provider: 'claude-code', totalTokens: 1_000_000, requests: 1 },
        {
          model: 'claude-sonnet-4-6',
          provider: 'claude-code',
          totalTokens: 500_000,
          requests: 1,
        },
      ],
      dailyTrend: [],
    };
    const out = recomputeCosts(period);
    // opus share = 1M/1.5M, allocated 1M of input × $15 = $15
    // sonnet share = 0.5M/1.5M, allocated 0.5M × $3 = $1.50
    // total: $16.50
    expect(out.totals.cost.totalUSD).toBeCloseTo(16.5, 4);
    expect(out.byProvider[0]!.costUSD).toBeCloseTo(16.5, 4);
  });

  it('uses byModel on MachineAllTime to price across providers', () => {
    // Machine ran sonnet on claude-code AND o4-mini on codex.
    // Without byModel we'd pass cost through unchanged. With it,
    // we can compute exactly: (provider, model) split lets each
    // chunk hit its real pricing tier.
    const machine = {
      machine: 'mbp-jacky',
      dateRange: { start: '2026-04-01', end: '2026-04-29' },
      totals: {
        // 1M tokens total: 800K to claude-sonnet, 200K to o4-mini
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 1_000_000,
        cost: ZERO_COST,
        requests: 2,
      },
      byModel: [
        {
          model: 'claude-sonnet-4-6',
          provider: 'claude-code',
          totalTokens: 800_000,
          requests: 1,
        },
        { model: 'o4-mini', provider: 'codex', totalTokens: 200_000, requests: 1 },
      ],
      dailyTrend: [],
    };
    const out = recomputeCosts(machine);
    // claude-code share=0.8, input slice = 0.8M × $3 = $2.40
    // codex share=0.2, input slice = 0.2M × $1.10 = $0.22
    // total: $2.62
    expect(out.totals.cost.totalUSD).toBeCloseTo(2.62, 4);
  });

  it('passes MachineAllTime cost through unchanged (no provider hint to price by)', () => {
    // Regression: an earlier version synthesized a `provider:
    // 'unknown'` row, which had no pricing entry, and zeroed out
    // any pre-computed cost on the machine page. The wire format
    // doesn't carry a per-provider split for machine totals, so
    // there is no honest way to price them — leave cost alone and
    // let the UI render "—" if it cares.
    const m = {
      machine: 'mbp-jacky',
      dateRange: { start: '2026-04-01', end: '2026-04-29' },
      totals: {
        inputTokens: 2_000_000,
        outputTokens: 1_000_000,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 3_000_000,
        // Pretend the backend grew the ability to compute machine
        // cost server-side — we should NOT clobber it.
        cost: { totalUSD: 42.5, byProvider: {} },
        requests: 7,
      },
      dailyTrend: [],
    };
    const out = recomputeCosts(m);
    expect(out.totals.cost.totalUSD).toBe(42.5);
  });

  it('zeros cost for unknown providers (e.g. removed pricing)', () => {
    const d = makeDaily();
    d.byProvider[0]!.provider = 'unknown-provider';
    d.byModel[0]!.provider = 'unknown-provider';
    const out = recomputeCosts(d);
    expect(out.byProvider[0]!.costUSD).toBe(0);
    expect(out.totals.cost.totalUSD).toBe(0);
  });

  it('handles GLM-style totalPerKTok pricing with CNY→USD conversion', () => {
    const d = makeDaily();
    d.byProvider[0]!.provider = 'glm-coding';
    d.byModel[0]!.provider = 'glm-coding';
    d.byModel[0]!.model = 'glm-4-plus'; // hits _default
    const out = recomputeCosts(d);
    // 1.5M tokens / 1000 = 1500 KTok × 0.05 CNY = 75 CNY
    // × 0.1389 = ~10.4175 USD
    expect(out.byProvider[0]!.cost).toBeCloseTo(75, 5);
    expect(out.byProvider[0]!.currency).toBe('CNY');
    expect(out.byProvider[0]!.costUSD).toBeCloseTo(75 * 0.1389, 4);
  });
});
