import pricing from '@/config/pricing.json';
import type {
  DailySummary,
  LatestSummary,
  MachineAllTime,
  MonthlySummary,
  PeriodSummary,
  ProviderAllTime,
  ProviderSummary,
  TokenTotals,
  WeeklySummary,
} from '@/types/summary';

/**
 * Recompute cost fields client-side, matching the original
 * upstream summary generator (`summary/src/pricing.ts`).
 *
 * The Token Beats backend emits cost = 0 everywhere — pricing is
 * frontend-owned (single source of truth in `config/pricing.json`).
 * Every fetch in `api.ts` runs through `recomputeCosts()` before
 * reaching the store, so consumers can rely on `cost.totalUSD` /
 * `costUSD` fields being meaningful.
 *
 * Approximation note: the backend has lost record-level
 * granularity by the time it reaches us. We have per-provider
 * input/output/cache split (`ProviderSummary`) and per-model
 * `totalTokens` (`ModelSummary`), but not per-model input/output.
 * For each provider we pick the dominant model from `byModel`
 * (highest `totalTokens` for that provider) and apply that
 * model's pricing to the provider's full token split. This is
 * exact for users who use one model per provider per day (the
 * common case) and slightly off for mixed-model days. Users who
 * need precise per-model cost should run the desktop tracker's
 * own analytics.
 */

interface ModelPricing {
  inputPerMTok?: number;
  outputPerMTok?: number;
  cacheCreationPerMTok?: number;
  cacheReadPerMTok?: number;
  totalPerKTok?: number;
  currency: string;
}

interface ProviderPricingToken {
  type: 'token';
  models: Record<string, ModelPricing>;
}

interface PricingConfig {
  exchangeRates: Record<string, number>;
  providers: Record<
    string,
    | ProviderPricingToken
    | { type: 'subscription'; subscription: { plan: string; monthlyCost: number; currency: string } }
  >;
}

const PRICING = pricing as PricingConfig;

function findModelPricing(
  models: Record<string, ModelPricing>,
  modelName: string | undefined,
): ModelPricing | null {
  if (!modelName) return models['_default'] ?? null;
  if (models[modelName]) return models[modelName];
  // Prefix match — model identifiers from logs sometimes carry
  // a date suffix (e.g. "claude-sonnet-4-6-20260301").
  for (const key of Object.keys(models)) {
    if (key !== '_default' && modelName.startsWith(key)) {
      return models[key]!;
    }
  }
  return models['_default'] ?? null;
}

function convertToUSD(amount: number, currency: string): number {
  if (currency === 'USD') return amount;
  const rate = PRICING.exchangeRates[`${currency}/USD`];
  if (!rate) return 0;
  return amount * rate;
}

interface PerProviderTokens {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}

function computeProviderCost(
  providerId: string,
  tokens: PerProviderTokens,
  modelHint: string | undefined,
): { amount: number; currency: string } {
  const providerPricing = PRICING.providers[providerId];
  if (!providerPricing) return { amount: 0, currency: 'USD' };
  if (providerPricing.type === 'subscription') {
    return { amount: 0, currency: providerPricing.subscription.currency };
  }
  const modelPricing = findModelPricing(providerPricing.models, modelHint);
  if (!modelPricing) return { amount: 0, currency: 'USD' };

  if (modelPricing.totalPerKTok !== undefined) {
    const kTok = tokens.totalTokens / 1000;
    return { amount: kTok * modelPricing.totalPerKTok, currency: modelPricing.currency };
  }

  const input = tokens.inputTokens / 1_000_000;
  const output = tokens.outputTokens / 1_000_000;
  const cacheWrite = tokens.cacheCreationTokens / 1_000_000;
  const cacheRead = tokens.cacheReadTokens / 1_000_000;

  const amount =
    input * (modelPricing.inputPerMTok ?? 0) +
    output * (modelPricing.outputPerMTok ?? 0) +
    cacheWrite * (modelPricing.cacheCreationPerMTok ?? 0) +
    cacheRead * (modelPricing.cacheReadPerMTok ?? 0);

  return { amount, currency: modelPricing.currency };
}

/**
 * Pick the dominant model (highest totalTokens) for the given
 * provider out of a `byModel[]` list. Returns undefined when the
 * caller has no per-model breakdown for this provider — pricing
 * then falls back to `_default` per `findModelPricing`.
 */
