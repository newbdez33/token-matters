import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CollectorProvider, DataQuality, RawDataFile, RawRecord } from './types.js';
import { findSessionFiles, parseSessionFile, aggregateByDate } from './codex-parser.js';

interface CodexProviderOptions {
  codexDir: string;
  machine: string;
  timezone: string;
  sessionsDir?: string;
}

export function createCodexProvider(opts: CodexProviderOptions): CollectorProvider {
  const sessionsDir = opts.sessionsDir ?? join(opts.codexDir, 'sessions');

  return {
    name: 'codex',
    dataQuality: 'exact' as DataQuality,

    async isAvailable(): Promise<boolean> {
      return existsSync(sessionsDir);
    },

    async collect(date: string): Promise<RawDataFile> {
      const files = findSessionFiles(sessionsDir, [date]);
      const allRecords = files.flatMap(f =>
        parseSessionFile(f, opts.timezone, [date]),
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
            cacheReadTokens: m.cachedInputTokens,
            totalTokens: m.totalTokens,
            requests: m.requests,
          });
        }
      }

      return {
        version: '1.0',
        collectedAt: new Date().toISOString(),
        machine: opts.machine,
        provider: 'codex',
        date,
        dataQuality: 'exact',
        records,
      };
    },
  };
}
