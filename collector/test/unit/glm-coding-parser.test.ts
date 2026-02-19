import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseModelUsageResponse,
  aggregateGlmByDate,
  type GlmModelUsageResponse,
} from '../../src/providers/glm-coding-parser.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures', 'glm');

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'));
}

describe('parseModelUsageResponse', () => {
  it('parses hourly time series into records', () => {
    const data = loadFixture<GlmModelUsageResponse>('model-usage.json');
    const records = parseModelUsageResponse(data);
    expect(records).toHaveLength(5);
    expect(records[0]).toEqual({
      datetime: '2026-02-18 08:00:00',
      modelCalls: 10,
      tokensUsage: 50000,
    });
  });

  it('treats null values as 0', () => {
    const data = loadFixture<GlmModelUsageResponse>('model-usage.json');
    const records = parseModelUsageResponse(data);
    // The third entry has null for both fields
    expect(records[2].modelCalls).toBe(0);
    expect(records[2].tokensUsage).toBe(0);
  });

  it('returns empty array for missing data', () => {
    const records = parseModelUsageResponse({
      code: 200,
      msg: 'success',
      success: true,
      data: { x_time: [], modelCallCount: [], tokensUsage: [], totalUsage: { totalModelCallCount: 0, totalTokensUsage: 0 } },
    });
    expect(records).toEqual([]);
  });
});

describe('aggregateGlmByDate', () => {
  it('groups hourly records by date', () => {
    const data = loadFixture<GlmModelUsageResponse>('model-usage.json');
    const records = parseModelUsageResponse(data);
    const agg = aggregateGlmByDate(records);

    expect(agg.has('2026-02-18')).toBe(true);
    expect(agg.has('2026-02-19')).toBe(true);
  });

  it('sums calls and tokens per day', () => {
    const data = loadFixture<GlmModelUsageResponse>('model-usage.json');
    const records = parseModelUsageResponse(data);
    const agg = aggregateGlmByDate(records);

    const feb18 = agg.get('2026-02-18')!;
    // 10 + 5 + 0 = 15 calls, 50000 + 30000 + 0 = 80000 tokens
    expect(feb18.modelCalls).toBe(15);
    expect(feb18.tokensUsage).toBe(80000);

    const feb19 = agg.get('2026-02-19')!;
    // 20 + 8 = 28 calls, 100000 + 40000 = 140000 tokens
    expect(feb19.modelCalls).toBe(28);
    expect(feb19.tokensUsage).toBe(140000);
  });

  it('filters by date when dateFilter provided', () => {
    const data = loadFixture<GlmModelUsageResponse>('model-usage.json');
    const records = parseModelUsageResponse(data);
    const agg = aggregateGlmByDate(records, ['2026-02-18']);

    expect(agg.has('2026-02-18')).toBe(true);
    expect(agg.has('2026-02-19')).toBe(false);
  });

  it('handles empty records', () => {
    const agg = aggregateGlmByDate([]);
    expect(agg.size).toBe(0);
  });
});
