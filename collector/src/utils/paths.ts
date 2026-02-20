import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Returns the default data directory for a provider based on the current platform.
 * Users can override these in config.yaml.
 */

export function defaultClaudeDir(platform = process.platform): string {
  const home = homedir();
  // ~/.claude is the same on all platforms
  return join(home, '.claude');
}

export function defaultTraeDir(platform = process.platform): string {
  const home = homedir();
  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Trae');
    case 'win32':
      return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Trae');
    default:
      // Linux and others: XDG convention
      return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'Trae');
  }
}

export function defaultCodexDir(): string {
  return process.env.CODEX_HOME ?? join(homedir(), '.codex');
}

export function defaultOpenCodeDir(): string {
  const xdgData = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(xdgData, 'opencode');
}

export function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return homedir() + p.slice(1);
  }
  return p;
}
