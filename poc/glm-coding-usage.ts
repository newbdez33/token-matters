/**
 * POC: GLM Coding Plan 用量采集
 *
 * 数据来源:
 *   1. /api/monitor/usage/quota/limit  — 当前配额使用率
 *   2. /api/monitor/usage/model-usage  — 按小时的模型调用 & Token 消耗时序
 *   3. /api/monitor/usage/tool-usage   — MCP 工具调用时序
 *
 * 认证: Authorization 头直接传 API Key（不加 Bearer 前缀）
 *
 * 用法:
 *   GLM_API_KEY=your_key npx tsx poc/glm-coding-usage.ts
 *   GLM_API_KEY=your_key npx tsx poc/glm-coding-usage.ts --days 30
 *   GLM_API_KEY=your_key npx tsx poc/glm-coding-usage.ts --json
 *
 * z.ai 用户:
 *   GLM_API_KEY=your_key GLM_BASE_URL=https://api.z.ai npx tsx poc/glm-coding-usage.ts
 */

// ── 配置 ─────────────────────────────────────────────────

const API_KEY = process.env.GLM_API_KEY ?? process.env.ZHIPU_API_KEY ?? "";
const BASE_URL = process.env.GLM_BASE_URL ?? "https://open.bigmodel.cn";

// ── 类型定义 ──────────────────────────────────────────────

interface QuotaLimit {
  type: string;
  // open.bigmodel.cn 格式
  usage?: number;
  currentValue?: number;
  remaining?: number;
  percentage: number;
  nextResetTime?: number;
  // z.ai 格式
  unit?: number;
  number?: number;
  // 工具明细
  usageDetails?: Array<{ modelCode: string; usage: number }>;
}

interface QuotaResponse {
  code: number;
  msg: string;
  success: boolean;
  data: {
    limits: QuotaLimit[];
    level?: string;
  };
}

