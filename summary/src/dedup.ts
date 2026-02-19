import type { RawDataFile } from './types.js';

function dedupKey(f: RawDataFile): string {
  return `${f.provider}|${f.date}|${f.machine}`;
}

function filterSyntheticRecords(file: RawDataFile): RawDataFile {
  const filtered = file.records.filter((r) => {
    if (r.model === '<synthetic>' && (r.totalTokens ?? 0) === 0) return false;
    return true;
  });
  return { ...file, records: filtered };
}

export function dedupFiles(files: RawDataFile[]): RawDataFile[] {
  const map = new Map<string, RawDataFile>();

  for (const file of files) {
    const key = dedupKey(file);
    const existing = map.get(key);
    if (!existing || file.collectedAt > existing.collectedAt) {
      map.set(key, file);
    }
  }

  return Array.from(map.values()).map(filterSyntheticRecords);
}
