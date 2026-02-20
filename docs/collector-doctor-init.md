# Token Matters — Collector Doctor & Init 设计文档

> 版本: v0.1.0 | 最后更新: 2026-02-20

## 1. 概述

本文档描述 Collector 的两个新 CLI 功能：

- **`pnpm collect --doctor [--fix]`**：诊断当前机器的 Collector 运行环境，检查依赖、配置、数据仓库、Provider 数据源等是否就绪，并可选自动修复常见问题。
- **`pnpm collect --init`**：交互式引导新机器完成首次配置，生成 `~/.token-matters/config.yaml` 并验证环境。

---

## 2. CLI 入口

```bash
pnpm collect --doctor          # 运行诊断
pnpm collect --doctor --fix    # 运行诊断 + 自动修复
pnpm doctor                    # 快捷方式（package.json script）

pnpm collect --init            # 交互式初始化
```

### 2.1 main.ts 改动

1. `CliArgs` 新增 `doctor: boolean`、`fix: boolean`、`init: boolean`（默认 `false`）
2. `parseArgs()` switch 新增 `--doctor`、`--fix`、`--init` 三个 case
3. 校验：`--fix` 必须搭配 `--doctor`，否则报错退出
4. `main()` 开头（配置加载之前）插入：

```typescript
if (args.doctor) {
  const { runDoctor } = await import('./doctor.js');
  await runDoctor(args.fix);
  return;
}

if (args.init) {
  const { runInit } = await import('./init.js');
  await runInit();
  return;
}
```

> 使用动态 `import()` 避免影响正常采集的启动速度。

### 2.2 package.json 新增 script

```json
{
  "scripts": {
    "doctor": "tsx src/main.ts --doctor"
  }
}
```

---

## 3. Doctor 功能

### 3.1 新增文件

| 文件 | 职责 |
|------|------|
| `collector/src/doctor.ts` | 编排器：按顺序运行各类检查，渲染输出 |
| `collector/src/doctor/types.ts` | `CheckResult`、`CheckGroup`、`DoctorSummary`、`KNOWN_PROVIDERS` |
| `collector/src/doctor/config-checks.ts` | 配置目录 / 文件 / YAML / 字段校验 |
| `collector/src/doctor/repo-checks.ts` | 数据仓库 git 状态、`raw/` 目录 |
| `collector/src/doctor/provider-checks.ts` | 各 Provider 路径 / 数据源 / 连通性 |
| `collector/src/doctor/state-checks.ts` | `state.json` 校验、过期条目清理 |
| `collector/src/doctor/dependency-checks.ts` | git、better-sqlite3 可用性 |
| `collector/src/doctor/formatter.ts` | 彩色终端输出（✓ / ⚠ / ✗ / ✦） |
| `collector/test/unit/doctor.test.ts` | 所有检查的单元测试 |

### 3.2 需修改的文件

| 文件 | 改动 |
|------|------|
| `collector/src/main.ts` | `CliArgs` 加 `doctor` / `fix`；`parseArgs()` 加 case；`main()` 加 doctor 分支（动态 import） |
| `collector/test/unit/main.test.ts` | 新增 `--doctor` / `--fix` 解析测试 |
| `collector/package.json` | 加 `"doctor"` script |

### 3.3 类型定义（doctor/types.ts）

```typescript
type CheckSeverity = 'pass' | 'warn' | 'fail';

interface CheckResult {
  label: string;
  severity: CheckSeverity;
  message?: string;       // 详情
  fixable?: boolean;      // 是否可 --fix
  fixed?: boolean;        // 是否已修复
}

interface CheckGroup {
  name: string;
  checks: CheckResult[];
}

interface DoctorSummary {
  passed: number;
  warnings: number;
  failures: number;
  fixed: number;
}

const KNOWN_PROVIDERS = ['claude-code', 'codex', 'opencode', 'glm-coding', 'trae-pro'] as const;
```

---

### 3.4 检查项

#### 3.4.1 Dependencies（最基础，最先执行）

| 检查项 | Pass 条件 | 失败等级 |
|--------|----------|:--------:|
| git 可用 | `git --version` 成功，输出版本号 | fail |
| better-sqlite3 原生绑定 | `new Database(':memory:')` 成功 | fail |

#### 3.4.2 Config

| 检查项 | Pass 条件 | 失败等级 | 可修复 |
|--------|----------|:--------:|:------:|
| 配置目录存在 | `~/.token-matters/` 存在 | fail | ✦ 创建目录 |
| 配置文件存在可读 | `config.yaml` 存在 | fail | ✦ 创建模板 |
| YAML 语法合法 | `parseYaml()` 无异常 | fail | |
| `dataRepo` 字段 | 非空字符串 | fail | |
| `dataRepo` 路径存在 | `existsSync(expandHome(...))` | fail | |
| `timezone` 合法 | `Intl.DateTimeFormat` 无异常 | warn | |
| `machine` 名格式 | `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/` | warn | |
| 无未知 Provider | 与 `KNOWN_PROVIDERS` 对比 | warn | |

