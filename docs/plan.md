# Token Matters — 实施路线图

> 版本: v0.3.0 | 最后更新: 2026-02-20

## 1. 总体阶段划分

```
Phase 1          Phase 2           Phase 3          Phase 4          Phase 5
数据仓库 +       多 Provider       Summary          Frontend         完善
Claude Code      采集              管道              对接
Collector
─────────────── ─────────────── ─────────────── ─────────────── ───────────────
创建双仓库       添加 GLM/TRAE    实现聚合程序     Frontend         多机实测
Collector 框架   Provider          配置 Actions     JSON 数据层      历史回填
Claude Code      launchd 定时     跨仓库推送        Dashboard        精度标注
Provider         多 Provider      daily/weekly/     按需加载         费用配置 UI
                 并行采集         monthly 聚合      部署 Pages

──────── 以上已完成 ──────── 以下为新阶段 ────────

Phase 6          Phase 7
Collector        多用户系统
Doctor & Init
─────────────── ───────────────────────────────────────────────────
环境诊断         7a: Backend 服务 + 用户管理 + 数据上传 API
自动修复         7b: Collector API 上传模式
交互式初始化     7c: Backend 聚合服务（替代 GitHub Actions）
                 7d: Frontend 多用户支持
```

---

## 2. Phase 详情

### Phase 1：数据仓库 + Claude Code Collector

**目标**：建立数据基础设施，验证端到端数据流（采集 → 存储 → 推送）。

**交付物**：

- [ ] 创建 `token-matters-data` GitHub 仓库（Private）
- [ ] 创建 `token-matters-summary` GitHub 仓库（Public）
- [ ] 定义并验证 `RawDataFile` / `DailySummary` TypeScript schema
- [ ] 实现 Collector CLI 框架（`collector/src/main.ts`）
  - 配置加载（`config.ts`）
  - Git 操作封装（`git.ts`）
  - Content hash 计算（`hash.ts`）
  - Provider 接口定义（`providers/types.ts`）
- [x] 实现 Claude Code Provider（从 `poc/claude-code-usage.ts` 迁移）
  - JSONL 文件扫描与解析（含 message.id 去重）
  - 按日聚合（时区感知）
  - 增量状态管理
- [x] 手动运行验证：raw 文件生成 + git push 到 `token-matters-data`
- [x] 编写 `~/.token-matters/config.yaml`（machine 从 hostname 自动推导）
- [x] launchd 定时调度已部署验证（每日 00:30）
- [x] 75 个测试（单元 + 集成）全部通过

**验证标准**（均已通过）：

- `npx tsx collector/src/main.ts` 成功采集 Claude Code 数据
- `raw/j-studio/claude-code/2026-02-19_*.json` 文件生成且格式正确
- 重复运行不产生重复文件（hash 去重生效）
- `git push` 成功将数据推送到 `token-matters-data`
- `launchctl start com.token-matters.collector` 手动触发正常运行

### Phase 2：多 Provider 采集

**目标**：完成所有 Provider 的自动化采集，配置定时任务。

**交付物**：

- [x] 实现 GLM Coding Provider（从 `poc/glm-coding-usage.ts` 迁移）
  - 监控 API 调用（model-usage）
  - z.ai / open.bigmodel.cn 双端点支持
  - API Key 认证（无 Bearer）
- [x] 实现 TRAE Pro Provider（从 `poc/trae-usage.ts` 迁移）
  - ai-agent 日志解析（TimingCostOriginEvent, body_len, AgentTask, TokenUsageEvent）
  - Token 估算算法（timing + body_len, p95 outlier replacement）
- [x] 三个 Provider 注册到 main.ts `buildProviders()`
- [x] 配置 macOS launchd 定时任务（Phase 1 已配置，自动覆盖新 Provider）
- [x] 验证多 Provider 并行采集：三个 Provider 同时运行，互不影响
- [x] 115 个测试（单元 + 集成）全部通过

**验证标准**：

- 三个 Provider 的 raw 文件均成功生成
- 各 Provider 的 `dataQuality` 标记正确（exact / partial / estimated）
- launchd 定时任务每日自动执行
- 单个 Provider 失败不影响其余 Provider

### Phase 3：Summary 管道

**目标**：实现数据聚合，配置 GitHub Actions 自动化，完成跨仓库推送。

**交付物**：

- [x] 实现 Summary 聚合程序（`summary/src/main.ts`）
  - raw 文件扫描与去重
  - 按日/周/月聚合
  - 按 Provider/机器维度聚合
  - 费用计算（基于 pricing.json）
  - 生成 latest.json + meta.json 索引
- [x] 配置 `pricing.json` 费用定价
- [x] 配置 GitHub Actions workflow（`summarize.yml`）
  - push 触发 + 定时触发 + 手动触发
  - 跨仓库推送到 `token-matters-summary`
