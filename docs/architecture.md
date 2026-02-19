# Token Matters — 系统架构文档

> 版本: v0.2.0 | 最后更新: 2026-02-19

## 1. 架构概述

Token Matters 采用**三组件 + 双仓库架构**，将隐私数据与公开数据分离，无需传统后端服务或数据库。

```
开发机 (macOS / Linux)
┌─────────────────────┐
│      Collector       │  定时采集 Token 消耗数据
│  (TypeScript CLI)    │  launchd / cron
└──────────┬──────────┘
           │ git push
           ▼
┌──────────────────────────────────────────────────────────┐
│              GitHub: token-matters-data  [Private]        │
│                                                          │
│  raw/{machine}/{provider}/{date}_{hash}.json             │
│  pricing.json                                            │
│  .github/workflows/summarize.yml                         │
│                                                          │
│  ── push 触发 GitHub Actions (Summary) ──                │
│      读取 raw/ → 聚合 → 跨仓库推送到 summary 仓库        │
└──────────────────────────┬───────────────────────────────┘
                           │ git push (deploy key / PAT)
                           ▼
┌──────────────────────────────────────────────────────────┐
│            GitHub: token-matters-summary  [Public]        │
│                                                          │
│  summary/daily/{date}.json                               │
│  summary/weekly/{week}.json                              │
│  summary/monthly/{month}.json                            │
│  summary/providers/{provider}.json                       │
│  summary/machines/{machine}.json                         │
│  summary/latest.json                                     │
│  summary/meta.json                                       │
│                                                          │
│  ── GitHub Pages 静态托管 ──                              │
└──────────────────────────┬───────────────────────────────┘
                           │ fetch JSON
                           ▼
                  ┌─────────────────┐
                  │    Frontend      │  React SPA
                  │  (GitHub Pages)  │  读取 summary/ 渲染图表
                  └─────────────────┘
```

### 双仓库设计

| 仓库 | 可见性 | 内容 | 说明 |
|------|:------:|------|------|
| `token-matters-data` | **Private** | `raw/` + `pricing.json` + GitHub Actions workflow | 包含个人使用数据，不可公开 |
| `token-matters-summary` | **Public** | `summary/` + GitHub Pages 静态托管 | 聚合后的统计 JSON，供 Frontend 读取 |

> **为什么需要双仓库？** GitHub Free 不支持 Private 仓库的 GitHub Pages。将聚合数据推送到 Public 仓库后，即可免费使用 Pages 托管静态 JSON。原始数据保留在 Private 仓库中，隐私安全。

### 核心设计原则

| 原则 | 说明 |
|------|------|
| GitHub as Database | 用 Git 仓库存储所有数据，天然具备版本历史、多机同步和审计追溯 |
| 隐私与公开分离 | Private 仓库存原始数据，Public 仓库存聚合统计 |
| 无后端 | Frontend 直接读取静态 JSON，通过 GitHub Pages 托管 |
| 单向数据流 | Collector → raw → Summary → summary → Frontend，各阶段职责明确 |
| 多机协作 | 每台开发机独立采集，写入各自子目录，互不冲突 |
| 幂等聚合 | Summary 从 raw 全量重算，任何时候重跑结果一致 |

---

## 2. 数据仓库设计

### 2.1 token-matters-data（Private）

| 项目 | 说明 |
|------|------|
| 可见性 | **Private** |
| 用途 | 存储原始采集数据 + 费用配置 + 聚合 workflow |

```
token-matters-data/
├── raw/                                    # Collector 写入，append-only
│   ├── macbook-pro/                        # 机器名（kebab-case）
│   │   ├── claude-code/                    # Provider 标识
│   │   │   ├── 2026-02-19_a1b2c3.json
│   │   │   └── ...
│   │   ├── glm-coding/
│   │   │   └── 2026-02-19_d4e5f6.json
│   │   └── trae-pro/
│   │       └── 2026-02-19_g7h8i9.json
│   └── imac-studio/                        # 另一台机器
│       └── claude-code/
│           └── 2026-02-19_m3n4o5.json
│
├── pricing.json                            # 费用定价配置
│
└── .github/
    └── workflows/
        └── summarize.yml                   # Summary GitHub Actions
```

