import { describe, it, expect } from 'vitest';
import { dedupFiles } from '../../src/dedup.js';
import type { RawDataFile } from '../../src/types.js';

function makeFile(overrides: Partial<RawDataFile>): RawDataFile {
  return {
    version: '1.0',
    collectedAt: '2026-02-17T10:00:00.000Z',
    machine: 'test-machine',
    provider: 'claude-code',
    date: '2026-02-17',
    dataQuality: 'exact',
    records: [
      {
        model: 'claude-opus-4-6',
        inputTokens: 1000,
        outputTokens: 2000,
        totalTokens: 3000,
        requests: 10,
      },
    ],
    ...overrides,
  };
}

describe('dedupFiles', () => {
  it('keeps single file as-is', () => {
    const files = [makeFile({})];
    const result = dedupFiles(files);
    expect(result).toHaveLength(1);
  });

  it('deduplicates by (provider, date, machine) keeping latest collectedAt', () => {
    const older = makeFile({ collectedAt: '2026-02-17T10:00:00.000Z' });
    const newer = makeFile({
      collectedAt: '2026-02-17T12:00:00.000Z',
      records: [
        {
          model: 'claude-opus-4-6',
          inputTokens: 8000,
          outputTokens: 150000,
          totalTokens: 158000,
          requests: 300,
        },
      ],
    });
    const result = dedupFiles([older, newer]);
    expect(result).toHaveLength(1);
    expect(result[0].records[0].inputTokens).toBe(8000);
  });

  it('keeps files with different dates', () => {
    const day1 = makeFile({ date: '2026-02-17' });
    const day2 = makeFile({ date: '2026-02-18' });
    const result = dedupFiles([day1, day2]);
    expect(result).toHaveLength(2);
  });

  it('keeps files with different providers', () => {
    const claude = makeFile({ provider: 'claude-code' });
    const glm = makeFile({ provider: 'glm-coding', dataQuality: 'partial' });
    const result = dedupFiles([claude, glm]);
    expect(result).toHaveLength(2);
  });

  it('keeps files with different machines', () => {
    const m1 = makeFile({ machine: 'machine-a' });
    const m2 = makeFile({ machine: 'machine-b' });
    const result = dedupFiles([m1, m2]);
    expect(result).toHaveLength(2);
  });

  it('filters out <synthetic> model records with zero tokens', () => {
    const file = makeFile({
      records: [
        {
          model: 'claude-opus-4-6',
          inputTokens: 1000,
          outputTokens: 2000,
          totalTokens: 3000,
          requests: 10,
        },
        {
          model: '<synthetic>',
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          totalTokens: 0,
          requests: 2,
        },
      ],
    });
    const result = dedupFiles([file]);
    expect(result).toHaveLength(1);
    expect(result[0].records).toHaveLength(1);
    expect(result[0].records[0].model).toBe('claude-opus-4-6');
  });

  it('handles empty input', () => {
    expect(dedupFiles([])).toEqual([]);
  });
});
