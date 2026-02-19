import { describe, it, expect } from 'vitest';
import { formatTokens, formatCost, formatCostCompact, formatPercent } from './format';

describe('formatTokens', () => {
  it('formats millions', () => {
    expect(formatTokens(1_500_000)).toBe('1.5M');
  });

  it('formats thousands', () => {
    expect(formatTokens(24_633)).toBe('24.6K');
  });

  it('formats small numbers', () => {
    expect(formatTokens(500)).toBe('500');
  });
});

describe('formatCost', () => {
  it('formats USD', () => {
    expect(formatCost(127.43, 'USD')).toBe('$127.43');
  });

  it('formats CNY', () => {
    expect(formatCost(68, 'CNY')).toBe('¥68.00');
  });

  it('defaults to USD', () => {
    expect(formatCost(1.25)).toBe('$1.25');
  });
});

describe('formatCostCompact', () => {
  it('formats large amounts', () => {
    expect(formatCostCompact(1500)).toBe('$1.5K');
  });

  it('formats small amounts', () => {
    expect(formatCostCompact(42.5)).toBe('$42.50');
  });
});

describe('formatPercent', () => {
  it('formats positive', () => {
    expect(formatPercent(12.3)).toBe('+12.3%');
  });

  it('formats negative', () => {
    expect(formatPercent(-5.2)).toBe('-5.2%');
  });
});