- [x] 在 `token-matters-summary` 配置 deploy key
- [x] 启用 `token-matters-summary` 的 GitHub Pages
- [x] 实现 SVG Badge 生成（`summary/src/badge.ts`）
  - 双主题：flat（shields.io 风格）+ pixel（黑框白底等宽字体）
  - 4 个 badge：token-usage{,-cost}{,-pixel}.svg
  - 输出到 `badge/`，随 summary 一同推送
- [x] 100 个测试（单元 + 集成）全部通过

**验证标准**：

- `summary/daily/`, `summary/weekly/`, `summary/monthly/` 文件正确生成
- `summary/providers/`, `summary/machines/` 维度聚合正确
- `latest.json` 包含最近 7 天和 30 天汇总
- `meta.json` 索引完整（日期范围、Provider 列表、文件列表）
- GitHub Actions 在 push raw/ 后自动触发聚合
- 聚合结果成功推送到 `token-matters-summary`
- `https://{user}.github.io/token-matters-summary/summary/latest.json` 可访问
- `badge/token-usage.svg` 正确生成，内容与 latest.json 中的 7 天汇总一致
- SVG 可通过 `https://{user}.github.io/token-matters-summary/badge/token-usage.svg` 访问
- Markdown `![Token Usage](url)` 嵌入后正常渲染

### Phase 4：Frontend 对接

**目标**：Frontend 从静态 JSON 读取数据，渲染 Dashboard 和各维度报表。

**交付物**：

- [x] 实现 JSON fetch 数据层（`services/api.ts`）
  - base URL 配置（指向 GitHub Pages）
  - meta.json + latest.json 启动加载
  - 按需加载 daily / provider / machine JSON
- [x] 实现 Dexie.js 缓存层（`services/cache.ts`）
  - stale-while-revalidate 策略
  - 缓存过期清理
- [x] Dashboard 页面对接 `latest.json`
  - Token 总量（完整数字）+ 费用注脚
  - 产品明细表（Logo + 费用 + Token + 数据精度 badge）
  - 近 7/30 天趋势柱状图
  - 今日概要
- [x] Provider 详情页对接 `providers/*.json`
- [x] 时间范围分析页对接 `daily/*.json` + `weekly/*.json` + `monthly/*.json`
- [x] Settings 页面（主题切换、缓存管理、数据导出）
- [x] 部署 Frontend 到 GitHub Pages（代码仓库 `token-matters`）
- [x] GitHub Actions workflow（`deploy-frontend.yml`）+ SPA 404 路由 hack

**验证标准**：

- 首屏 2 个请求（meta.json + latest.json）即可渲染 Dashboard
- 已加载数据缓存到 IndexedDB，刷新后先展示缓存
- 各维度报表数据与 summary JSON 一致
- 数据精度标注（exact / estimated / partial）在 UI 中正确展示

### Phase 5：完善

**目标**：多机器实测、历史数据回填、体验优化。

**交付物**：

- [ ] 多机器实测：在第二台开发机运行 Collector，验证双机并行
- [x] 历史数据回填：`--from --to` 参数已在 Collector Phase 1 实现
- [ ] 费用定价配置：支持在 Frontend 中查看/编辑 pricing.json
- [x] 数据精度标注优化：exact / estimated / partial 差异化展示（图标 + 边框样式 + tooltip 说明）
- [x] 深色/浅色主题：chart 颜色随主题切换，CSS 变量驱动，logo dark:invert
- [x] 响应式布局：mobile / desktop 全适配（padding、grid、table 均有断点）
- [x] 性能优化：lazy loading 路由（Provider/Analytics/Settings 按需加载），code splitting，首屏仅加载 Dashboard 核心 chunk

**验证标准**：

- 两台机器的数据在 Dashboard 中正确合并展示
- 30 天历史数据回填后趋势图连续无断裂
- [x] 深色/浅色主题切换正常
- [x] 性能：build 产出 6 chunks，最大 339KB gzip 102KB；首屏仅需 vendor + index + css

### Phase 6：Collector Doctor & Init

**目标**：降低 Collector 在新机器上的配置门槛，提供环境诊断和一键修复。

> 详细设计参见 `collector-doctor-init.md`。

**交付物**：

- [ ] `pnpm collect --doctor`：诊断 5 大类检查（Dependencies → Config → Data Repo → Providers → State）
- [ ] `pnpm collect --doctor --fix`：自动修复可修复的问题（创建目录/模板配置/清理过期 state）
- [ ] `pnpm collect --init`：交互式引导（数据仓库路径 → 时区 → Provider 自动检测 → 写入配置）
- [ ] 彩色终端输出（✓ / ⚠ / ✗ / ✦ 图标）
- [ ] Doctor + Init 单元测试

