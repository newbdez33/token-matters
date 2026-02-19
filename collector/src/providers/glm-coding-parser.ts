export interface GlmModelUsageResponse {
  code: number;
  msg: string;
  success: boolean;
  data: {
    x_time: string[];
    modelCallCount: (number | null)[];
    tokensUsage: (number | null)[];
    totalUsage: {
      totalModelCallCount: number;
      totalTokensUsage: number;
    };
  };
}

export interface GlmToolUsageResponse {
  code: number;
  msg: string;
  success: boolean;
  data: {
    x_time: string[];
    networkSearchCount: (number | null)[];
    webReadMcpCount: (number | null)[];
    zreadMcpCount: (number | null)[];
    totalUsage: {
      totalNetworkSearchCount: number;
      totalWebReadMcpCount: number;
      totalZreadMcpCount: number;
      totalSearchMcpCount: number;
    };
  };
}

export interface GlmHourlyRecord {
  datetime: string;
  modelCalls: number;
  tokensUsage: number;
}

export interface GlmDailyAggregate {
  date: string;
  modelCalls: number;
  tokensUsage: number;
}

export function parseModelUsageResponse(resp: GlmModelUsageResponse): GlmHourlyRecord[] {
  const { x_time, modelCallCount, tokensUsage } = resp.data;
  const records: GlmHourlyRecord[] = [];

  for (let i = 0; i < x_time.length; i++) {
    records.push({
      datetime: x_time[i],
      modelCalls: modelCallCount[i] ?? 0,
      tokensUsage: tokensUsage[i] ?? 0,
    });
  }

  return records;
}

export function aggregateGlmByDate(
  records: GlmHourlyRecord[],
  dateFilter?: string[],
): Map<string, GlmDailyAggregate> {
  const map = new Map<string, GlmDailyAggregate>();

  for (const r of records) {
    const date = r.datetime.slice(0, 10);
    if (dateFilter && !dateFilter.includes(date)) continue;

    let day = map.get(date);
    if (!day) {
      day = { date, modelCalls: 0, tokensUsage: 0 };
      map.set(date, day);
    }

    day.modelCalls += r.modelCalls;
    day.tokensUsage += r.tokensUsage;
  }

  return map;
}
