import type { CollectorProvider, DataQuality, RawDataFile } from './types.js';

export function createTraeProProvider(): CollectorProvider {
  return {
    name: 'trae-pro',
    dataQuality: 'estimated' as DataQuality,

    async isAvailable(): Promise<boolean> {
      throw new Error('trae-pro provider not implemented');
    },

    async collect(_date: string): Promise<RawDataFile> {
      throw new Error('trae-pro provider not implemented');
    },
  };
}
