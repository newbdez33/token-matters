import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildProviders } from '../../src/main.js';
import type { CollectorConfig } from '../../src/providers/types.js';

const home = homedir();

function makeConfig(overrides: Partial<CollectorConfig> = {}): CollectorConfig {
  return {
    machine: 'test-machine',
    dataRepo: '/tmp/data',
    timezone: 'UTC',
    providers: {},
    ...overrides,
  };
}

describe('buildProviders', () => {
  it('uses default claude dir (~/.claude) when not configured', () => {
    const config = makeConfig({
      providers: { 'claude-code': { enabled: true } },
    });
    const built = buildProviders(config);
    const claude = built.find(b => b.provider.name === 'claude-code');
    expect(claude).toBeDefined();
    expect(claude!.resolvedPath).toBe(join(home, '.claude', 'projects'));
  });

  it('uses configured claudeDir with ~ expansion', () => {
    const config = makeConfig({
      providers: { 'claude-code': { enabled: true, claudeDir: '~/custom-claude' } },
    });
    const built = buildProviders(config);
    const claude = built.find(b => b.provider.name === 'claude-code');
    expect(claude!.resolvedPath).toBe(join(home, 'custom-claude', 'projects'));
  });

  it('uses platform-appropriate default trae dir', () => {
    const config = makeConfig({
      providers: { 'trae-pro': { enabled: true } },
    });
    const built = buildProviders(config);
    const trae = built.find(b => b.provider.name === 'trae-pro');
    expect(trae).toBeDefined();
    // On current platform, the resolvedPath should end with /logs
    expect(trae!.resolvedPath).toMatch(/logs$/);
  });

  it('uses configured traeDir with ~ expansion', () => {
    const config = makeConfig({
      providers: { 'trae-pro': { enabled: true, traeDir: '~/my-trae' } },
    });
    const built = buildProviders(config);
    const trae = built.find(b => b.provider.name === 'trae-pro');
    expect(trae!.resolvedPath).toBe(join(home, 'my-trae', 'logs'));
  });

  it('uses default codex dir (~/.codex) when not configured', () => {
    const config = makeConfig({
      providers: { 'codex': { enabled: true } },
    });
    const built = buildProviders(config);
    const codex = built.find(b => b.provider.name === 'codex');
    expect(codex).toBeDefined();
    expect(codex!.resolvedPath).toBe(join(home, '.codex', 'sessions'));
  });

  it('uses configured codexDir with ~ expansion', () => {
    const config = makeConfig({
      providers: { 'codex': { enabled: true, codexDir: '~/my-codex' } },
    });
    const built = buildProviders(config);
    const codex = built.find(b => b.provider.name === 'codex');
    expect(codex!.resolvedPath).toBe(join(home, 'my-codex', 'sessions'));
  });

  it('uses default opencode dir when not configured', () => {
    const config = makeConfig({
      providers: { 'opencode': { enabled: true } },
    });
    const built = buildProviders(config);
    const oc = built.find(b => b.provider.name === 'opencode');
    expect(oc).toBeDefined();
    expect(oc!.resolvedPath).toMatch(/opencode\.db$/);
  });

  it('uses configured openCodeDir with ~ expansion', () => {
    const config = makeConfig({
      providers: { 'opencode': { enabled: true, openCodeDir: '~/my-opencode' } },
    });
    const built = buildProviders(config);
    const oc = built.find(b => b.provider.name === 'opencode');
    expect(oc!.resolvedPath).toBe(join(home, 'my-opencode', 'opencode.db'));
  });

  it('skips disabled providers', () => {
    const config = makeConfig({
      providers: {
        'claude-code': { enabled: false },
        'trae-pro': { enabled: false },
        'codex': { enabled: false },
        'opencode': { enabled: false },
      },
    });
    const built = buildProviders(config);
    expect(built).toHaveLength(0);
  });

  it('includes glm-coding only when apiKey is provided', () => {
    const config = makeConfig({
      providers: { 'glm-coding': { enabled: true, apiKey: 'test-key' } },
    });
    const built = buildProviders(config);
    const glm = built.find(b => b.provider.name === 'glm-coding');
    expect(glm).toBeDefined();
    expect(glm!.resolvedPath).toBe('https://open.bigmodel.cn');
  });

  it('reports unavailable for nonexistent path', async () => {
    const config = makeConfig({
      providers: { 'trae-pro': { enabled: true, traeDir: '/nonexistent/trae-path' } },
    });
    const built = buildProviders(config);
    const trae = built.find(b => b.provider.name === 'trae-pro')!;
    expect(trae.resolvedPath).toBe(join('/nonexistent/trae-path', 'logs'));
    expect(await trae.provider.isAvailable()).toBe(false);
  });
});
