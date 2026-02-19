import fs from 'node:fs/promises';
import type {
  PricingConfig,
  RawRecord,
  ModelPricing,
  ProviderPricingToken,
} from './types.js';

export async function loadPricing(filePath: string): Promise<PricingConfig> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as PricingConfig;
}

function findModelPricing(
  models: Record<string, ModelPricing>,
  modelName: string | undefined,
): ModelPricing | null {
  if (!modelName) return models['_default'] ?? null;

  // 1. Exact match
  if (models[modelName]) return models[modelName];

  // 2. Prefix match: find a key that modelName starts with
  for (const key of Object.keys(models)) {
    if (key !== '_default' && modelName.startsWith(key)) {
      return models[key];
    }
  }

  // 3. _default fallback
  return models['_default'] ?? null;
}

export function calculateRecordCost(
  record: RawRecord,
  provider: string,
  pricing: PricingConfig,
): { amount: number; currency: string } {
  const providerPricing = pricing.providers[provider];
  if (!providerPricing) return { amount: 0, currency: 'USD' };

  if (providerPricing.type === 'subscription') {
    return { amount: 0, currency: providerPricing.subscription.currency };
  }

  const tokenPricing = providerPricing as ProviderPricingToken;
  const modelPricing = findModelPricing(tokenPricing.models, record.model);
  if (!modelPricing) return { amount: 0, currency: 'USD' };

  let amount = 0;

  if (modelPricing.totalPerKTok !== undefined) {
    // GLM-style: totalTokens × price per KTok
    const kTok = (record.totalTokens ?? 0) / 1000;
    amount = kTok * modelPricing.totalPerKTok;
  } else {
    // Claude-style: per-category pricing per MTok
    const input = (record.inputTokens ?? 0) / 1_000_000;
    const output = (record.outputTokens ?? 0) / 1_000_000;
    const cacheWrite = (record.cacheCreationTokens ?? 0) / 1_000_000;
    const cacheRead = (record.cacheReadTokens ?? 0) / 1_000_000;

    amount +=
      input * (modelPricing.inputPerMTok ?? 0) +
      output * (modelPricing.outputPerMTok ?? 0) +
      cacheWrite * (modelPricing.cacheCreationPerMTok ?? 0) +
      cacheRead * (modelPricing.cacheReadPerMTok ?? 0);
  }

  return { amount, currency: modelPricing.currency };
}

export function convertToUSD(
  amount: number,
  currency: string,
  pricing: PricingConfig,
): number {
  if (currency === 'USD') return amount;
  const rate = pricing.exchangeRates[`${currency}/USD`];
  if (!rate) return 0;
  return amount * rate;
}
