import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  findJsonlFiles,
  parseJsonlFile,
  aggregateByDate,
} from '../../src/providers/claude-code-parser.js';

const sessionsDir = join(import.meta.dirname, '..', 'fixtures', 'sessions');

describe('findJsonlFiles', () => {
  it('finds all JSONL files recursively including subagents', () => {
    const files = findJsonlFiles(sessionsDir);
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.some(f => f.endsWith('session-a.jsonl'))).toBe(true);
    expect(files.some(f => f.endsWith('session-b.jsonl'))).toBe(true);
    expect(files.some(f => f.endsWith('agent-x.jsonl'))).toBe(true);
    expect(files.some(f => f.endsWith('malformed.jsonl'))).toBe(true);
  });

  it('returns empty array for nonexistent directory', () => {
    expect(findJsonlFiles('/nonexistent/dir')).toEqual([]);
  });

  it('ignores non-jsonl files', () => {
    const files = findJsonlFiles(sessionsDir);
    for (const f of files) {
      expect(f).toMatch(/\.jsonl$/);
    }
  });
});

describe('parseJsonlFile', () => {
  it('extracts assistant records with usage', () => {
    const records = parseJsonlFile(join(sessionsDir, 'session-b.jsonl'), 'UTC');
    expect(records.length).toBe(2);
    expect(records[0].model).toBe('claude-sonnet-4-6');
    expect(records[0].inputTokens).toBe(80);
    expect(records[0].outputTokens).toBe(40);
  });

  it('deduplicates by message.id (keeps last)', () => {
    const records = parseJsonlFile(join(sessionsDir, 'session-a.jsonl'), 'UTC');
    // msg_001 appears twice (progressive update), should keep last
    const msg001 = records.filter(r => r.messageId === 'msg_001');
    expect(msg001).toHaveLength(1);
  });

  it('skips user messages', () => {
    const records = parseJsonlFile(join(sessionsDir, 'session-a.jsonl'), 'UTC');
    // All records should be from assistant messages only
    for (const r of records) {
      expect(r.model).toBeDefined();
    }
  });

  it('skips records without usage or timestamp', () => {
    const records = parseJsonlFile(join(sessionsDir, 'malformed.jsonl'), 'UTC');
    // Only msg_ok has both usage and timestamp
    expect(records).toHaveLength(1);
    expect(records[0].messageId).toBe('msg_ok');
    expect(records[0].inputTokens).toBe(30);
  });

  it('handles empty lines and malformed JSON without throwing', () => {
    expect(() =>
      parseJsonlFile(join(sessionsDir, 'malformed.jsonl'), 'UTC'),
    ).not.toThrow();
  });

  it('extracts all four token fields with missing as 0', () => {
    const records = parseJsonlFile(join(sessionsDir, 'session-b.jsonl'), 'UTC');
    const first = records[0];
    expect(first.inputTokens).toBe(80);
    expect(first.outputTokens).toBe(40);
    expect(first.cacheCreationTokens).toBe(0);
    expect(first.cacheReadTokens).toBe(5);
  });

  it('filters records by date when dateFilter is provided', () => {
    const all = parseJsonlFile(join(sessionsDir, 'session-a.jsonl'), 'UTC');
    const onlyFeb18 = parseJsonlFile(join(sessionsDir, 'session-a.jsonl'), 'UTC', ['2026-02-18']);
    const onlyFeb19 = parseJsonlFile(join(sessionsDir, 'session-a.jsonl'), 'UTC', ['2026-02-19']);
    expect(all.length).toBeGreaterThan(onlyFeb18.length);
    expect(onlyFeb18.every(r => r.date === '2026-02-18')).toBe(true);
    expect(onlyFeb19.every(r => r.date === '2026-02-19')).toBe(true);
  });

  it('handles timezone correctly for date assignment', () => {
    // session-a has a record at 2026-02-19T02:00:01.000Z
    // In Asia/Shanghai (+8), that's 2026-02-19T10:00:01 → still Feb 19
    const records = parseJsonlFile(join(sessionsDir, 'session-a.jsonl'), 'Asia/Shanghai');
    const feb19 = records.filter(r => r.date === '2026-02-19');
    expect(feb19.length).toBeGreaterThanOrEqual(1);

    // In UTC, records at 2026-02-18T10:00:01Z → Feb 18
    // In Asia/Shanghai (+8), 2026-02-18T10:00:01Z → 2026-02-18T18:00:01 → still Feb 18
    const feb18utc = parseJsonlFile(join(sessionsDir, 'session-a.jsonl'), 'UTC', ['2026-02-18']);
    const feb18sh = parseJsonlFile(join(sessionsDir, 'session-a.jsonl'), 'Asia/Shanghai', ['2026-02-18']);
    expect(feb18utc.length).toBe(feb18sh.length);
  });

  it('returns empty for nonexistent file', () => {
    const records = parseJsonlFile('/nonexistent/file.jsonl', 'UTC');
    expect(records).toEqual([]);
  });
});

describe('aggregateByDate', () => {
  it('groups records by date and model', () => {
    const records = parseJsonlFile(join(sessionsDir, 'session-a.jsonl'), 'UTC');
    const agg = aggregateByDate(records);

    expect(agg.has('2026-02-18')).toBe(true);
    expect(agg.has('2026-02-19')).toBe(true);
  });

  it('sums tokens correctly per date', () => {
    const records = parseJsonlFile(join(sessionsDir, 'session-b.jsonl'), 'UTC');
    const agg = aggregateByDate(records);
    const feb18 = agg.get('2026-02-18')!;

    // session-b: msg_010 (80+40+0+5) + msg_011 (120+60+10+8)
    expect(feb18.inputTokens).toBe(200);
    expect(feb18.outputTokens).toBe(100);
    expect(feb18.cacheCreationTokens).toBe(10);
    expect(feb18.cacheReadTokens).toBe(13);
    expect(feb18.totalTokens).toBe(323);
    expect(feb18.requests).toBe(2);
  });

  it('tracks model breakdown', () => {
    const records = parseJsonlFile(join(sessionsDir, 'session-b.jsonl'), 'UTC');
    const agg = aggregateByDate(records);
    const feb18 = agg.get('2026-02-18')!;

    expect(feb18.models['claude-sonnet-4-6']).toBeDefined();
    expect(feb18.models['claude-sonnet-4-6'].requests).toBe(2);
  });

  it('handles empty records', () => {
    const agg = aggregateByDate([]);
    expect(agg.size).toBe(0);
  });
});