function dominantModelFor(
  providerId: string,
  byModel: Array<{ provider: string; model: string; totalTokens: number }>,
): string | undefined {
  let best: { model: string; tokens: number } | null = null;
  for (const m of byModel) {
    if (m.provider !== providerId) continue;
    if (!best || m.totalTokens > best.tokens) {
      best = { model: m.model, tokens: m.totalTokens };
    }
  }
  return best?.model;
}

/**
 * Recompute cost on a `ProviderSummary[]` and return a fresh
 * `TokenTotals` whose `cost` aggregates match. The byModel hint
 * lets us pick the dominant model per provider when present.
 */
function applyToProviders(
  providers: ProviderSummary[],
  totals: TokenTotals,
  byModel: Array<{ provider: string; model: string; totalTokens: number }> = [],
): { providers: ProviderSummary[]; totals: TokenTotals } {
  let totalUSD = 0;
  const byProviderCost: Record<string, { amount: number; currency: string }> = {};

  const recomputedProviders = providers.map((p) => {
    const modelHint = dominantModelFor(p.provider, byModel);
    const cost = computeProviderCost(p.provider, p, modelHint);
    const costUSD = convertToUSD(cost.amount, cost.currency);
    totalUSD += costUSD;
    byProviderCost[p.provider] = { amount: cost.amount, currency: cost.currency };
    return { ...p, cost: cost.amount, costUSD, currency: cost.currency };
  });

  return {
    providers: recomputedProviders,
    totals: {
      ...totals,
      cost: { totalUSD, byProvider: byProviderCost },
    },
  };
}

function recomputeDaily(d: DailySummary): DailySummary {
  const { providers, totals } = applyToProviders(d.byProvider, d.totals, d.byModel);
  return { ...d, byProvider: providers, totals };
}

function recomputePeriod<
  T extends PeriodSummary | WeeklySummary | MonthlySummary | ProviderAllTime | MachineAllTime,
>(p: T): T {
  // ProviderAllTime / MachineAllTime carry totals but no
  // ProviderSummary[] or byModel — they're already scoped to a
  // single provider/machine. Recompute their `totals.cost` from
  // the totals' own token split, treating the row as a single
  // provider bucket.
  if (!('byProvider' in p)) {
    const synthetic: ProviderSummary = {
      provider: 'provider' in p ? p.provider : 'unknown',
      dataQuality: 'exact',
      inputTokens: p.totals.inputTokens,
      outputTokens: p.totals.outputTokens,
      cacheCreationTokens: p.totals.cacheCreationTokens,
      cacheReadTokens: p.totals.cacheReadTokens,
      totalTokens: p.totals.totalTokens,
      cost: 0,
      costUSD: 0,
      currency: 'USD',
      requests: p.totals.requests,
    };
    const { totals } = applyToProviders([synthetic], p.totals);
    return { ...p, totals };
  }

  const { providers, totals } = applyToProviders(p.byProvider, p.totals);
  return { ...p, byProvider: providers, totals };
}

/**
 * Polymorphic entry point. Walks whatever summary shape it gets
 * (latest / daily / weekly / monthly / provider / machine) and
 * returns a structurally identical value with cost fields filled
 * in. Idempotent — re-running on already-recomputed data is a
 * no-op.
 */
export function recomputeCosts<
  T extends
    | DailySummary
    | LatestSummary
    | PeriodSummary
    | WeeklySummary
    | MonthlySummary
    | ProviderAllTime
    | MachineAllTime,
>(input: T): T {
  // LatestSummary
  if ('last7Days' in input && 'last30Days' in input) {
    const ls = input as LatestSummary;
    return {
      ...ls,
      last7Days: recomputePeriod(ls.last7Days),
      last30Days: recomputePeriod(ls.last30Days),
      today: ls.today ? recomputeDaily(ls.today) : null,
    } as T;
  }
  // DailySummary
  if ('byModel' in input) {
    return recomputeDaily(input as DailySummary) as T;
  }
  // PeriodSummary / WeeklySummary / MonthlySummary / ProviderAllTime / MachineAllTime
  return recomputePeriod(input as PeriodSummary) as T;
}