interface ModelUsageResponse {
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

interface ToolUsageResponse {
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

interface DailySummary {
  date: string;
  modelCalls: number;
  tokensUsage: number;
  searchCalls: number;
  webReadCalls: number;
  zreadCalls: number;
}

// ── HTTP 请求 ────────────────────────────────────────────

async function glmFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: API_KEY,
      "Accept-Language": "en-US,en",
      "Content-Type": "application/json",
    },
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText} — ${await resp.text()}`);
  }

  return resp.json() as Promise<T>;
}

// ── 日期工具 ─────────────────────────────────────────────

function formatDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ── 聚合小时数据为日粒度 ─────────────────────────────────

function aggregateDaily(
  xTime: string[],
  modelCalls: (number | null)[],
  tokens: (number | null)[],
  searchCounts: (number | null)[],
  webReadCounts: (number | null)[],
  zreadCounts: (number | null)[]
): DailySummary[] {
  const map = new Map<string, DailySummary>();

  for (let i = 0; i < xTime.length; i++) {
    const date = xTime[i].slice(0, 10); // "2026-02-12"
    if (!map.has(date)) {
      map.set(date, {
        date,
        modelCalls: 0,
        tokensUsage: 0,
        searchCalls: 0,
        webReadCalls: 0,
        zreadCalls: 0,
      });
    }
    const day = map.get(date)!;
    day.modelCalls += modelCalls[i] ?? 0;
    day.tokensUsage += tokens[i] ?? 0;
    day.searchCalls += searchCounts[i] ?? 0;
    day.webReadCalls += webReadCounts[i] ?? 0;
    day.zreadCalls += zreadCounts[i] ?? 0;
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ── Quota 单位映射 ───────────────────────────────────────

const UNIT_LABELS: Record<number, string> = {
  3: "5h window",
  5: "monthly",
  6: "weekly",
};

function quotaLabel(limit: QuotaLimit): string {
  if (limit.type === "TOKENS_LIMIT") {
    const window = limit.unit !== undefined ? UNIT_LABELS[limit.unit] ?? `unit=${limit.unit}` : "5h window";
    return `Token (${window})`;
  }
  if (limit.type === "TIME_LIMIT") {
    const window = limit.unit !== undefined ? UNIT_LABELS[limit.unit] ?? `unit=${limit.unit}` : "monthly";
    return `MCP calls (${window})`;
  }
  return limit.type;
}

// ── 主逻辑 ───────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error("Error: GLM_API_KEY 环境变量未设置");
    console.error("");
    console.error("用法:");
    console.error("  GLM_API_KEY=your_key npx tsx poc/glm-coding-usage.ts");
    console.error("  GLM_API_KEY=your_key GLM_BASE_URL=https://api.z.ai npx tsx poc/glm-coding-usage.ts");
    console.error("");
    console.error("API Key 获取:");
    console.error("  国内: https://open.bigmodel.cn/usercenter/apikeys");
    console.error("  国际: https://api.z.ai");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const daysFlag = args.indexOf("--days");
  const days = daysFlag !== -1 ? parseInt(args[daysFlag + 1], 10) : 7;
  const jsonOutput = args.includes("--json");

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const startStr = formatDatetime(startDate);
  const endStr = formatDatetime(now);

  // ── 并行请求三个端点 ──

  const [quotaResult, modelResult, toolResult] = await Promise.allSettled([
    glmFetch<QuotaResponse>("/api/monitor/usage/quota/limit"),
    glmFetch<ModelUsageResponse>("/api/monitor/usage/model-usage", {
      startTime: startStr,
      endTime: endStr,
    }),
    glmFetch<ToolUsageResponse>("/api/monitor/usage/tool-usage", {
      startTime: startStr,
      endTime: endStr,
    }),
  ]);

  // ── 解析结果 ──

  const quotaData = quotaResult.status === "fulfilled" && quotaResult.value.success ? quotaResult.value : null;
  const modelData = modelResult.status === "fulfilled" && modelResult.value.success ? modelResult.value : null;
  const toolData = toolResult.status === "fulfilled" && toolResult.value.success ? toolResult.value : null;

  // 聚合按日
  const dailyData = aggregateDaily(
    modelData?.data.x_time ?? [],
    modelData?.data.modelCallCount ?? [],
    modelData?.data.tokensUsage ?? [],
    toolData?.data.networkSearchCount ?? [],
    toolData?.data.webReadMcpCount ?? [],
    toolData?.data.zreadMcpCount ?? []
  );

  // ── JSON 输出 ──

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          queryTime: now.toISOString(),
          baseUrl: BASE_URL,
          period: { start: startStr, end: endStr, days },
          plan: quotaData?.data.level ?? "unknown",
          quota: quotaData?.data.limits ?? null,
          totalUsage: modelData?.data.totalUsage ?? null,
          toolTotalUsage: toolData?.data.totalUsage ?? null,
          daily: dailyData,
        },
        null,
        2
      )
    );
    return;
  }

  // ── 帐单式文本输出 ──

  const fmt = (n: number) => n.toLocaleString("en-US");

  console.log("");
  console.log("  GLM CODING PLAN USAGE");
  console.log(`  ${formatDate(startDate)} — ${formatDate(now)} (${days} days)`);
  console.log(`  Plan: ${quotaData?.data.level?.toUpperCase() ?? "UNKNOWN"}  |  Source: ${BASE_URL}`);
  console.log("");

  // ── Quota ──
  if (quotaData?.data.limits) {
    console.log("  CURRENT QUOTA");
    console.log("  ──────────────────────────────────────────────────────────────────────");
    console.log("  TYPE                         USED         TOTAL    USAGE%     RESETS");
    console.log("  ──────────────────────────────────────────────────────────────────────");

    for (const limit of quotaData.data.limits) {
      const label = quotaLabel(limit);
      const used = limit.currentValue ?? limit.percentage ?? 0;
      const total = limit.usage ?? "--";
      const pct = `${limit.percentage.toFixed(1)}%`;
      const resetStr = limit.nextResetTime
        ? new Date(limit.nextResetTime).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "  --";

      if (typeof total === "number") {
        console.log(
          `  ${label.padEnd(27)}  ${fmt(used).padStart(9)}  ${fmt(total).padStart(11)}  ${pct.padStart(8)}   ${resetStr}`
        );
      } else {
        console.log(
          `  ${label.padEnd(27)}         ${String(used).padStart(4)}           --  ${pct.padStart(8)}   ${resetStr}`
        );
      }
    }
    console.log("");
  }

  // ── Daily Usage ──
  console.log("  DAILY USAGE");
  console.log("  ──────────────────────────────────────────────────────────────────────");
  console.log("  DATE            CALLS         TOKENS      SEARCH    WEB READ");
  console.log("  ──────────────────────────────────────────────────────────────────────");

  let totalCalls = 0;
  let totalTokens = 0;
  let totalSearch = 0;
  let totalWebRead = 0;

  for (const d of dailyData) {
    if (d.modelCalls === 0 && d.tokensUsage === 0) continue; // 跳过空天
    totalCalls += d.modelCalls;
    totalTokens += d.tokensUsage;
    totalSearch += d.searchCalls;
    totalWebRead += d.webReadCalls + d.zreadCalls;

    console.log(
      `  ${d.date}  ${fmt(d.modelCalls).padStart(9)}  ${fmt(d.tokensUsage).padStart(13)}  ${fmt(d.searchCalls).padStart(9)}  ${fmt(d.webReadCalls + d.zreadCalls).padStart(9)}`
    );
  }

  console.log("  ──────────────────────────────────────────────────────────────────────");
  console.log(
    `  TOTAL     ${fmt(totalCalls).padStart(9)}  ${fmt(totalTokens).padStart(13)}  ${fmt(totalSearch).padStart(9)}  ${fmt(totalWebRead).padStart(9)}`
  );
  console.log("");

  // API 汇总 vs 本地汇总校验
  if (modelData?.data.totalUsage) {
    const api = modelData.data.totalUsage;
    console.log("  SUMMARY (from API)");
    console.log("  ──────────────────────────────────────────────────────────────────────");
    console.log(`  Total model calls:    ${fmt(api.totalModelCallCount)}`);
    console.log(`  Total tokens:         ${fmt(api.totalTokensUsage)}`);
    console.log("");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
