import { describe, it, expect, vi } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defaultClaudeDir, defaultTraeDir, defaultCodexDir, defaultOpenCodeDir, expandHome } from '../../src/utils/paths.js';

const home = homedir();

describe('defaultClaudeDir', () => {
  it('returns ~/.claude on all platforms', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      expect(defaultClaudeDir(platform)).toBe(join(home, '.claude'));
    }
  });
});

describe('defaultTraeDir', () => {
  it('returns ~/Library/Application Support/Trae on macOS', () => {
    expect(defaultTraeDir('darwin')).toBe(
      join(home, 'Library', 'Application Support', 'Trae'),
    );
  });

  it('returns %APPDATA%/Trae on Windows', () => {
    const original = process.env.APPDATA;
    try {
      process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
      expect(defaultTraeDir('win32')).toBe(
        join('C:\\Users\\test\\AppData\\Roaming', 'Trae'),
      );
    } finally {
      process.env.APPDATA = original;
    }
  });

  it('falls back to ~/AppData/Roaming/Trae on Windows without APPDATA', () => {
    const original = process.env.APPDATA;
    try {
      delete process.env.APPDATA;
      expect(defaultTraeDir('win32')).toBe(
        join(home, 'AppData', 'Roaming', 'Trae'),
      );
    } finally {
      process.env.APPDATA = original;
    }
  });

  it('returns $XDG_CONFIG_HOME/Trae on Linux with XDG set', () => {
    const original = process.env.XDG_CONFIG_HOME;
    try {
      process.env.XDG_CONFIG_HOME = '/custom/config';
      expect(defaultTraeDir('linux')).toBe(join('/custom/config', 'Trae'));
    } finally {
      process.env.XDG_CONFIG_HOME = original;
    }
  });

  it('returns ~/.config/Trae on Linux without XDG', () => {
    const original = process.env.XDG_CONFIG_HOME;
    try {
      delete process.env.XDG_CONFIG_HOME;
      expect(defaultTraeDir('linux')).toBe(join(home, '.config', 'Trae'));
    } finally {
      process.env.XDG_CONFIG_HOME = original;
    }
  });
});

describe('defaultCodexDir', () => {
  it('returns ~/.codex by default', () => {
    const original = process.env.CODEX_HOME;
    try {
      delete process.env.CODEX_HOME;
      expect(defaultCodexDir()).toBe(join(home, '.codex'));
    } finally {
      process.env.CODEX_HOME = original;
    }
  });

  it('uses CODEX_HOME env var when set', () => {
    const original = process.env.CODEX_HOME;
    try {
      process.env.CODEX_HOME = '/custom/codex';
      expect(defaultCodexDir()).toBe('/custom/codex');
    } finally {
      process.env.CODEX_HOME = original;
    }
  });
});

describe('defaultOpenCodeDir', () => {
  it('returns ~/.local/share/opencode by default', () => {
    const original = process.env.XDG_DATA_HOME;
    try {
      delete process.env.XDG_DATA_HOME;
      expect(defaultOpenCodeDir()).toBe(join(home, '.local', 'share', 'opencode'));
    } finally {
      process.env.XDG_DATA_HOME = original;
    }
  });

  it('uses XDG_DATA_HOME env var when set', () => {
    const original = process.env.XDG_DATA_HOME;
    try {
      process.env.XDG_DATA_HOME = '/custom/data';
      expect(defaultOpenCodeDir()).toBe(join('/custom/data', 'opencode'));
    } finally {
      process.env.XDG_DATA_HOME = original;
    }
  });
});

describe('expandHome', () => {
  it('expands ~/ to home directory', () => {
    expect(expandHome('~/projects')).toBe(join(home, 'projects'));
  });

  it('expands bare ~', () => {
    expect(expandHome('~')).toBe(home);
  });

  it('does not expand paths without ~', () => {
    expect(expandHome('/absolute/path')).toBe('/absolute/path');
  });

  it('does not expand ~ in the middle of a path', () => {
    expect(expandHome('/some/~/path')).toBe('/some/~/path');
  });
});
