# Token Matters — Collector 设计文档

> 版本: v0.2.0 | 最后更新: 2026-02-19

## 1. 概述

Collector 是运行在开发机上的 TypeScript CLI 程序，定时采集各 Provider 的 Token 使用数据，写入本地 clone 的数据仓库（`token-matters-data`）并推送到 GitHub。

核心职责：
- 从各 AI 产品的本地文件或 API 中提取 Token 消耗数据
- 转换为统一的 `RawDataFile` 格式（参见 `architecture.md` 第 2.4 章）
- 写入 `raw/{machine}/{provider}/{date}_{hash}.json`
- 通过 `git push` 将数据同步到 GitHub

---

## 2. 程序结构

### 2.1 目录结构

```
collector/
├── src/
│   ├── main.ts                    # CLI 入口
│   ├── config.ts                  # 配置加载（~/.token-matters/config.yaml）
│   ├── state.ts                   # 增量状态管理（~/.token-matters/state.json）
│   ├── git.ts                     # Git 操作（add / commit / push / pull --rebase）
│   ├── hash.ts                    # Content hash 计算
│   ├── providers/
│   │   ├── types.ts               # CollectorProvider 接口定义
│   │   ├── claude-code.ts         # Claude Code Provider
│   │   ├── claude-code-parser.ts  # JSONL 解析/聚合纯函数
│   │   ├── glm-coding.ts          # GLM Coding Provider
│   │   ├── glm-coding-parser.ts   # GLM API 响应解析
│   │   ├── trae-pro.ts            # TRAE Pro Provider
│   │   └── trae-pro-parser.ts     # TRAE 日志解析 + Token 估算
│   └── utils/
│       ├── date.ts                # 日期/时区工具
│       └── logger.ts              # 日志输出
├── package.json
└── tsconfig.json
```

### 2.2 CLI 入口

```bash
# 采集所有启用的 Provider（默认 today）
npx tsx collector/src/main.ts

# 采集指定日期
npx tsx collector/src/main.ts --date 2026-02-18

# 采集指定日期范围（回填历史数据）
npx tsx collector/src/main.ts --from 2026-02-01 --to 2026-02-18

# 仅采集指定 Provider
npx tsx collector/src/main.ts --provider claude-code

# 干跑模式（不写入文件、不 git push）
npx tsx collector/src/main.ts --dry-run

# 显示当前配置和 Provider 状态
npx tsx collector/src/main.ts --status
```

---

## 3. Provider 接口

### 3.1 接口定义

```typescript
interface CollectorProvider {
  readonly name: string;                    // 'claude-code' | 'glm-coding' | 'trae-pro'
  readonly dataQuality: DataQuality;
  isAvailable(): Promise<boolean>;          // 检查数据源是否存在
  collect(date: string): Promise<RawDataFile>;
}
```

### 3.2 各 Provider 采集方式

| Provider | 数据源 | 采集方式 | 数据精度 | 认证 |
|----------|--------|---------|:--------:|------|
| Claude Code | `~/.claude/projects/**/*.jsonl` | 本地 JSONL 解析 | exact | 无需 |
| GLM Coding | `open.bigmodel.cn` 或 `api.z.ai` | 监控 API HTTP 调用 | partial | API Key |
| TRAE Pro | `~/Library/Application Support/Trae/logs/` | 本地日志解析 + Token 估算 | estimated | 无需（JWT 自动读取） |

> 各 Provider 的具体技术细节（API 端点、数据格式、认证方式、POC 验证结果）参见 `data-integration.md`。

---

