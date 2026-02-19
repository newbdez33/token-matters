import type { CollectorProvider, DataQuality, RawDataFile } from './types.js';

export function createGlmCodingProvider(): CollectorProvider {
  return {
    name: 'glm-coding',
    dataQuality: 'partial' as DataQuality,

    async isAvailable(): Promise<boolean> {
      throw new Error('glm-coding provider not implemented');
    },

    async collect(_date: string): Promise<RawDataFile> {
      throw new Error('glm-coding provider not implemented');
    },
  };
}
