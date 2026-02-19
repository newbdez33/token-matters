import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseTimingCostEvents,
  parseBodyLenEntries,
  parseAgentTasks,
  parseTokenUsageEvents,
  parseLogContent,
  estimateTokens,
  aggregateByDate,
  DEFAULT_ESTIMATION_CONFIG,
  type EstimationConfig,
} from '../../src/providers/trae-pro-parser.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures', 'trae');

function loadLog(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('parseTimingCostEvents', () => {
  it('parses TimingCostOriginEvent entries', () => {
    const content = loadLog('ai-agent-a.log');
    const events = parseTimingCostEvents(content);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      timestamp: '2026-02-18T08:00:01',
      date: '2026-02-18',
      configName: 'gemini-3-pro',
      providerModelName: 'gemini-3-pro-preview',
      serverProcessingTime: 4080,
      firstSseEventTime: 3172,
      isRetry: false,
      sessionId: 'sess-001',
      messageId: 'msg-001',
    });
  });

  it('extracts different models', () => {
    const content = loadLog('ai-agent-b.log');
    const events = parseTimingCostEvents(content);
    expect(events).toHaveLength(2);
    expect(events[0].configName).toBe('claude-sonnet-4');
    expect(events[1].isRetry).toBe(true);
  });

  it('returns empty for content with no timing events', () => {
    const events = parseTimingCostEvents('some random log line\nanother line');
    expect(events).toEqual([]);
  });
});

describe('parseBodyLenEntries', () => {
  it('parses body_len from aha_net send lines', () => {
    const content = loadLog('ai-agent-a.log');
    const entries = parseBodyLenEntries(content);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toEqual({
      timestamp: '2026-02-18T08:00:01',
      date: '2026-02-18',
      type: 'create_agent_task',
      bodyLen: 12000,
    });
    expect(entries[1].type).toBe('commit_toolcall_result');
    expect(entries[1].bodyLen).toBe(8000);
    expect(entries[2].type).toBe('create_agent_task');
    expect(entries[2].bodyLen).toBe(20000);
    expect(entries[3].type).toBe('create_agent_task');
    expect(entries[3].bodyLen).toBe(16000);
  });

  it('returns empty for content with no body_len', () => {
    const entries = parseBodyLenEntries('no body len here');
    expect(entries).toEqual([]);
  });
});

describe('parseAgentTasks', () => {
  it('parses create_agent_task Status: 200 lines', () => {
    const content = loadLog('ai-agent-a.log');
    const tasks = parseAgentTasks(content);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toEqual({
      timestamp: '2026-02-18T08:00:05',
      date: '2026-02-18',
      sessionId: 'sess-001',
      taskId: 'task-001',
      messageId: 'msg-001',
    });
  });

  it('parses tasks from second log file', () => {
    const content = loadLog('ai-agent-b.log');
    const tasks = parseAgentTasks(content);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].sessionId).toBe('sess-002');
    expect(tasks[0].date).toBe('2026-02-19');
  });
});

describe('parseTokenUsageEvents', () => {
  it('parses TokenUsageEvent entries', () => {
    const content = loadLog('ai-agent-a.log');
    const events = parseTokenUsageEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      timestamp: '2026-02-18T11:00:00',
      date: '2026-02-18',
      promptTokens: 402,
      completionTokens: 6,
      totalTokens: 408,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
  });

  it('parses events with non-zero cache tokens', () => {
    const content = loadLog('ai-agent-b.log');
    const events = parseTokenUsageEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0].cacheCreationTokens).toBe(10);
    expect(events[0].cacheReadTokens).toBe(50);
  });
});

describe('parseLogContent', () => {
  it('parses all event types from a single file', () => {
    const content = loadLog('ai-agent-a.log');
    const data = parseLogContent(content);
    expect(data.timingEvents).toHaveLength(3);
    expect(data.bodyLenEntries).toHaveLength(4);
    expect(data.agentTasks).toHaveLength(3);
    expect(data.tokenUsageEvents).toHaveLength(1);
  });

  it('handles empty content', () => {
    const data = parseLogContent('');
    expect(data.timingEvents).toEqual([]);
    expect(data.bodyLenEntries).toEqual([]);
    expect(data.agentTasks).toEqual([]);
    expect(data.tokenUsageEvents).toEqual([]);
  });
});

