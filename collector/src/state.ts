import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CollectorState } from './providers/types.js';

const DEFAULT_STATE: CollectorState = {
  lastRun: '',
  providers: {},
};

export function loadState(statePath: string): CollectorState {
  try {
    const raw = readFileSync(statePath, 'utf-8');
    const data = JSON.parse(raw);
    return {
      lastRun: data.lastRun ?? '',
      providers: data.providers ?? {},
    };
  } catch {
    return { ...DEFAULT_STATE, providers: {} };
  }
}

export function saveState(statePath: string, state: CollectorState): void {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}
