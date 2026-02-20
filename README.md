# Token Matters

![Token Usage](https://newbdez33.github.io/token-matters-summary/badge/token-usage.svg)

个人 AI 产品 Token 消耗统计与可视化工具。追踪你在 Claude Code、GLM Coding、TRAE Pro 等 AI 产品上的 Token 使用量与费用支出。

**Live Dashboard**: [newbdez33.github.io/token-matters](https://newbdez33.github.io/token-matters/)

## Architecture

```
开发机                  token-matters-data [Private]     token-matters-summary [Public]
┌──────────┐           ┌────────────────────┐           ┌─────────────────────┐
│ Collector │──push──▶ │ raw/ + pricing.json │──Actions─▶│ summary/ + badge/   │
│ (CLI)     │          │ .github/workflows/  │           │ GitHub Pages 托管    │
└──────────┘           └────────────────────┘           └──────────┬──────────┘
                                                                   │ fetch JSON
                                                                   ▼
                                                          ┌─────────────────┐
                                                          │    Frontend      │
                                                          │   (React SPA)   │
                                                          └─────────────────┘
```

**三仓库**：

| 仓库 | 可见性 | 内容 |
|------|:------:|------|
| [`token-matters`](https://github.com/newbdez33/token-matters) | Public | Collector CLI + Summary 聚合代码 + Frontend |
| [`token-matters-data`](https://github.com/newbdez33/token-matters-data) | Private | 原始采集数据 + pricing.json + GitHub Actions workflow |
| [`token-matters-summary`](https://github.com/newbdez33/token-matters-summary) | Public | 聚合统计 JSON + SVG badge（GitHub Pages 托管） |

**数据流**：

1. **采集**：开发机上 Collector CLI 定时采集各 Provider Token 数据，push 到 `token-matters-data/raw/`
2. **聚合**：`token-matters-data` 的 GitHub Actions 触发（`raw/**` push / 每 6 小时 / 手动），checkout `token-matters` 的 summary 代码运行聚合管道
3. **发布**：Action 将生成的 summary JSON + badge SVG push 到 `token-matters-summary`，GitHub Pages 自动部署
4. **展示**：Frontend 从 GitHub Pages 读取聚合 JSON 渲染图表

## Supported Providers

| Provider | 计费模式 | 数据精度 | 采集方式 |
|----------|:--------:|:--------:|---------|
| Claude Code (Anthropic) | Token | exact | 本地 JSONL 解析 |
| Codex CLI (OpenAI) | Token | exact | 本地 JSONL 解析 |
| OpenCode | Token | exact | 本地 SQLite 查询 |
| GLM Coding (智谱 AI) | Subscription | partial | 监控 API |
| TRAE Pro (ByteDance) | Subscription | estimated | 本地日志解析 + Token 估算 |

## Collector Configuration

配置文件路径：`~/.token-matters/config.yaml`

```yaml
dataRepo: ~/projects/token-matters-data
timezone: Asia/Shanghai

providers:
  claude-code:
    enabled: true
    claudeDir: ~/.claude          # 可选，默认 ~/.claude

  codex:
    enabled: true
    codexDir: ~/.codex            # 可选，默认 ~/.codex（或 $CODEX_HOME）

  opencode:
    enabled: true
    openCodeDir: ~/.local/share/opencode  # 可选，默认 $XDG_DATA_HOME/opencode

  glm-coding:
    enabled: true
    apiKey: your-api-key
    baseUrl: https://open.bigmodel.cn     # 可选

  trae-pro:
    enabled: true
    traeDir: ~/Library/Application Support/Trae  # 可选，按平台自动检测
```

每个 provider 设置 `enabled: false` 即可关闭。未在配置中出现的 provider 默认开启。

```bash
cd collector
pnpm collect --status       # 查看各 provider 状态
pnpm collect                # 采集今天的数据
pnpm collect --date 2026-02-20          # 采集指定日期
pnpm collect --from 2026-02-01 --to 2026-02-20  # 采集日期范围
pnpm collect --dry-run      # 预览，不实际写入
```

## Frontend

React SPA dashboard，从 GitHub Pages 读取 summary JSON 渲染。

| 页面 | 路径 | 说明 |
|------|------|------|
| Dashboard | `/` | Token 总量、费用、产品明细、日趋势图 |
| Provider | `/providers/:id` | 单产品详情、Token 细分、趋势 |
| Analytics | `/analytics` | 按日/周/月粒度浏览历史数据 |
| Settings | `/settings` | 主题切换、缓存管理、数据导出 |

```bash
cd frontend
pnpm install
pnpm dev        # 本地开发 http://localhost:5173/token-matters/
pnpm build      # 构建
pnpm test       # 测试
```

## Tech Stack

| | 选型 |
|--|------|
| Runtime | TypeScript / Node.js |
| Frontend | React 19 + Vite + Tailwind CSS 4 + shadcn/ui + Recharts |
| State | Zustand + Dexie.js (IndexedDB cache) |
| CI/CD | GitHub Actions |
| Hosting | GitHub Pages |

## Documentation

| 文档 | 内容 |
|------|------|
| [`architecture.md`](docs/architecture.md) | 双仓库架构、数据仓库设计、数据流、去重策略、ADR |
| [`collector.md`](docs/collector.md) | Collector 程序结构、Provider 接口、采集流程、配置 |
| [`backend.md`](docs/backend.md) | Summary 聚合管道、SVG Badge、Phase 2 Backend 预留 |
| [`frontend.md`](docs/frontend.md) | 功能需求、技术栈、UI 视觉设计系统 |
| [`data-integration.md`](docs/data-integration.md) | 各 Provider 技术细节、API 文档、POC 验证结果 |
| [`plan.md`](docs/plan.md) | 实施路线图（Phase 1–5） |

## License

MIT