## 4. 采集流程

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ 1. 读取   │ ──▶ │ 2. 采集   │ ──▶ │ 3. 写入   │ ──▶ │ 4. 去重   │ ──▶ │ 5. 推送   │
│    配置   │     │    各     │     │    raw/   │     │    检查   │     │    git   │
│           │     │  Provider │     │    JSON   │     │          │     │   push   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
```

1. **读取配置**：加载 `~/.token-matters/config.yaml`，确定启用的 Provider 和参数
2. **采集**：依次调用每个 Provider 的 `collect(date)`，任一 Provider 失败不影响其余
3. **写入**：生成 `raw/{machine}/{provider}/{date}_{hash}.json`
4. **去重**：检查是否已存在相同 hash 的文件，如已存在则跳过
5. **推送**：`git add raw/ && git commit && git push`

---

## 5. 增量采集策略

避免重复解析已处理的数据，Collector 维护本地状态文件 `~/.token-matters/state.json`：

```typescript
interface CollectorState {
  lastRun: string;                          // ISO 8601
  providers: {
    [name: string]: {
      lastCollectedDate: string;            // 上次采集的日期
      checkpoint?: string;                  // Provider 特定的断点信息
    };
  };
}
```

| Provider | 增量策略 |
|----------|---------|
| Claude Code | 记录上次处理的最新 `timestamp`，仅解析之后的 JSONL 行 |
| GLM Coding | 以 `lastCollectedDate` 作为 API 的 `startTime` 参数 |
| TRAE Pro | 记录已处理的日志文件路径 + 字节偏移量 |

---

## 6. 去重

| 层级 | 机制 | 说明 |
|------|------|------|
| 文件级 | content hash 文件名 | 相同内容产生相同 hash，跳过重复写入 |
| 目录级 | `raw/{machine}/{provider}/` 隔离 | 不同机器写入不同目录，无 Git 冲突 |
| 聚合级 | Summary 按 `(provider, date, machine)` 合并 | 同一 key 多个文件时取最新 `collectedAt` |

> 去重的完整设计参见 `architecture.md` 第 4 章。

---

## 7. 定时调度

### macOS launchd（每日 00:30 执行）✅ 已部署验证

plist 路径：`~/Library/LaunchAgents/com.token-matters.collector.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.token-matters.collector</string>

  <key>ProgramArguments</key>
  <array>
    <string>/path/to/.nvm/versions/node/vXX/bin/npx</string>
    <string>tsx</string>
    <string>/path/to/token-matters/collector/src/main.ts</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/path/to/token-matters/collector</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/path/to/.nvm/versions/node/vXX/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>/Users/yourname</string>
  </dict>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>0</integer>
    <key>Minute</key>
    <integer>30</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>/tmp/token-matters-collector.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/token-matters-collector.log</string>
</dict>
</plist>
```

> **注意**：launchd 不加载 shell profile，必须在 plist 中显式设置 `PATH`（包含 node/npx 所在目录）和 `HOME`。

常用命令：

```bash
# 加载（开机自动生效）
launchctl load ~/Library/LaunchAgents/com.token-matters.collector.plist

# 手动触发一次
launchctl start com.token-matters.collector

# 查看状态
launchctl list | grep token-matters

# 卸载
launchctl unload ~/Library/LaunchAgents/com.token-matters.collector.plist

# 查看日志
cat /tmp/token-matters-collector.log
```

### Linux cron

```
30 0 * * * cd /path/to/token-matters/collector && npx tsx src/main.ts >> /tmp/token-matters-collector.log 2>&1
```

---

## 8. 配置文件

路径：`~/.token-matters/config.yaml`

```yaml
# machine: my-host                            # 可选，默认从 hostname 自动推导（去 .local、小写、kebab-case）
dataRepo: ~/projects/token-matters-data       # 数据仓库本地 clone 路径
timezone: Asia/Shanghai                       # 日期聚合时区

providers:
  claude-code:
    enabled: true
    claudeDir: ~/.claude                      # Claude Code 数据目录

  glm-coding:
    enabled: true
    apiKey: ${GLM_API_KEY}                    # 支持环境变量引用
    baseUrl: https://api.z.ai                 # 国际版；国内版用 https://open.bigmodel.cn

  trae-pro:
    enabled: true
    traeDir: ~/Library/Application Support/Trae
    estimation:                               # Token 估算参数（参见 data-integration.md 9.5）
      outputTokenRate: 100                    # tok/s
      bodyContentRatio: 0.5
      bytesPerToken: 4
      outlierThresholdMs: 60000
```

---

## 9. 认证与安全

| 凭证 | 存储位置 | 说明 |
|------|---------|------|
| GitHub SSH Key | `~/.ssh/` | 推送数据仓库，使用开发机已有的 SSH 配置 |
| GLM API Key | `~/.token-matters/config.yaml` 或 `$GLM_API_KEY` | 调用监控 API |
| TRAE JWT | TRAE 本地 `storage.json` | 自动读取，无需额外配置 |

> 数据仓库为 Private，防止个人使用数据泄露。`config.yaml` 应加入 `.gitignore`。