### 2.2 token-matters-summary（Public）

| 项目 | 说明 |
|------|------|
| 可见性 | **Public** |
| 用途 | 存储聚合后的统计 JSON，GitHub Pages 托管 |

```
token-matters-summary/
├── summary/
│   ├── daily/
│   │   ├── 2026-02-19.json
│   │   └── 2026-02-18.json
│   ├── weekly/
│   │   └── 2026-W08.json
│   ├── monthly/
│   │   └── 2026-02.json
│   ├── providers/                          # 按 Provider 维度
│   │   ├── claude-code.json
│   │   ├── glm-coding.json
│   │   └── trae-pro.json
│   ├── machines/                           # 按机器维度
│   │   ├── macbook-pro.json
│   │   └── imac-studio.json
│   ├── latest.json                         # 最新汇总（Dashboard 首页）
│   └── meta.json                           # 索引：日期范围、Provider 列表等
├── badge/
│   └── token-usage.svg                     # 每日更新的 SVG 徽章（嵌入个人主页）
└── .nojekyll                               # 禁用 Jekyll，直接服务静态文件
```

### 2.3 文件命名约定

Raw 文件完整路径：`raw/{machine}/{provider}/{date}_{hash}.json`

| 组成部分 | 格式 | 示例 | 说明 |
|----------|------|------|------|
| `machine` | kebab-case hostname | `macbook-pro` | 机器名，区分多设备 |
| `provider` | 固定标识符 | `claude-code` | `claude-code` / `glm-coding` / `trae-pro` |
| `date` | `YYYY-MM-DD` | `2026-02-19` | 数据所属日期 |
| `hash` | 6 位 hex | `a1b2c3` | 内容摘要，用于去重 |

Hash 计算：`SHA256(machine + provider + date + JSON.stringify(records)).slice(0, 6)`

### 2.4 原始数据格式

所有 Provider 统一输出以下 JSON 格式：

```typescript
interface RawDataFile {
  version: '1.0';
  collectedAt: string;            // ISO 8601，Collector 运行时间
  machine: string;                // 机器名
  provider: string;               // 'claude-code' | 'glm-coding' | 'trae-pro'
  date: string;                   // YYYY-MM-DD，数据所属日期
  dataQuality: DataQuality;       // 数据精度标识
  records: RawRecord[];
}

type DataQuality = 'exact' | 'estimated' | 'partial';
//  exact:     精确 token 数（Claude Code，从 JSONL 直接提取）
//  estimated: 估算值（TRAE，从 timing + body_len 反推）
//  partial:   部分数据（GLM，聚合 token 总量，无 input/output 拆分）

interface RawRecord {
  timestamp?: string;             // ISO 8601（如可用）
  model?: string;                 // 模型名称
  inputTokens?: number;           // 输入 Token
  outputTokens?: number;          // 输出 Token
  cacheCreationTokens?: number;   // 缓存写入 Token
  cacheReadTokens?: number;       // 缓存读取 Token
  totalTokens?: number;           // 合计 Token
  cost?: number;                  // 估算费用
  currency?: string;              // USD / CNY
  requests?: number;              // 请求次数
  sessions?: number;              // 会话数
  note?: string;                  // 备注
}
```

各 Provider 的数据精度对比：

| Provider | dataQuality | inputTokens | outputTokens | cache* | cost | 来源 |
|----------|:-----------:|:-----------:|:------------:|:------:|:----:|------|
| Claude Code | `exact` | 精确 | 精确 | 精确 | 精确 | 本地 JSONL `message.usage` |
| GLM Coding | `partial` | — | — | — | — | 监控 API `tokensUsage`（仅 totalTokens） |
| TRAE Pro | `estimated` | 估算 | 估算 | — | — | 日志 timing + body_len 反推 |

