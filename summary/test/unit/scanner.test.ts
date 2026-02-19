import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { scanRawFiles } from '../../src/scanner.js';

const FIXTURES_RAW = path.resolve(import.meta.dirname, '../fixtures/raw');

describe('scanRawFiles', () => {
  it('scans all JSON files from raw directory', async () => {
    const files = await scanRawFiles(FIXTURES_RAW);
    // 4 claude-code + 1 glm-coding + 1 trae-pro = 6
    expect(files.length).toBe(6);
  });

  it('extracts machine from directory path', async () => {
    const files = await scanRawFiles(FIXTURES_RAW);
    for (const f of files) {
      expect(f.machine).toBe('test-machine');
    }
  });

  it('parses provider correctly', async () => {
    const files = await scanRawFiles(FIXTURES_RAW);
    const providers = new Set(files.map((f) => f.provider));
    expect(providers).toEqual(
      new Set(['claude-code', 'glm-coding', 'trae-pro']),
    );
  });

  it('parses all fields from JSON', async () => {
    const files = await scanRawFiles(FIXTURES_RAW);
    const claude = files.find(
      (f) => f.provider === 'claude-code' && f.date === '2026-02-18',
    );
    expect(claude).toBeDefined();
    expect(claude!.version).toBe('1.0');
    expect(claude!.collectedAt).toBe('2026-02-18T10:00:00.000Z');
    expect(claude!.dataQuality).toBe('exact');
    expect(claude!.records).toHaveLength(1);
    expect(claude!.records[0].model).toBe('claude-opus-4-6');
  });

  it('returns empty array for nonexistent directory', async () => {
    const files = await scanRawFiles('/tmp/nonexistent-dir-12345');
    expect(files).toEqual([]);
  });

  it('skips non-JSON files', async () => {
    // All returned files should be valid RawDataFile
    const files = await scanRawFiles(FIXTURES_RAW);
    for (const f of files) {
      expect(f.version).toBe('1.0');
      expect(f.records).toBeDefined();
    }
  });
});
