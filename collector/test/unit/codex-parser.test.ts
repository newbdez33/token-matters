import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  findSessionFiles,
  parseSessionFile,
  aggregateByDate,
} from '../../src/providers/codex-parser.js';

const sessionsDir = join(import.meta.dirname, '..', 'fixtures', 'codex', 'sessions');

describe('findSessionFiles', () => {
  it('finds all rollout JSONL files recursively without date filter', () => {
    const files = findSessionFiles(sessionsDir);
    expect(files.length).toBe(2);
    expect(files.some(f => f.endsWith('rollout-sample-a.jsonl'))).toBe(true);
    expect(files.some(f => f.endsWith('rollout-sample-b.jsonl'))).toBe(true);
  });

  it('filters by date using directory structure', () => {
    const files = findSessionFiles(sessionsDir, ['2026-02-20']);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/rollout-sample-a\.jsonl$/);
  });

  it('returns files for multiple date filters', () => {
    const files = findSessionFiles(sessionsDir, ['2026-02-20', '2026-02-21']);
    expect(files.length).toBe(2);
  });

  it('returns empty array for nonexistent date directory', () => {
    const files = findSessionFiles(sessionsDir, ['2099-01-01']);
    expect(files).toEqual([]);
  });

  it('returns empty array for nonexistent sessions directory', () => {
    const files = findSessionFiles('/nonexistent/sessions');
    expect(files).toEqual([]);
  });

  it('only includes rollout-*.jsonl files', () => {
    const files = findSessionFiles(sessionsDir);
    for (const f of files) {
      expect(f).toMatch(/rollout-.*\.jsonl$/);
    }
  });
});

describe('parseSessionFile', () => {
  const sampleA = join(sessionsDir, '2026', '02', '20', 'rollout-sample-a.jsonl');
  const sampleB = join(sessionsDir, '2026', '02', '21', 'rollout-sample-b.jsonl');

  it('computes deltas from cumulative token counts', () => {
    const records = parseSessionFile(sampleA, 'UTC');
    expect(records.length).toBe(3);

    // First token_count: cumulative 100/50/20, delta = 100/50/20
    expect(records[0].model).toBe('o4-mini');
    expect(records[0].inputTokens).toBe(100);
    expect(records[0].outputTokens).toBe(50);
    expect(records[0].cachedInputTokens).toBe(20);

    // Second token_count: cumulative 350/150/40, delta = 250/100/20
    expect(records[1].model).toBe('o4-mini');
    expect(records[1].inputTokens).toBe(250);
    expect(records[1].outputTokens).toBe(100);
    expect(records[1].cachedInputTokens).toBe(20);

    // Third token_count: cumulative 500/250/50, delta = 150/100/10
    expect(records[2].model).toBe('codex-mini-latest');
    expect(records[2].inputTokens).toBe(150);
    expect(records[2].outputTokens).toBe(100);
    expect(records[2].cachedInputTokens).toBe(10);
  });

  it('tracks model from turn_context.model', () => {
    const records = parseSessionFile(sampleA, 'UTC');
    expect(records[0].model).toBe('o4-mini');
    expect(records[1].model).toBe('o4-mini');
    expect(records[2].model).toBe('codex-mini-latest');
  });

  it('assigns correct dates to records', () => {
    const records = parseSessionFile(sampleA, 'UTC');
    expect(records.every(r => r.date === '2026-02-20')).toBe(true);
  });

  it('filters records by date', () => {
    const records = parseSessionFile(sampleA, 'UTC', ['2026-02-20']);
    expect(records.length).toBe(3);

    const noMatch = parseSessionFile(sampleA, 'UTC', ['2026-02-21']);
    expect(noMatch.length).toBe(0);
  });

  it('handles malformed lines without throwing', () => {
    expect(() => parseSessionFile(sampleA, 'UTC')).not.toThrow();
  });

  it('skips non-token_count events', () => {
    // sampleA has a user_message and other_event — neither should produce records
    const records = parseSessionFile(sampleA, 'UTC');
    expect(records.length).toBe(3); // only 3 token_count events
  });

  it('returns empty for nonexistent file', () => {
    expect(parseSessionFile('/nonexistent/file.jsonl', 'UTC')).toEqual([]);
  });

  it('parses single-turn session correctly', () => {
    const records = parseSessionFile(sampleB, 'UTC');
    expect(records.length).toBe(1);
    expect(records[0].model).toBe('o4-mini');
    expect(records[0].inputTokens).toBe(200);
    expect(records[0].outputTokens).toBe(80);
    expect(records[0].cachedInputTokens).toBe(30);
    expect(records[0].date).toBe('2026-02-21');
  });
});

describe('aggregateByDate', () => {
  const sampleA = join(sessionsDir, '2026', '02', '20', 'rollout-sample-a.jsonl');

  it('groups records by date and model', () => {
    const records = parseSessionFile(sampleA, 'UTC');
    const agg = aggregateByDate(records);

    expect(agg.has('2026-02-20')).toBe(true);
    const day = agg.get('2026-02-20')!;

    expect(day.models['o4-mini']).toBeDefined();
    expect(day.models['codex-mini-latest']).toBeDefined();
  });

  it('sums deltas correctly per model', () => {
    const records = parseSessionFile(sampleA, 'UTC');
    const agg = aggregateByDate(records);
    const day = agg.get('2026-02-20')!;

    // o4-mini: turn1(100,50,20) + turn2(250,100,20) = (350,150,40)
    const o4 = day.models['o4-mini'];
    expect(o4.inputTokens).toBe(350);
    expect(o4.outputTokens).toBe(150);
    expect(o4.cachedInputTokens).toBe(40);
    expect(o4.totalTokens).toBe(540); // 350+150+40
    expect(o4.requests).toBe(2);

    // codex-mini-latest: turn3(150,100,10) = (150,100,10)
    const codex = day.models['codex-mini-latest'];
    expect(codex.inputTokens).toBe(150);
    expect(codex.outputTokens).toBe(100);
    expect(codex.cachedInputTokens).toBe(10);
    expect(codex.totalTokens).toBe(260); // 150+100+10
    expect(codex.requests).toBe(1);
  });

  it('handles empty records', () => {
    const agg = aggregateByDate([]);
    expect(agg.size).toBe(0);
  });

  it('handles records from multiple dates', () => {
    const sampleB = join(sessionsDir, '2026', '02', '21', 'rollout-sample-b.jsonl');
    const recordsA = parseSessionFile(sampleA, 'UTC');
    const recordsB = parseSessionFile(sampleB, 'UTC');
    const agg = aggregateByDate([...recordsA, ...recordsB]);

    expect(agg.has('2026-02-20')).toBe(true);
    expect(agg.has('2026-02-21')).toBe(true);
  });
});
