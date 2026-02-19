import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CollectorProvider, DataQuality, RawDataFile, RawRecord } from './types.js';
import {
  findAiAgentLogs,
  parseLogFile,
  aggregateByDate,
  type ParsedLogData,
  type EstimationConfig,
  DEFAULT_ESTIMATION_CONFIG,
} from './trae-pro-parser.js';

interface TraeProProviderOptions {
  traeDir: string;
  machine: string;
  timezone: string;
  logsDir?: string; // override for testing
  estimationConfig?: EstimationConfig;
}

export function createTraeProProvider(opts: TraeProProviderOptions): CollectorProvider {
  const logsDir = opts.logsDir ?? join(opts.traeDir, 'logs');
  const cfg = opts.estimationConfig ?? DEFAULT_ESTIMATION_CONFIG;

  return {
    name: 'trae-pro',
    dataQuality: 'estimated' as DataQuality,

    async isAvailable(): Promise<boolean> {
      return existsSync(logsDir);
    },

    async collect(date: string): Promise<RawDataFile> {
      const logFiles = findAiAgentLogs(logsDir);

      // Parse all log files and merge
      const merged: ParsedLogData = {
        timingEvents: [],
        bodyLenEntries: [],
        agentTasks: [],
        tokenUsageEvents: [],
      };

      for (const logFile of logFiles) {
        try {
          const data = parseLogFile(logFile);
          merged.timingEvents.push(...data.timingEvents);
          merged.bodyLenEntries.push(...data.bodyLenEntries);
          merged.agentTasks.push(...data.agentTasks);
          merged.tokenUsageEvents.push(...data.tokenUsageEvents);
        } catch {
          // skip unreadable files
        }
      }

      const agg = aggregateByDate(merged, [date], cfg);
      const dayData = agg.get(date);

      const records: RawRecord[] = [];
      if (dayData && (dayData.llmCalls > 0 || dayData.agentTasks > 0)) {
        records.push({
          totalTokens: dayData.estTotalTokens,
          inputTokens: dayData.estInputTokens,
          outputTokens: dayData.estOutputTokens,
          requests: dayData.llmCalls,
          note: `TRAE ai-agent log (estimated: ${dayData.agentTasks} agent tasks, models: ${Object.keys(dayData.models).join(', ') || 'none'})`,
        });
      }

      return {
        version: '1.0',
        collectedAt: new Date().toISOString(),
        machine: opts.machine,
        provider: 'trae-pro',
        date,
        dataQuality: 'estimated',
        records,
      };
    },
  };
}
