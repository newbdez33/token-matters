import { execFileSync } from 'node:child_process';
import * as logger from '../utils/logger.js';
import type { ScheduleParams, ResolvedPaths, PlatformScheduler } from './types.js';

const MARKER = '# token-matters-collector';

function buildCronLine(params: ScheduleParams, paths: ResolvedPaths): string {
  const minute = params.offsetMinute;
  const hour = params.intervalMinutes === 1440 ? '0' : '*';
  const cmd = `cd ${paths.collectorDir} && ${paths.npxPath} tsx ${paths.collectorMainTs}`;
  const redirect = params.logFile ? ` >> ${params.logFile} 2>&1` : '';
  return `${minute} ${hour} * * * ${cmd}${redirect} ${MARKER}`;
}

function getCurrentCrontab(): string {
  try {
    return execFileSync('crontab', ['-l'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}

function filterMarkerLines(crontab: string): string {
  return crontab
    .split('\n')
    .filter(line => !line.includes(MARKER))
    .join('\n');
}

export function createLinuxScheduler(): PlatformScheduler {
  return {
    async install(params, paths, dryRun) {
      const cronLine = buildCronLine(params, paths);

      if (dryRun) {
        logger.info(`[dry-run] Would add crontab entry:`);
        console.log(cronLine);
        return;
      }

      const existing = getCurrentCrontab();
      const filtered = filterMarkerLines(existing).replace(/\n+$/, '');
      const newCrontab = filtered ? `${filtered}\n${cronLine}\n` : `${cronLine}\n`;

      execFileSync('crontab', ['-'], {
        input: newCrontab,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      logger.info('Installed crontab entry');
    },

    async uninstall(dryRun) {
      if (dryRun) {
        logger.info('[dry-run] Would remove token-matters-collector crontab entries');
        return;
      }

      const existing = getCurrentCrontab();
      if (!existing.includes(MARKER)) {
        logger.info('No crontab entry found — nothing to uninstall');
        return;
      }

      const filtered = filterMarkerLines(existing).replace(/\n+$/, '');
      const newCrontab = filtered ? `${filtered}\n` : '';

      execFileSync('crontab', ['-'], {
        input: newCrontab,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      logger.info('Removed token-matters-collector crontab entry');
    },

    async isInstalled() {
      const crontab = getCurrentCrontab();
      return crontab.includes(MARKER);
    },

    describe() {
      return 'Linux crontab';
    },
  };
}
