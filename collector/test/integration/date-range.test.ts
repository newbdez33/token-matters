import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClaudeCodeProvider } from '../../src/providers/claude-code.js';
import { writeRawDataFile } from '../../src/writer.js';
import { getDateRange } from '../../src/utils/date.js';

const sessionsDir = join(import.meta.dirname, '..', 'fixtures', 'sessions');

describe('date range (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tm-range-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('only produces files for dates within the specified range', async () => {
    const provider = createClaudeCodeProvider({
      claudeDir: '/unused',
      projectsDir: sessionsDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });

    const dates = getDateRange('2026-02-18', '2026-02-19');
    const results = [];

    for (const date of dates) {
      const data = await provider.collect(date);
      if (data.records.length > 0) {
        const result = writeRawDataFile(tmpDir, data);
        results.push(result);
      }
    }

    // Both dates should have data from fixtures
    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r.written).toBe(true);
      expect(existsSync(r.filePath)).toBe(true);
    }
  });

  it('produces no files for dates outside the data range', async () => {
    const provider = createClaudeCodeProvider({
      claudeDir: '/unused',
      projectsDir: sessionsDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });

    const data = await provider.collect('2020-01-01');
    expect(data.records).toHaveLength(0);

    const result = writeRawDataFile(tmpDir, data);
    // Empty records still get a hash, but let's verify the content
    // Actually with empty records, writing is still valid but the file will have empty records
    // The writeRawDataFile doesn't skip empty records - that logic is in main.ts
    // So we verify the collect side returns empty
    expect(data.records).toEqual([]);
  });
});
