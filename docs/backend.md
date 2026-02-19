# Token Matters — Backend 设计文档

> 版本: v0.2.0 | 最后更新: 2026-02-19

## 1. 概述

Backend 负责将 Collector 写入的原始数据（`raw/`）聚合为多维度统计，并提供给 Frontend 消费。

核心职责：
- 读取 `raw/` 目录下的所有原始 JSON 文件
- 按时间（日/周/月）、Provider、机器等维度聚合统计
- 根据 `pricing.json` 计算费用
- 将聚合结果提供给 Frontend（静态 JSON 或 REST API）

---

## 2. 方案演进路线

| 阶段 | 方案 | 数据提供方式 | 适用场景 |
|------|------|-------------|---------|
| **Phase 1** (开发/测试) | Summary 静态方案 | GitHub Actions 聚合 → 静态 JSON → GitHub Pages | 零成本启动，个人使用 |
| **Phase 2** (生产) | 真正 Backend 服务 | Serverless Functions → REST API | 需要实时查询或动态聚合 |

Phase 1 的静态 JSON URL 路径设计与 Phase 2 的 REST API 兼容，迁移时 Frontend 只需切换 base URL。

---

## 3. Phase 1: Summary 静态方案

### 3.1 程序结构

```
summary/
├── src/
│   ├── main.ts                    # CLI 入口
│   ├── scanner.ts                 # raw/ 文件扫描与解析
│   ├── dedup.ts                   # 去重逻辑（同一 key 取最新 collectedAt）
│   ├── aggregator/
│   │   ├── daily.ts               # 按日聚合
│   │   ├── weekly.ts              # 按周聚合
│   │   ├── monthly.ts             # 按月聚合
│   │   ├── provider.ts            # 按 Provider 维度聚合
│   │   ├── machine.ts             # 按机器维度聚合
│   │   └── latest.ts              # 生成 latest.json
│   ├── pricing.ts                 # 费用计算
│   ├── meta.ts                    # 生成 meta.json 索引
│   └── writer.ts                  # 写出 summary/ 目录
├── package.json
└── tsconfig.json
```

### 3.2 CLI 入口

```bash
# 全量聚合（从 raw/ 重新生成所有 summary/）
npx tsx summary/src/main.ts --raw-dir ./raw --output-dir ./summary

# 增量聚合（仅处理新增/变更的 raw 文件）
npx tsx summary/src/main.ts --raw-dir ./raw --output-dir ./summary --incremental

# 指定 pricing 配置
npx tsx summary/src/main.ts --raw-dir ./raw --output-dir ./summary --pricing ./pricing.json

# 干跑模式（不写出文件）
npx tsx summary/src/main.ts --raw-dir ./raw --dry-run
```

### 3.3 GitHub Actions Workflow

Summary 运行在 `token-matters-data` 仓库的 GitHub Actions 中，聚合后将结果跨仓库推送到 `token-matters-summary`。

```yaml
# .github/workflows/summarize.yml (位于 token-matters-data 仓库)
name: Summarize Token Data
on:
  push:
    paths: ['raw/**']
  schedule:
    - cron: '0 */6 * * *'            # 每 6 小时兜底
  workflow_dispatch:                   # 支持手动触发

jobs:
  summarize:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout data repo
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Run summary aggregation
        run: npx tsx summary/src/main.ts --raw-dir ./raw --output-dir ./output/summary --pricing ./pricing.json

      - name: Checkout summary repo
        uses: actions/checkout@v4
        with:
          repository: ${{ github.repository_owner }}/token-matters-summary
          path: summary-repo
          ssh-key: ${{ secrets.SUMMARY_DEPLOY_KEY }}

      - name: Push summary + badge to public repo
        run: |
          cp -r ./output/summary/* summary-repo/summary/
          mkdir -p summary-repo/badge
          cp ./output/badge/* summary-repo/badge/
          cd summary-repo
          git config user.name "token-matters-bot"
          git config user.email "bot@token-matters"
          git add summary/ badge/
          git diff --cached --quiet || git commit -m "Update summary $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          git push
```

