import type {
  ChangePasswordRequest,
  CreateUserRequest,
  CurrentUser,
  TestConfig,
  JobStatus,
  HistoryEntry,
  TestResult,
  ScheduleConfig,
  ScheduleStatus,
  MonitorConfig,
  MonitorStatus,
  ProbeResult,
  ResetPasswordRequest,
  UpdateUserRequest,
  UserSummary,
} from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new ApiError(body.detail || `Request failed (${res.status})`, res.status);
    if (res.status === 401 && url !== '/api/auth/login') {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    throw error;
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

const json = (body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ── Auth ──
export const login = (username: string, password: string) =>
  request<CurrentUser>('/api/auth/login', json({ username, password }));

export const logout = () =>
  request<{ ok: boolean; user_id: string }>('/api/auth/logout', { method: 'POST' });

export const getCurrentUser = () =>
  request<CurrentUser>('/api/auth/me');

export const changePassword = (payload: ChangePasswordRequest) =>
  request<CurrentUser>('/api/auth/change-password', json(payload));

export const getUsers = () =>
  request<UserSummary[]>('/api/users');

export const createUser = (payload: CreateUserRequest) =>
  request<UserSummary>('/api/users', json(payload));

export const updateUser = (userId: string, payload: UpdateUserRequest) =>
  request<UserSummary>(`/api/users/${encodeURIComponent(userId)}`, json(payload, 'PATCH'));

export const resetUserPassword = (userId: string, payload: ResetPasswordRequest) =>
  request<UserSummary>(`/api/users/${encodeURIComponent(userId)}/reset-password`, json(payload));

// ── Tests ──
export const runTest = (cfg: TestConfig) =>
  request<{ job_id: string }>('/api/run', json(cfg));

export const getJobStatus = (id: string) =>
  request<JobStatus>(`/api/status/${encodeURIComponent(id)}`);

export const getJobResult = (id: string) =>
  request<JobStatus>(`/api/result/${encodeURIComponent(id)}`);

// ── History ──
export const getHistory = () => request<HistoryEntry[]>('/api/history');

export const getReport = (filename: string) =>
  request<TestResult>(`/api/report/${encodeURIComponent(filename)}`);

// ── Schedules ──
export const getSchedules = () => request<ScheduleStatus[]>('/api/schedules');

export const createSchedule = (cfg: ScheduleConfig) =>
  request<ScheduleStatus>('/api/schedules', json(cfg));

export const toggleSchedule = (id: string, enabled: boolean) =>
  request<ScheduleStatus>(`/api/schedules/${encodeURIComponent(id)}`, json({ enabled }, 'PATCH'));

export const deleteSchedule = (id: string) =>
  request<{ ok: boolean }>(`/api/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ── Monitors ──
export const getMonitors = () => request<MonitorStatus[]>('/api/monitors');

export const createMonitor = (cfg: MonitorConfig) =>
  request<MonitorStatus>('/api/monitors', json(cfg));

export const getMonitor = (id: string) =>
  request<MonitorStatus>(`/api/monitors/${encodeURIComponent(id)}`);

export const getMonitorHistory = (id: string, limit = 100) =>
  request<ProbeResult[]>(`/api/monitors/${encodeURIComponent(id)}/history?limit=${limit}`);

export const toggleMonitor = (id: string, enabled: boolean) =>
  request<MonitorStatus>(`/api/monitors/${encodeURIComponent(id)}`, json({ enabled }, 'PATCH'));

export const deleteMonitor = (id: string) =>
  request<{ ok: boolean }>(`/api/monitors/${encodeURIComponent(id)}`, { method: 'DELETE' });
