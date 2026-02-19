import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ──

export interface EstimationConfig {
  /** Model output rate (tokens/sec). Gemini-3-Pro ≈ 80~150, use midpoint */
  outputTokenRate: number;
  /** Ratio of actual prompt content in HTTP body (JSON overhead ≈ 50%) */
  bodyContentRatio: number;
  /** Average bytes per token (English/code ≈ 4, Chinese ≈ 3) */
  bytesPerToken: number;
  /** Outlier threshold (ms). Values above this are replaced with p95 */
  outlierThresholdMs: number;
}

export const DEFAULT_ESTIMATION_CONFIG: EstimationConfig = {
  outputTokenRate: 100,
  bodyContentRatio: 0.5,
  bytesPerToken: 4,
  outlierThresholdMs: 60_000,
};

export interface TimingCostEntry {
  timestamp: string;
  date: string;
  configName: string;
  providerModelName: string;
  serverProcessingTime: number;
  firstSseEventTime: number;
  isRetry: boolean;
  sessionId: string;
  messageId: string;
}

export interface BodyLenEntry {
  timestamp: string;
  date: string;
  type: 'create_agent_task' | 'commit_toolcall_result';
  bodyLen: number;
}

export interface AgentTaskEntry {
  timestamp: string;
  date: string;
  sessionId: string;
  taskId: string;
  messageId: string;
}

export interface TokenUsageEntry {
  timestamp: string;
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface TraeDailyAggregate {
  date: string;
  agentTasks: number;
  llmCalls: number;
  models: Record<string, number>;
  estInputTokens: number;
  estOutputTokens: number;
  estTotalTokens: number;
}

// ── Log file discovery ──

export function findAiAgentLogs(logsDir: string): string[] {
  const results: string[] = [];
  try {
    for (const sessionDir of readdirSync(logsDir)) {
      const modularDir = join(logsDir, sessionDir, 'Modular');
      try {
        for (const file of readdirSync(modularDir)) {
          if (file.startsWith('ai-agent_') && file.endsWith('_stdout.log')) {
            results.push(join(modularDir, file));
          }
        }
      } catch {
        // no Modular dir
      }
    }
  } catch {
    // no logs dir
  }
  return results;
}

// ── Timestamp parsing ──

function parseTimestamp(line: string): { timestamp: string; date: string } | null {
  const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  return { timestamp: match[1], date: match[1].slice(0, 10) };
}

// ── Event parsing ──

export function parseTimingCostEvents(content: string): TimingCostEntry[] {
  const results: TimingCostEntry[] = [];
  const regex =
    /^(.+?)\s+INFO\s+.*TimingCost: TimingCostOriginEvent \{ data: "(.*?)" \}.*?session_id=(\S+).*?message_id=(\S+)/gm;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const ts = parseTimestamp(match[1]);
    if (!ts) continue;
    try {
      const jsonStr = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const data = JSON.parse(jsonStr);
      results.push({
        timestamp: ts.timestamp,
        date: ts.date,
        configName: data.config_name ?? 'unknown',
        providerModelName: data.provider_model_name ?? data.config_name ?? 'unknown',
        serverProcessingTime: data.server_processing_time ?? 0,
        firstSseEventTime: data.first_sse_event_time ?? 0,
        isRetry: data.is_retry ?? false,
        sessionId: match[3],
        messageId: match[4],
      });
    } catch {
      // skip malformed JSON
    }
  }
  return results;
}

export function parseBodyLenEntries(content: string): BodyLenEntry[] {
  const results: BodyLenEntry[] = [];
  const regex =
    /^(.+?)\s+INFO\s+.*\[aha_net\] send:.*url=(https?:\/\/\S+)\S*,.*body_len=(\d+)/gm;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const ts = parseTimestamp(match[1]);
    if (!ts) continue;
    const url = match[2];
    let type: BodyLenEntry['type'] | null = null;
    if (url.includes('create_agent_task')) type = 'create_agent_task';
    else if (url.includes('commit_toolcall_result')) type = 'commit_toolcall_result';
    if (!type) continue;
    results.push({
      timestamp: ts.timestamp,
      date: ts.date,
      type,
      bodyLen: parseInt(match[3]),
    });
  }
  return results;
}

export function parseAgentTasks(content: string): AgentTaskEntry[] {
  const results: AgentTaskEntry[] = [];
  const regex =
    /^(.+?)\s+INFO\s+.*\[AhaNetHTTPClient\/Stream\]\s+https?:\/\/\S+\/api\/agent\/\S+create_agent_task,\s+Status:\s+200.*?session_id=(\S+)\s+task_id=(\S+)\s+message_id=(\S+)/gm;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const ts = parseTimestamp(match[1]);
    if (!ts) continue;
    results.push({
      timestamp: ts.timestamp,
      date: ts.date,
      sessionId: match[2],
      taskId: match[3],
      messageId: match[4],
    });
  }
  return results;
}

export function parseTokenUsageEvents(content: string): TokenUsageEntry[] {
  const results: TokenUsageEntry[] = [];
  const regex =
    /^(.+?)\s+INFO\s+.*token usage: TokenUsageEvent \{ name: ".*?", prompt_tokens: (\d+), completion_tokens: (\d+), total_tokens: (\d+), reasoning_tokens: Some\((\d+)\), cache_creation_input_tokens: Some\((\d+)\), cache_read_input_tokens: Some\((\d+)\)/gm;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const ts = parseTimestamp(match[1]);
    if (!ts) continue;
    results.push({
      timestamp: ts.timestamp,
      date: ts.date,
      promptTokens: parseInt(match[2]),
      completionTokens: parseInt(match[3]),
      totalTokens: parseInt(match[4]),
      reasoningTokens: parseInt(match[5]),
      cacheCreationTokens: parseInt(match[6]),
      cacheReadTokens: parseInt(match[7]),
    });
  }
  return results;
}