**跨仓库推送认证**：

| 方式 | 配置 | 权限范围 |
|------|------|---------|
| **Deploy Key**（推荐） | 在 `token-matters-summary` 添加 deploy key（write 权限），私钥存为 data 仓库的 `SUMMARY_DEPLOY_KEY` secret | 仅限目标仓库 |
| PAT（备选） | 创建 Fine-grained PAT，授权 `token-matters-summary` 的 `contents: write` | 可配置范围 |

**触发条件**：

| 触发方式 | 场景 |
|----------|------|
| `push to raw/**` | Collector 推送新数据后自动聚合 |
| `schedule (每 6 小时)` | 兜底，确保 summary 不过于陈旧 |
| `workflow_dispatch` | 调试和补数据场景 |

### 3.4 聚合管道

```
raw/**/*.json
    │
    ▼
┌──────────────────┐
│ 1. 扫描 & 解析    │  读取所有 raw JSON，按 (provider, date, machine) 去重
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 2. 按日聚合       │  → summary/daily/{date}.json
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 3. 按周聚合       │  → summary/weekly/{year}-W{week}.json
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 4. 按月聚合       │  → summary/monthly/{year}-{month}.json
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 5. 维度聚合       │  → summary/providers/*.json
│                  │  → summary/machines/*.json
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 6. 生成索引       │  → summary/latest.json
│                  │  → summary/meta.json
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 7. 生成 Badge    │  → badge/token-usage.svg
└──────────────────┘
```

> 聚合数据格式（DailySummary、LatestSummary、SummaryMeta 等）参见 `architecture.md` 第 2.5 章。

### 3.5 SVG Badge 生成

Summary 在聚合管道末尾生成一个 SVG 徽章文件 `badge/token-usage.svg`，展示用户最近的 Token 使用概况，可嵌入 GitHub 个人主页、README 或其他页面。

#### 嵌入方式

```markdown
<!-- GitHub README / 个人主页 -->
![Token Usage](https://\{user\}.github.io/token-matters-summary/badge/token-usage.svg)
```

#### Badge 内容