describe('estimateTokens', () => {
  it('estimates output tokens from timing events', () => {
    // Event 1: serverProcessingTime=4080, firstSseEventTime=3172 → gen=908ms
    // Event 2: serverProcessingTime=8500, firstSseEventTime=2000 → gen=6500ms
    // Event 3: serverProcessingTime=120000, firstSseEventTime=1000 → gen=119000ms (outlier!)
    // p95 of [908, 6500, 119000] sorted = [908, 6500, 119000], p95 idx = floor(3*0.95) = 2 → 119000
    // But outlier threshold is 60000, so event 3 gen is replaced with p95=119000... wait,
    // that's still > 60000. Let me use a custom config.
    const content = loadLog('ai-agent-a.log');
    const data = parseLogContent(content);

    const cfg: EstimationConfig = {
      ...DEFAULT_ESTIMATION_CONFIG,
      outlierThresholdMs: 60_000,
    };

    const result = estimateTokens(data.timingEvents, data.bodyLenEntries, ['2026-02-18'], cfg);

    // Event 1: gen = 908ms → 908/1000 * 100 = 90.8 tokens
    // Event 2: gen = 6500ms → 6500/1000 * 100 = 650 tokens
    // Event 3: gen = 119000ms > 60000 → outlier, use p95
    //   sorted = [908, 6500, 119000], p95 idx = floor(3*0.95)=2 → 119000
    //   But 119000 > 60000 still, so it replaces with p95=119000
    //   output = 119000/1000 * 100 = 11900 tokens
    // Total output = 90.8 + 650 + 11900 = 12640.8 → rounded = 12641
    expect(result.outlierCount).toBe(1);
    expect(result.totalEstOutput).toBe(12641);

    // body_len: 12000 + 8000 + 20000 + 16000 = 56000 bytes
    // input = 56000 * 0.5 / 4 = 7000
    expect(result.totalEstInput).toBe(7000);
  });

  it('estimates with no outliers when threshold is high', () => {
    const content = loadLog('ai-agent-a.log');
    const data = parseLogContent(content);

    const cfg: EstimationConfig = {
      ...DEFAULT_ESTIMATION_CONFIG,
      outlierThresholdMs: 200_000,
    };

    const result = estimateTokens(data.timingEvents, data.bodyLenEntries, ['2026-02-18'], cfg);
    expect(result.outlierCount).toBe(0);
  });

  it('applies date filter', () => {
    const content = loadLog('ai-agent-a.log');
    const data = parseLogContent(content);

    const result = estimateTokens(data.timingEvents, data.bodyLenEntries, ['2099-01-01']);
    expect(result.totalEstOutput).toBe(0);
    expect(result.totalEstInput).toBe(0);
  });

  it('handles empty inputs', () => {
    const result = estimateTokens([], []);
    expect(result.totalEstOutput).toBe(0);
    expect(result.totalEstInput).toBe(0);
    expect(result.outlierCount).toBe(0);
    expect(result.p95GenerationMs).toBe(0);
  });
});

describe('aggregateByDate', () => {
  it('aggregates across multiple log files', () => {
    const contentA = loadLog('ai-agent-a.log');
    const contentB = loadLog('ai-agent-b.log');
    const dataA = parseLogContent(contentA);
    const dataB = parseLogContent(contentB);

    // Merge data from both files
    const merged = {
      timingEvents: [...dataA.timingEvents, ...dataB.timingEvents],
      bodyLenEntries: [...dataA.bodyLenEntries, ...dataB.bodyLenEntries],
      agentTasks: [...dataA.agentTasks, ...dataB.agentTasks],
      tokenUsageEvents: [...dataA.tokenUsageEvents, ...dataB.tokenUsageEvents],
    };

    const agg = aggregateByDate(merged);

    expect(agg.has('2026-02-18')).toBe(true);
    expect(agg.has('2026-02-19')).toBe(true);

    const feb18 = agg.get('2026-02-18')!;
    expect(feb18.llmCalls).toBe(3);
    expect(feb18.agentTasks).toBe(3);
    expect(feb18.models['gemini-3-pro']).toBe(3);

    const feb19 = agg.get('2026-02-19')!;
    expect(feb19.llmCalls).toBe(2);
    expect(feb19.agentTasks).toBe(1);
    expect(feb19.models['claude-sonnet-4']).toBe(2);
  });

  it('filters by date', () => {
    const content = loadLog('ai-agent-a.log');
    const data = parseLogContent(content);

    const agg = aggregateByDate(data, ['2026-02-18']);
    expect(agg.has('2026-02-18')).toBe(true);
    expect(agg.size).toBe(1);
  });

  it('includes estimated tokens', () => {
    const content = loadLog('ai-agent-a.log');
    const data = parseLogContent(content);

    const agg = aggregateByDate(data, ['2026-02-18']);
    const feb18 = agg.get('2026-02-18')!;
    expect(feb18.estInputTokens).toBeGreaterThan(0);
    expect(feb18.estOutputTokens).toBeGreaterThan(0);
    expect(feb18.estTotalTokens).toBe(feb18.estInputTokens + feb18.estOutputTokens);
  });

  it('handles empty data', () => {
    const data = parseLogContent('');
    const agg = aggregateByDate(data);
    expect(agg.size).toBe(0);
  });
});
