import { readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { parse as parseYaml } from 'yaml';
import type { CollectorConfig } from './providers/types.js';

function deriveMachineName(): string {
  return hostname()
    .replace(/\.local$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function expandHome(p: string): string {
  if (p.startsWith('~/')) {
    return homedir() + p.slice(1);
  }
  return p;
}

export function loadConfig(configPath: string): CollectorConfig {
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const data = parseYaml(raw);
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid config: expected a YAML object');
  }

  if (!data.dataRepo || typeof data.dataRepo !== 'string') {
    throw new Error('Config missing required field: dataRepo');
  }

  const providers: CollectorConfig['providers'] = {};
  if (data.providers && typeof data.providers === 'object') {
    for (const [name, cfg] of Object.entries(data.providers)) {
      if (cfg && typeof cfg === 'object') {
        const providerCfg = cfg as Record<string, unknown>;
        providers[name] = {
          enabled: providerCfg.enabled !== false,
          ...providerCfg,
        };
      }
    }
  }

  const machine = typeof data.machine === 'string' && data.machine
    ? data.machine
    : deriveMachineName();

  return {
    machine,
    dataRepo: expandHome(data.dataRepo),
    timezone: data.timezone ?? 'Asia/Shanghai',
    providers,
  };
}
