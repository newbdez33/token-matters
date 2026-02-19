import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../src/main.js';

describe('parseArgs', () => {
  it('parses all arguments', () => {
    const args = parseArgs([
      '--raw-dir',
      '/data/raw',
      '--output-dir',
      '/out/summary',
      '--pricing',
      '/data/pricing.json',
      '--badge-dir',
      '/out/badge',
      '--reference-date',
      '2026-02-19',
      '--dry-run',
    ]);
    expect(args.rawDir).toBe('/data/raw');
    expect(args.outputDir).toBe('/out/summary');
    expect(args.pricing).toBe('/data/pricing.json');
    expect(args.badgeDir).toBe('/out/badge');
    expect(args.referenceDate).toBe('2026-02-19');
    expect(args.dryRun).toBe(true);
  });

  it('has sensible defaults', () => {
    const args = parseArgs(['--raw-dir', '/data/raw', '--pricing', '/p.json']);
    expect(args.rawDir).toBe('/data/raw');
    expect(args.outputDir).toBe('./summary');
    expect(args.badgeDir).toBe('./badge');
    expect(args.dryRun).toBe(false);
    expect(args.referenceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('throws on missing --raw-dir', () => {
    expect(() => parseArgs(['--pricing', '/p.json'])).toThrow('--raw-dir');
  });

  it('throws on missing --pricing', () => {
    expect(() => parseArgs(['--raw-dir', '/data'])).toThrow('--pricing');
  });
});
