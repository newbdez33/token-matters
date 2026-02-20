import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  openDb,
  querySessionsByDate,
  queryMessagesBySessionIds,
  aggregateByModel,
} from '../../src/providers/opencode-parser.js';
import { createTestOpenCodeDb } from '../helpers/create-opencode-db.js';

let tempDir: string;
let dbPath: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'opencode-test-'));
  dbPath = join(tempDir, 'opencode.db');
  createTestOpenCodeDb(dbPath);
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('openDb', () => {
  it('opens database in read-only mode', () => {
    const db = openDb(dbPath);
    expect(db).toBeDefined();
    // Verify read-only: attempting to write should throw
    expect(() => db.exec('CREATE TABLE test (id TEXT)')).toThrow();
    db.close();
  });
});

describe('querySessionsByDate', () => {
  it('returns sessions for a specific date in UTC', () => {
    const db = openDb(dbPath);
    const sessions = querySessionsByDate(db, '2026-02-20', 'UTC');
    // sess-001 and sess-003 are on 2026-02-20
    expect(sessions.length).toBe(2);
    expect(sessions.some(s => s.id === 'sess-001')).toBe(true);
    expect(sessions.some(s => s.id === 'sess-003')).toBe(true);
    db.close();
  });

  it('returns sessions for another date', () => {
    const db = openDb(dbPath);
    const sessions = querySessionsByDate(db, '2026-02-21', 'UTC');
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe('sess-002');
    db.close();
  });

  it('returns empty for a date with no sessions', () => {
    const db = openDb(dbPath);
    const sessions = querySessionsByDate(db, '2020-01-01', 'UTC');
    expect(sessions).toEqual([]);
    db.close();
  });

  it('maps token fields correctly', () => {
    const db = openDb(dbPath);
    const sessions = querySessionsByDate(db, '2026-02-20', 'UTC');
    const sess1 = sessions.find(s => s.id === 'sess-001')!;
    expect(sess1.inputTokens).toBe(500);
    expect(sess1.outputTokens).toBe(300);
    expect(sess1.cacheReadTokens).toBe(50);
    expect(sess1.cacheWriteTokens).toBe(20);
    expect(sess1.reasoningTokens).toBe(40);
    db.close();
  });

  it('defaults null token fields to 0', () => {
    const db = openDb(dbPath);
    const sessions = querySessionsByDate(db, '2026-02-20', 'UTC');
    const empty = sessions.find(s => s.id === 'sess-003')!;
    expect(empty.inputTokens).toBe(0);
    expect(empty.outputTokens).toBe(0);
    db.close();
  });
});

describe('queryMessagesBySessionIds', () => {
  it('returns only assistant messages', () => {
    const db = openDb(dbPath);
    const messages = queryMessagesBySessionIds(db, ['sess-001']);
    // sess-001 has 2 assistant messages + 1 user message; only assistant returned
    expect(messages.length).toBe(2);
    expect(messages.every(m => m.role === 'assistant')).toBe(true);
    db.close();
  });

  it('returns messages with correct token fields', () => {
    const db = openDb(dbPath);
    const messages = queryMessagesBySessionIds(db, ['sess-001']);
    const msg1 = messages.find(m => m.id === 'msg-001')!;
    expect(msg1.modelId).toBe('claude-sonnet-4-6');
    expect(msg1.modelProvider).toBe('anthropic');
    expect(msg1.inputTokens).toBe(200);
    expect(msg1.outputTokens).toBe(150);
    expect(msg1.cacheReadTokens).toBe(30);
    expect(msg1.cacheWriteTokens).toBe(10);
    expect(msg1.reasoningTokens).toBe(20);
    db.close();
  });

  it('returns messages across multiple sessions', () => {
    const db = openDb(dbPath);
    const messages = queryMessagesBySessionIds(db, ['sess-001', 'sess-002']);
    expect(messages.length).toBe(3); // 2 from sess-001 + 1 from sess-002
    db.close();
  });

  it('returns empty for session with no messages', () => {
    const db = openDb(dbPath);
    const messages = queryMessagesBySessionIds(db, ['sess-003']);
    expect(messages).toEqual([]);
    db.close();
  });

  it('returns empty for empty session IDs array', () => {
    const db = openDb(dbPath);
    const messages = queryMessagesBySessionIds(db, []);
    expect(messages).toEqual([]);
    db.close();
  });
});

describe('aggregateByModel', () => {
  it('groups messages by model and sums tokens', () => {
    const db = openDb(dbPath);
    const messages = queryMessagesBySessionIds(db, ['sess-001']);
    const agg = aggregateByModel(messages);

    const claude = agg.get('claude-sonnet-4-6')!;
    expect(claude.inputTokens).toBe(200);
    expect(claude.outputTokens).toBe(150);
    expect(claude.cacheReadTokens).toBe(30);
    expect(claude.cacheWriteTokens).toBe(10);
    expect(claude.totalTokens).toBe(390); // 200+150+30+10
    expect(claude.requests).toBe(1);

    const gpt = agg.get('gpt-4.1')!;
    expect(gpt.inputTokens).toBe(300);
    expect(gpt.outputTokens).toBe(150);
    expect(gpt.cacheReadTokens).toBe(20);
    expect(gpt.cacheWriteTokens).toBe(10);
    expect(gpt.totalTokens).toBe(480); // 300+150+20+10
    expect(gpt.requests).toBe(1);

    db.close();
  });

  it('aggregates across multiple sessions', () => {
    const db = openDb(dbPath);
    const messages = queryMessagesBySessionIds(db, ['sess-001', 'sess-002']);
    const agg = aggregateByModel(messages);

    // claude-sonnet-4-6: msg-001(200,150,30,10) + msg-004(200,100,10,5)
    const claude = agg.get('claude-sonnet-4-6')!;
    expect(claude.inputTokens).toBe(400);
    expect(claude.outputTokens).toBe(250);
    expect(claude.requests).toBe(2);

    db.close();
  });

  it('handles empty messages', () => {
    const agg = aggregateByModel([]);
    expect(agg.size).toBe(0);
  });
});
