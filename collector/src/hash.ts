import { createHash } from 'node:crypto';
import type { RawRecord } from './providers/types.js';

export function computeHash(
  machine: string,
  provider: string,
  date: string,
  records: RawRecord[],
): string {
  const content = machine + provider + date + JSON.stringify(records);
  return createHash('sha256').update(content).digest('hex').slice(0, 6);
}
