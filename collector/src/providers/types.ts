export type DataQuality = 'exact' | 'estimated' | 'partial';

export interface RawRecord {
  timestamp?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  totalTokens?: number;
  cost?: number;
  currency?: string;
  requests?: number;
  sessions?: number;
  note?: string;
}

export interface RawDataFile {
  version: '1.0';
  collectedAt: string;
  machine: string;
  provider: string;
  date: string;
  dataQuality: DataQuality;
  records: RawRecord[];
}

export interface CollectorProvider {
  readonly name: string;
  readonly dataQuality: DataQuality;
  isAvailable(): Promise<boolean>;
  collect(date: string): Promise<RawDataFile>;
}

export interface ProviderState {
  lastCollectedDate: string;
  checkpoint?: string;
}

export interface CollectorState {
  lastRun: string;
  providers: Record<string, ProviderState>;
}

export interface ProviderConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface CollectorConfig {
  machine: string;
  dataRepo: string;
  timezone: string;
  providers: Record<string, ProviderConfig>;
}
