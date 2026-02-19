import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  DailySummary,
  WeeklySummary,
  MonthlySummary,
  ProviderAllTime,
  MachineAllTime,
  LatestSummary,
  SummaryMeta,
} from './types.js';

export interface WriteInput {
  daily: Map<string, DailySummary>;
  weekly: Map<string, WeeklySummary>;
  monthly: Map<string, MonthlySummary>;
  providers: Map<string, ProviderAllTime>;
  machines: Map<string, MachineAllTime>;
  latest: LatestSummary;
  meta: SummaryMeta;
  badgeSvg: string;
}

async function writeJSON(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export async function writeAllOutputs(
  input: WriteInput,
  outputDir: string,
  badgeDir: string,
  dryRun = false,
): Promise<number> {
  const files: Array<{ path: string; content: string }> = [];

  for (const [date, summary] of input.daily) {
    files.push({
      path: path.join(outputDir, 'daily', `${date}.json`),
      content: JSON.stringify(summary, null, 2) + '\n',
    });
  }

  for (const [week, summary] of input.weekly) {
    files.push({
      path: path.join(outputDir, 'weekly', `${week}.json`),
      content: JSON.stringify(summary, null, 2) + '\n',
    });
  }

  for (const [month, summary] of input.monthly) {
    files.push({
      path: path.join(outputDir, 'monthly', `${month}.json`),
      content: JSON.stringify(summary, null, 2) + '\n',
    });
  }

  for (const [provider, summary] of input.providers) {
    files.push({
      path: path.join(outputDir, 'providers', `${provider}.json`),
      content: JSON.stringify(summary, null, 2) + '\n',
    });
  }

  for (const [machine, summary] of input.machines) {
    files.push({
      path: path.join(outputDir, 'machines', `${machine}.json`),
      content: JSON.stringify(summary, null, 2) + '\n',
    });
  }

  files.push({
    path: path.join(outputDir, 'latest.json'),
    content: JSON.stringify(input.latest, null, 2) + '\n',
  });

  files.push({
    path: path.join(outputDir, 'meta.json'),
    content: JSON.stringify(input.meta, null, 2) + '\n',
  });

  files.push({
    path: path.join(badgeDir, 'token-usage.svg'),
    content: input.badgeSvg,
  });

  if (dryRun) return files.length;

  for (const file of files) {
    await fs.mkdir(path.dirname(file.path), { recursive: true });
    await fs.writeFile(file.path, file.content, 'utf-8');
  }

  return files.length;
}
