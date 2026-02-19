import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadPricing, calculateRecordCost } from '../../src/pricing.js';
import type { PricingConfig, RawRecord } from '../../src/types.js';

const PRICING_PATH = path.resolve(
  import.meta.dirname,
  '../fixtures/pricing.json',
);

describe('loadPricing', () => {
  it('loads pricing config from file', async () => {
    const config = await loadPricing(PRICING_PATH);
    expect(config.exchangeRates['CNY/USD']).toBe(0.1389);
    expect(config.providers['claude-code'].type).toBe('token');
    expect(config.providers['trae-pro'].type).toBe('subscription');
  });
});

describe('calculateRecordCost', () => {
  let pricing: PricingConfig;

  const loadConfig = async () => {
    pricing = await loadPricing(PRICING_PATH);
  };

  it('calculates Claude opus cost correctly', async () => {
    await loadConfig();
    const record: RawRecord = {
      model: 'claude-opus-4-6',
      inputTokens: 1000000, // 1M input
      outputTokens: 1000000, // 1M output
      cacheCreationTokens: 1000000, // 1M cache write
      cacheReadTokens: 1000000, // 1M cache read
      totalTokens: 4000000,
      requests: 100,
    };
    const result = calculateRecordCost(record, 'claude-code', pricing);
    // 1M × $15/M + 1M × $75/M + 1M × $18.75/M + 1M × $1.50/M = $110.25
    expect(result.amount).toBeCloseTo(110.25, 2);
    expect(result.currency).toBe('USD');
  });

  it('matches Claude haiku by prefix', async () => {
    await loadConfig();
    const record: RawRecord = {
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 1000000,
      outputTokens: 1000000,
      cacheCreationTokens: 1000000,
      cacheReadTokens: 1000000,
      totalTokens: 4000000,
      requests: 50,
    };
    const result = calculateRecordCost(record, 'claude-code', pricing);
    // 1M × $0.80/M + 1M × $4/M + 1M × $1.0/M + 1M × $0.08/M = $5.88
    expect(result.amount).toBeCloseTo(5.88, 2);
    expect(result.currency).toBe('USD');
  });

  it('calculates GLM cost with CNY conversion', async () => {
    await loadConfig();
    const record: RawRecord = {
      totalTokens: 1000000, // 1M tokens = 1000 KTok
      requests: 50,
    };
    const result = calculateRecordCost(record, 'glm-coding', pricing);
    // 1000 KTok × ¥0.05/KTok = ¥50
    expect(result.amount).toBeCloseTo(50, 2);
    expect(result.currency).toBe('CNY');
  });

  it('returns zero cost for subscription providers', async () => {
    await loadConfig();
    const record: RawRecord = {
      totalTokens: 200000,
      inputTokens: 180000,
      outputTokens: 20000,
      requests: 100,
    };
    const result = calculateRecordCost(record, 'trae-pro', pricing);
    expect(result.amount).toBe(0);
    expect(result.currency).toBe('USD');
  });

  it('returns zero for unknown provider', async () => {
    await loadConfig();
    const record: RawRecord = { totalTokens: 1000, requests: 1 };
    const result = calculateRecordCost(record, 'unknown-provider', pricing);
    expect(result.amount).toBe(0);
    expect(result.currency).toBe('USD');
  });

  it('returns zero for unknown model in token provider', async () => {
    await loadConfig();
    const record: RawRecord = {
      model: 'totally-unknown-model',
      inputTokens: 1000,
      outputTokens: 1000,
      totalTokens: 2000,
      requests: 1,
    };
    const result = calculateRecordCost(record, 'claude-code', pricing);
    expect(result.amount).toBe(0);
    expect(result.currency).toBe('USD');
  });

  it('falls back to _default model pricing', async () => {
    await loadConfig();
    const record: RawRecord = {
      model: 'some-glm-model',
      totalTokens: 100000, // 100 KTok
      requests: 10,
    };
    const result = calculateRecordCost(record, 'glm-coding', pricing);
    // 100 KTok × ¥0.05/KTok = ¥5
    expect(result.amount).toBeCloseTo(5, 2);
    expect(result.currency).toBe('CNY');
  });

  it('handles missing token fields gracefully', async () => {
    await loadConfig();
    const record: RawRecord = {
      model: 'claude-opus-4-6',
      totalTokens: 100,
      requests: 1,
    };
    const result = calculateRecordCost(record, 'claude-code', pricing);
    // Only totalTokens set, input/output/cache are 0 → cost = 0
    expect(result.amount).toBe(0);
    expect(result.currency).toBe('USD');
  });
});
