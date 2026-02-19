import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeRawDataFile } from '../../src/writer.js';
import type { RawDataFile } from '../../src/providers/types.js';

function makeRawDataFile(overrides?: Partial<RawDataFile>): RawDataFile {
  return {
    version: '1.0',
    collectedAt: '2026-02-19T00:00:00Z',
    machine: 'macbook-pro',
    provider: 'claude-code',
    date: '2026-02-19',
    dataQuality: 'exact',
    records: [
      { model: 'claude-opus-4-6', inputTokens: 100, outputTokens: 50, totalTokens: 150, requests: 1 },
    ],
    ...overrides,
  };
}

describe('writeRawDataFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tm-writer-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes to correct path: raw/{machine}/{provider}/{date}_{hash}.json', () => {
    const data = makeRawDataFile();
    const result = writeRawDataFile(tmpDir, data);
    expect(result.written).toBe(true);
    expect(result.filePath).toMatch(/raw\/macbook-pro\/claude-code\/2026-02-19_[0-9a-f]{6}\.json$/);
    expect(existsSync(result.filePath)).toBe(true);
  });

  it('creates parent directories', () => {
    const data = makeRawDataFile();
    const result = writeRawDataFile(tmpDir, data);
    expect(existsSync(result.filePath)).toBe(true);
  });

  it('skips if hash file already exists', () => {
    const data = makeRawDataFile();
    const result1 = writeRawDataFile(tmpDir, data);
    const result2 = writeRawDataFile(tmpDir, data);
    expect(result1.written).toBe(true);
    expect(result2.written).toBe(false);
    expect(result2.filePath).toBe(result1.filePath);
  });

  it('writes valid JSON content', () => {
    const data = makeRawDataFile();
    const result = writeRawDataFile(tmpDir, data);
    const content = JSON.parse(readFileSync(result.filePath, 'utf-8'));
    expect(content.version).toBe('1.0');
    expect(content.machine).toBe('macbook-pro');
    expect(content.records).toHaveLength(1);
  });

  it('does not write in dryRun mode', () => {
    const data = makeRawDataFile();
    const result = writeRawDataFile(tmpDir, data, true);
    expect(result.written).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(existsSync(result.filePath)).toBe(false);
  });
});
