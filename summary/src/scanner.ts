import fs from 'node:fs/promises';
import path from 'node:path';
import type { RawDataFile } from './types.js';

export async function scanRawFiles(rawDir: string): Promise<RawDataFile[]> {
  const files: RawDataFile[] = [];

  let machines: string[];
  try {
    machines = await fs.readdir(rawDir);
  } catch {
    return [];
  }

  for (const machine of machines) {
    const machinePath = path.join(rawDir, machine);
    const stat = await fs.stat(machinePath).catch(() => null);
    if (!stat?.isDirectory()) continue;

    const providers = await fs.readdir(machinePath);
    for (const provider of providers) {
      const providerPath = path.join(machinePath, provider);
      const pStat = await fs.stat(providerPath).catch(() => null);
      if (!pStat?.isDirectory()) continue;

      const entries = await fs.readdir(providerPath);
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        const filePath = path.join(providerPath, entry);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const data = JSON.parse(content) as RawDataFile;
          if (data.version && data.records) {
            files.push(data);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  return files;
}
