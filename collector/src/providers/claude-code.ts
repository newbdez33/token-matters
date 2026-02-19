import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CollectorProvider, DataQuality, RawDataFile, RawRecord } from './types.js';
import { findJsonlFiles, parseJsonlFile, aggregateByDate } from './claude-code-parser.js';

interface ClaudeCodeProviderOptions {
  claudeDir: string;
  machine: string;
  timezone: string;
  /** Override the projects directory (for testing) */
  projectsDir?: string;
}

export function createClaudeCodeProvider(opts: ClaudeCodeProviderOptions): CollectorProvider {
  const projectsDir = opts.projectsDir ?? join(opts.claudeDir, 'projects');

  return {
    name: 'claude-code',
    dataQuality: 'exact' as DataQuality,

    async isAvailable(): Promise<boolean> {
      return existsSync(projectsDir);
    },

    async collect(date: string): Promise<RawDataFile> {
      const files = findJsonlFiles(projectsDir);
      const allRecords = files.flatMap(f =>
        parseJsonlFile(f, opts.timezone, [date]),
      );

      const agg = aggregateByDate(allRecords);
      const dayData = agg.get(date);

      const records: RawRecord[] = [];
      if (dayData) {
        for (const [model, m] of Object.entries(dayData.models)) {
          records.push({
            model,
            inputTokens: m.inputTokens,
            outputTokens: m.outputTokens,
            cacheCreationTokens: m.cacheCreationTokens,
            cacheReadTokens: m.cacheReadTokens,
            totalTokens: m.totalTokens,
            requests: m.requests,
          });
        }
      }

      return {
        version: '1.0',
        collectedAt: new Date().toISOString(),
        machine: opts.machine,
        provider: 'claude-code',
        date,
        dataQuality: 'exact',
        records,
      };
    },
  };
}
