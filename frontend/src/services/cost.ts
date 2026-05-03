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

/**
 * When the wire format includes `byModel[]` (post token-beats #88),
 * compute cost as the proportional sum of (provider, model) tokens
 * × that exact model's pricing. This is the same per-record fold
 * the upstream summary generator does, just done after-the-fact
 * from the model-aggregated rows.
 *
 * Each model row's cost is approximated by allocating the
 * provider's full input/output/cache split proportionally by
 * `totalTokens`. Exact when a provider used only one model
 * (the common case); a small approximation when a provider mixed
 * input-heavy and output-heavy models within the period.
 */
interface ByModelRow {
  provider: string;
  model: string;
  totalTokens: number;
  // Optional — present when the backend ships exact per-model
  // splits (token-beats #88+). Without them we fall back to
  // share-of-totalTokens allocation against the provider's
  // aggregate split.
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

function applyTotalsFromByModel(
  byModel: ByModelRow[],
  byProvider: ProviderSummary[],
  totals: TokenTotals,
): { providers: ProviderSummary[]; totals: TokenTotals } {
  let totalUSD = 0;
  const byProviderCost: Record<string, { amount: number; currency: string }> = {};
  // Per-provider running totals so we can aggregate the recomputed
  // numbers back onto each ProviderSummary row at the end.
  const provAmounts = new Map<string, { amount: number; currency: string; usd: number }>();

  for (const p of byProvider) {
    const modelsForProvider = byModel.filter((m) => m.provider === p.provider);
    const providerTotalTokens = modelsForProvider.reduce(
      (s, m) => s + m.totalTokens,
      0,
    );
    if (providerTotalTokens === 0) {
      // No model rows for this provider — fall back to `_default`.
      const fallback = computeProviderCost(p.provider, p, undefined);
      const fallbackUSD = convertToUSD(fallback.amount, fallback.currency);
      provAmounts.set(p.provider, {
        amount: fallback.amount,
        currency: fallback.currency,
        usd: fallbackUSD,
      });
      totalUSD += fallbackUSD;
      byProviderCost[p.provider] = { amount: fallback.amount, currency: fallback.currency };
      continue;
    }
    let provAmount = 0;
    let provCurrency = 'USD';
    let provUsd = 0;
    for (const m of modelsForProvider) {
      // Prefer the exact per-model split when the backend
      // included it (token-beats #88+). Fall back to allocating
      // the provider's aggregate split proportionally by
      // totalTokens share when only the legacy ModelSummary
      // (totalTokens-only) is available.
      const hasExactSplit =
        m.inputTokens !== undefined ||
        m.outputTokens !== undefined ||
        m.cacheCreationTokens !== undefined ||
        m.cacheReadTokens !== undefined;
      let slice: {
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens: number;
        cacheReadTokens: number;
        totalTokens: number;
      };
      if (hasExactSplit) {
        slice = {
          inputTokens: m.inputTokens ?? 0,
          outputTokens: m.outputTokens ?? 0,
          cacheCreationTokens: m.cacheCreationTokens ?? 0,
          cacheReadTokens: m.cacheReadTokens ?? 0,
          totalTokens: m.totalTokens,
        };
      } else {
        const share = m.totalTokens / providerTotalTokens;
        slice = {
          inputTokens: p.inputTokens * share,
          outputTokens: p.outputTokens * share,
          cacheCreationTokens: p.cacheCreationTokens * share,
          cacheReadTokens: p.cacheReadTokens * share,
          totalTokens: m.totalTokens,
        };
      }
      const c = computeProviderCost(p.provider, slice, m.model);
      provAmount += c.amount;
      provCurrency = c.currency;
      provUsd += convertToUSD(c.amount, c.currency);
    }
    provAmounts.set(p.provider, { amount: provAmount, currency: provCurrency, usd: provUsd });
    totalUSD += provUsd;
    byProviderCost[p.provider] = { amount: provAmount, currency: provCurrency };
  }

  const recomputedProviders = byProvider.map((p) => {
    const a = provAmounts.get(p.provider);
    if (!a) return p;
    return { ...p, cost: a.amount, costUSD: a.usd, currency: a.currency };
  });

  return {
    providers: recomputedProviders,
    totals: {
      ...totals,
      cost: { totalUSD, byProvider: byProviderCost },
    },
  };
}

function recomputePeriod<
  T extends PeriodSummary | WeeklySummary | MonthlySummary | ProviderAllTime | MachineAllTime,
>(p: T): T {
  if (!('byProvider' in p)) {
    // ProviderAllTime: scoped to one provider. When byModel is
    // present (post-#88), compute cost as the weighted sum across
    // each model. Without it, fall back to the provider's
    // `_default` pricing applied to the totals as a single bucket.
    if ('provider' in p) {
      const synthetic: ProviderSummary = {
        provider: p.provider,
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
      const { totals } =
        p.byModel && p.byModel.length > 0
          ? applyTotalsFromByModel(p.byModel, [synthetic], p.totals)
          : applyToProviders([synthetic], p.totals);
      return { ...p, totals };
    }

    // MachineAllTime: needs byModel because totals span multiple
    // providers. With byModel we can price each (provider, model)
    // row exactly. Without it (legacy backend), pass cost through
    // unchanged — fabricating a number from the totals would be a
    // confident lie.
    if (p.byModel && p.byModel.length > 0) {
      // Synthesize one ProviderSummary per provider observed in
      // byModel so applyTotalsFromByModel can do its weighted fold.
      const provs = new Map<string, ProviderSummary>();
      for (const m of p.byModel) {
        if (provs.has(m.provider)) continue;
        // Each synthetic row carries a per-provider share of the
        // machine's totals proportional to that provider's tokens.
        const provTokens = p.byModel
          .filter((x) => x.provider === m.provider)
          .reduce((s, x) => s + x.totalTokens, 0);
        const share = p.totals.totalTokens > 0 ? provTokens / p.totals.totalTokens : 0;
        provs.set(m.provider, {
          provider: m.provider,
          dataQuality: 'exact',
          inputTokens: p.totals.inputTokens * share,
          outputTokens: p.totals.outputTokens * share,
          cacheCreationTokens: p.totals.cacheCreationTokens * share,
          cacheReadTokens: p.totals.cacheReadTokens * share,
          totalTokens: provTokens,
          cost: 0,
          costUSD: 0,
          currency: 'USD',
          requests: 0,
        });
      }
      const { totals } = applyTotalsFromByModel(
        p.byModel,
        [...provs.values()],
        p.totals,
      );
      return { ...p, totals };
    }
    return p;
  }

  // PeriodSummary / WeeklySummary / MonthlySummary
  const { providers, totals } =
    p.byModel && p.byModel.length > 0
      ? applyTotalsFromByModel(p.byModel, p.byProvider, p.totals)
      : applyToProviders(p.byProvider, p.totals);
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
  // DailySummary — uniquely has top-level `date` (PeriodSummary
  // uses dateRange.start/end, weekly adds `week`, monthly
  // `month`, and provider/machine all-time have their own
  // discriminators). Until #88 ships, the previous version
  // dispatched on `'byModel' in input`, which mis-routes once
  // PeriodSummary also carries byModel.
  if ('date' in input) {
    return recomputeDaily(input as DailySummary) as T;
  }
  // PeriodSummary / WeeklySummary / MonthlySummary / ProviderAllTime / MachineAllTime
  return recomputePeriod(input as PeriodSummary) as T;
}