### 2.5 聚合数据格式

#### daily/{date}.json

```typescript
interface DailySummary {
  date: string;                         // YYYY-MM-DD
  totals: TokenTotals;
  byProvider: ProviderSummary[];
  byMachine: MachineSummary[];
  byModel: ModelSummary[];
}

interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cost: CostBreakdown;
  requests: number;
}

interface CostBreakdown {
  totalUSD: number;                     // 统一折算为 USD
  byProvider: Record<string, { amount: number; currency: string }>;
}

interface ProviderSummary {
  provider: string;
  dataQuality: DataQuality;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cost: number;
  currency: string;
  requests: number;
}

interface MachineSummary {
  machine: string;
  totalTokens: number;
  requests: number;
}

interface ModelSummary {
  model: string;
  provider: string;
  totalTokens: number;
  requests: number;
}
```

#### meta.json

```typescript
interface SummaryMeta {
  lastUpdated: string;                  // ISO 8601
  dateRange: { start: string; end: string };
  providers: string[];
  machines: string[];
  models: string[];
  dailyFiles: string[];                 // 可用的 daily 文件列表
  weeklyFiles: string[];
  monthlyFiles: string[];
}
```

#### latest.json

包含最近 7 天和 30 天的汇总统计，供 Dashboard 首页快速渲染：

```typescript
interface LatestSummary {
  lastUpdated: string;
  last7Days: PeriodSummary;
  last30Days: PeriodSummary;
  today: DailySummary | null;
}

interface PeriodSummary {
  dateRange: { start: string; end: string };
  totals: TokenTotals;
  byProvider: ProviderSummary[];
  dailyTrend: { date: string; totalTokens: number; cost: number }[];
}
```

---

## 3. 数据流全景

```
开发机 A (macbook-pro)               开发机 B (imac-studio)
┌───────────────────┐               ┌───────────────────┐
│ Claude Code JSONL │               │ Claude Code JSONL │
│ GLM 监控 API      │               │ TRAE ai-agent 日志│
│ TRAE ai-agent 日志│               └─────────┬─────────┘
└─────────┬─────────┘                         │
          │                                   │
     Collector A                         Collector B
     (launchd 每日)                      (launchd 每日)
          │                                   │
          ▼                                   ▼
┌────────────────────────────────────────────────────────┐
│           GitHub: token-matters-data [Private]          │
│                                                        │
│  raw/macbook-pro/claude-code/2026-02-19_a1b2c3.json   │
│  raw/macbook-pro/glm-coding/2026-02-19_d4e5f6.json    │
│  raw/macbook-pro/trae-pro/2026-02-19_g7h8i9.json      │
│  raw/imac-studio/claude-code/2026-02-19_j0k1l2.json   │
│  raw/imac-studio/trae-pro/2026-02-19_m3n4o5.json      │
│  pricing.json                                          │
│                                                        │
│  ── push 触发 GitHub Actions (Summary) ──              │
│  读取 raw/ → 聚合 → 跨仓库推送                          │
└────────────────────────────┬───────────────────────────┘
                             │ deploy key / PAT
                             ▼
┌────────────────────────────────────────────────────────┐
│         GitHub: token-matters-summary [Public]          │
│                                                        │
│  summary/daily/2026-02-19.json                         │
│  summary/weekly/2026-W08.json                          │
│  summary/monthly/2026-02.json                          │
│  summary/providers/claude-code.json                    │
│  summary/machines/macbook-pro.json                     │
│  summary/latest.json                                   │
│  summary/meta.json                                     │
│                                                        │
│  ── GitHub Pages 静态托管 ──                            │
│  https://{user}.github.io/token-matters-summary/...    │
└────────────────────────────┬───────────────────────────┘
                             │ fetch JSON
                             ▼
                    ┌─────────────────┐
                    │    Frontend      │
                    │  (React SPA)     │
                    │                  │
                    │  Dashboard       │
                    │  Provider 分析   │
                    │  趋势图表        │
                    │  费用报表        │
                    └─────────────────┘
```

