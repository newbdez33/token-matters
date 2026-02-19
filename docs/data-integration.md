# Token Matters — 数据自动采集技术方案

> 版本: v0.1.0 | 最后更新: 2026-02-19

## 1. 概述

本文档从技术角度描述如何从各 AI 产品 Provider 自动获取 Token 消耗数据，覆盖 API 对接、本地数据解析、认证方式及数据格式。

### 各 Provider 数据获取能力总览

| Provider | 官方用量 API | 响应级 Token 数据 | 本地数据解析 | 数据导出 |
|----------|:-----------:|:----------------:|:-----------:|:-------:|
| Claude Code (Anthropic) | Admin API | 每次响应返回 | JSONL 文件 + stats-cache | Console CSV |
| GLM Coding (智谱 AI) | 监控 API（未公开文档） | 每次响应返回 | 无 | 控制台 CSV |
| TRAE Pro (ByteDance) | 订阅状态 API | 无（服务端处理） | ai-agent 日志（调用次数+模型+Token 估算） | 无 |

---

## 2. Claude Code (Anthropic)

Anthropic 提供最完整的数据获取方案，有 3 个层级可供选择。

### 2.1 方案 A：解析本地 JSONL 文件（推荐首选）

Claude Code CLI 将所有会话数据以 JSONL 格式存储在本地，无需任何 API Key。

#### 存储路径

```
~/.claude/projects/{project-path-with-dashes}/{session-uuid}.jsonl
```

示例：
```
~/.claude/projects/-Users-jacky-projects-dev-token-matters/7d11e27e-46f4-4b45-a8fb-a937a3bae3e7.jsonl
```

#### JSONL 数据结构

每个 `.jsonl` 文件包含多种类型的行记录，Token 消耗数据在 `type: "assistant"` 的行中：

```jsonc
{
  "type": "assistant",
  "timestamp": "2026-02-19T01:26:01.084Z",
  "sessionId": "7d11e27e-...",
  "version": "2.1.47",
  "message": {
    "model": "claude-opus-4-6",
    "usage": {
      "input_tokens": 1,
      "output_tokens": 1978,
      "cache_creation_input_tokens": 131,
      "cache_read_input_tokens": 24633,
      "server_tool_use": {
        "web_search_requests": 0,
        "web_fetch_requests": 0
      },
      "service_tier": "standard",
      "cache_creation": {
        "ephemeral_1h_input_tokens": 131,
        "ephemeral_5m_input_tokens": 0
      },
      "speed": "standard"
    }
  }
}
```

#### Usage 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `input_tokens` | number | 非缓存的输入 Token 数 |
| `output_tokens` | number | 输出 Token 数 |
| `cache_creation_input_tokens` | number | 写入缓存的 Token 数 |
| `cache_read_input_tokens` | number | 从缓存读取的 Token 数 |
| `server_tool_use.web_search_requests` | number | Web 搜索调用次数 |
| `server_tool_use.web_fetch_requests` | number | Web 抓取调用次数 |
| `service_tier` | string | 服务层级：`standard` / `priority` / `batch` |
| `speed` | string | `standard` / `fast` |

**总输入 Token** = `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`

#### 聚合统计缓存

Claude Code 维护一个预聚合的统计缓存文件：

```
~/.claude/stats-cache.json
```

```jsonc
{
  "version": 2,
  "lastComputedDate": "2026-02-16",
  "dailyActivity": [
    { "date": "2026-01-28", "messageCount": 3219, "sessionCount": 7, "toolCallCount": 620 }
  ],
  "dailyModelTokens": [
    { "date": "2026-01-28", "tokensByModel": { "claude-opus-4-5-20251101": 28841 } }
  ],
  "modelUsage": {
    "claude-opus-4-6": {
      "inputTokens": 56154,
      "outputTokens": 301645,
      "cacheReadInputTokens": 363240835,
      "cacheCreationInputTokens": 11995076,
      "costUSD": 0
    }
  },
  "totalSessions": 52,
  "totalMessages": 30354,
  "firstSessionDate": "2026-01-28T04:55:10.641Z"
}
```

#### 解析实现思路

```typescript
// 扫描所有 JSONL 文件，提取 assistant 行中的 usage 数据
interface ClaudeUsageEntry {
  timestamp: string;
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

function parseClaudeJSONL(filePath: string): ClaudeUsageEntry[] {
  const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  return lines
    .map(line => JSON.parse(line))
    .filter(obj => obj.type === 'assistant' && obj.message?.usage)
    .map(obj => ({
      timestamp: obj.timestamp,
      sessionId: obj.sessionId,
      model: obj.message.model,
      inputTokens: obj.message.usage.input_tokens ?? 0,
      outputTokens: obj.message.usage.output_tokens ?? 0,
      cacheCreationTokens: obj.message.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: obj.message.usage.cache_read_input_tokens ?? 0,
    }));
}
```

> **注意**：此方案为纯前端项目时无法直接使用（浏览器无法访问本地文件系统）。可行的实施路径：
> - 提供一个本地 CLI 脚本，将数据导出为 JSON 后导入到 Web 应用
> - 未来版本可开发配套的本地 Agent / Electron 版本

#### 社区工具

