import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { toLocalDate } from '../utils/date.js';

export interface OpenCodeSession {
  id: string;
  timeCreated: number;
  title: string;
}

export interface OpenCodeMessage {
  id: string;
  sessionId: string;
  timeCreated: number;
  role: string;
  modelId: string | null;
  providerId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
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
  // time_created is unix milliseconds — query a ±1 day window, then filter
  // precisely using timezone-aware date conversion
  const target = new Date(date + 'T00:00:00Z');
  const prev = new Date(target);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const next = new Date(target);
  next.setUTCDate(next.getUTCDate() + 2);

  const stmt = db.prepare(`
    SELECT id, time_created, title
    FROM session
    WHERE time_created >= ? AND time_created < ?
  `);

  const rows = stmt.all(prev.getTime(), next.getTime()) as Array<{
    id: string;
    time_created: number;
    title: string;
  }>;

  return rows
    .filter(r => toLocalDate(new Date(r.time_created).toISOString(), timezone) === date)
    .map(r => ({
      id: r.id,
      timeCreated: r.time_created,
      title: r.title,
    }));
}

export function queryMessagesBySessionIds(
  db: DatabaseType,
  sessionIds: string[],
): OpenCodeMessage[] {
  if (sessionIds.length === 0) return [];

  // message.data is a JSON blob with structure:
  // { role, modelID, providerID, tokens: { total, input, output, reasoning, cache: { read, write } } }
  const placeholders = sessionIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT id, session_id, time_created, data
    FROM message
    WHERE session_id IN (${placeholders})
      AND json_extract(data, '$.role') = 'assistant'
      AND json_extract(data, '$.tokens') IS NOT NULL
  `);

  const rows = stmt.all(...sessionIds) as Array<{
    id: string;
    session_id: string;
    time_created: number;
    data: string;
  }>;

  return rows.map(r => {
    const d = JSON.parse(r.data) as {
      role: string;
      modelID?: string;
      providerID?: string;
      tokens?: {
        total?: number;
        input?: number;
        output?: number;
        reasoning?: number;
        cache?: { read?: number; write?: number };
      };
    };
    const tokens = d.tokens ?? {};
    const cache = tokens.cache ?? {};

    return {
      id: r.id,
      sessionId: r.session_id,
      timeCreated: r.time_created,
      role: d.role,
      modelId: d.modelID ?? null,
      providerId: d.providerID ?? null,
      inputTokens: tokens.input ?? 0,
      outputTokens: tokens.output ?? 0,
      cacheReadTokens: cache.read ?? 0,
      cacheWriteTokens: cache.write ?? 0,
      reasoningTokens: tokens.reasoning ?? 0,
      totalTokens: tokens.total ?? 0,
    };
  });
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
    agg.totalTokens += msg.totalTokens;
    agg.requests += 1;
  }

  return map;
}
