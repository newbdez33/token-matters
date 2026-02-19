# Token Matters — Frontend 设计文档

> 版本: v0.2.0 | 最后更新: 2026-02-19

## 1. 概述

Frontend 是一个静态 React Web App，从 `token-matters-summary` 仓库的 GitHub Pages 读取聚合后的 JSON 数据，渲染图表和报表。

### 功能需求

#### FR-001: AI 产品管理

- 展示已接入的 AI 产品列表
- 每个产品包含：名称、计费模式（`token` | `subscription`）、货币单位、图标/颜色标识、备注

| 产品 | 计费模式 | 说明 |
|------|---------|------|
| Claude Code | 按 Token 消耗 | Anthropic CLI 工具，按 input/output token 分别计费 |
| GLM Coding Plan | 订阅制 | 智谱 AI 编程助手，包月/包年套餐，含 Token 配额 |
| TRAE Pro Plan | 订阅制 | 字节跳动 AI 编程助手，包月/包年套餐，含使用配额 |

#### FR-002: 仪表盘总览

- 展示本月总消耗费用
- 展示本月各产品消耗占比（饼图/环形图）
- 展示近 7 天 / 30 天的消耗趋势（折线图/柱状图）
- 展示各产品当月消耗排行

#### FR-003: 按产品统计

- 选择单个产品，查看其历史消耗趋势
- 查看该产品的 input/output token 分布
- 订阅制产品展示配额使用率

#### FR-004: 按时间范围统计

- 支持自定义日期范围筛选
- 按日 / 周 / 月 粒度聚合数据
- 支持同比/环比对比

#### FR-005: 数据精度标注

- 数据来源精度在 UI 中标注：`exact`（精确）/ `estimated`（估算）/ `partial`（部分）
- 不同精度的数据使用不同视觉标记区分

#### FR-006: 数据导入/导出

- 支持导出为 JSON 格式
- 支持从 JSON 文件导入数据
- 导入时进行数据校验，提示冲突处理方式

#### FR-007: 主题切换

- 支持深色/浅色主题（基于 Tailwind CSS dark mode）
- 响应式布局，适配桌面和平板

#### FR-008: 性能要求

- 页面首次加载时间 < 2s
- 图表渲染时间 < 500ms（1000 条记录以内）

---

## 2. 技术栈

| 类别 | 选型 | 说明 |
|------|------|------|
| 包管理 | pnpm | 高效磁盘利用，严格依赖管理 |
| 构建工具 | Vite | 快速 HMR，原生 ESM 支持 |
| 前端框架 | React 19 | 组件化 UI 开发 |
| 类型系统 | TypeScript 5.x | 静态类型，提升代码可靠性 |
| 路由 | React Router v7 | 客户端路由 |
| 状态管理 | Zustand | 轻量、TypeScript 友好 |
| CSS 框架 | Tailwind CSS 4 | 原子化 CSS，快速构建自定义 UI |
| UI 组件 | shadcn/ui | 基于 Radix UI 的可复制组件集，完全可控 |
| 图表 | Recharts | shadcn/ui charts 内置方案，基于 D3，React 原生 |
| 本地缓存 | Dexie.js (IndexedDB) | 缓存已加载的 JSON 数据，支持离线浏览 |
| 表单验证 | React Hook Form + Zod | 类型安全的表单校验 |
| 日期处理 | dayjs | 轻量日期库 |
| 图标 | Lucide React | shadcn/ui 默认图标库 |
| BDD 测试 | Vitest + @testing-library/react | 组件行为测试 |
| TDD 测试 | Vitest | 单元测试 |
| E2E 测试 | Playwright | 端到端行为验证 |
| 代码规范 | ESLint + Prettier | 统一代码风格 |

---

## 3. 项目结构

