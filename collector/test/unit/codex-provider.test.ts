import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { createCodexProvider } from '../../src/providers/codex.js';

const sessionsDir = join(import.meta.dirname, '..', 'fixtures', 'codex', 'sessions');

describe('CodexProvider', () => {
  const provider = createCodexProvider({
    codexDir: '/unused',
    sessionsDir,
    machine: 'test-machine',
    timezone: 'UTC',
  });

  it('has correct name and dataQuality', () => {
    expect(provider.name).toBe('codex');
    expect(provider.dataQuality).toBe('exact');
  });

  it('isAvailable returns true when sessions directory exists', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when directory does not exist', async () => {
    const p = createCodexProvider({
      codexDir: '/nonexistent',
      machine: 'test',
      timezone: 'UTC',
    });
    expect(await p.isAvailable()).toBe(false);
  });

  it('collect returns correct RawDataFile for a date with data', async () => {
    const result = await provider.collect('2026-02-20');
    expect(result.version).toBe('1.0');
    expect(result.machine).toBe('test-machine');
    expect(result.provider).toBe('codex');
    expect(result.date).toBe('2026-02-20');
    expect(result.dataQuality).toBe('exact');
    expect(result.records.length).toBeGreaterThan(0);
  });

  it('collect aggregates per-model records', async () => {
    const result = await provider.collect('2026-02-20');
    const models = result.records.map(r => r.model);
    expect(models).toContain('o4-mini');
    expect(models).toContain('codex-mini-latest');
  });

  it('collect computes correct token values per model', async () => {
    const result = await provider.collect('2026-02-20');
    const o4 = result.records.find(r => r.model === 'o4-mini')!;
    // o4-mini: turn1(100,50,20) + turn2(250,100,20) = (350,150,40)
    expect(o4.inputTokens).toBe(350);
    expect(o4.outputTokens).toBe(150);
    expect(o4.cacheReadTokens).toBe(40);
    expect(o4.totalTokens).toBe(500);
    expect(o4.requests).toBe(2);

    const codex = result.records.find(r => r.model === 'codex-mini-latest')!;
    expect(codex.inputTokens).toBe(150);
    expect(codex.outputTokens).toBe(100);
    expect(codex.cacheReadTokens).toBe(10);
    expect(codex.totalTokens).toBe(250);
    expect(codex.requests).toBe(1);
  });

  it('collect returns empty records for a date with no data', async () => {
    const result = await provider.collect('2020-01-01');
    expect(result.records).toEqual([]);
  });

  it('collect returns data for second date', async () => {
    const result = await provider.collect('2026-02-21');
    expect(result.records.length).toBe(1);
    const o4 = result.records[0];
    expect(o4.model).toBe('o4-mini');
    expect(o4.inputTokens).toBe(200);
    expect(o4.outputTokens).toBe(80);
    expect(o4.cacheReadTokens).toBe(30);
    expect(o4.requests).toBe(1);
  });
});
