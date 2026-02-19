import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { loadConfig } from '../../src/config.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');

describe('loadConfig', () => {
  it('parses a valid config file', () => {
    const config = loadConfig(join(fixturesDir, 'config-valid.yaml'));
    expect(config.machine).toBe('macbook-pro');
    expect(config.timezone).toBe('Asia/Shanghai');
    expect(config.providers['claude-code'].enabled).toBe(true);
    expect(config.providers['glm-coding'].enabled).toBe(false);
  });

  it('expands ~ in dataRepo path', () => {
    const config = loadConfig(join(fixturesDir, 'config-valid.yaml'));
    expect(config.dataRepo).not.toContain('~');
    expect(config.dataRepo).toContain('projects/token-matters-data');
  });

  it('derives machine name from hostname when not specified', () => {
    const config = loadConfig(join(fixturesDir, 'config-minimal.yaml'));
    // machine is not in config-minimal, should be auto-derived
    expect(config.machine).toMatch(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/);
    expect(config.machine.length).toBeGreaterThan(0);
  });

  it('applies defaults for minimal config', () => {
    const config = loadConfig(join(fixturesDir, 'config-minimal.yaml'));
    expect(config.timezone).toBe('Asia/Shanghai');
    expect(config.providers).toEqual({});
  });

  it('throws on missing file', () => {
    expect(() => loadConfig('/nonexistent/config.yaml')).toThrow();
  });
});
