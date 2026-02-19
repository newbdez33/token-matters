import { describe, it, expect } from 'vitest';
import { generateBadge, formatTokens } from '../../src/badge.js';

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

describe('generateBadge', () => {
  it('generates valid SVG', () => {
    const svg = generateBadge(1_200_000, 47.2);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes token count and cost', () => {
    const svg = generateBadge(1_200_000, 47.2);
    expect(svg).toContain('1.2M');
    expect(svg).toContain('$47.20');
  });

  it('includes label text', () => {
    const svg = generateBadge(1_200_000, 47.2);
    expect(svg).toContain('Token Usage (7d)');
  });

  it('handles zero values', () => {
    const svg = generateBadge(0, 0);
    expect(svg).toContain('0');
    expect(svg).toContain('$0.00');
  });
});
