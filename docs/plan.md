# Token Matters — 实施路线图

> 版本: v0.2.0 | 最后更新: 2026-02-19

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

- [ ] 实现 JSON fetch 数据层（`services/api.ts`）
  - base URL 配置（指向 GitHub Pages）
  - meta.json + latest.json 启动加载
  - 按需加载 daily / provider / machine JSON
- [ ] 实现 Dexie.js 缓存层（`services/cache.ts`）
  - stale-while-revalidate 策略
  - 缓存过期清理
- [ ] Dashboard 页面对接 `latest.json`
  - 月度总费用
  - 产品消耗占比图
  - 近 7/30 天趋势图
  - 产品排行
- [ ] Provider 详情页对接 `providers/*.json`
- [ ] 时间范围分析页对接 `daily/*.json` + `monthly/*.json`
- [ ] 部署 Frontend 到 GitHub Pages（代码仓库 `token-matters`）

**验证标准**：

- 首屏 2 个请求（meta.json + latest.json）即可渲染 Dashboard
- 已加载数据缓存到 IndexedDB，刷新后先展示缓存
- 各维度报表数据与 summary JSON 一致
- 数据精度标注（exact / estimated / partial）在 UI 中正确展示

### Phase 5：完善

**目标**：多机器实测、历史数据回填、体验优化。

**交付物**：

- [ ] 多机器实测：在第二台开发机运行 Collector，验证双机并行
- [ ] 历史数据回填：`--from --to` 参数回填过去 30 天数据
- [ ] 费用定价配置：支持在 Frontend 中查看/编辑 pricing.json
- [ ] 数据精度标注优化：exact / estimated / partial 在 UI 中的差异化展示
- [ ] 深色/浅色主题验证
- [ ] 响应式布局验证（桌面 + 平板）
- [ ] 性能测试：首屏 < 2s，图表渲染 < 500ms

**验证标准**：

- 两台机器的数据在 Dashboard 中正确合并展示
- 30 天历史数据回填后趋势图连续无断裂
- 深色/浅色主题切换正常
- 性能指标达标
