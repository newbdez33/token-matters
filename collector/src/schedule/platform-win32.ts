import { execFileSync } from 'node:child_process';
import * as logger from '../utils/logger.js';
import type { ScheduleParams, ResolvedPaths, PlatformScheduler } from './types.js';

const TASK_NAME = 'TokenMattersCollector';

export function createWin32Scheduler(): PlatformScheduler {
  return {
    async install(params, paths, dryRun) {
      const isHourly = params.intervalMinutes === 60;
      const startTime = `00:${String(params.offsetMinute).padStart(2, '0')}`;
      const schedule = isHourly ? 'HOURLY' : 'DAILY';

      const args = [
        '/create',
        '/tn', TASK_NAME,
        '/tr', `"${paths.npxPath}" tsx "${paths.collectorMainTs}"`,
        '/sc', schedule,
        '/st', startTime,
        '/f',
      ];

      if (dryRun) {
        logger.info(`[dry-run] Would run: schtasks ${args.join(' ')}`);
        return;
      }

      execFileSync('schtasks', args, {
        cwd: paths.collectorDir,
        stdio: 'pipe',
      });
      logger.info(`Created scheduled task "${TASK_NAME}" (${schedule} at ${startTime})`);
    },

    async uninstall(dryRun) {
      const args = ['/delete', '/tn', TASK_NAME, '/f'];

      if (dryRun) {
        logger.info(`[dry-run] Would run: schtasks ${args.join(' ')}`);
        return;
      }

      try {
        execFileSync('schtasks', args, { stdio: 'pipe' });
        logger.info(`Deleted scheduled task "${TASK_NAME}"`);
      } catch {
        logger.info(`No scheduled task "${TASK_NAME}" found — nothing to uninstall`);
      }
    },

    async isInstalled() {
      try {
        execFileSync('schtasks', ['/query', '/tn', TASK_NAME], { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    },

    describe() {
      return `Windows Task Scheduler (task: ${TASK_NAME})`;
    },
  };
}
