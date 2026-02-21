# Collector Deployment Guide

> Last updated: 2026-02-20

Deploy the Collector on a new machine to start collecting token usage data.

## Prerequisites

| Requirement | How to check | Install |
|-------------|-------------|---------|
| Node.js >= 20 | `node -v` | [nvm](https://github.com/nvm-sh/nvm) (macOS/Linux) · `winget install OpenJS.NodeJS.LTS` (Windows) |
| pnpm | `pnpm -v` | `npm install -g pnpm` |
| Git | `git --version` | Xcode CLI tools (macOS) · `apt install git` (Linux) · `winget install Git.Git` (Windows) |
| SSH key with GitHub access | `ssh -T git@github.com` | [GitHub docs](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) |

---

The guide below is organized by platform. Steps 1–4 are the same across all platforms (with platform-specific paths noted). Step 5 differs per platform.

## Steps 1–4: Clone, Install, Configure, Verify

### macOS / Linux

```bash
# Step 1: Clone repositories
git clone git@github.com:newbdez33/token-matters.git ~/projects/token-matters
git clone git@github.com:newbdez33/token-matters-data.git ~/projects/token-matters-data

# Step 2: Install dependencies
cd ~/projects/token-matters/collector
pnpm install
pnpm collect --help   # verify CLI runs

# Step 3: Create config
mkdir -p ~/.token-matters
```

Create `~/.token-matters/config.yaml`:

```yaml
dataRepo: ~/projects/token-matters-data
timezone: Asia/Shanghai

providers:
  claude-code:
    enabled: true
    # claudeDir: ~/.claude          # optional, defaults to ~/.claude

  codex:
    enabled: true
    # codexDir: ~/.codex            # optional, defaults to ~/.codex

  opencode:
    enabled: true
    # openCodeDir: ~/.local/share/opencode  # optional

  glm-coding:
    enabled: false                   # enable if you have an API key
    # apiKey: your-api-key
    # baseUrl: https://open.bigmodel.cn

  trae-pro:
    enabled: false                   # enable if TRAE is installed
    # traeDir: ~/Library/Application Support/Trae
```

```bash
# Step 4: Verify
cd ~/projects/token-matters/collector
pnpm collect --status     # shows which providers are available
pnpm collect --dry-run    # collects without writing or pushing
pnpm collect              # run for real

ls ~/projects/token-matters-data/raw/
# should see a directory named after this machine's hostname
```

### Windows (PowerShell)

```powershell
# Step 1: Clone repositories
git clone git@github.com:newbdez33/token-matters.git C:\projects\token-matters
git clone git@github.com:newbdez33/token-matters-data.git C:\projects\token-matters-data

# Step 2: Install dependencies
cd C:\projects\token-matters\collector
pnpm install
pnpm collect --help   # verify CLI runs

# Step 3: Create config
mkdir "$env:USERPROFILE\.token-matters"
```

Create `%USERPROFILE%\.token-matters\config.yaml`:

```yaml
dataRepo: C:\projects\token-matters-data
timezone: Asia/Shanghai

providers:
  claude-code:
    enabled: true
    # claudeDir: C:\Users\yourname\.claude  # optional, defaults to ~/.claude

  codex:
    enabled: true
    # codexDir: C:\Users\yourname\.codex    # optional, defaults to ~/.codex

  opencode:
    enabled: true

  glm-coding:
    enabled: false                   # enable if you have an API key
    # apiKey: your-api-key
    # baseUrl: https://open.bigmodel.cn

  trae-pro:
    enabled: false                   # enable if TRAE is installed
    # traeDir: C:\Users\yourname\AppData\Roaming\Trae
```

```powershell
# Step 4: Verify
cd C:\projects\token-matters\collector
pnpm collect --status     # shows which providers are available
pnpm collect --dry-run    # collects without writing or pushing
pnpm collect              # run for real

dir C:\projects\token-matters-data\raw\
# should see a directory named after this machine's hostname
```

> Only enable providers that are actually installed on this machine. Disable the rest with `enabled: false`.

## Step 5: Set up scheduled collection

### macOS (launchd)

Create the plist file. Replace the placeholder paths first:

```bash
# Find your npx path
which npx
# e.g., /Users/yourname/.nvm/versions/node/v22.14.0/bin/npx
```

Create `~/Library/LaunchAgents/com.token-matters.collector.plist`:

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
    <string>/Users/yourname/.nvm/versions/node/v22.14.0/bin/npx</string>
    <string>tsx</string>
    <string>/Users/yourname/projects/token-matters/collector/src/main.ts</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/yourname/projects/token-matters/collector</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/Users/yourname/.nvm/versions/node/v22.14.0/bin:/usr/local/bin:/usr/bin:/bin</string>
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

> **Important**: launchd does NOT load your shell profile. You must specify the full path to `npx` and set `PATH` + `HOME` explicitly.

Load and verify:

```bash
# Load (persists across reboots)
launchctl load ~/Library/LaunchAgents/com.token-matters.collector.plist

# Trigger a manual run to verify
launchctl start com.token-matters.collector

# Check status (exit code 0 = success)
launchctl list | grep token-matters

# Check log output
cat /tmp/token-matters-collector.log
```

### Linux (cron)

```bash
crontab -e
```

Add this line (runs daily at 00:30):

```
30 0 * * * cd /home/yourname/projects/token-matters/collector && /home/yourname/.nvm/versions/node/v22.14.0/bin/npx tsx src/main.ts >> /tmp/token-matters-collector.log 2>&1
```

> Use full paths — cron does not load your shell profile either.

### Windows (Task Scheduler)

Find your `npx` path first:

```powershell
(Get-Command npx).Source
# e.g., C:\Program Files\nodejs\npx.cmd
```

Create a scheduled task (runs daily at 00:30):

```powershell
$action = New-ScheduledTaskAction `
  -Execute "C:\Program Files\nodejs\npx.cmd" `
  -Argument "tsx src/main.ts" `
  -WorkingDirectory "C:\projects\token-matters\collector"

$trigger = New-ScheduledTaskTrigger -Daily -At 00:30

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries

Register-ScheduledTask `
  -TaskName "TokenMattersCollector" `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Token Matters daily collection"
```

> Replace the `npx.cmd` path with the output from `Get-Command npx` above.

Verify:

```powershell
# Trigger a manual run
Start-ScheduledTask -TaskName "TokenMattersCollector"

# Check status (LastTaskResult 0 = success)
Get-ScheduledTask -TaskName "TokenMattersCollector" | Select-Object State, LastRunTime, LastTaskResult

# To remove the task
Unregister-ScheduledTask -TaskName "TokenMattersCollector" -Confirm:$false
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `pnpm collect --status` shows all providers unavailable | Provider data directories don't exist on this machine | Disable unused providers in config.yaml |
| `git push` fails during collection | SSH key not set up for GitHub | Run `ssh -T git@github.com` to verify |
| launchd runs but no output | Wrong `npx` path in plist | Run `which npx` and update the plist |
| Task Scheduler shows `LastTaskResult` non-zero | Wrong `npx.cmd` path or working directory | Verify path with `(Get-Command npx).Source` |
| `raw/` directory has wrong machine name | Hostname auto-detection | Add `machine: your-name` to config.yaml to override |
| Git conflicts on push | Another machine pushed first | Collector auto-retries with `git pull --rebase` (up to 3 times) |

## Updating the Collector

When the Collector code is updated, pull the latest and reinstall dependencies:

```bash
# macOS / Linux
cd ~/projects/token-matters && git pull && cd collector && pnpm install
```

```powershell
# Windows
cd C:\projects\token-matters; git pull; cd collector; pnpm install
```

No need to reload launchd/cron/Task Scheduler — the next scheduled run picks up the new code automatically (it runs `tsx` directly on source files).
