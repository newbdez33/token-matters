import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { expandHome } from './utils/paths.js';
import type { CollectorConfig, ScheduleConfig } from './providers/types.js';

function deriveMachineName(): string {
  return hostname()
    .replace(/\.local$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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

  let schedule: ScheduleConfig | undefined;
  if (data.schedule && typeof data.schedule === 'object') {
    const s = data.schedule as Record<string, unknown>;
    const intervalMinutes = s.intervalMinutes ?? 60;
    if (intervalMinutes !== 60 && intervalMinutes !== 1440) {
      throw new Error('Config schedule.intervalMinutes must be 60 (hourly) or 1440 (daily)');
    }
    const offsetMinute = typeof s.offsetMinute === 'number' ? s.offsetMinute : 30;
    if (offsetMinute < 0 || offsetMinute > 59 || !Number.isInteger(offsetMinute)) {
      throw new Error('Config schedule.offsetMinute must be an integer 0–59');
    }
    schedule = {
      intervalMinutes: intervalMinutes as 60 | 1440,
      offsetMinute,
      logFile: typeof s.logFile === 'string' ? s.logFile : undefined,
    };
  }

  return {
    machine,
    dataRepo: expandHome(data.dataRepo),
    timezone: data.timezone ?? 'Asia/Shanghai',
    providers,
    schedule,
  };
}