---

## 4. 去重与一致性

### 4.1 去重层级

| 层级 | 时机 | 机制 |
|------|------|------|
| Collector 写入 | raw 文件生成时 | content hash 文件名：相同数据 → 相同 hash → 跳过写入 |
| Git 推送 | git push 时 | 每台机器写入独立子目录（`raw/{machine}/`），无合并冲突 |
| Summary 聚合 | 读取 raw 时 | 同一 `(provider, date, machine)` 的多个文件取最新 `collectedAt` |

### 4.2 Git 冲突处理

多台机器同时 push 的情况：

1. Collector 在 push 前先执行 `git pull --rebase`
2. 由于各机器写入不同子目录，rebase 几乎不会产生冲突
3. 如仍失败，等待随机 1-5 秒后重试，最多 3 次

### 4.3 数据不变性

- **Raw 数据 append-only**：已写入的 raw 文件不修改、不删除
- **Summary 可重建**：从 raw 全量重新生成，删除 `summary/` 目录后重跑即可恢复
- **`meta.json` 是索引**：Frontend 以此发现可用数据，Summary 每次更新

---

## 5. 设计决策记录

### ADR-001: GitHub 仓库作为数据存储

**决策**：用 Private GitHub 仓库存储所有 Token 消耗数据，替代传统数据库。

**原因**：
- 零服务器成本
- Git 天然提供版本历史和审计追溯
- 多台开发机通过 git push/pull 自然同步
- 数据是纯 JSON 文件，完全可移植

**代价**：
- 不支持复杂查询（需要 Summary 预聚合）
- 数据量增长后 clone 和 push 会变慢（可通过 shallow clone 缓解）

### ADR-002: Collector 与 Summary 分离

**决策**：数据采集（Collector）和数据聚合（Summary）是独立的程序。

**原因**：
- Collector 必须在开发机上运行（访问本地文件）
- Summary 可以在 CI 环境运行（只需 raw 文件）
- 关注点分离：采集逻辑 vs 统计逻辑
- Summary 幂等：任何时候从 raw 重算都能得到一致结果

### ADR-003: Raw 文件按日按机器拆分

**决策**：每台机器每个 Provider 每天生成一个独立 JSON 文件。

**原因**：
- 小文件在 Git 中 diff 更清晰
- 消除多机器并发 push 时的合并冲突
- Summary 可增量处理（只看新增文件）
- 单个文件损坏不影响其他数据

### ADR-004: 双仓库架构（Private Data + Public Summary）

**决策**：将数据仓库拆分为 `token-matters-data`（Private）和 `token-matters-summary`（Public）两个仓库。

**原因**：
- GitHub Free 不支持 Private 仓库的 GitHub Pages
- 原始数据包含个人使用习惯，不适合公开
- 聚合后的统计数据不含敏感信息，可安全公开
- Public 仓库免费使用 GitHub Pages 托管静态 JSON

**代价**：
- Summary 需要跨仓库推送（需配置 deploy key 或 PAT）
- 维护两个仓库的管理成本略高
- GitHub Actions 跨仓库操作需要额外的认证配置

### ADR-005: Summary 静态方案作为 Backend 起步方案

**决策**：以 GitHub Actions + 静态 JSON 作为 Backend 的 Phase 1 方案，预留向 Firebase / Cloudflare Workers 等真正 Backend 演进的路径。

**原因**：
- 零运维成本，适合项目早期
- 静态 JSON 的 URL 路径可设计为与未来 REST API 兼容
- GitHub Pages 全球 CDN 加速，性能足够
- 当数据量或实时性需求增长时，可平滑迁移到 serverless backend

**代价**：
- 数据更新延迟（依赖 GitHub Actions 触发）
- 不支持动态查询（所有聚合维度需要预先计算）

> 参见 `backend.md` 第 2 章了解方案演进路线的详细设计。
