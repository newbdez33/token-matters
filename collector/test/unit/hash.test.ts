import { describe, it, expect } from 'vitest';
import { computeHash } from '../../src/hash.js';
import type { RawRecord } from '../../src/providers/types.js';

describe('computeHash', () => {
  const machine = 'macbook-pro';
  const provider = 'claude-code';
  const date = '2026-02-19';
  const records: RawRecord[] = [
    { model: 'claude-opus-4-6', inputTokens: 100, outputTokens: 50 },
  ];

  it('returns a 6 character hex string', () => {
    const hash = computeHash(machine, provider, date, records);
    expect(hash).toMatch(/^[0-9a-f]{6}$/);
  });

  it('is deterministic', () => {
    const hash1 = computeHash(machine, provider, date, records);
    const hash2 = computeHash(machine, provider, date, records);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = computeHash(machine, provider, date, records);
    const hash2 = computeHash(machine, provider, '2026-02-20', records);
    const hash3 = computeHash('imac-studio', provider, date, records);
    expect(hash1).not.toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it('handles empty records', () => {
    const hash = computeHash(machine, provider, date, []);
    expect(hash).toMatch(/^[0-9a-f]{6}$/);
  });
});
