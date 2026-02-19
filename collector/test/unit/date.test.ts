import { describe, it, expect } from 'vitest';
import { isValidDate, getDateRange, toLocalDate, todayInTimezone } from '../../src/utils/date.js';

describe('isValidDate', () => {
  it('accepts valid YYYY-MM-DD', () => {
    expect(isValidDate('2026-02-19')).toBe(true);
    expect(isValidDate('2025-12-31')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidDate('2026-2-19')).toBe(false);
    expect(isValidDate('20260219')).toBe(false);
    expect(isValidDate('not-a-date')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });

  it('rejects invalid dates', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
  });
});

describe('getDateRange', () => {
  it('returns single date for same from/to', () => {
    const range = getDateRange('2026-02-19', '2026-02-19');
    expect(range).toEqual(['2026-02-19']);
  });

  it('returns range of dates', () => {
    const range = getDateRange('2026-02-17', '2026-02-19');
    expect(range).toEqual(['2026-02-17', '2026-02-18', '2026-02-19']);
  });

  it('throws on reversed range', () => {
    expect(() => getDateRange('2026-02-19', '2026-02-17')).toThrow();
  });
});

describe('toLocalDate', () => {
  it('converts UTC timestamp to Asia/Shanghai date', () => {
    // 2026-02-18T23:30:00Z is 2026-02-19T07:30 in Asia/Shanghai
    expect(toLocalDate('2026-02-18T23:30:00.000Z', 'Asia/Shanghai')).toBe('2026-02-19');
  });

  it('keeps same date when no timezone crossing', () => {
    // 2026-02-19T10:00:00Z is 2026-02-19T18:00 in Asia/Shanghai
    expect(toLocalDate('2026-02-19T10:00:00.000Z', 'Asia/Shanghai')).toBe('2026-02-19');
  });

  it('works with UTC timezone', () => {
    expect(toLocalDate('2026-02-19T23:30:00.000Z', 'UTC')).toBe('2026-02-19');
  });
});

describe('todayInTimezone', () => {
  it('returns a valid date string', () => {
    const today = todayInTimezone('Asia/Shanghai');
    expect(isValidDate(today)).toBe(true);
  });
});
