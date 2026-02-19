import type { CollectorProvider, DataQuality, RawDataFile, RawRecord } from './types.js';
import {
  parseModelUsageResponse,
  aggregateGlmByDate,
  type GlmModelUsageResponse,
} from './glm-coding-parser.js';

interface GlmCodingProviderOptions {
  apiKey: string;
  baseUrl: string;
  machine: string;
  timezone: string;
}

function formatDatetime(date: string, time: string): string {
  return `${date} ${time}`;
}

export function createGlmCodingProvider(opts: GlmCodingProviderOptions): CollectorProvider {
  async function glmFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, opts.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: opts.apiKey,
        'Accept-Language': 'en-US,en',
        'Content-Type': 'application/json',
      },
    });

    if (!resp.ok) {
      throw new Error(`GLM API ${resp.status}: ${resp.statusText}`);
    }

    return resp.json() as Promise<T>;
  }

  return {
    name: 'glm-coding',
    dataQuality: 'partial' as DataQuality,

    async isAvailable(): Promise<boolean> {
      return opts.apiKey.length > 0;
    },

    async collect(date: string): Promise<RawDataFile> {
      // Fetch 7 days of data to ensure we capture the target date
      const startTime = formatDatetime(date, '00:00:00');
      const endTime = formatDatetime(date, '23:59:59');

      const modelResp = await glmFetch<GlmModelUsageResponse>(
        '/api/monitor/usage/model-usage',
        { startTime, endTime },
      );

      const hourlyRecords = parseModelUsageResponse(modelResp);
      const agg = aggregateGlmByDate(hourlyRecords, [date]);
      const dayData = agg.get(date);

      const records: RawRecord[] = [];
      if (dayData && dayData.tokensUsage > 0) {
        records.push({
          totalTokens: dayData.tokensUsage,
          requests: dayData.modelCalls,
          note: 'GLM monitoring API (aggregated, no input/output breakdown)',
        });
      }

      return {
        version: '1.0',
        collectedAt: new Date().toISOString(),
        machine: opts.machine,
        provider: 'glm-coding',
        date,
        dataQuality: 'partial',
        records,
      };
    },
  };
}
