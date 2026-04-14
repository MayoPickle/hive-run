/* API types — mirrors web/backend/schemas.py */

export type UserRole = 'viewer' | 'operator' | 'admin';

export interface TestConfig {
  target_url: string;
  method?: string;
  duration?: string;
  concurrency?: number;
  ramp_up?: string;
  timeout?: string;
  qps?: number;
  headers?: Record<string, string>;
  body?: string;
  use_proxy?: boolean;
  stop_on_error_rate?: number;
  stop_on_timeout_rate?: number;
  min_samples_before_stop?: number;
  retry_count?: number;
  retry_backoff?: string;
}

export interface LatencySummary {
  average: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface TestResult {
  target_url: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  timeout_count: number;
  success_rate: number;
  throughput_rps: number;
  latency_ms: LatencySummary;
  status_codes: Record<string, number>;
  error_types: Record<string, number>;
}

export interface JobStatus {
  job_id: string;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  console_output: string;
  stopped_early: boolean;
  stop_reason: string;
  result: TestResult | null;
  error: string;
}

export interface HistoryEntry {
  filename: string;
  created_at: string;
  size_bytes: number;
  target_url: string;
  total_requests: number;
  success_rate: number;
  throughput_rps: number;
  avg_latency_ms: number;
  duration_seconds: number;
}

export interface ScheduleConfig {
  name?: string;
  interval_seconds: number;
  test_config: TestConfig;
}

export interface ScheduleStatus {
  schedule_id: string;
  name: string;
  interval_seconds: number;
  test_config: TestConfig;
  enabled: boolean;
  created_at: string;
  run_count: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_job_id: string;
  last_status: string;
}

export interface MonitorConfig {
  name?: string;
  url: string;
  interval_seconds?: number;
  timeout_ms?: number;
}

export interface ProbeResult {
  id?: number;
  monitor_id: string;
  checked_at: string;
  is_up: boolean;
  status_code: number | null;
  latency_ms: number | null;
  error_type: string | null;
}

export interface MonitorStatus {
  monitor_id: string;
  name: string;
  url: string;
  interval_seconds: number;
  timeout_ms: number;
  enabled: boolean;
  created_at: string;
  current_status: 'up' | 'down' | 'pending';
  last_checked_at: string | null;
  last_latency_ms: number | null;
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface CurrentUser {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  can_use_proxy: boolean;
  is_active: boolean;
  last_login_at: string | null;
}

export interface UserSummary extends CurrentUser {
  created_at: string;
  updated_at: string;
}

export interface CreateUserRequest {
  username: string;
  display_name: string;
  password: string;
  role: UserRole;
  can_use_proxy: boolean;
  is_active: boolean;
}

export interface UpdateUserRequest {
  display_name?: string;
  role?: UserRole;
  can_use_proxy?: boolean;
  is_active?: boolean;
}

export interface ResetPasswordRequest {
  new_password: string;
}
