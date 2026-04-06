export type SelectOption = {
  label: string;
  value: string;
};

export type ConfigField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "password" | "number" | "checkbox" | "select";
  value: string | number | boolean;
  sensitive?: boolean;
  options?: SelectOption[];
  hint?: string;
};

export type ConfigSection = {
  key: string;
  label: string;
  columns?: 1 | 2 | 3;
  fields: ConfigField[];
};

export type StatItem = {
  label: string;
  value: number;
  icon: string;
  tone: "success" | "danger" | "pending";
};

export type LogLine = {
  id: string;
  prefix: string;
  timestamp: string;
  message: string;
  tone: "muted" | "info" | "success" | "warning" | "danger";
};

export type OutputInventoryFile = {
  id: string;
  source: "cpa" | "subapi";
  fileName: string;
  accountKey: string;
  updatedAt: string;
  size: number;
  path: string;
};

export type OutputInventoryState = {
  rootPath: string;
  batchShellEnabled: boolean;
  cpa: {
    exists: boolean;
    path: string;
    fileCount: number;
  };
  subapi: {
    exists: boolean;
    path: string;
    fileCount: number;
  };
  uniqueAccountCount: number;
  pairedAccountCount: number;
  lastUpdatedAt: string | null;
  recentFiles: OutputInventoryFile[];
};

export type BatchMonitorState = {
  running: boolean;
  runMode?: string;
  phase: string;
  message: string;
  targetCount: number;
  completed: number;
  total: number;
  percent: number;
  stats: StatItem[];
  logs: LogLine[];
  lastLogPath?: string;
};

export type MonitorState = {
  running: boolean;
  runMode?: string;
  loopRunning?: boolean;
  loopNextCheckInSeconds?: number | null;
  phase: string;
  message: string;
  availableCandidates: number | null;
  availableCandidatesError?: string;
  completed: number;
  total: number;
  percent: number;
  stats: StatItem[];
  singleAccountTiming: {
    latestRegSeconds: number | null;
    latestOauthSeconds: number | null;
    latestTotalSeconds: number | null;
    recentAvgRegSeconds: number | null;
    recentAvgOauthSeconds: number | null;
    recentAvgTotalSeconds: number | null;
    recentSlowCount: number;
    sampleSize: number;
    windowSize: number;
  };
  logs: LogLine[];
};
