import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { toLocalDate } from '../utils/date.js';

export interface OpenCodeSession {
  id: string;
  createdAt: string;
  title: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
}

export interface OpenCodeMessage {
  id: string;
  sessionId: string;
  role: string;
  modelProvider: string | null;
  modelId: string | null;
  createdAt: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
}

export interface ModelAggregate {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  requests: number;
}

export function openDb(dbPath: string): DatabaseType {
  return new Database(dbPath, { readonly: true });
}

export function querySessionsByDate(
  db: DatabaseType,
  date: string,
  timezone: string,
): OpenCodeSession[] {
  // Fetch sessions from a ±1 day UTC window, then filter precisely
  // using timezone-aware date conversion
  const target = new Date(date + 'T00:00:00Z');
  const prev = new Date(target);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const next = new Date(target);
  next.setUTCDate(next.getUTCDate() + 2);

  const stmt = db.prepare(`
    SELECT id, created_at, title,
           COALESCE(input_tokens, 0) as input_tokens,
           COALESCE(output_tokens, 0) as output_tokens,
           COALESCE(cache_read_tokens, 0) as cache_read_tokens,
           COALESCE(cache_write_tokens, 0) as cache_write_tokens,
           COALESCE(reasoning_tokens, 0) as reasoning_tokens
    FROM sessions
    WHERE date(created_at) BETWEEN ? AND ?
  `);

  const rows = stmt.all(
    prev.toISOString().slice(0, 10),
    next.toISOString().slice(0, 10),
  ) as Array<{
    id: string;
    created_at: string;
    title: string | null;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    reasoning_tokens: number;
  }>;

  return rows
    .filter(r => toLocalDate(r.created_at, timezone) === date)
    .map(r => ({
      id: r.id,
      createdAt: r.created_at,
      title: r.title,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cacheReadTokens: r.cache_read_tokens,
      cacheWriteTokens: r.cache_write_tokens,
      reasoningTokens: r.reasoning_tokens,
    }));
}

export function queryMessagesBySessionIds(
  db: DatabaseType,
  sessionIds: string[],
): OpenCodeMessage[] {
  if (sessionIds.length === 0) return [];

  const placeholders = sessionIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT id, session_id, role, model_provider, model_id, created_at,
           COALESCE(input_tokens, 0) as input_tokens,
           COALESCE(output_tokens, 0) as output_tokens,
           COALESCE(cache_read_tokens, 0) as cache_read_tokens,
           COALESCE(cache_write_tokens, 0) as cache_write_tokens,
           COALESCE(reasoning_tokens, 0) as reasoning_tokens
    FROM messages
    WHERE session_id IN (${placeholders})
      AND role = 'assistant'
  `);

  const rows = stmt.all(...sessionIds) as Array<{
    id: string;
    session_id: string;
    role: string;
    model_provider: string | null;
    model_id: string | null;
    created_at: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    reasoning_tokens: number;
  }>;

  return rows.map(r => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role,
    modelProvider: r.model_provider,
    modelId: r.model_id,
    createdAt: r.created_at,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheReadTokens: r.cache_read_tokens,
    cacheWriteTokens: r.cache_write_tokens,
    reasoningTokens: r.reasoning_tokens,
  }));
}

export function aggregateByModel(
  messages: OpenCodeMessage[],
): Map<string, ModelAggregate> {
  const map = new Map<string, ModelAggregate>();

  for (const msg of messages) {
    const model = msg.modelId ?? 'unknown';
    let agg = map.get(model);
    if (!agg) {
      agg = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        requests: 0,
      };
      map.set(model, agg);
    }

    agg.inputTokens += msg.inputTokens;
    agg.outputTokens += msg.outputTokens;
    agg.cacheReadTokens += msg.cacheReadTokens;
    agg.cacheWriteTokens += msg.cacheWriteTokens;
    agg.totalTokens += msg.inputTokens + msg.outputTokens +
      msg.cacheReadTokens + msg.cacheWriteTokens;
    agg.requests += 1;
  }

  return map;
}
