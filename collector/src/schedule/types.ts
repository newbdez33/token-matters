export interface ScheduleParams {
  intervalMinutes: 60 | 1440;
  offsetMinute: number;
  logFile: string;
}

export interface ResolvedPaths {
  npxPath: string;
  nodeBinDir: string;
  collectorMainTs: string;
  collectorDir: string;
  home: string;
}

export interface PlatformScheduler {
  install(params: ScheduleParams, paths: ResolvedPaths, dryRun: boolean): Promise<void>;
  uninstall(dryRun: boolean): Promise<void>;
  isInstalled(): Promise<boolean>;
  describe(): string;
}
