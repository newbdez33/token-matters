/**
 * POC: Claude Code 本地 Token 消耗采集
 *
 * 数据来源:
 *   1. ~/.claude/stats-cache.json  — 预聚合统计（截止到 lastComputedDate）
 *   2. ~/.claude/projects/**\/*.jsonl — 原始会话日志（补齐缓存之后的数据）
 *
 * 用法:
 *   npx tsx poc/claude-code-usage.ts
 *   npx tsx poc/claude-code-usage.ts --days 30
 *   npx tsx poc/claude-code-usage.ts --json
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

// ── 类型定义 ──────────────────────────────────────────────

interface UsageFromResponse {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface DailyTokens {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  requests: number;
  models: Record<string, number>;
}

interface StatsCache {
  version: number;
  lastComputedDate: string;
  dailyModelTokens: Array<{
    date: string;
    tokensByModel: Record<string, number>;
  }>;
  modelUsage: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
    }
  >;
}

// ── 定价 (USD per token) ─────────────────────────────────

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheCreation: number }> = {
  "claude-opus-4-6":            { input: 15 / 1e6, output: 75 / 1e6, cacheCreation: 18.75 / 1e6, cacheRead: 1.50 / 1e6 },
  "claude-opus-4-5-20251101":   { input: 15 / 1e6, output: 75 / 1e6, cacheCreation: 18.75 / 1e6, cacheRead: 1.50 / 1e6 },
  "claude-sonnet-4-6":          { input: 3 / 1e6,  output: 15 / 1e6, cacheCreation: 3.75 / 1e6,  cacheRead: 0.30 / 1e6 },
  "claude-sonnet-4-5-20250929": { input: 3 / 1e6,  output: 15 / 1e6, cacheCreation: 3.75 / 1e6,  cacheRead: 0.30 / 1e6 },
  "claude-haiku-4-5":           { input: 0.80 / 1e6, output: 4 / 1e6, cacheCreation: 1 / 1e6,   cacheRead: 0.08 / 1e6 },
};

function getDefaultPricing() {
  return PRICING["claude-opus-4-6"];
}

// ── JSONL 解析 ───────────────────────────────────────────

function findAllJsonlFiles(baseDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (entry.endsWith(".jsonl")) {
          results.push(full);
        }
      } catch {
        // skip inaccessible
      }
    }
  }

  walk(baseDir);
  return results;
}

function parseJsonlForUsage(
  filePath: string,
  afterDate: string
): Array<{ date: string; model: string; usage: UsageFromResponse }> {
  const results: Array<{ date: string; model: string; usage: UsageFromResponse }> = [];
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return results;
  }

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type !== "assistant") continue;
      const usage = obj.message?.usage;
      if (!usage) continue;
      const ts = obj.timestamp as string;
      if (!ts) continue;
      const date = ts.slice(0, 10); // YYYY-MM-DD
      if (date <= afterDate) continue;
      results.push({
        date,
        model: obj.message?.model ?? "unknown",
        usage,
      });
    } catch {
      // skip malformed lines
    }
  }
  return results;
}

// ── 主逻辑 ───────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const daysFlag = args.indexOf("--days");
  const days = daysFlag !== -1 ? parseInt(args[daysFlag + 1], 10) : 7;
  const jsonOutput = args.includes("--json");

  const claudeDir = join(homedir(), ".claude");
  const projectsDir = join(claudeDir, "projects");
  const statsCachePath = join(claudeDir, "stats-cache.json");

  // 计算日期范围
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  // ── Step 1: 读取 stats-cache ──

  let statsCache: StatsCache | null = null;
  try {
    statsCache = JSON.parse(readFileSync(statsCachePath, "utf-8"));
  } catch {
    // no cache available
  }

  const dailyMap = new Map<string, DailyTokens>();

  function getOrCreateDay(date: string): DailyTokens {
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        requests: 0,
        models: {},
      });
    }
    return dailyMap.get(date)!;
  }

  // stats-cache 中的 dailyModelTokens 只有 output tokens by model，粒度不够
  // 但可以作为参考。我们主要从 JSONL 解析精确数据。
  const cacheLastDate = statsCache?.lastComputedDate ?? "1970-01-01";

  // ── Step 2: 扫描所有 JSONL 文件 ──

  const jsonlFiles = findAllJsonlFiles(projectsDir);
  let totalParsed = 0;

  for (const file of jsonlFiles) {
    // 只解析 startDate 之后的数据
    const entries = parseJsonlForUsage(file, startDateStr);
    for (const entry of entries) {
      if (entry.date > todayStr) continue;
      const day = getOrCreateDay(entry.date);
      const u = entry.usage;
      const input = u.input_tokens ?? 0;
      const output = u.output_tokens ?? 0;
      const cacheCreation = u.cache_creation_input_tokens ?? 0;
      const cacheRead = u.cache_read_input_tokens ?? 0;

      day.inputTokens += input;
      day.outputTokens += output;
      day.cacheCreationTokens += cacheCreation;
      day.cacheReadTokens += cacheRead;
      day.totalTokens += input + output + cacheCreation + cacheRead;
      day.requests += 1;
      day.models[entry.model] = (day.models[entry.model] ?? 0) + output;
      totalParsed++;
    }
  }

  // ── Step 3: 排序并计算费用 ──

  const sortedDays = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // 计算每日预估费用
  const daysWithCost = sortedDays.map((day) => {
    let cost = 0;
    // 按模型比例估算（简化：用日粒度的 output 占比分摊到各模型定价）
    for (const [model, outputTok] of Object.entries(day.models)) {
      const p = PRICING[model] ?? getDefaultPricing();
      // 按模型 output 占比推算该模型承担的 input/cache 比例
      const ratio = day.outputTokens > 0 ? outputTok / day.outputTokens : 0;
      cost +=
        day.inputTokens * ratio * p.input +
        outputTok * p.output +
        day.cacheCreationTokens * ratio * p.cacheCreation +
        day.cacheReadTokens * ratio * p.cacheRead;
    }
    return { ...day, estimatedCostUSD: Math.round(cost * 100) / 100 };
  });

  // ── Step 4: 输出 ──

  if (jsonOutput) {
    console.log(JSON.stringify(daysWithCost, null, 2));
    return;
  }

  // 汇总
  const totals = daysWithCost.reduce(
    (acc, d) => {
      acc.inputTokens += d.inputTokens;
      acc.outputTokens += d.outputTokens;
      acc.cacheCreationTokens += d.cacheCreationTokens;
      acc.cacheReadTokens += d.cacheReadTokens;
      acc.totalTokens += d.totalTokens;
      acc.requests += d.requests;
      acc.estimatedCostUSD += d.estimatedCostUSD;
      return acc;
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      requests: 0,
      estimatedCostUSD: 0,
    }
  );

  const fmt = (n: number) => n.toLocaleString("en-US");
  const fmtUSD = (n: number) => `$${n.toFixed(2)}`;

  console.log("");
  console.log("  CLAUDE CODE TOKEN USAGE");
  console.log(`  ${startDateStr} — ${todayStr} (${days} days)`);
  console.log("");
  console.log("  ──────────────────────────────────────────────────────────────────────");
  console.log("");
  console.log(
    "  DATE          INPUT       OUTPUT     CACHE W     CACHE R      REQS    COST"
  );
  console.log(
    "  ──────────────────────────────────────────────────────────────────────"
  );

  for (const d of daysWithCost) {
    console.log(
      `  ${d.date}  ${fmt(d.inputTokens).padStart(9)}  ${fmt(d.outputTokens).padStart(9)}  ${fmt(d.cacheCreationTokens).padStart(9)}  ${fmt(d.cacheReadTokens).padStart(9)}  ${String(d.requests).padStart(7)}  ${fmtUSD(d.estimatedCostUSD).padStart(7)}`
    );
  }

  console.log(
    "  ──────────────────────────────────────────────────────────────────────"
  );
  console.log(
    `  TOTAL     ${fmt(totals.inputTokens).padStart(9)}  ${fmt(totals.outputTokens).padStart(9)}  ${fmt(totals.cacheCreationTokens).padStart(9)}  ${fmt(totals.cacheReadTokens).padStart(9)}  ${String(totals.requests).padStart(7)}  ${fmtUSD(totals.estimatedCostUSD).padStart(7)}`
  );
  console.log("");
  console.log(`  Files scanned: ${jsonlFiles.length}`);
  console.log(`  Records parsed: ${totalParsed}`);
  console.log("");

  // 模型分布
  const modelTotals: Record<string, number> = {};
  for (const d of daysWithCost) {
    for (const [m, t] of Object.entries(d.models)) {
      modelTotals[m] = (modelTotals[m] ?? 0) + t;
    }
  }

  if (Object.keys(modelTotals).length > 0) {
    console.log("  BY MODEL (output tokens)");
    console.log("  ──────────────────────────────────────────────────────────────────────");
    for (const [model, tokens] of Object.entries(modelTotals).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${model.padEnd(35)} ${fmt(tokens).padStart(12)}`);
    }
    console.log("");
  }
}

main();