[ccusage](https://github.com/ryoppippi/ccusage) 是一个现成的 CLI 工具，可直接解析 Claude Code 本地数据：

```bash
npx ccusage@latest daily     # 按日统计
npx ccusage@latest monthly   # 按月统计
npx ccusage@latest session   # 按会话统计
```

支持 `--json` 输出，可作为数据导入源。

### 2.2 方案 B：Anthropic Admin API（组织账户）

需要组织级别的 Admin API Key（前缀 `sk-ant-admin...`），适用于有组织账户的用户。

#### 认证

```
Header: x-api-key: sk-ant-admin...
Header: anthropic-version: 2023-06-01
```

#### 端点 1：Token 用量报告

```
GET https://api.anthropic.com/v1/organizations/usage_report/messages
```

| 参数 | 必填 | 说明 |
|------|:----:|------|
| `starting_at` | 是 | ISO 8601 起始时间 |
| `ending_at` | 是 | ISO 8601 结束时间 |
| `bucket_width` | 否 | 聚合粒度：`1m` / `1h` / `1d` |
| `group_by[]` | 否 | 分组维度：`model` / `api_key_id` / `workspace_id` |
| `models[]` | 否 | 按模型过滤 |

返回的 Token 类型：`uncached_input`、`cached_input`、`cache_creation`、`output`

#### 端点 2：费用报告

```
GET https://api.anthropic.com/v1/organizations/cost_report
```

返回按日粒度的 USD 费用明细，支持按 `workspace_id` 和 `description` 分组。

#### 端点 3：Claude Code 专属分析

```
GET https://api.anthropic.com/v1/organizations/usage_report/claude_code
```

返回按用户、按日聚合的 Claude Code 使用指标：

```jsonc
{
  "data": [{
    "date": "2025-09-01T00:00:00Z",
    "actor": { "type": "user_actor", "email_address": "dev@company.com" },
    "core_metrics": {
      "num_sessions": 5,
      "lines_of_code": { "added": 1543, "removed": 892 },
      "commits_by_claude_code": 12
    },
    "model_breakdown": [{
      "model": "claude-opus-4-6",
      "tokens": {
        "input": 100000,
        "output": 35000,
        "cache_read": 10000,
        "cache_creation": 5000
      },
      "estimated_cost": { "currency": "USD", "amount": 1025 }
    }]
  }]
}
```

### 2.3 方案 C：OpenTelemetry 实时监控

Claude Code 支持通过 OpenTelemetry 导出实时遥测数据。

#### 启用方式

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_LOGS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

#### 关键指标

| Metric | 说明 |
|--------|------|
| `claude_code.token.usage` | Token 数量（属性：`type`=input/output/cacheRead/cacheCreation，`model`） |
| `claude_code.cost.usage` | 预估费用 USD |
| `claude_code.session.count` | 会话数 |

#### 关键事件（Logs Protocol）

| Event | 关键属性 |
|-------|---------|
| `claude_code.api_request` | `model`, `cost_usd`, `input_tokens`, `output_tokens`, `duration_ms` |
| `claude_code.tool_result` | `tool_name`, `success`, `duration_ms` |

### 2.4 方案对比

| 方案 | 认证要求 | 数据粒度 | 实时性 | 适用场景 |
|------|---------|---------|--------|---------|
| A. 本地 JSONL | 无 | 每次请求 | 实时（文件写入即可读） | 个人用户首选 |
| B. Admin API | Admin Key（组织） | 按分钟/小时/天 | 延迟 ~5min | 组织管理员 |
| C. OpenTelemetry | 无（本地配置） | 每次请求 | 实时 | 需要监控系统集成 |

---

## 3. GLM Coding Plan (智谱 AI)

智谱 AI 有 3 种数据获取方式，其中**监控 API 是最实用的自动化方案**。

### 3.1 方案 A：监控 API（推荐首选）

智谱 AI 提供了未公开文档但已被多个开源项目验证的监控 API，可查询 Coding Plan 配额和用量。

#### 端点

| 端点 | 国内 | 国际 |
|------|------|------|
| 配额查询 | `https://open.bigmodel.cn/api/monitor/usage/quota/limit` | `https://api.z.ai/api/monitor/usage/quota/limit` |
| 模型用量 | `https://open.bigmodel.cn/api/monitor/usage/model-usage` | `https://api.z.ai/api/monitor/usage/model-usage` |
| 工具用量 | `https://open.bigmodel.cn/api/monitor/usage/tool-usage` | `https://api.z.ai/api/monitor/usage/tool-usage` |

#### 认证

**注意**：Authorization 头**不加** `Bearer` 前缀，直接传 API Key：

```
Authorization: <your-api-key>
Accept-Language: en-US,en
Content-Type: application/json
```

#### 端点 1：配额查询（GET，无参数）

```bash
curl -s "https://open.bigmodel.cn/api/monitor/usage/quota/limit" \
  -H "Authorization: YOUR_API_KEY"
```

响应：

```jsonc
{
  "code": 200,
  "msg": "success",
  "data": {
    "limits": [
      {
        "type": "TOKENS_LIMIT",          // 5 小时滚动 Token 配额
        "usage": 50000000,               // 总配额
        "currentValue": 12345678,        // 已消耗
        "percentage": 24.69,             // 使用率 %
        "nextResetTime": 1740000000000   // 下次重置时间 (Unix ms)
      },
      {
        "type": "TIME_LIMIT",            // 月度 MCP 工具调用配额
        "usage": 1000,                   // 总配额
        "currentValue": 150,             // 已消耗
        "percentage": 15.0
      }
    ]
  },
  "success": true
}
```

| 配额类型 | 说明 | 重置周期 |
|---------|------|---------|
| `TOKENS_LIMIT` | Token 消耗配额 | 5 小时滚动窗口 |
| `TIME_LIMIT` | MCP 工具调用次数（Web 搜索 + 网页阅读） | 每月重置 |

> **z.ai 格式差异**：z.ai 国际版的 `TOKENS_LIMIT` 可能返回多条（用 `unit` 区分窗口类型：`3`=5h, `6`=weekly），且使用 `percentage` 替代 `usage`/`currentValue`。详见 8.5 验证备注。

#### 端点 2：模型用量（GET，带时间范围）

```bash
curl -s "https://open.bigmodel.cn/api/monitor/usage/model-usage?startTime=2026-02-18%2000%3A00%3A00&endTime=2026-02-19%2023%3A59%3A59" \
  -H "Authorization: YOUR_API_KEY"
```

参数：
- `startTime`：URL 编码的日期时间，格式 `yyyy-MM-dd HH:mm:ss`
- `endTime`：同上

返回指定时间范围内各模型的 Token 消耗明细。

#### 端点 3：工具用量（GET，带时间范围）

参数同上，返回 MCP 工具调用统计。

#### 开源参考实现

| 项目 | 说明 |
|------|------|
| [opencode-glm-quota](https://github.com/guyinwonder168/opencode-glm-quota) | 完整的配额查询实现（endpoints.ts + client.ts） |
| [opencode-mystatus](https://github.com/vbgate/opencode-mystatus) | 状态栏插件实现（zhipu.ts） |
| [zai-coding-plugins](https://github.com/zai-org/zai-coding-plugins) | 智谱官方 Claude Code 插件，内含 usage-query skill |

### 3.2 方案 B：API 响应级 Token 数据

每次 GLM API 调用的响应中包含 `usage` 字段（OpenAI 兼容格式）：

#### API 端点

| 场景 | 端点 |
|------|------|
| 国内 | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| 国内 Coding | `https://open.bigmodel.cn/api/coding/paas/v4/chat/completions` |
| 国际 | `https://api.z.ai/api/paas/v4/chat/completions` |

#### 认证方式

**方式一：直接 API Key**

```bash
Authorization: Bearer YOUR_API_KEY
```

**方式二：JWT 签名（增强安全）**

API Key 格式为 `{id}.{secret}`，用 secret 签发 JWT：

```typescript
import jwt from 'jsonwebtoken';

function generateZhipuToken(apiKey: string): string {
  const [id, secret] = apiKey.split('.');
  const now = Date.now();
  const payload = {
    api_key: id,
    exp: now + 3600 * 1000,   // 过期时间（毫秒）
    timestamp: now,
  };
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    header: { alg: 'HS256', sign_type: 'SIGN' },
  });
}
```

#### 响应中的 Usage 结构

```jsonc
{
  "id": "task-id",
  "model": "glm-4.5",
  "choices": [{ "message": { "role": "assistant", "content": "..." } }],
  "usage": {
    "prompt_tokens": 125,
    "completion_tokens": 65,
    "total_tokens": 190,
    "prompt_tokens_details": {
      "cached_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0    // GLM-4.5+ 思维链模型
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `prompt_tokens` | 输入 Token 数 |
| `completion_tokens` | 输出 Token 数 |
| `total_tokens` | 合计 |
| `prompt_tokens_details.cached_tokens` | 缓存命中的 Token 数 |
| `completion_tokens_details.reasoning_tokens` | 推理链 Token 数（部分模型） |

> 注：IDE 插件模式（CodeGeeX / GLM Coding）下无法拦截此数据，仅适用于直接 API 调用场景。

### 3.3 方案 C：控制台手动导出

| 页面 | URL |
|------|-----|
| 财务概览 | `https://open.bigmodel.cn/finance-center/finance/overview` |
| 费用账单 | `https://open.bigmodel.cn/finance/expensebill/list` |
| GLM Coding 用量 | `https://open.bigmodel.cn/usercenter/glm-coding/usage` |
| 账单导出记录 | `https://open.bigmodel.cn/finance/exportrecord` |

可手动下载 CSV/Excel 账单，支持查看最近 6 个月消费记录。

### 3.4 GLM Coding Plan 配额参考

| 计划 | 5 小时 Token 配额 | 周配额 | MCP 月调用数 |
|------|------------------|-------|-------------|
| Lite | ~80-120 prompts | ~400 prompts | 100 |
| Pro | ~400-600 prompts | ~2,000 prompts | 1,000 |
| Max | ~1,600-2,400 prompts | ~8,000 prompts | 4,000 |

> 1 prompt ≈ 1 次提问 ≈ ~15-20 次模型 API 调用。高峰时段（14:00-18:00 UTC+8）GLM-5 消耗倍率更高。

### 3.5 方案对比

| 方案 | 认证要求 | 数据内容 | 自动化程度 | 适用场景 |
|------|---------|---------|-----------|---------|
| A. 监控 API | API Key（无 Bearer） | 配额使用率 + 模型/工具用量 | 全自动，可定时轮询 | **推荐首选** |
| B. API 响应 | API Key（Bearer） | 逐请求 token 数 | 需拦截每次调用 | 直接 API 调用场景 |
| C. 控制台导出 | Web 登录 | 月度账单 CSV | 手动 | 财务对账 |

### 3.6 集成方案

1. **首选**：调用监控 API `/api/monitor/usage/quota/limit` 获取当前配额使用率，定时轮询（如每小时）记录快照
2. **补充**：调用 `/api/monitor/usage/model-usage` 获取指定时间范围内的模型级用量明细
3. **兜底**：从控制台导出 CSV 账单，导入到应用

---

## 4. TRAE Pro Plan (ByteDance)

TRAE **没有公开的用量查询 API**，Token 消耗数据不返回客户端。但可从本地 ai-agent 日志中提取请求级别的活动数据（模型、调用次数、耗时），以及通过内部 API 查询订阅状态。

### 4.1 方案 A：解析本地 ai-agent 日志（推荐首选）

TRAE 的 ai-agent 模块以文本日志记录每次 LLM 调用的详细信息。

#### 存储路径

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/Trae/logs/{session}/Modular/ai-agent_*_stdout.log` |
| Linux | `~/.trae/logs/{session}/Modular/ai-agent_*_stdout.log` |

#### 可提取数据

| 数据类型 | 日志标记 | 包含字段 |
|----------|---------|---------|
| LLM 调用详情 | `TimingCostOriginEvent` | `config_name`（模型名）、`provider_model_name`、`server_processing_time`、`first_sse_event_time`、`middleware_detail` |
| 服务端 Agent 任务 | `create_agent_task, Status: 200` | session_id、task_id、message_id、timestamp |
| Token 消耗（仅本地调用） | `TokenUsageEvent` | prompt_tokens、completion_tokens、total_tokens、reasoning_tokens、cache 相关 |
| 模型配置 | `model_info: CustomModel` | config_name、display_model_name、provider、multimodal |

#### 关键限制

- **主对话的 Token 计数不可用**：TRAE 的 AI 对话通过 `create_agent_task` API 在服务端处理，Token 消耗数据不返回客户端
- **TokenUsageEvent 仅覆盖本地调用**：如 session title 生成（走 `llm_raw_chat`），实际对话的 token 数据无法获取
- **Agent 任务数是最佳代理指标**：`create_agent_task` 的调用次数是衡量实际使用量的最可靠本地数据

#### TimingCostOriginEvent 示例

```
TimingCost: TimingCostOriginEvent { data: "{
  \"config_name\":\"gemini-3-pro\",
  \"provider_model_name\":\"gemini-3-pro-preview\",
  \"server_processing_time\":4080,
  \"first_sse_event_time\":3172,
  \"queue_timing\":1,
  \"is_retry\":false,
  \"middleware_detail\":{\"auth_check\":18,\"fee_check\":15,\"limit_queue\":19}
}" }
```

#### TokenUsageEvent 示例

```
token usage: TokenUsageEvent {
  name: "", prompt_tokens: 402, completion_tokens: 6, total_tokens: 408,
  reasoning_tokens: Some(0), cache_creation_input_tokens: Some(0),
  cache_read_input_tokens: Some(0)
}
```

### 4.2 方案 B：订阅状态 API

TRAE 内部使用 `growsg-normal.trae.ai` 查询付费状态。使用本地存储的 JWT Token 即可调用。

#### 认证信息获取

JWT Token 存储于：`~/Library/Application Support/Trae/User/globalStorage/storage.json`

```typescript
const data = JSON.parse(readFileSync(storagePath, "utf-8"));
const auth = JSON.parse(data["iCubeAuthInfo://icube.cloudide"]);
const jwt = auth.token; // JWT Token
```

#### API 端点

```
GET https://growsg-normal.trae.ai/trae/api/v1/pay/ide_user_pay_status

Headers:
  Authorization: Cloud-IDE-JWT <jwt_token>
  x-ide-token: <jwt_token>
  X-App-Id: 6eefa01c-1036-4c7e-9ca5-d891f63bfcd8
  Content-Type: application/json
```

#### 响应示例

```json
{
  "user_pay_identity": 1,
  "user_pay_identity_str": "Pro",
  "is_dollar_usage_billing": false,
  "has_package": true,
  "enable_solo_coder": true,
  "enable_solo_builder": true,
  "server_time_ms": 1771467566410,
  "trial_status": {
    "is_in_trial": false,
    "is_eligible_for_trial": false,
    "trial_end_time": 1762930058
  }
}
```

### 4.3 其他本地数据源

| 数据源 | 路径 | 状态 |
|--------|------|------|
| ai-agent 数据库 | `ModularData/ai-agent/database.db` | SQLCipher 加密，无法直接读取 |
| 全局状态 | `User/globalStorage/state.vscdb` | SQLite，包含 session 列表、认证信息 |
| 工作区状态 | `User/workspaceStorage/<id>/state.vscdb` | SQLite，包含 ChatStore（UI 状态） |

### 4.4 计费模式变更

TRAE 将于 **2026-02-24** 从请求制转为 Token 计费制（`is_dollar_usage_billing` 将变为 `true`）：

| 计划 | 月费 | 说明 |
|------|------|------|
| Lite | $3/月 | 基础配额 |
| Pro | $10/月 | 600 次 Premium 快速请求 |
| Team | $20/月 | 团队协作 |
| Ultra | $100/月 | 最大配额 |

转为 Token 计费后，`is_dollar_usage_billing` 会变为 `true`，届时可能会有新的用量 API 可用。

### 4.5 集成方案

1. **日志解析（推荐）**：解析 ai-agent 日志，提取 `TimingCostOriginEvent`（调用次数 + 模型名）和 `create_agent_task`（agent 任务数）
2. **订阅状态 API**：调用 `ide_user_pay_status` 获取当前套餐和计费模式
3. **手动记录**：按月记录订阅费用，与自动采集的请求次数交叉参考
4. **自定义模型 Key**：通过 TRAE 的「AI Services」配置自己的 API Key（如 OpenAI / Anthropic），绕过 TRAE 计费，直接从各 Provider 追踪用量

---

## 5. Token Matters 集成架构

### 5.1 数据采集分层

```
┌──────────────────────────────────────────────────────────────┐
│                    Token Matters Web App                      │
├──────────────────────────────────────────────────────────────┤
│                   JSON Import Interface                       │
├────────────┬────────────────────────┬────────────────────────┤
│  Claude    │  GLM Coding            │  TRAE Pro              │
│  Collector │  Collector             │  Collector             │
├────────────┼────────────────────────┼────────────────────────┤
│ • JSONL    │ • 监控 API              │ • 本地 SQLite 解析     │
│   解析     │   (quota/limit)         │ • 手动录入             │
│            │ • 模型用量 API          │                        │
│            │   (model-usage)         │                        │
│ • stats-   │                        │                        │
│   cache    │                        │                        │
│ • Admin    │                        │                        │
│   API      │                        │                        │
│ • OTel     │                        │                        │
└────────────┴────────────────────────┴────────────────────────┘
```

### 5.2 实施阶段

#### Phase 1：手动录入 + JSON 导入（v0.1）

所有 Provider 均通过手动录入或 JSON 文件导入，这是 Web 应用的基础能力。

#### Phase 2：Claude Code 本地数据导入工具（v0.2）

开发 CLI 工具 `token-matters-cli`：

```bash
# 扫描 Claude Code 本地数据，生成可导入的 JSON
npx token-matters-cli collect claude-code --output usage.json

# 将生成的 JSON 导入到 Web 应用（复制到剪贴板或直接上传）
```

实现要点：
- 扫描 `~/.claude/projects/` 目录下所有 JSONL 文件
- 提取 `type: "assistant"` 行的 `message.usage` 数据
- 按日聚合，输出为 Token Matters 的标准导入格式
- 支持增量导入（记录上次导入的最后时间戳）

#### Phase 3：多 Provider 数据采集（v0.3+）

- 支持解析 TRAE 本地 SQLite 数据
- 支持导入 GLM 控制台导出的 CSV
- 如果 Provider 开放 API，则直接对接

### 5.3 标准导入格式

所有 Collector 输出统一的 JSON 格式，供 Web 应用导入：

```typescript
interface ImportPayload {
  version: '1.0';
  exportedAt: string;           // ISO 8601
  provider: string;             // 'claude-code' | 'glm-coding' | 'trae-pro'
  records: ImportRecord[];
}

interface ImportRecord {
  date: string;                 // YYYY-MM-DD
  model?: string;               // 模型名称
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  cost?: number;                // 费用（Provider 货币单位）
  currency?: string;            // USD / CNY
  sessions?: number;            // 会话数
  requests?: number;            // 请求数
  note?: string;
}
```

---

## 6. 费用计算参考

### Claude Code 定价（2026-02 当前）

| 模型 | Input | Output | Cache Write | Cache Read |
|------|-------|--------|-------------|------------|
| claude-opus-4-6 | $15/MTok | $75/MTok | $18.75/MTok | $1.50/MTok |
| claude-sonnet-4-6 | $3/MTok | $15/MTok | $3.75/MTok | $0.30/MTok |
| claude-haiku-4-5 | $0.80/MTok | $4/MTok | $1/MTok | $0.08/MTok |

### GLM 定价（部分模型）

| 模型 | Input | Output |
|------|-------|--------|
| GLM-4.5 | ¥0.05/千 Tokens | ¥0.05/千 Tokens |
| GLM-4-Plus | ¥0.05/千 Tokens | ¥0.05/千 Tokens |
| GLM-4-Flash | 免费 | 免费 |

> 定价可能随时调整，应用中应支持用户自定义单价。

---

## 7. POC 验证：Claude Code 本地数据采集

### 7.1 验证目标

验证方案 A（本地 JSONL 解析）的可行性：能否从 `~/.claude/projects/` 下的 JSONL 文件中准确提取 Token 消耗数据，按日聚合并估算费用。

### 7.2 验证方法

编写 TypeScript 脚本 `poc/claude-code-usage.ts`，执行以下步骤：

1. 递归扫描 `~/.claude/projects/` 下所有 `.jsonl` 文件（含 subagents 子目录）
2. 逐行解析，筛选 `type: "assistant"` 且包含 `message.usage` 的记录
3. 从 `usage` 中提取 `input_tokens`、`output_tokens`、`cache_creation_input_tokens`、`cache_read_input_tokens`
4. 按 `timestamp` 的日期部分（`YYYY-MM-DD`）聚合
5. 根据 `message.model` 字段匹配定价表，按模型 output 占比分摊各类 token 费用
6. 输出帐单式表格和 JSON 两种格式

运行命令：

```bash
npx tsx poc/claude-code-usage.ts --days 7
```

### 7.3 验证结果

**执行环境**：macOS, Claude Code v2.1.47, 2026-02-19

**扫描规模**：364 个 JSONL 文件，解析出 7,270 条 assistant 记录

```
CLAUDE CODE TOKEN USAGE
2026-02-12 — 2026-02-19 (7 days)

DATE          INPUT       OUTPUT     CACHE W     CACHE R      REQS    COST
──────────────────────────────────────────────────────────────────────
2026-02-13     22,270    153,282  8,966,821  195,046,250     3049  $472.53
2026-02-14      6,419      7,273  2,809,578  23,934,674      354   $89.22
2026-02-15        777     19,317  1,073,813  31,034,981      411   $68.15
2026-02-16     31,991     68,990  4,420,155  111,812,224     1876  $255.05
2026-02-17     24,149     25,934  3,816,756  60,253,581      891  $161.56
2026-02-18     67,492     34,750  2,951,491  36,681,836      530  $113.35
2026-02-19     11,509      5,393    433,268  5,591,585       159   $17.09
──────────────────────────────────────────────────────────────────────
TOTAL       164,607    314,939  24,471,882  464,355,131     7270  $1176.95

BY MODEL (output tokens)
──────────────────────────────────────────────────────────────────────
claude-opus-4-6                          309,018
claude-haiku-4-5-20251001                  4,746
claude-sonnet-4-5-20250929                 1,175
```

### 7.4 验证结论

| 验证项 | 结果 |
|--------|------|
| JSONL 文件可正常扫描和解析 | 通过 — 364 个文件全部可读 |
| `type: "assistant"` 过滤有效 | 通过 — 7,270 条有效记录 |
| `usage` 字段结构稳定 | 通过 — 所有记录均包含 4 类 token 字段 |
| 多模型区分 | 通过 — 识别出 opus-4-6、haiku-4-5、sonnet-4-5 三个模型 |
| subagents 目录包含独立会话 | 通过 — 递归扫描覆盖了 subagent JSONL |
| 按日聚合准确性 | 通过 — 7 天数据连续，无遗漏 |
| 费用估算合理性 | 通过 — Cache Read 占比最大（符合 Claude Code 大量上下文缓存的特点） |
| JSON 输出格式可解析 | 通过 — 输出有效 JSON，可被下游程序消费 |

### 7.5 发现与备注

1. **Cache Read 是主要费用来源**：7 天 4.64 亿 cache read tokens，即使单价仅 $1.50/MTok 也构成了费用主体，这与 Claude Code 的工作方式一致（每次请求携带大量项目上下文）
2. **stats-cache.json 粒度不足**：其 `dailyModelTokens` 只记录 output tokens by model，无法获取 input/cache 明细。完整数据必须从 JSONL 解析
3. **stats-cache.json 存在延迟**：`lastComputedDate` 停留在 2026-02-16，2 月 17-19 日的数据只能从 JSONL 获取
4. **存在 `<synthetic>` 模型标记**：少量记录的 model 字段为 `<synthetic>`（output_tokens=0），为 Claude Code 内部系统消息，不影响统计
5. **性能可接受**：扫描 364 个文件（含大文件）耗时约 10 秒，对于 CLI 工具可接受；Web 导入场景下应输出 JSON 文件后上传

### 7.6 POC 脚本位置

```
poc/claude-code-usage.ts
```

用法：

```bash
npx tsx poc/claude-code-usage.ts           # 默认最近 7 天
npx tsx poc/claude-code-usage.ts --days 30 # 最近 30 天
npx tsx poc/claude-code-usage.ts --json    # JSON 输出（用于导入）
```

---

## 8. POC 验证：GLM Coding Plan 监控 API 采集

### 8.1 验证目标

验证方案 A（监控 API）的可行性：能否通过 `/api/monitor/usage/` 端点获取 GLM Coding Plan 的配额状态和历史用量数据。

### 8.2 验证方法

编写 TypeScript 脚本 `poc/glm-coding-usage.ts`，执行以下步骤：

1. 并行请求三个监控端点：`quota/limit`、`model-usage`、`tool-usage`
2. 解析 `quota/limit` 返回的配额状态（Token 5h 窗口、周配额、月度 MCP 调用）
3. 解析 `model-usage` 返回的小时级时序数据（`x_time`、`modelCallCount`、`tokensUsage`）
4. 将小时数据聚合为日粒度
5. 输出帐单式表格和 JSON 两种格式

运行命令：

```bash
GLM_API_KEY=your_key GLM_BASE_URL=https://api.z.ai npx tsx poc/glm-coding-usage.ts --days 7
```

### 8.3 验证结果

**执行环境**：macOS, z.ai 国际版, Max Plan, 2026-02-19

```
GLM CODING PLAN USAGE
2026-02-12 — 2026-02-19 (7 days)
Plan: MAX  |  Source: https://api.z.ai

CURRENT QUOTA
──────────────────────────────────────────────────────────────────────
TYPE                         USED         TOTAL    USAGE%     RESETS
──────────────────────────────────────────────────────────────────────
Token (5h window)               0           --      0.0%     --
Token (weekly)                 15           --     15.0%   Feb 22, 13:49
MCP calls (monthly)             0        4,000      0.0%   Mar 15, 13:49

DAILY USAGE
──────────────────────────────────────────────────────────────────────
DATE            CALLS         TOKENS      SEARCH    WEB READ
──────────────────────────────────────────────────────────────────────
2026-02-14         87      6,189,091          0          0
2026-02-15      1,702    116,497,708          0          0
2026-02-16        258     12,800,110          0          0
2026-02-17        259     15,725,783          0          0
2026-02-18         50        966,346          0          0
──────────────────────────────────────────────────────────────────────
TOTAL         2,356    152,179,038          0          0

SUMMARY (from API)
──────────────────────────────────────────────────────────────────────
Total model calls:    2,356
Total tokens:         152,179,038
```

### 8.4 验证结论

| 验证项 | 结果 |
|--------|------|
| `quota/limit` 端点可访问 | 通过 — 返回 code=200，包含 3 种配额类型 |
| `model-usage` 端点可访问 | 通过 — 返回按小时的时序数据，7 天共 179 个数据点 |
| `tool-usage` 端点可访问 | 通过 — 返回 search/webRead/zread 三类工具调用时序 |
| z.ai 国际版兼容性 | 通过 — 与 open.bigmodel.cn 使用相同 API 路径 |
| API Key 认证（无 Bearer） | 通过 — 直接传 Key 即可，加 Bearer 反而会报错 |
| 小时数据按日聚合准确 | 通过 — 本地聚合结果与 API `totalUsage` 一致（2,356 calls / 152M tokens） |
| 配额多窗口结构 | 通过 — 识别出 5h / weekly / monthly 三种配额窗口 |
| JSON 输出格式可解析 | 通过 — 输出有效 JSON，含 quota + daily + totalUsage |

### 8.5 发现与备注

1. **z.ai 响应格式与 open.bigmodel.cn 有差异**：`TOKENS_LIMIT` 条目使用 `unit`/`number` 字段而非 `usage`/`currentValue`，`unit=3` 表示 5 小时窗口，`unit=6` 表示周配额
2. **配额值含义不同**：5h 和 weekly 的 `percentage` 是使用率百分比但无 `usage`/`currentValue` 数值（仅 MCP 的 `TIME_LIMIT` 有明确的已用/总量）
3. **plan level 字段**：响应中包含 `level: "max"` 字段，可用于识别用户套餐
4. **model-usage 是聚合数据**：API 返回的 `tokensUsage` 是 input+output 合计，不区分输入/输出 token（与 Claude Code 的精细拆分不同）
5. **MCP 工具未使用**：7 天内所有 search/webRead/zread 调用均为 null，但 API 结构完整，说明 MCP 追踪功能正常
6. **无模型级别拆分**：`model-usage` 不区分具体模型（如 GLM-4.5 vs GLM-5），只有总量时序
7. **空小时数据用 null 表示**：无活动的时段为 `null`（非 `0`），聚合时需处理

### 8.6 POC 脚本位置

```
poc/glm-coding-usage.ts
```

用法：

```bash
# 国际版 (z.ai)
GLM_API_KEY=your_key GLM_BASE_URL=https://api.z.ai npx tsx poc/glm-coding-usage.ts

# 国内版 (open.bigmodel.cn)
GLM_API_KEY=your_key npx tsx poc/glm-coding-usage.ts

# 指定天数 / JSON 输出
GLM_API_KEY=your_key GLM_BASE_URL=https://api.z.ai npx tsx poc/glm-coding-usage.ts --days 30
GLM_API_KEY=your_key GLM_BASE_URL=https://api.z.ai npx tsx poc/glm-coding-usage.ts --json
```

---

## 9. POC 验证：TRAE Pro Plan 本地日志采集

### 9.1 验证目标

验证方案 A（本地日志解析）和方案 B（订阅状态 API）的可行性：能否从 TRAE 本地日志中提取有意义的使用数据，以及能否通过 API 查询订阅状态。

### 9.2 探索过程

#### 尝试过的路径

| 路径 | 结果 |
|------|------|
| `ModularData/ai-agent/database.db` | SQLCipher 加密，sqlite3 无法读取 |
| `User/globalStorage/state.vscdb` | SQLite 可读，但只有 session 列表和认证信息，无 token 数据 |
| `User/workspaceStorage/*/state.vscdb` | SQLite 可读，ChatStore 只有 UI 状态，无 token 数据 |
| TRAE API 端点探测（20+ 端点） | `coresg-normal.trae.ai` 上未发现 usage/quota 端点；`api-sg-central.trae.ai` 返回 403 (Api Scope Forbidden) |
| ai-agent stdout 日志 | 发现 `TimingCostOriginEvent`、`TokenUsageEvent`、`create_agent_task` 数据 |
| `growsg-normal.trae.ai` 支付 API | 发现 `ide_user_pay_status` 端点可用，返回订阅状态 |

### 9.3 验证方法

编写 TypeScript 脚本 `poc/trae-usage.ts`，执行以下步骤：

1. 读取 `storage.json` 获取 JWT Token 和用户信息
2. 调用 `ide_user_pay_status` API 获取当前订阅状态
3. 扫描所有 ai-agent 日志文件，使用正则解析四类数据：
   - `TimingCostOriginEvent`：解析 JSON 获取模型名、`server_processing_time`、`first_sse_event_time`
   - `body_len`：HTTP 请求体大小（字节），区分 `create_agent_task` 和 `commit_toolcall_result`
   - `TokenUsageEvent`：解析 Rust 结构体格式获取真实 token 计数（仅本地调用有此数据）
   - `create_agent_task, Status: 200`：提取 session/task/message ID
4. **Token 估算**：由于 TRAE 不返回 token 计数，使用以下公式从日志数据反推：
   - `output_tokens = (server_processing_time − first_sse_event_time) / 1000 × 100 tok/s`
   - `input_tokens = body_len × 0.5 / 4 bytes/tok`
   - 异常值处理：generation_time > 60,000ms 的条目用 p95 值替代
5. 按日聚合，输出帐单式表格（含估算 token 列）和 JSON 两种格式

运行命令：

```bash
npx tsx poc/trae-usage.ts
npx tsx poc/trae-usage.ts --days 30
npx tsx poc/trae-usage.ts --json
```

### 9.4 验证结果

**执行环境**：macOS, TRAE 3.5.32, Pro Plan, SG Region, 2026-02-19

```
TRAE PRO PLAN USAGE
2026-02-12 — 2026-02-19 (7 days)
Plan: PRO  |  Billing: subscription

DAILY USAGE
──────────────────────────────────────────────────────────────────────────────
DATE          TASKS   LLM CALLS    ~INPUT     ~OUTPUT      ~TOTAL    AVG MS
──────────────────────────────────────────────────────────────────────────────
2026-02-12      4         72     47,336      9,980      57,316   12,624
2026-02-13     18         90    147,085     11,064     158,149    4,308
──────────────────────────────────────────────────────────────────────────────
TOTAL        22        162    194,421     21,044     215,465

BY MODEL (LLM call count)
──────────────────────────────────────────────────────────────────────────────
gemini-3-pro                             162

ACTUAL TOKEN (local calls only, e.g. title generation)
──────────────────────────────────────────────────────────────────────────────
Events: 2  |  Total: 829 tokens

ESTIMATION METHOD
──────────────────────────────────────────────────────────────────────────────
Output = (server_processing_time − first_sse_event_time) / 1000 × 100 tok/s
Input  = body_len × 0.5 / 4 bytes/tok
Outliers (generation > 60,000ms): 1 replaced with p95 = 3,020ms

META
──────────────────────────────────────────────────────────────────────────────
Log files scanned:    5
Unique sessions:      2
Body entries parsed:  92
User ID:              7570984098324661265
```

### 9.5 Token 估算算法

TRAE 不返回 token 计数（服务端处理），但 ai-agent 日志中有请求耗时和 body 大小，可用于反推估算。

#### 估算公式

| 方向 | 公式 | 说明 |
|------|------|------|
| Output | `(server_processing_time − first_sse_event_time) / 1000 × outputTokenRate` | 两个时间之差 ≈ 模型实际生成 output 的时间 |
| Input | `body_len × bodyContentRatio / bytesPerToken` | HTTP 请求体中实际 prompt 内容的 token 换算 |

#### 参数配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `outputTokenRate` | 100 tok/s | Gemini-3-Pro 输出速率（范围 80~150，取中值） |
| `bodyContentRatio` | 0.5 | HTTP body 中实际 prompt 文本占比（JSON 结构/元数据开销约 50%） |
| `bytesPerToken` | 4 bytes/tok | 每个 token 对应的平均字节数（英文/代码 ≈ 4，中文 ≈ 3） |
| `outlierThresholdMs` | 60,000 ms | generation_time 异常值阈值，超过时用 p95 替代 |

#### 异常值处理

单条 generation_time 可能因 agent 多轮循环或网络卡顿远超正常值（如 588,000ms）。超过阈值的条目用同批数据的 p95 值替代，避免单条异常拉高总量。

#### 估算精度说明

此方法为**量级估算**（order-of-magnitude），适用于 Token Matters 中横向比较各 Provider 消耗量。不适合用于精确计费。精度受以下因素影响：

- 模型输出速率波动（受 GPU 负载、批量大小影响）
- body 中 prompt 内容比例因消息长短而异
- 中文内容的 bytes/token 比率低于英文

### 9.6 验证结论

| 验证项 | 结果 |
|--------|------|
| ai-agent 日志可解析 | 通过 — 5 个日志文件均可读取，正则匹配有效 |
| TimingCostOriginEvent 提取 | 通过 — 提取 162 条记录，含模型名和耗时数据 |
| body_len 提取 | 通过 — 提取 92 条 HTTP body 大小记录 |
| create_agent_task 提取 | 通过 — 提取 22 条 Agent 任务记录 |
| TokenUsageEvent 提取 | 通过 — 提取 2 条记录（仅 session title 生成） |
| Token 估算输出 | 通过 — 22 tasks / 162 calls → ~194K input + ~21K output = **~215K 总 tokens** |
| 异常值处理 | 通过 — 1 条 >60s 的记录被 p95 (3,020ms) 替代 |
| 订阅状态 API 可调用 | 通过 — 返回 plan=Pro, subscription 计费 |
| JWT Token 自动获取 | 通过 — 从 storage.json 读取 |
| 主对话真实 Token 计数 | 不可用 — 服务端处理，只能通过估算获得近似值 |
| 加密数据库读取 | 不可用 — database.db 使用 SQLCipher |

### 9.7 发现与备注

1. **Token 估算是唯一可行的量化方案**：TRAE 通过 `create_agent_task` API 将对话交由服务端处理，Token 消耗不返回客户端。通过 timing + body_len 反推是当前唯一可行的本地估算方式
2. **三个 Provider 数据精度对比**：Claude Code 提供精确 token 数据，GLM 通过监控 API 提供聚合数据，TRAE 只能通过估算获得近似值。在 Token Matters 中需标注数据来源和精度级别
3. **当前使用 Gemini-3-Pro**：所有 162 次调用均为 `gemini-3-pro`（SG 区域默认），估算参数需按模型调整
4. **计费模式即将变更**：`is_dollar_usage_billing: false` 表明当前仍为订阅制。2026-02-24 后转为 Token 计费，届时可能出现新的用量 API，届时可替代估算方案
5. **JWT Token 有过期时间**：当前 Token 到 2026-02-26 过期（refresh token 到 2026-08-11），生产环境需处理 Token 刷新
6. **日志仅保留近期数据**：logs 目录覆盖约 5 天的 session，长期追踪需定期采集

### 9.7 POC 脚本位置

```
poc/trae-usage.ts
```

用法：

```bash
# 默认 7 天
npx tsx poc/trae-usage.ts

# 指定天数
npx tsx poc/trae-usage.ts --days 30

# JSON 输出
npx tsx poc/trae-usage.ts --json
```