> YAML 解析失败时短路（跳过后续检查）。配置加载失败时跳过 Repo + Provider 组。

`--fix` 创建的模板内容：

```yaml
# token-matters collector configuration
# dataRepo: ~/path/to/your/data-repo
dataRepo: ""
timezone: Asia/Shanghai
providers: {}
```

#### 3.4.3 Data Repo

| 检查项 | Pass 条件 | 失败等级 | 可修复 |
|--------|----------|:--------:|:------:|
| 目录存在且可访问 | `existsSync` + `isDirectory` | fail | |
| 是 git 仓库 | `.git/` 存在 | fail | |
| `raw/` 子目录存在 | `existsSync` | warn | ✦ 创建 |
| git remote 已配置 | `git remote -v` 有输出 | warn | |
| `raw/` 无未提交更改 | `git status --porcelain -- raw/` 为空 | warn | |

#### 3.4.4 Providers（对每个已启用的 Provider）

复用 `main.ts` `buildProviders()` 中的路径解析逻辑（`expandHome` + `default*Dir`）。

| Provider | 检查项 |
|----------|--------|
| claude-code | `projects/` 存在；`.jsonl` 文件数量 |
| codex | `sessions/` 存在；日期子目录数量 |
| opencode | `opencode.db` 存在；可只读打开；有 `session` + `message` 表 |
| glm-coding | `apiKey` 非空；`fetch(baseUrl, HEAD, timeout=5s)` 连通性 |
| trae-pro | `logs/` 存在；扫描 `*/Modular/ai-agent_*_stdout.log` |

未启用的 Provider 显示为：`- {name} -- disabled`

#### 3.4.5 State

| 检查项 | Pass 条件 | 失败等级 | 可修复 |
|--------|----------|:--------:|:------:|
| `state.json` 存在且合法 | 可读 + `JSON.parse()` 成功 | warn | ✦ 创建默认 / 从 backup 恢复 |
| 无过期 Provider 条目 | 所有 state key 都在已启用 Provider 列表中 | warn | ✦ 删除过期条目 |

---

### 3.5 编排流程（doctor.ts）

```
1. 打印标题 "token-matters collector doctor"
2. runDependencyChecks()    → printGroup
3. runConfigChecks(configDir, configPath, fix)  → printGroup
4. 尝试 loadConfig() — 失败则跳过 repo + provider
5. runRepoChecks(config.dataRepo, fix)          → printGroup
6. runProviderChecks(config)                     → printGroup
7. runStateChecks(statePath, enabledProviders, fix) → printGroup
8. computeSummary()         → printSummary()
9. failures > 0 → process.exitCode = 1
```

---

### 3.6 输出格式示例

图标约定：

| 图标 | 颜色 | 含义 |
|:----:|------|------|
| ✓ | 绿色 | 通过 |
| ⚠ | 黄色 | 警告 |
| ✗ | 红色 | 失败 |
| ✦ | 青色 | 已修复 |
| `-` | 灰色 | 已禁用 |

可修复但未修复的项附加灰色提示：`(fixable with --fix)`

```
token-matters collector doctor

Dependencies
  ✓ git -- version 2.44.0
  ✓ better-sqlite3 native bindings

Config
  ✓ Config directory (~/.token-matters/)
  ✓ Config file readable
  ✓ Valid YAML syntax
  ✓ dataRepo: ~/projects/token-matters-data
  ✓ Timezone: Asia/Shanghai
  ✓ Machine: j-studio

Data Repo
  ✓ Directory exists
  ✓ Is a git repository
  ✓ Has raw/ subdirectory
  ✓ Git remote configured (origin)

Providers
  ✓ claude-code -- ~/.claude/projects (42 .jsonl files)
  ✗ codex -- ~/.codex/sessions not found
  - opencode -- disabled
  ✓ glm-coding -- API reachable
  ✓ trae-pro -- 3 log files found

State
  ✓ State file valid
  ⚠ Stale entry: old-provider (fixable with --fix)

--- Summary ---
  12 passed, 1 warning, 1 failure
```

---

### 3.7 复用与集成

| 已有模块 | 复用方式 |
|---------|---------|
| `config.ts` `loadConfig()` | Doctor 内部调用，失败时报告并跳过后续 |
| `utils/paths.ts` `expandHome()`、`default*Dir()` | Provider 路径解析 |
| `yaml` 包 | 配置 YAML 解析 |
| `better-sqlite3` | opencode DB 验证 |
| `providers/types.ts` `CollectorConfig` | 类型引用 |

> Doctor 不复用 `logger.ts`（输出格式不同），不复用 `git.ts`（错误处理语义不同）。Repo 检查使用本地 `execCommand()` 辅助函数（10s 超时）。

