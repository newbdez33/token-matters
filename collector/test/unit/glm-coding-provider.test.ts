import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGlmCodingProvider } from '../../src/providers/glm-coding.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures', 'glm');

function loadFixture(name: string) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'));
}

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GlmCodingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const provider = createGlmCodingProvider({
    apiKey: 'test-key',
    baseUrl: 'https://api.z.ai',
    machine: 'test-machine',
    timezone: 'UTC',
  });

  it('has correct name and dataQuality', () => {
    expect(provider.name).toBe('glm-coding');
    expect(provider.dataQuality).toBe('partial');
  });

  it('isAvailable returns true when apiKey is set', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when apiKey is empty', async () => {
    const p = createGlmCodingProvider({
      apiKey: '',
      baseUrl: 'https://api.z.ai',
      machine: 'test',
      timezone: 'UTC',
    });
    expect(await p.isAvailable()).toBe(false);
  });

  it('collect fetches model-usage and returns RawDataFile', async () => {
    const modelUsage = loadFixture('model-usage.json');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => modelUsage,
    });

    const result = await provider.collect('2026-02-18');
    expect(result.version).toBe('1.0');
    expect(result.provider).toBe('glm-coding');
    expect(result.date).toBe('2026-02-18');
    expect(result.dataQuality).toBe('partial');
    expect(result.records).toHaveLength(1);
    // Feb 18: 15 calls, 80000 tokens
    expect(result.records[0].totalTokens).toBe(80000);
    expect(result.records[0].requests).toBe(15);
  });

  it('collect sends correct auth header (no Bearer)', async () => {
    const modelUsage = loadFixture('model-usage.json');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => modelUsage,
    });

    await provider.collect('2026-02-18');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('test-key');
    expect(opts.headers.Authorization).not.toContain('Bearer');
  });

  it('collect returns empty records when API returns no data for date', async () => {
    const modelUsage = loadFixture('model-usage.json');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => modelUsage,
    });

    const result = await provider.collect('2020-01-01');
    expect(result.records).toEqual([]);
  });

  it('collect throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'bad key',
    });

    await expect(provider.collect('2026-02-18')).rejects.toThrow(/401/);
  });
});
