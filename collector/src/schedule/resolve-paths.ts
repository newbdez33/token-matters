import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import type { ResolvedPaths } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function resolvePaths(): ResolvedPaths {
  // Use the same Node installation that's running this process
  const nodeBinDir = dirname(process.execPath);
  const npxName = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const npxPath = join(nodeBinDir, npxName);

  if (!existsSync(npxPath)) {
    throw new Error(`npx not found at ${npxPath} — is Node installed correctly?`);
  }

  // collector/src/schedule/resolve-paths.ts → collector/src/main.ts
  const collectorMainTs = resolve(__dirname, '..', 'main.ts');
  // collector/src/schedule/ → collector/
  const collectorDir = resolve(__dirname, '..', '..');

  return {
    npxPath,
    nodeBinDir,
    collectorMainTs,
    collectorDir,
    home: homedir(),
  };
}
