import type {
  TestConfig,
  JobStatus,
  HistoryEntry,
  TestResult,
  ScheduleConfig,
  ScheduleStatus,
  MonitorConfig,
  MonitorStatus,
  ProbeResult,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

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
  request<ScheduleStatus>(`/api/schedules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });

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
  request<MonitorStatus>(`/api/monitors/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });

export const deleteMonitor = (id: string) =>
  request<{ ok: boolean }>(`/api/monitors/${encodeURIComponent(id)}`, { method: 'DELETE' });
