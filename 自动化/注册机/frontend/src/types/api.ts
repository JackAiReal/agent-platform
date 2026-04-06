import type { LogLine, StatItem } from "./runtime";

export type SingleAccountTimingResponse = {
  latest_reg_seconds: number | null;
  latest_oauth_seconds: number | null;
  latest_total_seconds: number | null;
  recent_avg_reg_seconds: number | null;
  recent_avg_oauth_seconds: number | null;
  recent_avg_total_seconds: number | null;
  recent_slow_count: number;
  sample_size: number;
  window_size: number;
};

export type OutputInventoryFileResponse = {
  id: string;
  source: "cpa" | "subapi";
  file_name: string;
  account_key: string;
  updated_at: string;
  size: number;
  path: string;
};

export type OutputInventoryStatusResponse = {
  root_path: string;
  batch_shell_enabled: boolean;
  formats: {
    cpa: {
      exists: boolean;
      path: string;
      file_count: number;
    };
    subapi: {
      exists: boolean;
      path: string;
      file_count: number;
    };
  };
  unique_account_count: number;
  paired_account_count: number;
  last_updated_at: string | null;
  recent_files: OutputInventoryFileResponse[];
};

export type BackendConfig = {
  cfmail: {
    api_base: string;
    api_key: string;
    domain: string;
    domains: string[];
    use_random_subdomain: boolean;
    random_subdomain_length: number;
  };
  clean: {
    base_url: string;
    token: string;
    target_type: string;
    workers: number;
    sample_size: number;
    delete_workers: number;
    timeout: number;
    retries: number;
    user_agent?: string;
    used_percent_threshold: number;
  };
  mail: {
    provider: string;
    api_base: string;
    api_key: string;
    domain: string;
    domains: string[];
    mix_domain_rotation: boolean;
    use_random_subdomain: boolean;
    random_subdomain_length: number;
    otp_timeout_seconds: number;
    poll_interval_seconds: number;
  };
  duckmail: {
    api_base: string;
    bearer: string;
    domain: string;
    domains: string[];
    use_random_subdomain: boolean;
    random_subdomain_length: number;
  };
  tempmail_lol: {
    api_base: string;
  };
  yyds_mail: {
    api_base: string;
    api_key: string;
    domain: string;
    domains: string[];
  };
  maintainer: {
    min_candidates: number;
    loop_interval_seconds: number;
  };
  run: {
    workers: number;
    proxy: string;
    failure_threshold_for_cooldown: number;
    failure_cooldown_seconds: number;
    loop_jitter_min_seconds: number;
    loop_jitter_max_seconds: number;
  };
  flow: {
    step_retry_attempts: number;
    step_retry_delay_base: number;
    step_retry_delay_cap: number;
    outer_retry_attempts: number;
    oauth_local_retry_attempts: number;
    transient_markers: string;
    register_otp_validate_order: string;
    oauth_otp_validate_order: string;
    oauth_password_phone_action: string;
    oauth_otp_phone_action: string;
  };
  registration: {
    entry_mode: string;
    entry_mode_fallback: boolean;
    chatgpt_base: string;
    register_create_account_phone_action: string;
    phone_verification_markers: string;
  };
  oauth: {
    issuer: string;
    client_id: string;
    redirect_uri: string;
    retry_attempts: number;
    retry_backoff_base: number;
    retry_backoff_max: number;
    otp_timeout_seconds: number;
    otp_poll_interval_seconds: number;
  };
  output: {
    accounts_file: string;
    csv_file: string;
    ak_file: string;
    rk_file: string;
    save_local: boolean;
    batch_allow_access_token_only: boolean;
    maintainer_allow_access_token_only: boolean;
  };
};

export type RuntimeStatusResponse = {
  running: boolean;
  run_mode?: string;
  loop_running?: boolean;
  loop_next_check_in_seconds?: number | null;
  phase: string;
  message: string;
  available_candidates: number | null;
  available_candidates_error?: string;
  completed: number;
  total: number;
  percent: number;
  stats: StatItem[];
  single_account_timing?: SingleAccountTimingResponse;
  logs: LogLine[];
  last_log_path?: string;
};

export type BatchStatusResponse = {
  running: boolean;
  run_mode?: string;
  phase: string;
  message: string;
  target_count: number;
  completed: number;
  total: number;
  percent: number;
  stats: StatItem[];
  logs: LogLine[];
  last_log_path?: string;
  output_inventory: OutputInventoryStatusResponse;
};

export type StartRuntimeResponse = {
  ok: boolean;
  started: boolean;
  pid?: number;
  mode?: string;
  message: string;
};

export type StartBatchResponse = {
  ok: boolean;
  started: boolean;
  pid?: number;
  mode?: string;
  target_count?: number;
  message: string;
};

export type StopRuntimeResponse = {
  ok: boolean;
  stopped: boolean;
  message: string;
};

export type StopBatchResponse = {
  ok: boolean;
  stopped: boolean;
  message: string;
};

export type ClearOutputResponse = {
  ok: boolean;
  cleared: boolean;
  deleted_files?: number;
  deleted_dirs?: number;
  message: string;
};

export type UpdateAdminTokenResponse = {
  ok: boolean;
  updated: boolean;
  read_only?: boolean;
  message: string;
};

export type MailDomainRegistryCheckResponse = {
  ok: boolean;
  provider: string;
  api_base: string;
  enabled_domains: string[];
  manual_domains: string[];
  composed_domains: string[];
  default_domain: string;
  message: string;
};

export type AuthState = {
  token: string;
};
