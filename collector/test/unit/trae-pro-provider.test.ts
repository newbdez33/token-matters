import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTraeProProvider } from '../../src/providers/trae-pro.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures', 'trae');

// Set up a fake TRAE logs directory with proper structure
const testDir = join(tmpdir(), 'trae-pro-test-' + Date.now());
const logsDir = join(testDir, 'logs');

beforeAll(() => {
  // Create structure: logs/{session}/Modular/ai-agent_*_stdout.log
  const session1 = join(logsDir, 'session-001', 'Modular');
  const session2 = join(logsDir, 'session-002', 'Modular');
  mkdirSync(session1, { recursive: true });
  mkdirSync(session2, { recursive: true });
  copyFileSync(
    join(fixturesDir, 'ai-agent-a.log'),
    join(session1, 'ai-agent_20260218_stdout.log'),
  );
  copyFileSync(
    join(fixturesDir, 'ai-agent-b.log'),
    join(session2, 'ai-agent_20260219_stdout.log'),
  );
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('TraeProProvider', () => {
  const provider = createTraeProProvider({
    traeDir: testDir,
    machine: 'test-machine',
    timezone: 'UTC',
  });

  it('has correct name and dataQuality', () => {
    expect(provider.name).toBe('trae-pro');
    expect(provider.dataQuality).toBe('estimated');
  });

  it('isAvailable returns true when logs dir exists', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when logs dir does not exist', async () => {
    const p = createTraeProProvider({
      traeDir: '/nonexistent/path',
      machine: 'test',
      timezone: 'UTC',
    });
    expect(await p.isAvailable()).toBe(false);
  });

  it('collect returns RawDataFile for date with data', async () => {
    const result = await provider.collect('2026-02-18');
    expect(result.version).toBe('1.0');
    expect(result.provider).toBe('trae-pro');
    expect(result.date).toBe('2026-02-18');
    expect(result.dataQuality).toBe('estimated');
    expect(result.records).toHaveLength(1);

    const rec = result.records[0];
    // 3 LLM calls on Feb 18
    expect(rec.requests).toBe(3);
    // Estimated tokens should be > 0
    expect(rec.totalTokens).toBeGreaterThan(0);
    expect(rec.inputTokens).toBeGreaterThan(0);
    expect(rec.outputTokens).toBeGreaterThan(0);
    expect(rec.note).toContain('3 agent tasks');
    expect(rec.note).toContain('gemini-3-pro');
  });

  it('collect returns data for second date', async () => {
    const result = await provider.collect('2026-02-19');
    expect(result.records).toHaveLength(1);
    const rec = result.records[0];
    expect(rec.requests).toBe(2);
    expect(rec.note).toContain('claude-sonnet-4');
  });

  it('collect returns empty records for date with no data', async () => {
    const result = await provider.collect('2020-01-01');
    expect(result.records).toEqual([]);
  });

  it('supports logsDir override for testing', async () => {
    const p = createTraeProProvider({
      traeDir: '/nonexistent',
      machine: 'test',
      timezone: 'UTC',
      logsDir,
    });
    const result = await p.collect('2026-02-18');
    expect(result.records).toHaveLength(1);
  });
});
