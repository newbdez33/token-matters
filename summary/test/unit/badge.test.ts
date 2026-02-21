import { describe, it, expect } from 'vitest';
import {
  formatTokens,
  formatCost,
  formatRequests,
  formatDateRange,
  generateBadge,
  generateBadges,
  type BadgeData,
} from '../../src/badge.js';

const sampleData: BadgeData = {
  tokens: 479_400_000,
  costUSD: 1717.56,
  requests: 4521,
  dateRange: { start: '2026-02-13', end: '2026-02-19' },
};

describe('formatTokens', () => {
  it('formats millions', () => {
    expect(formatTokens(1_200_000)).toBe('1.2M');
    expect(formatTokens(50_000_000)).toBe('50.0M');
  });

  it('formats thousands', () => {
    expect(formatTokens(856_000)).toBe('856K');
    expect(formatTokens(1_500)).toBe('1.5K');
  });

  it('formats small numbers', () => {
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(0)).toBe('0');
  });
});

describe('formatCost', () => {
  it('formats with commas and two decimals', () => {
    expect(formatCost(1717.56)).toBe('$1,717.56');
  });

  it('formats zero', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('formats small values', () => {
    expect(formatCost(0.5)).toBe('$0.50');
  });
});

describe('formatRequests', () => {
  it('formats thousands', () => {
    expect(formatRequests(4521)).toBe('4.5K');
    expect(formatRequests(12000)).toBe('12K');
  });

  it('formats small numbers with commas', () => {
    expect(formatRequests(500)).toBe('500');
  });
});

describe('formatDateRange', () => {
  it('same month', () => {
    expect(formatDateRange('2026-02-13', '2026-02-19')).toBe('Feb 13\u201319');
  });

  it('cross month', () => {
    expect(formatDateRange('2026-02-13', '2026-03-02')).toBe('Feb 13 \u2013 Mar 2');
  });
});

describe('generateBadge', () => {
  it('generates flat SVG by default', () => {
    const svg = generateBadge(sampleData);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Token Usage (7d)');
    expect(svg).toContain('479.4M');
    // flat theme markers
    expect(svg).toContain('linearGradient');
    expect(svg).toContain('rx="3"');
  });

  it('generates pixel SVG', () => {
    const svg = generateBadge(sampleData, { theme: 'pixel' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain('stroke="#000"');
    expect(svg).toContain('fill="#000"');
    expect(svg).toContain('Consolas');
    expect(svg).toContain('479.4M');
    // no gradients in pixel
    expect(svg).not.toContain('linearGradient');
  });

  it('defaults to tokens only', () => {
    const svg = generateBadge(sampleData);
    expect(svg).toContain('479.4M');
    expect(svg).not.toContain('$');
  });

  it('combines tokens and cost', () => {
    const svg = generateBadge(sampleData, { items: ['tokens', 'cost'] });
    expect(svg).toContain('479.4M');
    expect(svg).toContain('$1,717.56');
    expect(svg).toContain('\u00b7');
  });

  it('combines all three items', () => {
    const svg = generateBadge(sampleData, { items: ['tokens', 'cost', 'dateRange'] });
    expect(svg).toContain('479.4M');
    expect(svg).toContain('$1,717.56');
    expect(svg).toContain('Feb 13');
  });

  it('handles zero values', () => {
    const data: BadgeData = {
      tokens: 0,
      costUSD: 0,
      requests: 0,
      dateRange: { start: '2026-02-13', end: '2026-02-19' },
    };
    const svg = generateBadge(data, { items: ['tokens', 'cost'] });
    expect(svg).toContain('>0');
    expect(svg).toContain('$0.00');
  });

  it('generates dark badge SVG', () => {
    const svg = generateBadge(sampleData, { theme: 'dark' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('AI Tokens I Used');
    expect(svg).toContain('479,400,000');
    expect(svg).toContain('tokens');
    // dark theme markers
    expect(svg).toContain('#171717');
    expect(svg).toContain('#f5f5f5');
    expect(svg).toContain('Inter');
  });
});

describe('generateBadges', () => {
  it('returns all 5 badge files', () => {
    const result = generateBadges(sampleData);
    expect(Object.keys(result).sort()).toEqual([
      'token-usage-cost-pixel.svg',
      'token-usage-cost.svg',
      'token-usage-dark.svg',
      'token-usage-pixel.svg',
      'token-usage.svg',
    ]);
  });

  it('token-only badges have no cost', () => {
    const result = generateBadges(sampleData);
    expect(result['token-usage.svg']).toContain('479.4M');
    expect(result['token-usage.svg']).not.toContain('$');
    expect(result['token-usage-pixel.svg']).toContain('479.4M');
    expect(result['token-usage-pixel.svg']).not.toContain('$');
  });

  it('cost badges include both tokens and cost', () => {
    const result = generateBadges(sampleData);
    expect(result['token-usage-cost.svg']).toContain('479.4M');
    expect(result['token-usage-cost.svg']).toContain('$1,717.56');
    expect(result['token-usage-cost-pixel.svg']).toContain('479.4M');
    expect(result['token-usage-cost-pixel.svg']).toContain('$1,717.56');
  });

  it('flat badges use gradients, pixel badges do not', () => {
    const result = generateBadges(sampleData);
    expect(result['token-usage.svg']).toContain('linearGradient');
    expect(result['token-usage-cost.svg']).toContain('linearGradient');
    expect(result['token-usage-pixel.svg']).not.toContain('linearGradient');
    expect(result['token-usage-cost-pixel.svg']).not.toContain('linearGradient');
  });
});
