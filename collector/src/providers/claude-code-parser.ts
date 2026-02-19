import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { toLocalDate } from '../utils/date.js';

export interface ParsedRecord {
  messageId: string;
  date: string;
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface DailyAggregate {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  requests: number;
  models: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    requests: number;
  }>;
}

export function findJsonlFiles(baseDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.jsonl')) {
          results.push(full);
        }
      } catch {
        // skip inaccessible
      }
    }
  }

  walk(baseDir);
  return results;
}

export function parseJsonlFile(
  filePath: string,
  timezone: string,
  dateFilter?: string[],
): ParsedRecord[] {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  // Use a map to deduplicate by message.id (keep last occurrence)
  const byMessageId = new Map<string, ParsedRecord>();

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (obj.type !== 'assistant') continue;

    const message = obj.message as Record<string, unknown> | undefined;
    if (!message) continue;

    const usage = message.usage as Record<string, unknown> | undefined;
    if (!usage) continue;

    const timestamp = obj.timestamp as string | undefined;
    if (!timestamp) continue;

    const messageId = (message.id as string) ?? obj.uuid as string;
    if (!messageId) continue;

    const date = toLocalDate(timestamp, timezone);

    if (dateFilter && !dateFilter.includes(date)) continue;

    const record: ParsedRecord = {
      messageId,
      date,
      timestamp,
      model: (message.model as string) ?? 'unknown',
      inputTokens: (usage.input_tokens as number) ?? 0,
      outputTokens: (usage.output_tokens as number) ?? 0,
      cacheCreationTokens: (usage.cache_creation_input_tokens as number) ?? 0,
      cacheReadTokens: (usage.cache_read_input_tokens as number) ?? 0,
    };

    // Overwrite earlier entries with same message.id (dedup progressive updates)
    byMessageId.set(messageId, record);
  }

  return Array.from(byMessageId.values());
}

export function aggregateByDate(
  records: ParsedRecord[],
): Map<string, DailyAggregate> {
  const map = new Map<string, DailyAggregate>();

  for (const r of records) {
    let day = map.get(r.date);
    if (!day) {
      day = {
        date: r.date,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        requests: 0,
        models: {},
      };
      map.set(r.date, day);
    }

    day.inputTokens += r.inputTokens;
    day.outputTokens += r.outputTokens;
    day.cacheCreationTokens += r.cacheCreationTokens;
    day.cacheReadTokens += r.cacheReadTokens;
    const total = r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
    day.totalTokens += total;
    day.requests += 1;

    if (!day.models[r.model]) {
      day.models[r.model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        requests: 0,
      };
    }
    const m = day.models[r.model];
    m.inputTokens += r.inputTokens;
    m.outputTokens += r.outputTokens;
    m.cacheCreationTokens += r.cacheCreationTokens;
    m.cacheReadTokens += r.cacheReadTokens;
    m.totalTokens += total;
    m.requests += 1;
  }

  return map;
}
