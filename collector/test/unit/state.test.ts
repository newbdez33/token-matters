import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadState, saveState } from '../../src/state.js';

describe('state', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tm-state-'));
    statePath = join(tmpDir, 'nested', 'state.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns default state when file is missing', () => {
    const state = loadState(statePath);
    expect(state.lastRun).toBe('');
    expect(state.providers).toEqual({});
  });

  it('reads existing state file', () => {
    const fixture = join(import.meta.dirname, '..', 'fixtures', 'state.json');
    const state = loadState(fixture);
    expect(state.lastRun).toBe('2026-02-18T12:00:00.000Z');
    expect(state.providers['claude-code'].lastCollectedDate).toBe('2026-02-18');
  });

  it('creates parent directories when saving', () => {
    const state = { lastRun: '2026-02-19T00:00:00Z', providers: {} };
    saveState(statePath, state);
    expect(existsSync(statePath)).toBe(true);
  });

  it('round-trips state through save/load', () => {
    const state = {
      lastRun: '2026-02-19T00:00:00Z',
      providers: {
        'claude-code': { lastCollectedDate: '2026-02-19' },
      },
    };
    saveState(statePath, state);
    const loaded = loadState(statePath);
    expect(loaded).toEqual(state);
  });

  it('merges provider state on save', () => {
    const state1 = {
      lastRun: '2026-02-18T00:00:00Z',
      providers: {
        'claude-code': { lastCollectedDate: '2026-02-18' },
      },
    };
    saveState(statePath, state1);

    const state2 = {
      lastRun: '2026-02-19T00:00:00Z',
      providers: {
        'claude-code': { lastCollectedDate: '2026-02-19' },
        'glm-coding': { lastCollectedDate: '2026-02-19' },
      },
    };
    saveState(statePath, state2);
    const loaded = loadState(statePath);
    expect(loaded.providers['claude-code'].lastCollectedDate).toBe('2026-02-19');
    expect(loaded.providers['glm-coding'].lastCollectedDate).toBe('2026-02-19');
  });
});
