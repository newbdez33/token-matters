import { describe, it, expect } from 'vitest';
import { parseArgs } from '../../src/main.js';

describe('parseArgs', () => {
  it('returns defaults with no arguments', () => {
    const args = parseArgs([]);
    expect(args.dryRun).toBe(false);
    expect(args.status).toBe(false);
    expect(args.date).toBeUndefined();
    expect(args.from).toBeUndefined();
    expect(args.to).toBeUndefined();
    expect(args.provider).toBeUndefined();
  });

  it('parses --dry-run', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.dryRun).toBe(true);
  });

  it('parses --status', () => {
    const args = parseArgs(['--status']);
    expect(args.status).toBe(true);
  });

  it('parses --date', () => {
    const args = parseArgs(['--date', '2026-02-19']);
    expect(args.date).toBe('2026-02-19');
  });

  it('parses --from and --to', () => {
    const args = parseArgs(['--from', '2026-02-01', '--to', '2026-02-18']);
    expect(args.from).toBe('2026-02-01');
    expect(args.to).toBe('2026-02-18');
  });

  it('parses --provider', () => {
    const args = parseArgs(['--provider', 'claude-code']);
    expect(args.provider).toBe('claude-code');
  });

  it('throws when --date is used with --from', () => {
    expect(() => parseArgs(['--date', '2026-02-19', '--from', '2026-02-01'])).toThrow(
      /--date cannot be used with --from/,
    );
  });

  it('throws when --date is used with --to', () => {
    expect(() => parseArgs(['--date', '2026-02-19', '--to', '2026-02-18'])).toThrow(
      /--date cannot be used with --from/,
    );
  });

  it('throws when --from is used without --to', () => {
    expect(() => parseArgs(['--from', '2026-02-01'])).toThrow(
      /--from and --to must be used together/,
    );
  });

  it('throws when --to is used without --from', () => {
    expect(() => parseArgs(['--to', '2026-02-18'])).toThrow(
      /--from and --to must be used together/,
    );
  });

  it('throws on invalid date format', () => {
    expect(() => parseArgs(['--date', 'not-a-date'])).toThrow(/Invalid date/);
  });
});
