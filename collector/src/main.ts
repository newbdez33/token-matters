import { join } from 'node:path';
import { homedir } from 'node:os';
import { isValidDate, getDateRange, todayInTimezone } from './utils/date.js';
import * as logger from './utils/logger.js';
import { loadConfig } from './config.js';
import { loadState, saveState } from './state.js';
import { gitPull, gitAddCommitPush } from './git.js';
import { writeRawDataFile } from './writer.js';
import { createClaudeCodeProvider } from './providers/claude-code.js';
import type { CollectorProvider } from './providers/types.js';

export interface CliArgs {
  dryRun: boolean;
  status: boolean;
  date?: string;
  from?: string;
  to?: string;
  provider?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    status: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--status':
        args.status = true;
        break;
      case '--date':
        args.date = argv[++i];
        break;
      case '--from':
        args.from = argv[++i];
        break;
      case '--to':
        args.to = argv[++i];
        break;
      case '--provider':
        args.provider = argv[++i];
        break;
    }
  }

  // Validate
  if (args.date && (args.from || args.to)) {
    throw new Error('--date cannot be used with --from/--to');
  }
  if ((args.from && !args.to) || (!args.from && args.to)) {
    throw new Error('--from and --to must be used together');
  }
  if (args.date && !isValidDate(args.date)) {
    throw new Error(`Invalid date: ${args.date}`);
  }
  if (args.from && !isValidDate(args.from)) {
    throw new Error(`Invalid date: ${args.from}`);
  }
  if (args.to && !isValidDate(args.to)) {
    throw new Error(`Invalid date: ${args.to}`);
  }

  return args;
}

function buildProviders(config: ReturnType<typeof loadConfig>): CollectorProvider[] {
  const providers: CollectorProvider[] = [];

  const claudeCodeCfg = config.providers['claude-code'];
  if (claudeCodeCfg?.enabled !== false) {
    const claudeDir = typeof claudeCodeCfg?.claudeDir === 'string'
      ? claudeCodeCfg.claudeDir.replace(/^~/, homedir())
      : join(homedir(), '.claude');
    providers.push(createClaudeCodeProvider({
      claudeDir,
      machine: config.machine,
      timezone: config.timezone,
    }));
  }

  // Phase 2 stubs will be registered here
  return providers;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const configDir = join(homedir(), '.token-matters');
  const configPath = join(configDir, 'config.yaml');
  const statePath = join(configDir, 'state.json');

  // Load config
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig(configPath);
  } catch (err) {
    logger.error(`Failed to load config: ${(err as Error).message}`);
    process.exit(1);
  }

  // Status mode
  if (args.status) {
    const providers = buildProviders(config);
    logger.info(`Machine: ${config.machine}`);
    logger.info(`Data repo: ${config.dataRepo}`);
    logger.info(`Timezone: ${config.timezone}`);
    for (const p of providers) {
      const available = await p.isAvailable();
      logger.info(`Provider ${p.name}: ${available ? 'available' : 'unavailable'}`);
    }
    return;
  }

  // Determine date range
  const today = todayInTimezone(config.timezone);
  let dates: string[];
  if (args.date) {
    dates = [args.date];
  } else if (args.from && args.to) {
    dates = getDateRange(args.from, args.to);
  } else {
    dates = [today];
  }

  // Load state
  const state = loadState(statePath);

  // Build providers
  let providers = buildProviders(config);
  if (args.provider) {
    providers = providers.filter(p => p.name === args.provider);
    if (providers.length === 0) {
      logger.error(`Provider not found: ${args.provider}`);
      process.exit(1);
    }
  }

  // Git pull
  try {
    await gitPull(config.dataRepo, args.dryRun);
  } catch (err) {
    logger.warn(`git pull failed: ${(err as Error).message}`);
  }

  // Collect
  const writtenFiles: string[] = [];

  for (const provider of providers) {
    const available = await provider.isAvailable();
    if (!available) {
      logger.warn(`Skipping ${provider.name}: data source not available`);
      continue;
    }

    for (const date of dates) {
      try {
        logger.info(`Collecting ${provider.name} for ${date}...`);
        const data = await provider.collect(date);

        if (data.records.length === 0) {
          logger.info(`  No data for ${date}`);
          continue;
        }

        const result = writeRawDataFile(config.dataRepo, data, args.dryRun);
        if (result.written) {
          logger.info(`  Wrote ${result.filePath}`);
          writtenFiles.push(result.filePath);
        } else if (result.dryRun) {
          logger.info(`  [dry-run] Would write ${result.filePath}`);
        } else {
          logger.info(`  Skipped (already exists): ${result.filePath}`);
        }

        // Update state
        state.providers[provider.name] = {
          ...state.providers[provider.name],
          lastCollectedDate: date,
        };
      } catch (err) {
        logger.error(`Error collecting ${provider.name} for ${date}: ${(err as Error).message}`);
        // Continue with other dates/providers
      }
    }
  }

  // Git push
  if (writtenFiles.length > 0) {
    try {
      const message = `collect: ${dates.length === 1 ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`}`;
      await gitAddCommitPush(config.dataRepo, writtenFiles, message, args.dryRun);
      logger.info('Pushed to remote');
    } catch (err) {
      logger.error(`git push failed: ${(err as Error).message}`);
    }
  }

  // Save state
  state.lastRun = new Date().toISOString();
  if (!args.dryRun) {
    saveState(statePath, state);
  }

  logger.info(`Done. ${writtenFiles.length} file(s) written.`);
}

// Only auto-run when executed directly (not imported by tests)
const isDirectRun = process.argv[1]?.endsWith('main.ts');
if (isDirectRun) {
  main().catch(err => {
    logger.error(err.message);
    process.exit(1);
  });
}
