import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClaudeCodeProvider } from '../../src/providers/claude-code.js';
import { writeRawDataFile } from '../../src/writer.js';

const sessionsDir = join(import.meta.dirname, '..', 'fixtures', 'sessions');

describe('dedup (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tm-dedup-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not create duplicate files for same data', async () => {
    const provider = createClaudeCodeProvider({
      claudeDir: '/unused',
      projectsDir: sessionsDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });

    const data = await provider.collect('2026-02-18');

    const result1 = writeRawDataFile(tmpDir, data);
    const result2 = writeRawDataFile(tmpDir, data);

    expect(result1.written).toBe(true);
    expect(result2.written).toBe(false);
    expect(result1.filePath).toBe(result2.filePath);

    // Verify only one file exists
    const providerDir = join(tmpDir, 'raw', 'test-machine', 'claude-code');
    const files = readdirSync(providerDir);
    expect(files).toHaveLength(1);
  });
});