**验证标准**：

- `pnpm doctor` 在已配置机器上全部通过（12+ ✓）
- `pnpm collect --doctor --fix` 在空 `~/.token-matters/` 下自动创建目录和模板配置
- `pnpm collect --init` 完成后 `~/.token-matters/config.yaml` 有效，后续 `--doctor` 全部通过
- 所有 doctor/init 测试通过

### Phase 7：多用户系统

**目标**：将 Token Matters 从单用户（git-based）架构演进为多用户中央化系统。多个用户各自在自己的机器上运行 Collector，通过 Backend API 上传数据；共用一个 Frontend，通过用户标识区分展示各自数据。

**架构变化**：

```
当前架构（单用户）                          目标架构（多用户）
─────────────────                          ─────────────────
Collector                                  Collector (用户 A 的机器)
    │ git push                             Collector (用户 B 的机器)
    ▼                                          │ POST /api/raw + Token
token-matters-data [Private]                   ▼
    │ GitHub Actions                       ┌──────────────────┐
    ▼                                      │  Backend 服务     │
token-matters-summary [Public]             │  (Cloudflare /   │
    │ fetch JSON                           │   Firebase)      │
    ▼                                      │                  │
Frontend (单用户)                           │  · 用户管理      │
                                           │  · 数据上传 API  │
                                           │  · 聚合计算      │
                                           │  · REST API      │
                                           │  · 按用户隔离    │
                                           └────────┬─────────┘
                                                    │ REST API
                                                    ▼
                                           Frontend (多用户共用)
                                           · 登录 / URL 参数区分用户
                                           · 读取当前用户的聚合数据
```

---

#### Phase 7a：Backend 服务 — 用户管理 + 数据上传 API

**目标**：搭建中央 Backend，实现用户注册和 Collector 数据上传。

**交付物**：

- [ ] 选择 Backend 平台（Cloudflare Workers + R2 / Firebase / 自建 VPS）
- [ ] 用户管理
  - 用户注册（简化版：管理员手动创建用户，生成 Collector Token）
  - `collector-token`：Collector 上传数据时使用的认证令牌（per-user）
  - Token 管理 API：创建 / 吊销 / 列出
- [ ] 数据上传 API
  - `POST /api/raw` — Collector 上传 `RawDataFile` JSON
  - 请求头：`Authorization: Bearer <collector-token>`
  - 服务端按用户隔离存储：`data/{userId}/raw/{machine}/{provider}/{date}_{hash}.json`
  - 上传去重：相同 hash 跳过
  - 响应：`201 Created` / `200 Already Exists` / `401 Unauthorized`
- [ ] 数据存储方案
  - 方案 A（文件存储）：Cloudflare R2 / S3，目录按用户隔离
  - 方案 B（数据库）：Firestore / D1 / PostgreSQL，`userId` 作为分区键

**数据隔离结构**：

```
data/
├── user-alice/
│   └── raw/
│       ├── macbook-pro/
│       │   ├── claude-code/
│       │   │   └── 2026-02-20_a1b2c3.json
│       │   └── trae-pro/
│       │       └── 2026-02-20_d4e5f6.json
│       └── imac/
│           └── claude-code/
│               └── 2026-02-20_g7h8i9.json
├── user-bob/
│   └── raw/
│       └── thinkpad/
│           └── claude-code/
│               └── 2026-02-20_j0k1l2.json
```

**验证标准**：

- `POST /api/raw` 带有效 Token 返回 201，数据正确存入用户目录
- 无效/过期 Token 返回 401
- 重复上传相同 hash 返回 200，不产生重复文件
- 用户 A 的 Token 无法访问用户 B 的数据

---

#### Phase 7b：Collector API 上传模式

**目标**：Collector 支持通过 HTTP API 上传数据（替代 git push），使用 per-user Token 认证。

**交付物**：

- [ ] `~/.token-matters/config.yaml` 新增字段：
  ```yaml
  # 上传模式: 'git'（默认，向后兼容）或 'api'
  uploadMode: api

  api:
    url: https://api.token-matters.example.com
    token: tm_xxxxxxxxxxxxxxxx        # Collector Token（从 Backend 获取）
  ```
- [ ] 新增 `collector/src/uploader.ts`：HTTP 上传实现
  - `POST /api/raw`，Body 为 `RawDataFile` JSON
  - `Authorization: Bearer <token>` 认证
  - 重试逻辑：网络错误重试 3 次，指数退避
  - 超时：30s