```
token-matters/
├── docs/                          # 项目文档
├── e2e/                           # E2E 测试 (Playwright)
│   ├── dashboard.spec.ts
│   ├── records.spec.ts
│   └── products.spec.ts
├── src/
│   ├── assets/                    # 静态资源
│   ├── components/                # 通用组件
│   │   ├── ui/                    # shadcn/ui 组件 (自动生成)
│   │   ├── Layout/
│   │   │   ├── AppLayout.tsx
│   │   │   ├── AppLayout.test.tsx
│   │   │   └── index.ts
│   │   └── Charts/
│   │       ├── CostPieChart.tsx
│   │       ├── TrendLineChart.tsx
│   │       └── index.ts
│   ├── features/                  # 按功能模块组织
│   │   ├── dashboard/
│   │   │   ├── components/
│   │   │   │   ├── DashboardPage.tsx
│   │   │   │   ├── DashboardPage.test.tsx
│   │   │   │   ├── MonthlySummary.tsx
│   │   │   │   └── ProductRanking.tsx
│   │   │   └── index.ts
│   │   ├── products/
│   │   │   ├── components/
│   │   │   │   ├── ProductList.tsx
│   │   │   │   ├── ProductList.test.tsx
│   │   │   │   ├── ProductForm.tsx
│   │   │   │   └── ProductForm.test.tsx
│   │   │   └── index.ts
│   │   ├── records/
│   │   │   ├── components/
│   │   │   │   ├── RecordList.tsx
│   │   │   │   ├── RecordList.test.tsx
│   │   │   │   ├── RecordForm.tsx
│   │   │   │   └── RecordForm.test.tsx
│   │   │   └── index.ts
│   │   ├── analytics/
│   │   │   ├── components/
│   │   │   │   └── AnalyticsPage.tsx
│   │   │   └── index.ts
│   │   └── settings/
│   │       ├── components/
│   │       │   └── SettingsPage.tsx
│   │       └── index.ts
│   ├── models/                    # 数据模型与类型定义
│   │   ├── product.ts
│   │   ├── record.ts
│   │   ├── subscription.ts
│   │   └── index.ts
│   ├── services/                  # 数据服务层
│   │   ├── api.ts                 # fetch JSON (GitHub Pages URL)
│   │   ├── cache.ts               # Dexie.js 缓存层
│   │   ├── statsService.ts        # 统计计算逻辑
│   │   ├── statsService.test.ts
│   │   └── index.ts
│   ├── stores/                    # Zustand 状态管理
│   │   ├── useDataStore.ts        # summary 数据状态
│   │   ├── useFilterStore.ts      # 筛选条件状态
│   │   └── useThemeStore.ts
│   ├── utils/                     # 工具函数
│   │   ├── format.ts              # 数字/日期格式化
│   │   ├── format.test.ts
│   │   └── index.ts
│   ├── App.tsx
│   ├── App.test.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── components.json              # shadcn/ui 配置
└── eslint.config.js
```

页面路由：

| 页面 | 路径 | 说明 |
|------|------|------|
| 仪表盘 | `/` | 总览统计数据 |
| 产品统计 | `/providers/:id` | 单产品详情 |
| 统计分析 | `/analytics` | 高级统计与对比分析 |
| 设置 | `/settings` | 导入/导出、主题切换 |

---

## 4. 数据访问与加载策略

### 4.1 数据源

Frontend 从 `token-matters-summary` 仓库的 GitHub Pages 读取静态 JSON：

```
https://{user}.github.io/token-matters-summary/summary/meta.json
https://{user}.github.io/token-matters-summary/summary/latest.json
https://{user}.github.io/token-matters-summary/summary/daily/2026-02-19.json
...
```

> Phase 2 迁移到 Backend 服务后，只需切换 base URL，参见 `backend.md` 第 4.3 章。

### 4.2 加载策略

```
App 启动
    │
    ▼
fetch meta.json        → 获取可用日期范围、Provider 列表
    │
    ▼
fetch latest.json      → 渲染 Dashboard（最近 7/30 天汇总 + 趋势图）
    │
    ▼ (用户交互)
fetch daily/*.json     → 按需加载具体日期的明细
fetch providers/*.json → 按需加载 Provider 维度分析
fetch monthly/*.json   → 按需加载月度报表
```

- 启动时仅加载 `meta.json` + `latest.json`（2 个请求），确保首屏快速渲染
- 后续数据按用户交互按需加载

---

## 5. 状态管理与持久化

### 5.1 Zustand Store

```typescript
// stores/useDataStore.ts
interface DataStore {
  meta: SummaryMeta | null;
  latest: LatestSummary | null;
  dailyCache: Record<string, DailySummary>;      // 按 date key 缓存
  providerCache: Record<string, ProviderDetail>;  // 按 provider key 缓存
  isLoading: boolean;
  error: string | null;
  fetchMeta: () => Promise<void>;
  fetchLatest: () => Promise<void>;
  fetchDaily: (date: string) => Promise<void>;
  fetchProvider: (provider: string) => Promise<void>;
}
```

