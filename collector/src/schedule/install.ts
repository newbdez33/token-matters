import * as logger from '../utils/logger.js';
import { resolvePaths } from './resolve-paths.js';
import { createDarwinScheduler } from './platform-darwin.js';
import { createLinuxScheduler } from './platform-linux.js';
import { createWin32Scheduler } from './platform-win32.js';
import type { ScheduleParams, PlatformScheduler } from './types.js';
import type { ScheduleConfig } from '../providers/types.js';

function getScheduler(): PlatformScheduler {
  switch (process.platform) {
    case 'darwin':
      return createDarwinScheduler();
    case 'win32':
      return createWin32Scheduler();
    default:
      return createLinuxScheduler();
  }
}

function resolveParams(config?: ScheduleConfig): ScheduleParams {
  return {
    intervalMinutes: config?.intervalMinutes ?? 60,
    offsetMinute: config?.offsetMinute ?? 30,
    logFile: config?.logFile ?? '/tmp/token-matters-collector.log',
  };
}

export async function runInstall(scheduleConfig: ScheduleConfig | undefined, dryRun: boolean): Promise<void> {
  const scheduler = getScheduler();
  const params = resolveParams(scheduleConfig);
  const paths = resolvePaths();

  logger.info(`Platform: ${scheduler.describe()}`);
  logger.info(`Schedule: every ${params.intervalMinutes} min, offset :${String(params.offsetMinute).padStart(2, '0')}`);
  logger.info(`Log file: ${params.logFile}`);
  logger.info(`npx: ${paths.npxPath}`);
  logger.info(`Collector: ${paths.collectorMainTs}`);

  await scheduler.install(params, paths, dryRun);

  if (!dryRun) {
    logger.info('Schedule installed successfully');
  }
}

export async function runUninstall(dryRun: boolean): Promise<void> {
  const scheduler = getScheduler();

  logger.info(`Platform: ${scheduler.describe()}`);
  await scheduler.uninstall(dryRun);

  if (!dryRun) {
    logger.info('Schedule uninstalled successfully');
  }
}

export async function getScheduleStatus(): Promise<{ installed: boolean; description: string }> {
  const scheduler = getScheduler();
  const installed = await scheduler.isInstalled();
  return { installed, description: scheduler.describe() };
}
