/**
 * POC: TRAE Pro Plan 用量采集（含 Token 估算）
 *
 * 数据来源:
 *   1. ~/Library/Application Support/Trae/logs/ — ai-agent 日志
 *      - TimingCostOriginEvent: 每次 LLM 调用的模型名、server_processing_time、first_sse_event_time
 *      - HTTP body_len: 每次请求的 body 大小（字节）
 *      - TokenUsageEvent: 真实 token 消耗（仅 title 生成等本地调用有此数据）
 *      - create_agent_task: 服务端 agent 任务计数
 *   2. ~/Library/Application Support/Trae/User/globalStorage/storage.json — 认证 & 订阅信息
 *   3. growsg-normal.trae.ai/trae/api/v1/pay/ide_user_pay_status — 订阅状态 API
 *
 * Token 估算算法:
 *   TRAE 不返回 token 计数，但日志中有耗时和 body 大小，可反推估算。
 *   详见代码中 EstimationConfig 和 estimateTokens() 的注释。
 *
 * 用法:
 *   npx tsx poc/trae-usage.ts
 *   npx tsx poc/trae-usage.ts --json
 *   npx tsx poc/trae-usage.ts --days 30
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── 估算参数 ─────────────────────────────────────────────
//
// TRAE 服务端处理 AI 对话，不返回 token 计数。我们用以下公式从日志反推：
//
//   output_tokens = generation_time_sec × OUTPUT_TOKEN_RATE
//     其中 generation_time_sec = (server_processing_time − first_sse_event_time) / 1000
//     server_processing_time: SSE 流从建连到结束的总耗时（含排队、预处理、推理）
//     first_sse_event_time:   收到第一个 SSE event 的耗时（≈ TTFT，反映 input 处理时间）
//     两者之差 ≈ 模型实际生成 output 的时间
//
//   input_tokens = body_len × BODY_CONTENT_RATIO / BYTES_PER_TOKEN
//     body_len:   HTTP 请求体大小（字节），包含 JSON 结构、会话上下文、系统 prompt
//     BODY_CONTENT_RATIO: JSON 结构中实际 prompt 文本占比（去除 key、元数据等开销）
//     BYTES_PER_TOKEN: 平均每个 token 对应的字节数（英文/代码 ≈ 4，中文 ≈ 3）
//
//   异常值处理:
//     generation_time > OUTLIER_THRESHOLD_MS 的条目视为异常（agent 多轮循环、网络卡顿等），
//     用 p95 值替代，避免单条异常拉高总量。
//

interface EstimationConfig {
  /** 模型输出速率 (tokens/sec)。Gemini-3-Pro ≈ 80~150，取中值 */
  outputTokenRate: number;
  /** HTTP body 中实际 prompt 内容占比。JSON 结构/元数据开销约 50% */
  bodyContentRatio: number;
  /** 每个 token 的平均字节数。英文/代码 ≈ 4 */
  bytesPerToken: number;
  /** generation_time 异常值阈值 (ms)。超过此值用 p95 替代 */
  outlierThresholdMs: number;
}

const DEFAULT_CONFIG: EstimationConfig = {
  outputTokenRate: 100,
  bodyContentRatio: 0.5,
  bytesPerToken: 4,
  outlierThresholdMs: 60_000,
};

// ── 类型定义 ──────────────────────────────────────────────

interface TokenUsageEntry {
  timestamp: string;
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  context: string;
}