---

## 4. Init 功能

`--init` 提供交互式引导，帮助新机器从零完成 Collector 首次配置。

### 4.1 新增文件

| 文件 | 职责 |
|------|------|
| `collector/src/init.ts` | 交互式初始化流程 |
| `collector/test/unit/init.test.ts` | 初始化逻辑测试 |

### 4.2 交互流程

```
pnpm collect --init

token-matters collector init

Step 1/4: 数据仓库
  ? 数据仓库路径 (token-matters-data 的本地 clone):
  > ~/projects/token-matters-data
  ✓ 已验证: git 仓库，remote = origin

Step 2/4: 时区
  ? 时区 [Asia/Shanghai]:
  > (回车使用默认)
  ✓ Asia/Shanghai

Step 3/4: Providers
  检测到以下可用数据源:
  [✓] claude-code  -- ~/.claude/projects (42 .jsonl files)
  [ ] codex        -- ~/.codex/sessions not found
  [ ] opencode     -- opencode.db not found
  [?] glm-coding   -- 需要 API Key
  [✓] trae-pro     -- 3 log files found

  ? 启用 glm-coding? (y/N): y
  ? GLM API Key: sk-***
  ? GLM Base URL [https://api.z.ai]:
  > (回车使用默认)
  ✓ API 连通性验证通过

Step 4/4: 写入配置
  ✓ 已创建 ~/.token-matters/config.yaml
  ✓ 已创建 ~/.token-matters/state.json

--- 完成 ---
  配置文件: ~/.token-matters/config.yaml
  已启用 Provider: claude-code, glm-coding, trae-pro

  下一步:
    pnpm collect --doctor    # 验证完整环境
    pnpm collect --dry-run   # 试运行（不写入、不推送）
    pnpm collect             # 正式采集
```

### 4.3 详细步骤

#### Step 1: 数据仓库

1. 提示输入 `dataRepo` 路径
2. 验证路径存在、是目录、是 git 仓库
3. 检查 `raw/` 子目录，不存在则创建
4. 显示 git remote 信息

#### Step 2: 时区

1. 提示输入时区，默认 `Asia/Shanghai`
2. 通过 `Intl.DateTimeFormat` 验证合法性
3. 无效时提示重新输入

#### Step 3: Providers

1. 自动扫描本机可用数据源（复用 Doctor 的 Provider 检查逻辑）
2. 自动检测到的 Provider 默认启用
3. 需要凭证的 Provider（如 glm-coding）交互式输入
4. 输入凭证后立即验证连通性
5. 每个 Provider 显示检测结果

#### Step 4: 写入配置

1. 生成 `~/.token-matters/config.yaml`
2. 初始化 `~/.token-matters/state.json`（空状态）
3. 显示配置摘要和后续步骤

### 4.4 边界情况

| 场景 | 处理方式 |
|------|---------|
| `~/.token-matters/config.yaml` 已存在 | 提示是否覆盖，默认否；选择覆盖前备份为 `config.yaml.bak` |
| `dataRepo` 路径不存在 | 报错并提示先 `git clone` 数据仓库 |
| 无任何可用 Provider | 警告但仍生成配置，提示后续安装 Provider 后重新运行 `--init` 或手动编辑配置 |
| Ctrl+C 中断 | 未写入任何文件，无副作用 |

---

## 5. 测试计划

### 5.1 Doctor 测试（test/unit/doctor.test.ts）

使用 `mkdtempSync` 创建隔离临时目录，按检查模块组织 describe 块：

- **config-checks**：目录 / 文件缺失及 fix 创建、无效 YAML、缺失 `dataRepo`、无效 `timezone`、未知 Provider
- **repo-checks**：合法 git 仓库、非 git 目录、`raw/` 缺失及 fix 创建、无 remote
- **provider-checks**：各 Provider 路径存在 / 缺失、opencode DB 合法 / 损坏 / 缺表、disabled 状态
- **state-checks**：合法 state、缺失时创建、JSON 损坏修复、过期条目清理
- **dependency-checks**：git 可用、better-sqlite3 可用
- **formatter**：summary 计算

### 5.2 Init 测试（test/unit/init.test.ts）

- 正常流程完整运行（mock stdin）
- 已有配置时的覆盖 / 跳过行为
- 无效路径输入后重试
- Ctrl+C 中断无副作用

### 5.3 main.test.ts 新增

- `--doctor` 解析
- `--doctor --fix` 解析
- 单独 `--fix` 报错
- `--init` 解析

### 5.4 验证命令

```bash
cd collector && pnpm test          # 含新 doctor/init 测试全部通过
cd collector && pnpm typecheck     # 类型检查通过
pnpm doctor                        # 本机运行诊断验证输出
pnpm collect --doctor --fix        # 测试自动修复
pnpm collect --init                # 测试交互式初始化
```
