import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { toLocalDate } from '../utils/date.js';

export interface ParsedCodexRecord {
  date: string;
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface CodexDailyAggregate {
  date: string;
  models: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    totalTokens: number;
    requests: number;
  }>;
}

export function findSessionFiles(sessionsDir: string, dateFilter?: string[]): string[] {
  const results: string[] = [];

  if (dateFilter && dateFilter.length > 0) {
    for (const date of dateFilter) {
      const [yyyy, mm, dd] = date.split('-');
      const dateDir = join(sessionsDir, yyyy, mm, dd);
      try {
        for (const entry of readdirSync(dateDir)) {
          if (entry.startsWith('rollout-') && entry.endsWith('.jsonl')) {
            results.push(join(dateDir, entry));
          }
        }
      } catch {
        // directory doesn't exist for this date
      }
    }
  } else {
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
          } else if (entry.startsWith('rollout-') && entry.endsWith('.jsonl')) {
            results.push(full);
          }
        } catch {
          // skip inaccessible
        }
      }
    }
    walk(sessionsDir);
  }

  return results;
}

export function parseSessionFile(
  filePath: string,
  timezone: string,
  dateFilter?: string[],
): ParsedCodexRecord[] {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const records: ParsedCodexRecord[] = [];
  let currentModel = 'unknown';

  // Track previous cumulative values for delta calculation
  let prevInput = 0;
  let prevOutput = 0;
  let prevCached = 0;

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    // Track model from turn events
    const turnContext = obj.turn_context as Record<string, unknown> | undefined;
    if (turnContext?.model) {
      currentModel = turnContext.model as string;
    }

    // Process token_count events
    const payload = obj.payload as Record<string, unknown> | undefined;
    if (payload?.type !== 'token_count') continue;

    const timestamp = obj.timestamp as string | undefined;
    if (!timestamp) continue;

    const cumInput = (payload.input_tokens as number) ?? 0;
    const cumOutput = (payload.output_tokens as number) ?? 0;
    const cumCached = (payload.cached_input_tokens as number) ?? 0;

    // Compute deltas from previous cumulative values
    const deltaInput = cumInput - prevInput;
    const deltaOutput = cumOutput - prevOutput;
    const deltaCached = cumCached - prevCached;

    prevInput = cumInput;
    prevOutput = cumOutput;
    prevCached = cumCached;

    // Skip if all deltas are zero
    if (deltaInput === 0 && deltaOutput === 0 && deltaCached === 0) continue;

    const date = toLocalDate(timestamp, timezone);
    if (dateFilter && !dateFilter.includes(date)) continue;

    records.push({
      date,
      timestamp,
      model: currentModel,
      inputTokens: deltaInput,
      outputTokens: deltaOutput,
      cachedInputTokens: deltaCached,
    });
  }

  return records;
}

export function aggregateByDate(
  records: ParsedCodexRecord[],
): Map<string, CodexDailyAggregate> {
  const map = new Map<string, CodexDailyAggregate>();

  for (const r of records) {
    let day = map.get(r.date);
    if (!day) {
      day = { date: r.date, models: {} };
      map.set(r.date, day);
    }

    if (!day.models[r.model]) {
      day.models[r.model] = {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        totalTokens: 0,
        requests: 0,
      };
    }

    const m = day.models[r.model];
    m.inputTokens += r.inputTokens;
    m.outputTokens += r.outputTokens;
    m.cachedInputTokens += r.cachedInputTokens;
    m.totalTokens += r.inputTokens + r.outputTokens + r.cachedInputTokens;
    m.requests += 1;
  }

  return map;
}