interface TimingCostEntry {
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

interface BodyLenEntry {
  timestamp: string;
  date: string;
  type: "create_agent_task" | "commit_toolcall_result";
  bodyLen: number;
}

interface AgentTaskEntry {
  timestamp: string;
  date: string;
  sessionId: string;
  taskId: string;
  messageId: string;
}

interface DailyEstimate {
  date: string;
  // 原始事件
  agentTasks: number;
  llmCalls: number;
  models: Record<string, number>;
  // 估算 token
  estOutputTokens: number;
  estInputTokens: number;
  estTotalTokens: number;
  // 耗时
  avgServerProcessingMs: number;
}

interface PayStatus {
  userPayIdentityStr: string;
  userPayIdentity: number;
  isDollarUsageBilling: boolean;
  hasPackage: boolean;
  enableSoloCoder: boolean;
  enableSoloBuilder: boolean;
  serverTimeMs: number;
  trialStatus: {
    isInTrial: boolean;
    isEligibleForTrial: boolean;
    trialEndTime: number;
  };
}

// ── 认证信息读取 ──────────────────────────────────────────

function readAuthInfo(): { token: string; userId: string; host: string } | null {
  const storagePath = join(
    homedir(),
    "Library/Application Support/Trae/User/globalStorage/storage.json"
  );
  try {
    const data = JSON.parse(readFileSync(storagePath, "utf-8"));
    const authRaw = data["iCubeAuthInfo://icube.cloudide"];
    if (!authRaw) return null;
    const auth = typeof authRaw === "string" ? JSON.parse(authRaw) : authRaw;
    return {
      token: auth.token ?? "",
      userId: auth.userId ?? "",
      host: auth.host ?? "",
    };
  } catch {
    return null;
  }
}

// ── 订阅状态 API ──────────────────────────────────────────

async function fetchPayStatus(token: string): Promise<PayStatus | null> {
  try {
    const resp = await fetch(
      "https://growsg-normal.trae.ai/trae/api/v1/pay/ide_user_pay_status",
      {
        headers: {
          Authorization: `Cloud-IDE-JWT ${token}`,
          "x-ide-token": token,
          "X-App-Id": "6eefa01c-1036-4c7e-9ca5-d891f63bfcd8",
          "Content-Type": "application/json",
        },
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as Record<string, unknown>;
    return {
      userPayIdentityStr: (data.user_pay_identity_str as string) ?? "unknown",
      userPayIdentity: (data.user_pay_identity as number) ?? 0,
      isDollarUsageBilling: (data.is_dollar_usage_billing as boolean) ?? false,
      hasPackage: (data.has_package as boolean) ?? false,
      enableSoloCoder: (data.enable_solo_coder as boolean) ?? false,
      enableSoloBuilder: (data.enable_solo_builder as boolean) ?? false,
      serverTimeMs: (data.server_time_ms as number) ?? 0,
      trialStatus: {
        isInTrial:
          ((data.trial_status as Record<string, unknown>)?.is_in_trial as boolean) ?? false,
        isEligibleForTrial:
          ((data.trial_status as Record<string, unknown>)?.is_eligible_for_trial as boolean) ??
          false,
        trialEndTime:
          ((data.trial_status as Record<string, unknown>)?.trial_end_time as number) ?? 0,
      },
    };
  } catch {
    return null;
  }
}

// ── 日志目录扫描 ──────────────────────────────────────────

function findAiAgentLogs(logsDir: string): string[] {
  const results: string[] = [];
  try {
    for (const sessionDir of readdirSync(logsDir)) {
      const modularDir = join(logsDir, sessionDir, "Modular");
      try {
        for (const file of readdirSync(modularDir)) {
          if (file.startsWith("ai-agent_") && file.endsWith("_stdout.log")) {
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

// ── 日志解析 ──────────────────────────────────────────────

function parseTimestamp(line: string): { timestamp: string; date: string } | null {
  const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  return { timestamp: match[1], date: match[1].slice(0, 10) };
}

function parseTokenUsageEvents(content: string): TokenUsageEntry[] {
  const results: TokenUsageEntry[] = [];
  const regex =
    /^(.+?)\s+INFO\s+(\S+?):\s.*token usage: TokenUsageEvent \{ name: ".*?", prompt_tokens: (\d+), completion_tokens: (\d+), total_tokens: (\d+), reasoning_tokens: Some\((\d+)\), cache_creation_input_tokens: Some\((\d+)\), cache_read_input_tokens: Some\((\d+)\)/gm;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const ts = parseTimestamp(match[1]);
    if (!ts) continue;
    results.push({
      timestamp: ts.timestamp,
      date: ts.date,
      context: match[2],
      promptTokens: parseInt(match[3]),
      completionTokens: parseInt(match[4]),
      totalTokens: parseInt(match[5]),
      reasoningTokens: parseInt(match[6]),
      cacheCreationTokens: parseInt(match[7]),
      cacheReadTokens: parseInt(match[8]),
    });
  }
  return results;
}

function parseTimingCostEvents(content: string): TimingCostEntry[] {
  const results: TimingCostEntry[] = [];
  const regex =
    /^(.+?)\s+INFO\s+.*TimingCost: TimingCostOriginEvent \{ data: "(.*?)" \}.*?session_id=(\S+).*?message_id=(\S+)/gm;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const ts = parseTimestamp(match[1]);
    if (!ts) continue;
    try {
      const jsonStr = match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      const data = JSON.parse(jsonStr);
      results.push({
        timestamp: ts.timestamp,
        date: ts.date,
        configName: data.config_name ?? "unknown",
        providerModelName: data.provider_model_name ?? data.config_name ?? "unknown",
        serverProcessingTime: data.server_processing_time ?? 0,
        firstSseEventTime: data.first_sse_event_time ?? 0,
        isRetry: data.is_retry ?? false,
        sessionId: match[3],
        messageId: match[4],
      });
    } catch {
      // skip malformed
    }
  }
  return results;
}

function parseBodyLenEntries(content: string): BodyLenEntry[] {
  const results: BodyLenEntry[] = [];
  // Pattern: body_len=NNN at the end of a line containing the URL
  const regex =
    /^(.+?)\s+INFO\s+.*\[aha_net\] send:.*url=(https?:\/\/\S+)\S*,.*body_len=(\d+)/gm;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const ts = parseTimestamp(match[1]);
    if (!ts) continue;
    const url = match[2];
    let type: BodyLenEntry["type"] | null = null;
    if (url.includes("create_agent_task")) type = "create_agent_task";
    else if (url.includes("commit_toolcall_result")) type = "commit_toolcall_result";
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

function parseAgentTasks(content: string): AgentTaskEntry[] {
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

// ── Token 估算 ──────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

function estimateTokens(
  timingEvents: TimingCostEntry[],
  bodyLenEntries: BodyLenEntry[],
  startDate: string,
  cfg: EstimationConfig
): {
  daily: Map<string, { estOutput: number; estInput: number }>;
  totalEstOutput: number;
  totalEstInput: number;
  outlierCount: number;
  p95GenerationMs: number;
} {
  // ── Step 1: 计算每条 TimingCostEntry 的 generation_time ──
  const periodTiming = timingEvents.filter((e) => e.date >= startDate);
  const generationTimes = periodTiming.map((e) =>
    Math.max(0, e.serverProcessingTime - e.firstSseEventTime)
  );

  // ── Step 2: 确定 p95 和异常值 ──
  const sorted = [...generationTimes].sort((a, b) => a - b);
  const p95 = percentile(sorted, 0.95);

  // ── Step 3: 计算 output tokens ──
  //   output_tokens = generation_time_sec × outputTokenRate
  //   异常值 (> outlierThresholdMs) 用 p95 替代
  let outlierCount = 0;
  const dailyOutput = new Map<string, number>();
  let totalEstOutput = 0;

  for (let i = 0; i < periodTiming.length; i++) {
    const e = periodTiming[i];
    let genMs = generationTimes[i];
    if (genMs > cfg.outlierThresholdMs) {
      genMs = p95;
      outlierCount++;
    }
    const outputTokens = (genMs / 1000) * cfg.outputTokenRate;
    dailyOutput.set(e.date, (dailyOutput.get(e.date) ?? 0) + outputTokens);
    totalEstOutput += outputTokens;
  }

  // ── Step 4: 计算 input tokens ──
  //   input_tokens = body_len × bodyContentRatio / bytesPerToken
  const periodBody = bodyLenEntries.filter((e) => e.date >= startDate);
  const dailyInput = new Map<string, number>();
  let totalEstInput = 0;

  for (const e of periodBody) {
    const inputTokens = (e.bodyLen * cfg.bodyContentRatio) / cfg.bytesPerToken;
    dailyInput.set(e.date, (dailyInput.get(e.date) ?? 0) + inputTokens);
    totalEstInput += inputTokens;
  }

  // ── Step 5: 合并日粒度 ──
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

// ── 聚合 ────────────────────────────────────────────────

function aggregateDaily(
  timingEvents: TimingCostEntry[],
  agentTasks: AgentTaskEntry[],
  estimation: ReturnType<typeof estimateTokens>,
  startDate: string
): DailyEstimate[] {
  const map = new Map<string, DailyEstimate>();

  function getOrCreate(date: string): DailyEstimate {
    if (!map.has(date)) {
      map.set(date, {
        date,
        agentTasks: 0,
        llmCalls: 0,
        models: {},
        estOutputTokens: 0,
        estInputTokens: 0,
        estTotalTokens: 0,
        avgServerProcessingMs: 0,
      });
    }
    return map.get(date)!;
  }

  const timingByDay = new Map<string, number[]>();
  for (const e of timingEvents) {
    if (e.date < startDate) continue;
    const day = getOrCreate(e.date);
    day.llmCalls++;
    day.models[e.configName] = (day.models[e.configName] ?? 0) + 1;
    if (!timingByDay.has(e.date)) timingByDay.set(e.date, []);
    timingByDay.get(e.date)!.push(e.serverProcessingTime);
  }

  for (const e of agentTasks) {
    if (e.date < startDate) continue;
    getOrCreate(e.date).agentTasks++;
  }

  for (const [date, timings] of timingByDay) {
    const day = map.get(date);
    if (day && timings.length > 0) {
      day.avgServerProcessingMs = Math.round(
        timings.reduce((a, b) => a + b, 0) / timings.length
      );
    }
  }

  // 合入 token 估算
  for (const [date, est] of estimation.daily) {
    const day = getOrCreate(date);
    day.estOutputTokens = est.estOutput;
    day.estInputTokens = est.estInput;
    day.estTotalTokens = est.estOutput + est.estInput;
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ── 主逻辑 ───────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const daysFlag = args.indexOf("--days");
  const days = daysFlag !== -1 ? parseInt(args[daysFlag + 1], 10) : 7;
  const jsonOutput = args.includes("--json");

  const cfg = DEFAULT_CONFIG;

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const traeDir = join(homedir(), "Library/Application Support/Trae");
  const logsDir = join(traeDir, "logs");

  // ── Step 1: 读取认证信息 & 订阅状态 ──
  const auth = readAuthInfo();
  let payStatus: PayStatus | null = null;
  if (auth?.token) {
    payStatus = await fetchPayStatus(auth.token);
  }

  // ── Step 2: 扫描日志 ──
  const logFiles = findAiAgentLogs(logsDir);
  const allTokenEvents: TokenUsageEntry[] = [];
  const allTimingEvents: TimingCostEntry[] = [];
  const allAgentTasks: AgentTaskEntry[] = [];
  const allBodyLens: BodyLenEntry[] = [];

  for (const logFile of logFiles) {
    let content: string;
    try {
      content = readFileSync(logFile, "utf-8");
    } catch {
      continue;
    }
    allTokenEvents.push(...parseTokenUsageEvents(content));
    allTimingEvents.push(...parseTimingCostEvents(content));
    allAgentTasks.push(...parseAgentTasks(content));
    allBodyLens.push(...parseBodyLenEntries(content));
  }

  // ── Step 3: 估算 Token ──
  const estimation = estimateTokens(allTimingEvents, allBodyLens, startDateStr, cfg);

  // ── Step 4: 聚合 ──
  const dailyData = aggregateDaily(allTimingEvents, allAgentTasks, estimation, startDateStr);

  // ── Step 5: Unique sessions ──
  const uniqueSessions = new Set<string>();
  for (const e of allAgentTasks) {
    if (e.date >= startDateStr) uniqueSessions.add(e.sessionId);
  }
  for (const e of allTimingEvents) {
    if (e.date >= startDateStr) uniqueSessions.add(e.sessionId);
  }

  // ── Step 6: 输出 ──

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          queryTime: now.toISOString(),
          period: { start: startDateStr, end: todayStr, days },
          plan: payStatus?.userPayIdentityStr ?? "unknown",
          isDollarBilling: payStatus?.isDollarUsageBilling ?? null,
          estimation: {
            config: cfg,
            outputTokens: estimation.totalEstOutput,
            inputTokens: estimation.totalEstInput,
            totalTokens: estimation.totalEstOutput + estimation.totalEstInput,
            outlierCount: estimation.outlierCount,
            p95GenerationMs: estimation.p95GenerationMs,
          },
          logFiles: logFiles.length,
          uniqueSessions: uniqueSessions.size,
          daily: dailyData,
        },
        null,
        2
      )
    );
    return;
  }

  // ── 文本输出 ──

  const fmt = (n: number) => n.toLocaleString("en-US");

  console.log("");
  console.log("  TRAE PRO PLAN USAGE");
  console.log(`  ${startDateStr} — ${todayStr} (${days} days)`);
  console.log(
    `  Plan: ${payStatus?.userPayIdentityStr?.toUpperCase() ?? "UNKNOWN"}  |  Billing: ${payStatus?.isDollarUsageBilling ? "token-based" : "subscription"}`
  );
  console.log("");

  // ── Daily ──
  console.log("  DAILY USAGE");
  console.log("  ──────────────────────────────────────────────────────────────────────────────");
  console.log("  DATE          TASKS   LLM CALLS    ~INPUT     ~OUTPUT      ~TOTAL    AVG MS");
  console.log("  ──────────────────────────────────────────────────────────────────────────────");

  let totalTasks = 0;
  let totalCalls = 0;

  for (const d of dailyData) {
    if (d.agentTasks === 0 && d.llmCalls === 0) continue;
    totalTasks += d.agentTasks;
    totalCalls += d.llmCalls;

    console.log(
      `  ${d.date}  ${fmt(d.agentTasks).padStart(5)}  ${fmt(d.llmCalls).padStart(9)}  ${fmt(d.estInputTokens).padStart(9)}  ${fmt(d.estOutputTokens).padStart(9)}  ${fmt(d.estTotalTokens).padStart(10)}  ${fmt(d.avgServerProcessingMs).padStart(7)}`
    );
  }

  console.log("  ──────────────────────────────────────────────────────────────────────────────");
  console.log(
    `  TOTAL    ${fmt(totalTasks).padStart(5)}  ${fmt(totalCalls).padStart(9)}  ${fmt(estimation.totalEstInput).padStart(9)}  ${fmt(estimation.totalEstOutput).padStart(9)}  ${fmt(estimation.totalEstInput + estimation.totalEstOutput).padStart(10)}`
  );
  console.log("");

  // ── Model Distribution ──
  const modelTotals: Record<string, number> = {};
  for (const d of dailyData) {
    for (const [m, c] of Object.entries(d.models)) {
      modelTotals[m] = (modelTotals[m] ?? 0) + c;
    }
  }
  if (Object.keys(modelTotals).length > 0) {
    console.log("  BY MODEL (LLM call count)");
    console.log("  ──────────────────────────────────────────────────────────────────────────────");
    for (const [model, count] of Object.entries(modelTotals).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${model.padEnd(35)} ${fmt(count).padStart(8)}`);
    }
    console.log("");
  }

  // ── 真实 Token（仅本地调用）──
  const periodTokenEvents = allTokenEvents.filter((e) => e.date >= startDateStr);
  if (periodTokenEvents.length > 0) {
    const realTotal = periodTokenEvents.reduce((s, e) => s + e.totalTokens, 0);
    console.log("  ACTUAL TOKEN (local calls only, e.g. title generation)");
    console.log("  ──────────────────────────────────────────────────────────────────────────────");
    console.log(`  Events: ${periodTokenEvents.length}  |  Total: ${fmt(realTotal)} tokens`);
    console.log("");
  }

  // ── 估算公式说明 ──
  console.log("  ESTIMATION METHOD");
  console.log("  ──────────────────────────────────────────────────────────────────────────────");
  console.log(`  Output = (server_processing_time − first_sse_event_time) / 1000 × ${cfg.outputTokenRate} tok/s`);
  console.log(`  Input  = body_len × ${cfg.bodyContentRatio} / ${cfg.bytesPerToken} bytes/tok`);
  console.log(`  Outliers (generation > ${fmt(cfg.outlierThresholdMs)}ms): ${estimation.outlierCount} replaced with p95 = ${fmt(estimation.p95GenerationMs)}ms`);
  console.log("");
  console.log("  META");
  console.log("  ──────────────────────────────────────────────────────────────────────────────");
  console.log(`  Log files scanned:    ${logFiles.length}`);
  console.log(`  Unique sessions:      ${uniqueSessions.size}`);
  console.log(`  Body entries parsed:  ${allBodyLens.filter((e) => e.date >= startDateStr).length}`);
  console.log(`  User ID:              ${auth?.userId ?? "unknown"}`);
  console.log("");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
