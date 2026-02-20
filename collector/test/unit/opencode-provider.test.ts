import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createOpenCodeProvider } from '../../src/providers/opencode.js';
import { createTestOpenCodeDb } from '../helpers/create-opencode-db.js';

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'opencode-provider-test-'));
  createTestOpenCodeDb(join(tempDir, 'opencode.db'));
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('OpenCodeProvider', () => {
  it('has correct name and dataQuality', () => {
    const provider = createOpenCodeProvider({
      openCodeDir: tempDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });
    expect(provider.name).toBe('opencode');
    expect(provider.dataQuality).toBe('exact');
  });

  it('isAvailable returns true when DB exists', async () => {
    const provider = createOpenCodeProvider({
      openCodeDir: tempDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when DB does not exist', async () => {
    const provider = createOpenCodeProvider({
      openCodeDir: '/nonexistent',
      machine: 'test',
      timezone: 'UTC',
    });
    expect(await provider.isAvailable()).toBe(false);
  });

  it('collect returns correct RawDataFile for a date with data', async () => {
    const provider = createOpenCodeProvider({
      openCodeDir: tempDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });
    const result = await provider.collect('2026-02-20');

    expect(result.version).toBe('1.0');
    expect(result.machine).toBe('test-machine');
    expect(result.provider).toBe('opencode');
    expect(result.date).toBe('2026-02-20');
    expect(result.dataQuality).toBe('exact');
    expect(result.records.length).toBeGreaterThan(0);
  });

  it('collect returns per-model aggregation', async () => {
    const provider = createOpenCodeProvider({
      openCodeDir: tempDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });
    const result = await provider.collect('2026-02-20');
    const models = result.records.map(r => r.model);
    expect(models).toContain('claude-sonnet-4-6');
    expect(models).toContain('gpt-4.1');
  });

  it('collect maps token fields correctly', async () => {
    const provider = createOpenCodeProvider({
      openCodeDir: tempDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });
    const result = await provider.collect('2026-02-20');

    const claude = result.records.find(r => r.model === 'claude-sonnet-4-6')!;
    expect(claude.inputTokens).toBe(200);
    expect(claude.outputTokens).toBe(150);
    expect(claude.cacheReadTokens).toBe(30);
    expect(claude.cacheCreationTokens).toBe(10); // mapped from cache_write_tokens
    expect(claude.requests).toBe(1);

    const gpt = result.records.find(r => r.model === 'gpt-4.1')!;
    expect(gpt.inputTokens).toBe(300);
    expect(gpt.outputTokens).toBe(150);
    expect(gpt.requests).toBe(1);
  });

  it('collect returns empty records for a date with no data', async () => {
    const provider = createOpenCodeProvider({
      openCodeDir: tempDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });
    const result = await provider.collect('2020-01-01');
    expect(result.records).toEqual([]);
  });

  it('collect returns data for second date', async () => {
    const provider = createOpenCodeProvider({
      openCodeDir: tempDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });
    const result = await provider.collect('2026-02-21');
    expect(result.records.length).toBe(1);
    expect(result.records[0].model).toBe('claude-sonnet-4-6');
    expect(result.records[0].inputTokens).toBe(200);
    expect(result.records[0].outputTokens).toBe(100);
  });
});