// ── Parse a single log file ──

export interface ParsedLogData {
  timingEvents: TimingCostEntry[];
  bodyLenEntries: BodyLenEntry[];
  agentTasks: AgentTaskEntry[];
  tokenUsageEvents: TokenUsageEntry[];
}

export function parseLogFile(filePath: string): ParsedLogData {
  const content = readFileSync(filePath, 'utf-8');
  return parseLogContent(content);
}

export function parseLogContent(content: string): ParsedLogData {
  return {
    timingEvents: parseTimingCostEvents(content),
    bodyLenEntries: parseBodyLenEntries(content),
    agentTasks: parseAgentTasks(content),
    tokenUsageEvents: parseTokenUsageEvents(content),
  };
}

// ── Token estimation ──

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

export interface EstimationResult {
  daily: Map<string, { estOutput: number; estInput: number }>;
  totalEstOutput: number;
  totalEstInput: number;
  outlierCount: number;
  p95GenerationMs: number;
}

export function estimateTokens(
  timingEvents: TimingCostEntry[],
  bodyLenEntries: BodyLenEntry[],
  dateFilter?: string[],
  cfg: EstimationConfig = DEFAULT_ESTIMATION_CONFIG,
): EstimationResult {
  const filteredTiming = dateFilter
    ? timingEvents.filter(e => dateFilter.includes(e.date))
    : timingEvents;

  const generationTimes = filteredTiming.map(e =>
    Math.max(0, e.serverProcessingTime - e.firstSseEventTime),
  );

  const sorted = [...generationTimes].sort((a, b) => a - b);
  const p95 = percentile(sorted, 0.95);

  let outlierCount = 0;
  const dailyOutput = new Map<string, number>();
  let totalEstOutput = 0;

  for (let i = 0; i < filteredTiming.length; i++) {
    const e = filteredTiming[i];
    let genMs = generationTimes[i];
    if (genMs > cfg.outlierThresholdMs) {
      genMs = p95;
      outlierCount++;
    }
    const outputTokens = (genMs / 1000) * cfg.outputTokenRate;
    dailyOutput.set(e.date, (dailyOutput.get(e.date) ?? 0) + outputTokens);
    totalEstOutput += outputTokens;
  }

  const filteredBody = dateFilter
    ? bodyLenEntries.filter(e => dateFilter.includes(e.date))
    : bodyLenEntries;

  const dailyInput = new Map<string, number>();
  let totalEstInput = 0;

  for (const e of filteredBody) {
    const inputTokens = (e.bodyLen * cfg.bodyContentRatio) / cfg.bytesPerToken;
    dailyInput.set(e.date, (dailyInput.get(e.date) ?? 0) + inputTokens);
    totalEstInput += inputTokens;
  }

  const daily = new Map<string, { estOutput: number; estInput: number }>();
  const allDates = new Set([...dailyOutput.keys(), ...dailyInput.keys()]);
  for (const date of allDates) {
    daily.set(date, {
      estOutput: Math.round(dailyOutput.get(date) ?? 0),
      estInput: Math.round(dailyInput.get(date) ?? 0),
    });
  }

  return {
    daily,
    totalEstOutput: Math.round(totalEstOutput),
    totalEstInput: Math.round(totalEstInput),
    outlierCount,
    p95GenerationMs: Math.round(p95),
  };
}

// ── Aggregation ──

export function aggregateByDate(
  data: ParsedLogData,
  dateFilter?: string[],
  cfg: EstimationConfig = DEFAULT_ESTIMATION_CONFIG,
): Map<string, TraeDailyAggregate> {
  const estimation = estimateTokens(data.timingEvents, data.bodyLenEntries, dateFilter, cfg);

  const map = new Map<string, TraeDailyAggregate>();

  function getOrCreate(date: string): TraeDailyAggregate {
    let day = map.get(date);
    if (!day) {
      day = {
        date,
        agentTasks: 0,
        llmCalls: 0,
        models: {},
        estInputTokens: 0,
        estOutputTokens: 0,
        estTotalTokens: 0,
      };
      map.set(date, day);
    }
    return day;
  }

  const filteredTiming = dateFilter
    ? data.timingEvents.filter(e => dateFilter.includes(e.date))
    : data.timingEvents;

  for (const e of filteredTiming) {
    const day = getOrCreate(e.date);
    day.llmCalls++;
    day.models[e.configName] = (day.models[e.configName] ?? 0) + 1;
  }

  const filteredTasks = dateFilter
    ? data.agentTasks.filter(e => dateFilter.includes(e.date))
    : data.agentTasks;

  for (const e of filteredTasks) {
    getOrCreate(e.date).agentTasks++;
  }

  for (const [date, est] of estimation.daily) {
    const day = getOrCreate(date);
    day.estInputTokens = est.estInput;
    day.estOutputTokens = est.estOutput;
    day.estTotalTokens = est.estInput + est.estOutput;
  }

  return map;
}
