import { configToSections, normalizeBackendConfig, sectionsToConfig } from "../lib/config-schema";
import type {
  AuthState,
  BatchStatusResponse,
  BackendConfig,
  OutputInventoryStatusResponse,
  RuntimeStatusResponse,
  StartBatchResponse,
  StartRuntimeResponse,
  StopBatchResponse,
  StopRuntimeResponse,
  ClearOutputResponse,
  MailDomainRegistryCheckResponse,
  UpdateAdminTokenResponse,
} from "../types/api";
import type { BatchMonitorState, ConfigSection, MonitorState, OutputInventoryState } from "../types/runtime";

const AUTH_STORAGE_KEY = "apm_admin_token";

function resolveApiBase(): string {
  const configuredBase = import.meta.env.VITE_API_BASE?.trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, "");
  }

  return "";
}

const API_BASE = resolveApiBase();

function buildApiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

export function getStoredAuth(): AuthState {
  return {
    token: window.sessionStorage.getItem(AUTH_STORAGE_KEY) ?? "",
  };
}

export function storeAuthToken(token: string): void {
  window.sessionStorage.setItem(AUTH_STORAGE_KEY, token);
}

export function clearAuthToken(): void {
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
}

async function getBlob(
  path: string,
  init?: RequestInit,
  token?: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const adminToken = token ?? getStoredAuth().token;
  const url = buildApiUrl(path);
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(adminToken ? { "X-Admin-Token": adminToken } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new ApiRequestError(`${init?.method ?? "GET"} ${url} failed: ${response.status}`, response.status);
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] ?? null,
  };
}

async function getJson<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const adminToken = token ?? getStoredAuth().token;
  const url = buildApiUrl(path);
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { "X-Admin-Token": adminToken } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new ApiRequestError(`${init?.method ?? "GET"} ${url} failed: ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}

export async function verifyAuthToken(token: string): Promise<void> {
  await getJson<{ ok: boolean; time: string }>("/api/health", undefined, token);
  await getJson<Partial<BackendConfig>>("/api/config", undefined, token);
}

export async function fetchConfig(): Promise<ConfigSection[]> {
  const config = await getJson<Partial<BackendConfig>>("/api/config");
  return configToSections(normalizeBackendConfig(config));
}

export async function fetchBackendConfig(): Promise<BackendConfig> {
  const config = await getJson<Partial<BackendConfig>>("/api/config");
  return normalizeBackendConfig(config);
}

export async function saveConfig(sections: ConfigSection[]): Promise<ConfigSection[]> {
  const saved = await getJson<BackendConfig>("/api/config", {
    method: "POST",
    body: JSON.stringify(sectionsToConfig(sections)),
  });
  return configToSections(normalizeBackendConfig(saved));
}

export async function saveBackendConfig(config: BackendConfig): Promise<BackendConfig> {
  const saved = await getJson<BackendConfig>("/api/config", {
    method: "POST",
    body: JSON.stringify(config),
  });
  return normalizeBackendConfig(saved);
}

export async function fetchMonitorState(): Promise<MonitorState> {
  const status = await getJson<RuntimeStatusResponse>("/api/runtime/status");
  const timing = status.single_account_timing;
  return {
    running: status.running,
    runMode: status.run_mode ?? "",
    loopRunning: status.loop_running ?? false,
    loopNextCheckInSeconds: status.loop_next_check_in_seconds ?? null,
    phase: status.phase,
    message: status.message,
    availableCandidates: status.available_candidates,
    availableCandidatesError: status.available_candidates_error,
    completed: status.completed,
    total: status.total,
    percent: status.percent,
    stats: status.stats,
    singleAccountTiming: {
      latestRegSeconds: timing?.latest_reg_seconds ?? null,
      latestOauthSeconds: timing?.latest_oauth_seconds ?? null,
      latestTotalSeconds: timing?.latest_total_seconds ?? null,
      recentAvgRegSeconds: timing?.recent_avg_reg_seconds ?? null,
      recentAvgOauthSeconds: timing?.recent_avg_oauth_seconds ?? null,
      recentAvgTotalSeconds: timing?.recent_avg_total_seconds ?? null,
      recentSlowCount: timing?.recent_slow_count ?? 0,
      sampleSize: timing?.sample_size ?? 0,
      windowSize: timing?.window_size ?? 20,
    },
    logs: status.logs,
  };
}

export async function fetchOutputInventoryState(): Promise<OutputInventoryState> {
  const status = await getJson<OutputInventoryStatusResponse>("/api/output/status");
  return {
    rootPath: status.root_path,
    batchShellEnabled: status.batch_shell_enabled,
    cpa: {
      exists: status.formats.cpa.exists,
      path: status.formats.cpa.path,
      fileCount: status.formats.cpa.file_count,
    },
    subapi: {
      exists: status.formats.subapi.exists,
      path: status.formats.subapi.path,
      fileCount: status.formats.subapi.file_count,
    },
    uniqueAccountCount: status.unique_account_count,
    pairedAccountCount: status.paired_account_count,
    lastUpdatedAt: status.last_updated_at,
    recentFiles: status.recent_files.map((item) => ({
      id: item.id,
      source: item.source,
      fileName: item.file_name,
      accountKey: item.account_key,
      updatedAt: item.updated_at,
      size: item.size,
      path: item.path,
    })),
  };
}

export async function fetchBatchState(): Promise<BatchMonitorState> {
  const status = await getJson<BatchStatusResponse>("/api/batch/status");
  return {
    running: status.running,
    runMode: status.run_mode ?? "",
    phase: status.phase,
    message: status.message,
    targetCount: status.target_count,
    completed: status.completed,
    total: status.total,
    percent: status.percent,
    stats: status.stats,
    logs: status.logs,
    lastLogPath: status.last_log_path,
  };
}

export async function startRuntime(): Promise<StartRuntimeResponse> {
  return getJson<StartRuntimeResponse>("/api/runtime/start", {
    method: "POST",
    body: "{}",
  });
}

export async function startRuntimeLoop(): Promise<StartRuntimeResponse> {
  return getJson<StartRuntimeResponse>("/api/runtime/start-loop", {
    method: "POST",
    body: "{}",
  });
}

export async function stopRuntime(): Promise<StopRuntimeResponse> {
  return getJson<StopRuntimeResponse>("/api/runtime/stop", {
    method: "POST",
    body: "{}",
  });
}

export async function startBatchRuntime(targetCount: number): Promise<StartBatchResponse> {
  return getJson<StartBatchResponse>("/api/batch/start", {
    method: "POST",
    body: JSON.stringify({ target_count: targetCount }),
  });
}

export async function stopBatchRuntime(): Promise<StopBatchResponse> {
  return getJson<StopBatchResponse>("/api/batch/stop", {
    method: "POST",
    body: "{}",
  });
}

export async function updateAdminToken(token: string): Promise<UpdateAdminTokenResponse> {
  return getJson<UpdateAdminTokenResponse>("/api/admin/token", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function downloadOutputArchive(): Promise<{ blob: Blob; filename: string | null }> {
  return getBlob("/api/output/download");
}

export async function clearOutputInventory(): Promise<ClearOutputResponse> {
  return getJson<ClearOutputResponse>("/api/output/clear", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function checkMailDomainRegistry(payload: {
  provider: string;
  api_base: string;
  api_key: string;
}): Promise<MailDomainRegistryCheckResponse> {
  return getJson<MailDomainRegistryCheckResponse>("/api/mail/domain-registry/check", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
