# Token Matters

个人 AI 产品 Token 消耗统计与可视化工具。追踪你在 Claude Code、GLM Coding、TRAE Pro 等 AI 产品上的 Token 使用量与费用支出。

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

**三组件 + 双仓库**：

| 组件 | 说明 |
|------|------|
| **Collector** | TypeScript CLI，运行在开发机上，定时采集各 Provider 的 Token 数据 |
| **Summary** | GitHub Actions 聚合管道，将原始数据汇总为多维度统计 JSON + SVG badge |
| **Frontend** | React SPA，从 GitHub Pages 读取聚合 JSON 渲染图表 |

| 仓库 | 可见性 | 内容 |
|------|:------:|------|
| `token-matters-data` | Private | 原始采集数据 + 费用配置 + Actions workflow |
| `token-matters-summary` | Public | 聚合统计 JSON + SVG badge + GitHub Pages |

## Supported Providers

| Provider | 数据精度 | 采集方式 |
|----------|:--------:|---------|
| Claude Code (Anthropic) | exact | 本地 JSONL 解析 |
| GLM Coding (智谱 AI) | partial | 监控 API |
| TRAE Pro (ByteDance) | estimated | 本地日志解析 + Token 估算 |

## Project Status

> 🚧 设计阶段 — 文档已完成，代码尚未开始

当前进度参见 [`docs/plan.md`](docs/plan.md)。

## Documentation

| 文档 | 内容 |
|------|------|
| [`architecture.md`](docs/architecture.md) | 双仓库架构、数据仓库设计、数据流、去重策略、ADR |
| [`collector.md`](docs/collector.md) | Collector 程序结构、Provider 接口、采集流程、配置 |
| [`backend.md`](docs/backend.md) | Summary 聚合管道、SVG Badge、Phase 2 Backend 预留 |
| [`frontend.md`](docs/frontend.md) | 功能需求、技术栈、UI 视觉设计系统 |
| [`data-integration.md`](docs/data-integration.md) | 各 Provider 技术细节、API 文档、POC 验证结果 |
| [`plan.md`](docs/plan.md) | 实施路线图（Phase 1–5） |

## Tech Stack

| | 选型 |
|--|------|
| Runtime | TypeScript / Node.js |
| Frontend | React 19 + Vite + Tailwind CSS 4 + shadcn/ui + Recharts |
| State | Zustand + Dexie.js (IndexedDB cache) |
| CI/CD | GitHub Actions |
| Hosting | GitHub Pages |

## License

Private project — not open source.
