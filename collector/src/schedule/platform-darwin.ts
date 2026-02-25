import { join } from 'node:path';
import { homedir } from 'node:os';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as logger from '../utils/logger.js';
import type { ScheduleParams, ResolvedPaths, PlatformScheduler } from './types.js';

const LABEL = 'com.token-matters.collector';
const PLIST_DIR = join(homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH = join(PLIST_DIR, `${LABEL}.plist`);

function buildCalendarInterval(params: ScheduleParams): string {
  if (params.intervalMinutes === 1440) {
    // Daily: run at 00:{offsetMinute}
    return `  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>0</integer>
    <key>Minute</key>
    <integer>${params.offsetMinute}</integer>
  </dict>`;
  }
  // Hourly: run at every hour :{offsetMinute}
  return `  <key>StartCalendarInterval</key>
  <dict>
    <key>Minute</key>
    <integer>${params.offsetMinute}</integer>
  </dict>`;
}

function buildPlist(params: ScheduleParams, paths: ResolvedPaths): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${paths.npxPath}</string>
    <string>tsx</string>
    <string>${paths.collectorMainTs}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${paths.collectorDir}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${paths.nodeBinDir}:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${paths.home}</string>
  </dict>

${buildCalendarInterval(params)}

  <key>StandardOutPath</key>
  <string>${params.logFile}</string>
  <key>StandardErrorPath</key>
  <string>${params.logFile}</string>
</dict>
</plist>
`;
}

export function createDarwinScheduler(): PlatformScheduler {
  return {
    async install(params, paths, dryRun) {
      const plist = buildPlist(params, paths);

      if (dryRun) {
        logger.info(`[dry-run] Would write ${PLIST_PATH}:`);
        console.log(plist);
        logger.info(`[dry-run] Would run: launchctl load ${PLIST_PATH}`);
        return;
      }

      // Unload existing if present
      if (existsSync(PLIST_PATH)) {
        try {
          execFileSync('launchctl', ['unload', PLIST_PATH], { stdio: 'pipe' });
        } catch {
          // Ignore — may not be loaded
        }
      }

      writeFileSync(PLIST_PATH, plist, 'utf-8');
      logger.info(`Wrote ${PLIST_PATH}`);

      execFileSync('launchctl', ['load', PLIST_PATH], { stdio: 'pipe' });
      logger.info(`Loaded ${LABEL} via launchctl`);
    },

    async uninstall(dryRun) {
      if (dryRun) {
        logger.info(`[dry-run] Would run: launchctl unload ${PLIST_PATH}`);
        logger.info(`[dry-run] Would delete ${PLIST_PATH}`);
        return;
      }

      if (existsSync(PLIST_PATH)) {
        try {
          execFileSync('launchctl', ['unload', PLIST_PATH], { stdio: 'pipe' });
          logger.info(`Unloaded ${LABEL}`);
        } catch {
          // Ignore
        }
        unlinkSync(PLIST_PATH);
        logger.info(`Deleted ${PLIST_PATH}`);
      } else {
        logger.info('No plist found — nothing to uninstall');
      }
    },

    async isInstalled() {
      if (!existsSync(PLIST_PATH)) return false;
      try {
        const output = execFileSync('launchctl', ['list'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        return output.includes(LABEL);
      } catch {
        return false;
      }
    },

    describe() {
      return `macOS launchd (${PLIST_PATH})`;
    },
  };
}
