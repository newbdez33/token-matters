import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { run, type CLIArgs } from '../../src/main.js';
import type {
  DailySummary,
  LatestSummary,
  SummaryMeta,
  WeeklySummary,
  MonthlySummary,
  ProviderAllTime,
  MachineAllTime,
} from '../../src/types.js';

const FIXTURES_RAW = path.resolve(import.meta.dirname, '../fixtures/raw');
const PRICING_PATH = path.resolve(
  import.meta.dirname,
  '../fixtures/pricing.json',
);

let tmpDir: string;
let outputDir: string;
let badgeDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-test-'));
  outputDir = path.join(tmpDir, 'summary');
  badgeDir = path.join(tmpDir, 'badge');
});

async function readJSON<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

describe('full pipeline integration', () => {
  const runPipeline = async () => {
    const args: CLIArgs = {
      rawDir: FIXTURES_RAW,
      outputDir,
      pricing: PRICING_PATH,
      badgeDir,
      referenceDate: '2026-02-19',
      dryRun: false,
    };
    await run(args);
  };

  it('generates all expected output files', async () => {
    await runPipeline();

    // Daily files
    const daily17 = await readJSON<DailySummary>(
      path.join(outputDir, 'daily', '2026-02-17.json'),
    );
    expect(daily17.date).toBe('2026-02-17');

    const daily18 = await readJSON<DailySummary>(
      path.join(outputDir, 'daily', '2026-02-18.json'),
    );
    expect(daily18.date).toBe('2026-02-18');

    const daily19 = await readJSON<DailySummary>(
      path.join(outputDir, 'daily', '2026-02-19.json'),
    );
    expect(daily19.date).toBe('2026-02-19');

    // Weekly
    const weekly = await readJSON<WeeklySummary>(
      path.join(outputDir, 'weekly', '2026-W08.json'),
    );
    expect(weekly.week).toBe('2026-W08');

    // Monthly
    const monthly = await readJSON<MonthlySummary>(
      path.join(outputDir, 'monthly', '2026-02.json'),
    );
    expect(monthly.month).toBe('2026-02');

    // Provider
    const claude = await readJSON<ProviderAllTime>(
      path.join(outputDir, 'providers', 'claude-code.json'),
    );
    expect(claude.provider).toBe('claude-code');

    const glm = await readJSON<ProviderAllTime>(
      path.join(outputDir, 'providers', 'glm-coding.json'),
    );
    expect(glm.provider).toBe('glm-coding');

    const trae = await readJSON<ProviderAllTime>(
      path.join(outputDir, 'providers', 'trae-pro.json'),
    );
    expect(trae.provider).toBe('trae-pro');

    // Machine
    const machine = await readJSON<MachineAllTime>(
      path.join(outputDir, 'machines', 'test-machine.json'),
    );
    expect(machine.machine).toBe('test-machine');

    // Latest
    const latest = await readJSON<LatestSummary>(
      path.join(outputDir, 'latest.json'),
    );
    expect(latest.today).not.toBeNull();
    expect(latest.today!.date).toBe('2026-02-19');
    expect(latest.last7Days.dailyTrend.length).toBe(3);

    // Meta
    const meta = await readJSON<SummaryMeta>(
      path.join(outputDir, 'meta.json'),
    );
    expect(meta.providers).toContain('claude-code');
    expect(meta.providers).toContain('glm-coding');
    expect(meta.providers).toContain('trae-pro');
    expect(meta.dailyFiles).toHaveLength(3);

    // Badges
    const flatBadge = await fs.readFile(
      path.join(badgeDir, 'token-usage.svg'),
      'utf-8',
    );
    expect(flatBadge).toContain('<svg');
    expect(flatBadge).toContain('Token Usage (7d)');
    expect(flatBadge).toContain('linearGradient');

    const pixelBadge = await fs.readFile(
      path.join(badgeDir, 'token-usage-pixel.svg'),
      'utf-8',
    );
    expect(pixelBadge).toContain('<svg');
    expect(pixelBadge).toContain('Token Usage (7d)');
    expect(pixelBadge).toContain('fill="#111"');
  });

  it('deduplicates correctly - 2026-02-17 has newer data', async () => {
    await runPipeline();
    const daily17 = await readJSON<DailySummary>(
      path.join(outputDir, 'daily', '2026-02-17.json'),
    );
    // The newer file (bbb222) has opus inputTokens=8000, haiku inputTokens=800
    const claudeProvider = daily17.byProvider.find(
      (p) => p.provider === 'claude-code',
    )!;
    expect(claudeProvider.inputTokens).toBe(8000 + 800);
  });

  it('calculates costs correctly for Claude', async () => {
    await runPipeline();
    const daily18 = await readJSON<DailySummary>(
      path.join(outputDir, 'daily', '2026-02-18.json'),
    );
    // Claude opus on 02-18: 3000 input, 80000 output, 400000 cache_write, 15000000 cache_read
    // Cost = 3000/1M*15 + 80000/1M*75 + 400000/1M*18.75 + 15000000/1M*1.50
    //      = 0.045 + 6.0 + 7.5 + 22.5 = 36.045
    const claudeProvider = daily18.byProvider.find(
      (p) => p.provider === 'claude-code',
    )!;
    expect(claudeProvider.cost).toBeCloseTo(36.045, 2);
  });

  it('calculates GLM cost in CNY', async () => {
    await runPipeline();
    const daily18 = await readJSON<DailySummary>(
      path.join(outputDir, 'daily', '2026-02-18.json'),
    );
    const glmProvider = daily18.byProvider.find(
      (p) => p.provider === 'glm-coding',
    )!;
    // 5000000 tokens / 1000 * 0.05 = ¥250
    expect(glmProvider.cost).toBeCloseTo(250, 2);
    expect(glmProvider.currency).toBe('CNY');
  });

  it('has TRAE cost as zero', async () => {
    await runPipeline();
    const daily17 = await readJSON<DailySummary>(
      path.join(outputDir, 'daily', '2026-02-17.json'),
    );
    const traeProvider = daily17.byProvider.find(
      (p) => p.provider === 'trae-pro',
    )!;
    expect(traeProvider.cost).toBe(0);
  });

  it('totalUSD includes converted GLM cost', async () => {
    await runPipeline();
    const daily18 = await readJSON<DailySummary>(
      path.join(outputDir, 'daily', '2026-02-18.json'),
    );
    // Claude: $36.045, GLM: ¥250 × 0.1389 = $34.725
    // Total: $36.045 + $34.725 = $70.77
    expect(daily18.totals.cost.totalUSD).toBeCloseTo(70.77, 1);
  });

  it('weekly summary aggregates all 3 days', async () => {
    await runPipeline();
    const weekly = await readJSON<WeeklySummary>(
      path.join(outputDir, 'weekly', '2026-W08.json'),
    );
    expect(weekly.dailyTrend).toHaveLength(3);
    // Total tokens across all 3 days from all providers
    expect(weekly.totals.totalTokens).toBeGreaterThan(0);
  });

  it('dry-run produces no output files', async () => {
    const args: CLIArgs = {
      rawDir: FIXTURES_RAW,
      outputDir,
      pricing: PRICING_PATH,
      badgeDir,
      referenceDate: '2026-02-19',
      dryRun: true,
    };
    await run(args);
    await expect(fs.stat(outputDir)).rejects.toThrow();
  });
});