### 5.2 IndexedDB 持久化缓存

使用 Dexie.js 将已加载的 JSON 缓存到 IndexedDB，支持离线浏览和减少重复请求：

| 用途 | 说明 |
|------|------|
| 缓存角色 | 已加载的 summary JSON 存入 IndexedDB，下次打开时先展示缓存数据 |
| 更新策略 | stale-while-revalidate — 先展示缓存，后台请求最新数据后更新 |
| 过期清理 | 超过 7 天未访问的缓存条目自动清理 |

---

## 6. UI 视觉设计系统

### 6.1 设计理念

**帐单式设计（Invoice-style）**：整体视觉参考纸质帐单和财务报表，强调数据的清晰可读性，去除一切装饰性元素。

设计关键词：**克制、精确、留白、直角、单色**

### 6.2 色彩系统

仅使用黑白灰，不引入任何品牌色或装饰色。产品标识色仅在图表中用于区分数据系列。

```
Light Mode                          Dark Mode
──────────────────                  ──────────────────
背景    #FFFFFF (white)             背景    #0A0A0A (near-black)
表面    #FAFAFA                     表面    #141414
边框    #E5E5E5                     边框    #262626
次文字  #737373                     次文字  #A3A3A3
主文字  #0A0A0A                     主文字  #FAFAFA
强调    #000000 (black)             强调    #FFFFFF (white)
```

shadcn/ui CSS 变量覆盖：

```css
:root {
  --radius: 0;               /* 全局直角 */
  --background: 0 0% 100%;
  --foreground: 0 0% 4%;
  --card: 0 0% 98%;
  --card-foreground: 0 0% 4%;
  --border: 0 0% 90%;
  --input: 0 0% 90%;
  --ring: 0 0% 0%;
  --muted: 0 0% 96%;
  --muted-foreground: 0 0% 45%;
  --primary: 0 0% 0%;
  --primary-foreground: 0 0% 100%;
  --secondary: 0 0% 96%;
  --secondary-foreground: 0 0% 4%;
  --accent: 0 0% 96%;
  --accent-foreground: 0 0% 4%;
  --destructive: 0 0% 30%;
  --destructive-foreground: 0 0% 100%;
}

.dark {
  --background: 0 0% 4%;
  --foreground: 0 0% 98%;
  --card: 0 0% 8%;
  --card-foreground: 0 0% 98%;
  --border: 0 0% 15%;
  --input: 0 0% 15%;
  --ring: 0 0% 100%;
  --muted: 0 0% 10%;
  --muted-foreground: 0 0% 64%;
  --primary: 0 0% 100%;
  --primary-foreground: 0 0% 4%;
  --secondary: 0 0% 10%;
  --secondary-foreground: 0 0% 98%;
  --accent: 0 0% 10%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 0% 70%;
  --destructive-foreground: 0 0% 4%;
}
```

图表专用灰阶色板（用于区分不同产品数据系列）：

```
#000000  #404040  #808080  #A0A0A0  #D0D0D0
```

### 6.3 排版

```
字体栈:
  标题: Inter / system-ui, sans-serif
  正文: Inter / system-ui, sans-serif
  数字: "Tabular Nums" (font-variant-numeric: tabular-nums)
  代码: "JetBrains Mono" / ui-monospace, monospace

字号层级:
  页面标题    text-2xl   (24px)  font-light    tracking-tight
  区块标题    text-lg    (18px)  font-normal
  正文        text-sm    (14px)  font-normal
  辅助文字    text-xs    (12px)  font-normal   text-muted-foreground
  大数字      text-4xl   (36px)  font-light    tabular-nums
  表格数字    text-sm    (14px)  font-normal   tabular-nums  font-mono
```

### 6.4 间距与留白

大量留白是核心设计原则。内容不要堆积，让数据「呼吸」。

```
页面外边距        px-8 py-8        (32px)
区块之间间距      space-y-8        (32px)
卡片内边距        p-6              (24px)
表格行高          h-12             (48px)
表单字段间距      space-y-6        (24px)
```

