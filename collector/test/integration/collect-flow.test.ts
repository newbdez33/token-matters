import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClaudeCodeProvider } from '../../src/providers/claude-code.js';
import { writeRawDataFile } from '../../src/writer.js';
import { computeHash } from '../../src/hash.js';

const sessionsDir = join(import.meta.dirname, '..', 'fixtures', 'sessions');

describe('collect flow (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tm-flow-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('collects and writes a raw JSON file for a date', async () => {
    const provider = createClaudeCodeProvider({
      claudeDir: '/unused',
      projectsDir: sessionsDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });

    const data = await provider.collect('2026-02-18');
    expect(data.records.length).toBeGreaterThan(0);

    const result = writeRawDataFile(tmpDir, data);
    expect(result.written).toBe(true);
    expect(existsSync(result.filePath)).toBe(true);

    // Verify file content
    const content = JSON.parse(readFileSync(result.filePath, 'utf-8'));
    expect(content.version).toBe('1.0');
    expect(content.machine).toBe('test-machine');
    expect(content.provider).toBe('claude-code');
    expect(content.date).toBe('2026-02-18');
    expect(content.dataQuality).toBe('exact');
    expect(content.records.length).toBeGreaterThan(0);

    // Verify path format
    expect(result.filePath).toMatch(
      /raw\/test-machine\/claude-code\/2026-02-18_[0-9a-f]{6}\.json$/,
    );
  });

  it('hash matches the data content', async () => {
    const provider = createClaudeCodeProvider({
      claudeDir: '/unused',
      projectsDir: sessionsDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });

    const data = await provider.collect('2026-02-18');
    const result = writeRawDataFile(tmpDir, data);

    const expectedHash = computeHash('test-machine', 'claude-code', '2026-02-18', data.records);
    expect(result.filePath).toContain(expectedHash);
  });

  it('deduplicates progressive updates (same message.id)', async () => {
    const provider = createClaudeCodeProvider({
      claudeDir: '/unused',
      projectsDir: sessionsDir,
      machine: 'test-machine',
      timezone: 'UTC',
    });

    const data = await provider.collect('2026-02-18');
    // session-a has msg_001 duplicated (progressive update)
    // The opus record should have inputTokens = 100 (msg_001) + 200 (msg_002) + 30 (malformed msg_ok) = 330
    const opus = data.records.find(r => r.model === 'claude-opus-4-6');
    expect(opus).toBeDefined();
    expect(opus!.inputTokens).toBe(330);

    // Without dedup, it would be 100+100+200+30 = 430
    expect(opus!.inputTokens).not.toBe(430);
  });
});
