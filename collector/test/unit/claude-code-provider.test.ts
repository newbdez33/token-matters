import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { createClaudeCodeProvider } from '../../src/providers/claude-code.js';

const sessionsDir = join(import.meta.dirname, '..', 'fixtures', 'sessions');

describe('ClaudeCodeProvider', () => {
  const provider = createClaudeCodeProvider({
    claudeDir: '/unused',
    projectsDir: sessionsDir,
    machine: 'test-machine',
    timezone: 'UTC',
  });

  it('has correct name and dataQuality', () => {
    expect(provider.name).toBe('claude-code');
    expect(provider.dataQuality).toBe('exact');
  });

  it('isAvailable returns true when sessions directory exists', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when directory does not exist', async () => {
    const p = createClaudeCodeProvider({
      claudeDir: '/nonexistent',
      machine: 'test',
      timezone: 'UTC',
    });
    expect(await p.isAvailable()).toBe(false);
  });

  it('collect returns correct RawDataFile for a date', async () => {
    const result = await provider.collect('2026-02-18');
    expect(result.version).toBe('1.0');
    expect(result.machine).toBe('test-machine');
    expect(result.provider).toBe('claude-code');
    expect(result.date).toBe('2026-02-18');
    expect(result.dataQuality).toBe('exact');
    expect(result.records.length).toBeGreaterThan(0);
  });

  it('collect aggregates records per model for the date', async () => {
    const result = await provider.collect('2026-02-18');
    // session-a has opus records, session-b has sonnet records, subagent has haiku
    const models = result.records.map(r => r.model);
    expect(models).toContain('claude-opus-4-6');
    expect(models).toContain('claude-sonnet-4-6');
    expect(models).toContain('claude-haiku-4-5');
  });

  it('collect returns empty records for a date with no data', async () => {
    const result = await provider.collect('2020-01-01');
    expect(result.records).toEqual([]);
  });

  it('collect deduplicates progressive updates', async () => {
    const result = await provider.collect('2026-02-18');
    const opusRecords = result.records.filter(r => r.model === 'claude-opus-4-6');
    // session-a: msg_001(deduped,100) + msg_002(200) + malformed: msg_ok(30) = 330
    expect(opusRecords.length).toBe(1); // aggregated per model
    expect(opusRecords[0].inputTokens).toBe(330);
  });
});