- [ ] `main.ts` 根据 `uploadMode` 选择上传策略（git push 或 API upload）
- [ ] `--init` 集成：初始化时可选择上传模式，输入 API URL 和 Token
- [ ] `--doctor` 集成：API 模式下检查 URL 连通性和 Token 有效性

**向后兼容**：

| `uploadMode` | 行为 | 说明 |
|:------------:|------|------|
| `git`（默认） | `git add && git commit && git push` | 现有行为不变 |
| `api` | `POST /api/raw` | 新增 API 上传 |

**验证标准**：

- `uploadMode: api` 时 Collector 成功上传数据到 Backend
- `uploadMode: git` 时行为与现有完全一致
- Token 过期或无效时给出明确错误提示
- `--doctor` 在 API 模式下检查连通性和 Token 有效性

---

#### Phase 7c：Backend 聚合服务

**目标**：Backend 接管 Summary 聚合职责（替代 GitHub Actions），为 Frontend 提供 REST API。

**交付物**：

- [ ] 聚合触发：Collector 上传成功后自动触发（或定时 cron）
- [ ] 按用户聚合：每个用户独立计算 daily / weekly / monthly / provider / machine 维度
- [ ] 聚合结果存储：`data/{userId}/summary/` 下，结构与现有 `token-matters-summary` 一致
- [ ] REST API（鉴权按用户）：

| 端点 | 说明 | 鉴权 |
|------|------|------|
| `GET /api/summary/latest` | Dashboard 首页 | 用户 Token 或 Session |
| `GET /api/summary/daily/:date` | 日报 | 同上 |
| `GET /api/summary/weekly/:week` | 周报 | 同上 |
| `GET /api/summary/monthly/:month` | 月报 | 同上 |
| `GET /api/summary/providers/:provider` | Provider 维度 | 同上 |
| `GET /api/summary/machines/:machine` | 机器维度 | 同上 |
| `GET /api/summary/meta` | 索引 | 同上 |
| `GET /api/badge/:type.svg` | SVG Badge | 公开（无需鉴权） |

- [ ] `pricing.json` 管理：每个用户可自定义费用配置，Backend 存储和提供

**验证标准**：

- Collector 上传后 10s 内 `GET /api/summary/latest` 反映最新数据
- 用户 A 的 API 调用仅返回用户 A 的聚合数据
- REST API 路径与现有静态 JSON 路径兼容（Frontend 仅切换 base URL）

---

#### Phase 7d：Frontend 多用户支持

**目标**：Frontend 支持多用户访问，共用一个部署实例，通过用户标识展示各自数据。

**交付物**：

- [ ] 用户识别方案（二选一或组合）：
  - **方案 A — URL 参数**：`https://token-matters.example.com/?user=alice`，无需登录，简单直接
  - **方案 B — 登录认证**：简单登录页，输入用户名 + Token（或 OAuth），获取 Session
- [ ] `services/api.ts` 改造：
  - base URL 从 GitHub Pages → Backend API
  - 请求附带用户认证信息（Session Cookie / Bearer Token / URL 参数）
- [ ] 数据层适配：
  - 所有 fetch 请求携带用户上下文
  - 缓存按用户隔离（IndexedDB key 加 userId 前缀）
- [ ] UI 调整：
  - 顶部导航显示当前用户标识
  - Settings 页面显示 Collector Token 和 API 配置提示
  - Badge 嵌入链接包含用户标识
- [ ] 部署调整：
  - Frontend 部署到 Backend 同域（或独立域名 + CORS）
  - 移除对 `token-matters-summary` GitHub Pages 的依赖

**验证标准**：

- 用户 A 和用户 B 通过同一 Frontend URL 看到各自的 Dashboard 数据
- 用户 A 的数据不会泄露给用户 B
- Frontend 切换 base URL 后，现有所有页面和图表正常工作
- Badge SVG 通过公开 URL 可访问（可嵌入 GitHub README）

---

## 3. Phase 7 开放问题

以下问题需在实施前确定，不影响路线图的整体方向：

| # | 问题 | 候选方案 | 影响范围 |
|---|------|---------|---------|
| Q1 | Backend 平台选型 | Cloudflare Workers + R2 / Firebase / 自建 VPS | 7a |
| Q2 | 用户认证方式 | 简单 Token / OAuth (GitHub) / 邮箱+密码 | 7a, 7d |
| Q3 | 数据存储格式 | 文件存储 (R2/S3) vs 数据库 (Firestore/D1) | 7a, 7c |
| Q4 | Frontend 用户识别 | URL 参数 vs 登录页 vs 两者结合 | 7d |
| Q5 | 迁移策略 | 渐进式（git 和 API 共存过渡）vs 一步到位 | 7b |
| Q6 | 现有 GitHub Pages 数据 | 保留（只读存档）vs 迁移到 Backend | 7c, 7d |