### 6.5 组件风格规则

| 组件 | 规则 |
|------|------|
| Card | `rounded-none border shadow-none` — 直角 + 细边框 + 无阴影 |
| Button | `rounded-none` — 主按钮黑底白字，次按钮白底黑框 |
| Input | `rounded-none border-border` — 直角 + 细边框 |
| Table | 无外边框，仅行间细线分隔（`border-b`），表头加粗 + 大写字母 |
| Dialog | `rounded-none shadow-none border` — 直角弹窗 |
| Badge/Tag | `rounded-none` — 直角标签，灰底黑字 |
| Separator | `border-border` — 1px 细线 |
| Chart | 黑白灰填充，无渐变，细线条，无网格背景 |

### 6.6 布局参考

仪表盘采用纵向帐单式布局，不使用卡片网格，而是逐行展示：

```
┌─────────────────────────────────────────────────────────┐
│  Token Matters                          Feb 2026  [设置] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  MONTHLY TOTAL                                          │
│  $127.43                                                │
│                                                         │
│─────────────────────────────────────────────────────────│
│                                                         │
│  BY PRODUCT                       THIS MONTH    CHANGE  │
│  ─────────────────────────────────────────────────────  │
│  Claude Code                       $102.18      +12.3%  │
│  GLM Coding Plan                    ¥68.00         --   │
│  TRAE Pro Plan                      ¥70.00         --   │
│                                                         │
│─────────────────────────────────────────────────────────│
│                                                         │
│  DAILY TREND (30 DAYS)                                  │
│  ▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐▐                      │
│                                                         │
│─────────────────────────────────────────────────────────│
│                                                         │
│  RECENT RECORDS                                         │
│  ─────────────────────────────────────────────────────  │
│  2026-02-19  Claude Code   IN 24,633  OUT 1,978  $1.25  │
│  2026-02-18  Claude Code   IN 18,200  OUT 3,412  $2.10  │
│  2026-02-18  Claude Code   IN  9,800  OUT 1,100  $0.67  │
│  ...                                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 7. 数据模型

Frontend 使用的 TypeScript 类型定义：

```typescript
interface Product {
  id: string;
  name: string;
  provider: string;                // 'claude-code' | 'glm-coding' | 'trae-pro'
  billingMode: 'token' | 'subscription';
  currency: string;
  color: string;
  note?: string;
}

interface Subscription {
  id: string;
  provider: string;
  planName: string;
  cycle: 'monthly' | 'yearly';
  cost: number;
  currency: string;
  quota?: number;
  quotaUnit?: string;
  startDate: string;
  endDate: string;
}
```

> 聚合数据类型（DailySummary、LatestSummary、SummaryMeta 等）参见 `architecture.md` 第 2.5 章。

预设产品配置（首次启动自动创建）：

```typescript
const presetProducts: Product[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    provider: 'claude-code',
    billingMode: 'token',
    currency: 'USD',
    color: '#000000',
    note: 'Anthropic CLI - 按 token 计费',
  },
  {
    id: 'glm-coding',
    name: 'GLM Coding Plan',
    provider: 'glm-coding',
    billingMode: 'subscription',
    currency: 'CNY',
    color: '#808080',
    note: '智谱 AI 编程助手 - 订阅制',
  },
  {
    id: 'trae-pro',
    name: 'TRAE Pro Plan',
    provider: 'trae-pro',
    billingMode: 'subscription',
    currency: 'USD',
    color: '#C0C0C0',
    note: '字节跳动 AI 编程助手 - 订阅制',
  },
];
```

---

## 8. 与原有设计的关系

| 层级 | 原设计 | 新架构 |
|------|--------|--------|
| UI 组件 | 不变 | 不变 |
| 视觉设计 | 不变（invoice 风格） | 不变 |
| 状态管理 | Zustand | Zustand（数据源改为 fetch JSON） |
| 持久化 | Dexie.js / IndexedDB（主存储） | Dexie.js / IndexedDB（仅缓存） |
| 数据写入 | 前端 CRUD → IndexedDB | Collector → GitHub（前端只读） |
| 数据读取 | IndexedDB 查询 | fetch 静态 JSON |
| 手动录入 | 前端表单 → IndexedDB | 待定（可通过 Collector 手动模式或前端提交 PR） |
