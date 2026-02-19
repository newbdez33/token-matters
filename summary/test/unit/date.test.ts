import { describe, it, expect } from 'vitest';
import {
  isValidDate,
  getDateRange,
  getISOWeekString,
  getMonthString,
  subtractDays,
} from '../../src/utils/date.js';

describe('isValidDate', () => {
  it('accepts valid date', () => {
    expect(isValidDate('2026-02-19')).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(isValidDate('20260219')).toBe(false);
    expect(isValidDate('2026/02/19')).toBe(false);
    expect(isValidDate('')).toBe(false);
  });

  it('rejects invalid day', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
  });

  it('accepts leap year', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2025-02-29')).toBe(false);
  });
});

describe('getDateRange', () => {
  it('returns single date for same from/to', () => {
    expect(getDateRange('2026-02-19', '2026-02-19')).toEqual(['2026-02-19']);
  });

  it('returns inclusive range', () => {
    expect(getDateRange('2026-02-17', '2026-02-19')).toEqual([
      '2026-02-17',
      '2026-02-18',
      '2026-02-19',
    ]);
  });

  it('throws on invalid range', () => {
    expect(() => getDateRange('2026-02-20', '2026-02-19')).toThrow();
  });
});

describe('getISOWeekString', () => {
  it('returns correct ISO week for mid-week date', () => {
    // 2026-02-19 is Thursday, ISO week 8
    expect(getISOWeekString('2026-02-19')).toBe('2026-W08');
  });

  it('returns correct ISO week for Monday', () => {
    // 2026-02-16 is Monday, ISO week 8
    expect(getISOWeekString('2026-02-16')).toBe('2026-W08');
  });

  it('returns correct ISO week for Sunday', () => {
    // 2026-02-15 is Sunday, ISO week 7
    expect(getISOWeekString('2026-02-15')).toBe('2026-W07');
  });

  it('handles week 1 correctly', () => {
    // 2026-01-01 is Thursday, ISO week 1
    expect(getISOWeekString('2026-01-01')).toBe('2026-W01');
  });

  it('handles year boundary - last week of previous year', () => {
    // 2025-12-29 is Monday - ISO week 1 of 2026
    expect(getISOWeekString('2025-12-29')).toBe('2026-W01');
  });

  it('pads week number to 2 digits', () => {
    expect(getISOWeekString('2026-01-05')).toBe('2026-W02');
  });
});

describe('getMonthString', () => {
  it('returns YYYY-MM format', () => {
    expect(getMonthString('2026-02-19')).toBe('2026-02');
  });

  it('works for January', () => {
    expect(getMonthString('2026-01-01')).toBe('2026-01');
  });

  it('works for December', () => {
    expect(getMonthString('2026-12-31')).toBe('2026-12');
  });
});

describe('subtractDays', () => {
  it('subtracts days correctly', () => {
    expect(subtractDays('2026-02-19', 1)).toBe('2026-02-18');
    expect(subtractDays('2026-02-19', 7)).toBe('2026-02-12');
  });

  it('handles month boundary', () => {
    expect(subtractDays('2026-03-01', 1)).toBe('2026-02-28');
  });

  it('returns same date for 0 days', () => {
    expect(subtractDays('2026-02-19', 0)).toBe('2026-02-19');
  });
});
