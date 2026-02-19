import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeAllOutputs, type WriteInput } from '../../src/writer.js';
import type {
  DailySummary,
  WeeklySummary,
  MonthlySummary,
  ProviderAllTime,
  MachineAllTime,
  LatestSummary,
  SummaryMeta,
  TokenTotals,
} from '../../src/types.js';

function makeTotals(): TokenTotals {
  return {
    inputTokens: 100,
    outputTokens: 200,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 300,
    cost: { totalUSD: 1.5, byProvider: {} },
    requests: 5,
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'writer-test-'));
});

function makeInput(): WriteInput {
  const daily = new Map<string, DailySummary>([
    [
      '2026-02-17',
      {
        date: '2026-02-17',
        totals: makeTotals(),
        byProvider: [],
        byMachine: [],
        byModel: [],
      },
    ],
  ]);

  const weekly = new Map<string, WeeklySummary>([
    [
      '2026-W08',
      {
        week: '2026-W08',
        dateRange: { start: '2026-02-17', end: '2026-02-17' },
        totals: makeTotals(),
        byProvider: [],
        dailyTrend: [],
      },
    ],
  ]);

  const monthly = new Map<string, MonthlySummary>([
    [
      '2026-02',
      {
        month: '2026-02',
        dateRange: { start: '2026-02-17', end: '2026-02-17' },
        totals: makeTotals(),
        byProvider: [],
        dailyTrend: [],
      },
    ],
  ]);

  const providers = new Map<string, ProviderAllTime>([
    [
      'claude-code',
      {
        provider: 'claude-code',
        dateRange: { start: '2026-02-17', end: '2026-02-17' },
        totals: makeTotals(),
        dailyTrend: [],
      },
    ],
  ]);

  const machines = new Map<string, MachineAllTime>([
    [
      'test-machine',
      {
        machine: 'test-machine',
        dateRange: { start: '2026-02-17', end: '2026-02-17' },
        totals: makeTotals(),
        dailyTrend: [],
      },
    ],
  ]);

  const latest: LatestSummary = {
    lastUpdated: '2026-02-17T10:00:00.000Z',
    last7Days: {
      dateRange: { start: '2026-02-11', end: '2026-02-17' },
      totals: makeTotals(),
      byProvider: [],
      dailyTrend: [],
    },
    last30Days: {
      dateRange: { start: '2026-01-19', end: '2026-02-17' },
      totals: makeTotals(),
      byProvider: [],
      dailyTrend: [],
    },
    today: null,
  };

  const meta: SummaryMeta = {
    lastUpdated: '2026-02-17T10:00:00.000Z',
    dateRange: { start: '2026-02-17', end: '2026-02-17' },
    providers: ['claude-code'],
    machines: ['test-machine'],
    models: ['claude-opus-4-6'],
    dailyFiles: ['2026-02-17'],
    weeklyFiles: ['2026-W08'],
    monthlyFiles: ['2026-02'],
  };

  return {
    daily,
    weekly,
    monthly,
    providers,
    machines,
    latest,
    meta,
    badgeSvgs: {
      'token-usage.svg': '<svg>flat</svg>',
      'token-usage-pixel.svg': '<svg>pixel</svg>',
    },
  };
}

describe('writeAllOutputs', () => {
  it('writes all output files', async () => {
    const outputDir = path.join(tmpDir, 'summary');
    const badgeDir = path.join(tmpDir, 'badge');
    await writeAllOutputs(makeInput(), outputDir, badgeDir);

    const dailyFile = await fs.readFile(
      path.join(outputDir, 'daily', '2026-02-17.json'),
      'utf-8',
    );
    expect(JSON.parse(dailyFile).date).toBe('2026-02-17');

    const weeklyFile = await fs.readFile(
      path.join(outputDir, 'weekly', '2026-W08.json'),
      'utf-8',
    );
    expect(JSON.parse(weeklyFile).week).toBe('2026-W08');

    const monthlyFile = await fs.readFile(
      path.join(outputDir, 'monthly', '2026-02.json'),
      'utf-8',
    );
    expect(JSON.parse(monthlyFile).month).toBe('2026-02');

    const providerFile = await fs.readFile(
      path.join(outputDir, 'providers', 'claude-code.json'),
      'utf-8',
    );
    expect(JSON.parse(providerFile).provider).toBe('claude-code');

    const machineFile = await fs.readFile(
      path.join(outputDir, 'machines', 'test-machine.json'),
      'utf-8',
    );
    expect(JSON.parse(machineFile).machine).toBe('test-machine');

    const latestFile = await fs.readFile(
      path.join(outputDir, 'latest.json'),
      'utf-8',
    );
    expect(JSON.parse(latestFile).lastUpdated).toBeDefined();

    const metaFile = await fs.readFile(
      path.join(outputDir, 'meta.json'),
      'utf-8',
    );
    expect(JSON.parse(metaFile).providers).toContain('claude-code');

    const flatBadge = await fs.readFile(
      path.join(badgeDir, 'token-usage.svg'),
      'utf-8',
    );
    expect(flatBadge).toContain('<svg>flat</svg>');

    const pixelBadge = await fs.readFile(
      path.join(badgeDir, 'token-usage-pixel.svg'),
      'utf-8',
    );
    expect(pixelBadge).toContain('<svg>pixel</svg>');
  });

  it('creates directories as needed', async () => {
    const outputDir = path.join(tmpDir, 'deep', 'nested', 'summary');
    const badgeDir = path.join(tmpDir, 'deep', 'nested', 'badge');
    await writeAllOutputs(makeInput(), outputDir, badgeDir);

    const stat = await fs.stat(path.join(outputDir, 'daily'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('returns file count in dry-run mode', async () => {
    const outputDir = path.join(tmpDir, 'dryrun');
    const badgeDir = path.join(tmpDir, 'dryrun-badge');
    const count = await writeAllOutputs(makeInput(), outputDir, badgeDir, true);
    expect(count).toBeGreaterThan(0);

    // Directory should not exist in dry-run
    await expect(fs.stat(outputDir)).rejects.toThrow();
  });
});
