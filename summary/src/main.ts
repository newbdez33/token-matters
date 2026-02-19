import { scanRawFiles } from './scanner.js';
import { dedupFiles } from './dedup.js';
import { loadPricing } from './pricing.js';
import {
  buildDailySummaries,
  buildWeeklySummaries,
  buildMonthlySummaries,
  buildProviderSummaries,
  buildMachineSummaries,
  buildLatestSummary,
} from './aggregator.js';
import { buildMeta } from './meta.js';
import { generateBadges } from './badge.js';
import { writeAllOutputs } from './writer.js';

export interface CLIArgs {
  rawDir: string;
  outputDir: string;
  pricing: string;
  badgeDir: string;
  referenceDate: string;
  dryRun: boolean;
}

export function parseArgs(argv: string[]): CLIArgs {
  const args: Partial<CLIArgs> = {
    outputDir: './summary',
    badgeDir: './badge',
    referenceDate: new Date().toISOString().slice(0, 10),
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--raw-dir':
        args.rawDir = argv[++i];
        break;
      case '--output-dir':
        args.outputDir = argv[++i];
        break;
      case '--pricing':
        args.pricing = argv[++i];
        break;
      case '--badge-dir':
        args.badgeDir = argv[++i];
        break;
      case '--reference-date':
        args.referenceDate = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
    }
  }

  if (!args.rawDir) throw new Error('Missing required argument: --raw-dir');
  if (!args.pricing) throw new Error('Missing required argument: --pricing');

  return args as CLIArgs;
}

export async function run(args: CLIArgs): Promise<void> {
  const startTime = Date.now();

  // 1. Scan
  console.log(`Scanning raw files from ${args.rawDir}...`);
  const rawFiles = await scanRawFiles(args.rawDir);
  console.log(`  Found ${rawFiles.length} raw files`);

  // 2. Dedup
  const files = dedupFiles(rawFiles);
  console.log(`  After dedup: ${files.length} files`);

  // 3. Load pricing
  const pricing = await loadPricing(args.pricing);

  // 4. Build daily summaries
  const daily = buildDailySummaries(files, pricing);
  console.log(`  Daily summaries: ${daily.size}`);

  // 5. Build aggregations
  const weekly = buildWeeklySummaries(daily);
  const monthly = buildMonthlySummaries(daily);
  const providers = buildProviderSummaries(daily);
  const machines = buildMachineSummaries(daily);
  const latest = buildLatestSummary(daily, args.referenceDate);
  console.log(
    `  Weekly: ${weekly.size}, Monthly: ${monthly.size}, Providers: ${providers.size}, Machines: ${machines.size}`,
  );

  // 6. Build meta
  const meta = buildMeta(daily, weekly, monthly);

  // 7. Generate badges
  const badgeSvgs = generateBadges({
    tokens: latest.last7Days.totals.totalTokens,
    costUSD: latest.last7Days.totals.cost.totalUSD,
    dateRange: latest.last7Days.dateRange,
  });

  // 8. Write outputs
  const fileCount = await writeAllOutputs(
    { daily, weekly, monthly, providers, machines, latest, meta, badgeSvgs },
    args.outputDir,
    args.badgeDir,
    args.dryRun,
  );

  const elapsed = Date.now() - startTime;
  if (args.dryRun) {
    console.log(`[dry-run] Would write ${fileCount} files (${elapsed}ms)`);
  } else {
    console.log(`Wrote ${fileCount} files to ${args.outputDir} (${elapsed}ms)`);
  }
}

// CLI entry point
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('/main.ts') ||
    process.argv[1].endsWith('/main.js'));

if (isMainModule) {
  const args = parseArgs(process.argv.slice(2));
  run(args).catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
