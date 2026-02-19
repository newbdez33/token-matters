import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { computeHash } from './hash.js';
import type { RawDataFile } from './providers/types.js';

export interface WriteResult {
  filePath: string;
  written: boolean;
  dryRun?: boolean;
}

export function writeRawDataFile(
  dataRepoDir: string,
  data: RawDataFile,
  dryRun = false,
): WriteResult {
  const hash = computeHash(data.machine, data.provider, data.date, data.records);
  const relPath = join('raw', data.machine, data.provider, `${data.date}_${hash}.json`);
  const filePath = join(dataRepoDir, relPath);

  if (dryRun) {
    return { filePath, written: false, dryRun: true };
  }

  if (existsSync(filePath)) {
    return { filePath, written: false };
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  return { filePath, written: true };
}
