import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CollectorProvider, DataQuality, RawDataFile, RawRecord } from './types.js';
import {
  openDb,
  querySessionsByDate,
  queryMessagesBySessionIds,
  aggregateByModel,
} from './opencode-parser.js';

interface OpenCodeProviderOptions {
  openCodeDir: string;
  machine: string;
  timezone: string;
}

export function createOpenCodeProvider(opts: OpenCodeProviderOptions): CollectorProvider {
  const dbPath = join(opts.openCodeDir, 'opencode.db');

  return {
    name: 'opencode',
    dataQuality: 'exact' as DataQuality,

    async isAvailable(): Promise<boolean> {
      return existsSync(dbPath);
    },

    async collect(date: string): Promise<RawDataFile> {
      const db = openDb(dbPath);
      try {
        const sessions = querySessionsByDate(db, date, opts.timezone);
        const sessionIds = sessions.map(s => s.id);
        const messages = queryMessagesBySessionIds(db, sessionIds);
        const byModel = aggregateByModel(messages);

        const records: RawRecord[] = [];
        for (const [model, m] of byModel) {
          records.push({
            model,
            inputTokens: m.inputTokens,
            outputTokens: m.outputTokens,
            cacheReadTokens: m.cacheReadTokens,
            cacheCreationTokens: m.cacheWriteTokens,
            totalTokens: m.totalTokens,
            requests: m.requests,
          });
        }

        return {
          version: '1.0',
          collectedAt: new Date().toISOString(),
          machine: opts.machine,
          provider: 'opencode',
          date,
          dataQuality: 'exact',
          records,
        };
      } finally {
        db.close();
      }
    },
  };
}