徽章采用 [shields.io 风格](https://shields.io/)的双段式布局：

```
┌──────────────────────────────────────────┐
│  Token Usage  │  1.2M tokens · $47.20    │
│   (label)     │       (value)            │
└──────────────────────────────────────────┘
```

数据来源于 `latest.json` 中的 `last7Days` 或 `last30Days`：

| 字段 | 说明 | 示例 |
|------|------|------|
| label | 固定标签 | `Token Usage (7d)` |
| tokens | 最近 N 天总 Token 数（人类可读格式） | `1.2M` / `856K` |
| cost | 最近 N 天总费用 | `$47.20` |

#### 生成方式

Badge 由 Summary 程序直接生成纯 SVG 字符串（无需外部依赖），写入 `badge/token-usage.svg`。模板示例：

```typescript
function generateBadge(tokens: number, cost: number): string {
  const label = 'Token Usage (7d)';
  const value = `${formatTokens(tokens)} · $${cost.toFixed(2)}`;
  // 返回 shields.io 风格的 SVG 字符串
  return `<svg xmlns="http://www.w3.org/2000/svg" ...>...</svg>`;
}
```

#### 自动更新

Badge SVG 作为聚合管道的最后一步生成，随 summary JSON 一同推送到 `token-matters-summary` 仓库。由于 GitHub Pages 有缓存（TTL ~10min），badge 的更新频率与 summary 一致（push 触发 + 每 6 小时定时）。

### 3.6 费用计算

Summary 根据 `pricing.json` 中的单价配置计算费用：

```json
{
  "claude-code": {
    "models": {
      "claude-opus-4-6": {
        "inputPerMTok": 15,
        "outputPerMTok": 75,
        "cacheCreationPerMTok": 18.75,
        "cacheReadPerMTok": 1.50,
        "currency": "USD"
      },
      "claude-sonnet-4-6": {
        "inputPerMTok": 3,
        "outputPerMTok": 15,
        "cacheCreationPerMTok": 3.75,
        "cacheReadPerMTok": 0.30,
        "currency": "USD"
      }
    }
  },
  "glm-coding": {
    "subscription": {
      "plan": "Max",
      "monthlyCost": 199,
      "currency": "CNY"
    }
  },
  "trae-pro": {
    "subscription": {
      "plan": "Pro",
      "monthlyCost": 10,
      "currency": "USD"
    }
  }
}
```

费用计算规则：

- **Token 计费 Provider**（Claude Code）：`cost = tokens × price_per_MTok / 1,000,000`
- **订阅制 Provider**（GLM、TRAE）：月费均摊到每日，或按月整体记录

### 3.7 时区处理

- Raw 文件的 `date` 字段由 Collector 按本地时区生成
- Summary 以 raw 文件中的 `date` 为准进行聚合（不做时区转换）
- 所有 `collectedAt` / `lastUpdated` 时间戳使用 UTC ISO 8601

---

## 4. Phase 2: Backend 服务方案（预留）

当项目需要以下能力时，从 Phase 1 静态方案迁移到真正的 Backend 服务：

- **实时数据更新**：Collector 推送后立即可查，无需等待 GitHub Actions
- **动态查询**：支持自定义时间范围、多维度筛选等前端发起的动态查询
- **数据写入 API**：Collector 通过 HTTP API 上传数据，替代 git push

### 4.1 Firebase 方案

| 组件 | 用途 |
|------|------|
| Cloud Functions | 接收 Collector 上传、执行聚合、提供 REST API |
| Firestore | 存储原始数据和聚合结果（替代 Git 仓库） |
| Hosting | 托管 Frontend 静态文件 + API 反向代理 |

优势：Google 免费额度充裕（Cloud Functions 200 万次/月，Firestore 1GB 存储）。

### 4.2 Cloudflare 方案

| 组件 | 用途 |
|------|------|
| Workers | 接收 Collector 上传、执行聚合、提供 REST API |
| R2 | 存储原始 JSON 文件（兼容 S3 API） |
| Pages | 托管 Frontend 静态文件 |

优势：Workers 免费额度 10 万次/天，R2 免费 10GB，全球边缘节点延迟低。

### 4.3 API 设计

REST API 路径与 Phase 1 的静态 JSON 路径保持兼容：

| Phase 1 (静态 JSON) | Phase 2 (REST API) | 说明 |
|---------------------|--------------------|------|
| `GET /summary/latest.json` | `GET /api/summary/latest` | Dashboard 首页 |
| `GET /summary/daily/2026-02-19.json` | `GET /api/summary/daily/2026-02-19` | 日报 |
| `GET /summary/weekly/2026-W08.json` | `GET /api/summary/weekly/2026-W08` | 周报 |
| `GET /summary/monthly/2026-02.json` | `GET /api/summary/monthly/2026-02` | 月报 |
| `GET /summary/providers/claude-code.json` | `GET /api/summary/providers/claude-code` | Provider 维度 |
| `GET /summary/meta.json` | `GET /api/summary/meta` | 索引 |
| — | `POST /api/raw` | Collector 上传（Phase 2 新增） |
| — | `GET /api/summary/query?from=...&to=...&provider=...` | 动态查询（Phase 2 新增） |

Frontend 切换 base URL 即可从 Phase 1 迁移到 Phase 2：

```typescript
// Phase 1
const BASE_URL = 'https://{user}.github.io/token-matters-summary/summary';

// Phase 2
const BASE_URL = 'https://api.token-matters.example.com/api/summary';
```

### 4.4 Collector 推送方式变更

| | Phase 1 | Phase 2 |
|---|---------|---------|
| 推送方式 | `git push` 到 `token-matters-data` | `POST /api/raw` HTTP API 上传 |
| 认证 | SSH Key | API Key / JWT |
| 触发聚合 | GitHub Actions（push 事件） | Cloud Function / Worker（接收即聚合） |
| 延迟 | 分钟级（Actions 排队+执行） | 秒级（函数即时执行） |
