import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { getHistory, getSchedules, getMonitors, getReport, getJobStatus } from '../lib/api';
import { useToast } from '../components/Toast';
import ReportModal from '../components/ReportModal';
import { successColor, uptimeColor, fmtUptime, formatInterval } from '../lib/utils';
import type { HistoryEntry, ScheduleStatus, MonitorStatus, TestResult, JobStatus } from '../lib/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: 'rgba(255,255,255,0.55)', font: { size: 11 }, boxWidth: 12, padding: 10 } },
    tooltip: { mode: 'index' as const, intersect: false },
  },
  scales: {
    x: { ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 10 }, maxRotation: 30 }, grid: { color: 'rgba(255,255,255,0.05)' } },
    y: { ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
  },
};

export default function DashboardPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [schedules, setSchedules] = useState<ScheduleStatus[]>([]);
  const [monitors, setMonitors] = useState<MonitorStatus[]>([]);
  const [modalReport, setModalReport] = useState<{ result: TestResult; title: string; subtitle: string } | null>(null);

  // Active job tracking
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null);
  const jobPollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const load = useCallback(async () => {
    try {
      const [h, s, m] = await Promise.all([getHistory(), getSchedules(), getMonitors()]);
      setHistory(h);
      setSchedules(s);
      setMonitors(m);
    } catch { toast('Failed to load dashboard', 'error'); }
  }, [toast]);

  // Poll for active job
  const checkActiveJob = useCallback(() => {
    if (jobPollRef.current) { clearInterval(jobPollRef.current); jobPollRef.current = undefined; }
    const jobId = localStorage.getItem('activeJobId');
    if (!jobId) { setActiveJob(null); return; }
    const poll = async () => {
      try {
        const j = await getJobStatus(jobId);
        if (j.status === 'running') {
          setActiveJob(j);
        } else {
          localStorage.removeItem('activeJobId');
          setActiveJob(null);
          if (jobPollRef.current) { clearInterval(jobPollRef.current); jobPollRef.current = undefined; }
        }
      } catch {
        localStorage.removeItem('activeJobId');
        setActiveJob(null);
        if (jobPollRef.current) { clearInterval(jobPollRef.current); jobPollRef.current = undefined; }
      }
    };
    poll();
    jobPollRef.current = setInterval(poll, 5000);
  }, []);

  useEffect(() => {
    load();
    checkActiveJob();
    return () => { if (jobPollRef.current) clearInterval(jobPollRef.current); };
  }, [load, checkActiveJob]);

  const withData = history.filter(e => e.total_requests > 0);
  const n = withData.length;
  const avgSuccess = n ? withData.reduce((s, e) => s + e.success_rate, 0) / n : null;
  const avgThroughput = n ? withData.reduce((s, e) => s + e.throughput_rps, 0) / n : null;
  const avgLatency = n ? withData.reduce((s, e) => s + e.avg_latency_ms, 0) / n : null;

  // Monitor summary
  const monitorsUp = monitors.filter(m => m.current_status === 'up').length;
  const monitorsDown = monitors.filter(m => m.current_status === 'down').length;

  // Chart data
  const sorted = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-10);
  const labels = sorted.map(e => {
    const d = new Date(e.created_at);
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
  });

  const openReport = async (e: HistoryEntry) => {
    try {
      const r = await getReport(e.filename);
      setModalReport({ result: r, title: e.target_url || e.filename, subtitle: new Date(e.created_at).toLocaleString() });
    } catch { toast('Failed to load report', 'error'); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">Overview of all load test activity.</p>
        </div>
        <button onClick={load} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-input bg-transparent hover:bg-accent hover:text-accent-foreground transition-colors gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 11 16 11"/><polyline points="1 20 1 13 8 13"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 11M1 13l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Refresh
        </button>
      </div>

      {/* Active job banner */}
      {activeJob && (
        <div className="animate-in rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-500 anim-dot shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-amber-400">Test running</span>
              <span className="text-xs text-muted-foreground font-mono ml-2">{activeJob.job_id.slice(0, 8)}…</span>
              {activeJob.started_at && (
                <span className="text-xs text-muted-foreground ml-2">· started {new Date(activeJob.started_at).toLocaleTimeString()}</span>
              )}
            </div>
            <button onClick={() => navigate('/test')} className="shrink-0 inline-flex items-center gap-1 rounded-md text-xs font-medium h-7 px-3 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors">
              View <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Tests"
          value={String(history.length)}
          icon={<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>}
        />
        <StatCard
          label="Avg Success Rate"
          value={avgSuccess != null ? (avgSuccess * 100).toFixed(1) + '%' : '—'}
          valueClass={avgSuccess != null ? successColor(avgSuccess) : ''}
          icon={<><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
        />
        <StatCard
          label="Avg Throughput"
          value={avgThroughput != null ? avgThroughput.toFixed(1) : '—'}
          unit="req/s"
          icon={<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>}
        />
        <StatCard
          label="Avg Latency"
          value={avgLatency != null ? avgLatency.toFixed(0) : '—'}
          unit="ms"
          icon={<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}
        />
      </div>

      {/* Charts */}
      {sorted.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg border border-border bg-card p-6 animate-in">
            <h3 className="text-sm font-medium mb-4">Avg Latency Trend — last 10 tests</h3>
            <div className="relative h-52">
              <Line
                data={{
                  labels,
                  datasets: [{
                    label: 'Avg Latency (ms)',
                    data: sorted.map(e => e.avg_latency_ms || null),
                    borderColor: 'rgb(251,191,36)',
                    backgroundColor: 'rgba(251,191,36,0.12)',
                    tension: 0.35,
                    pointRadius: 4,
                    fill: true,
                  }],
                }}
                options={CHART_OPTS}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 animate-in">
            <h3 className="text-sm font-medium mb-4">Throughput &amp; Success Rate — last 10 tests</h3>
            <div className="relative h-52">
              <Bar
                data={{
                  labels,
                  datasets: [
                    {
                      label: 'Throughput (req/s)',
                      data: sorted.map(e => e.throughput_rps || null),
                      backgroundColor: 'rgba(139,92,246,0.55)',
                      borderColor: 'rgba(139,92,246,0.9)',
                      borderWidth: 1,
                      yAxisID: 'y',
                    },
                    {
                      type: 'line' as unknown as 'bar',
                      label: 'Success Rate (%)',
                      data: sorted.map(e => e.success_rate != null ? +(e.success_rate * 100).toFixed(1) : null),
                      borderColor: 'rgb(52,211,153)',
                      backgroundColor: 'rgba(52,211,153,0.08)',
                      pointRadius: 4,
                      fill: false,
                      yAxisID: 'y1',
                    } as any,
                  ],
                }}
                options={{
                  ...CHART_OPTS,
                  scales: {
                    x: CHART_OPTS.scales.x,
                    y: { ...CHART_OPTS.scales.y, title: { display: true, text: 'req/s', color: 'rgba(255,255,255,0.3)', font: { size: 10 } } },
                    y1: {
                      type: 'linear' as const,
                      position: 'right' as const,
                      min: 0,
                      max: 100,
                      ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 10 }, callback: (v: string | number) => v + '%' },
                      grid: { drawOnChartArea: false },
                      title: { display: true, text: '%', color: 'rgba(255,255,255,0.3)', font: { size: 10 } },
                    },
                  },
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg border border-border bg-card p-6 animate-in">
            <h3 className="text-sm font-medium mb-4">Avg Latency Trend — last 10 tests</h3>
            <div className="h-52 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">Run some tests to see trends</p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-6 animate-in">
            <h3 className="text-sm font-medium mb-4">Throughput &amp; Success Rate — last 10 tests</h3>
            <div className="h-52 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">Run some tests to see trends</p>
            </div>
          </div>
        </div>
      )}

      {/* Middle row: monitors overview */}
      {monitors.length > 0 && (
        <div className="rounded-lg border border-border bg-card animate-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium">Monitors</h3>
              <div className="flex items-center gap-2 text-[11px]">
                {monitorsUp > 0 && (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{monitorsUp} up
                  </span>
                )}
                {monitorsDown > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{monitorsDown} down
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => navigate('/monitors')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">View all →</button>
          </div>
          <div className="divide-y divide-border">
            {monitors.slice(0, 5).map(m => {
              const dotColor = m.current_status === 'up' ? 'bg-emerald-500' : m.current_status === 'down' ? 'bg-red-500' : 'bg-zinc-500';
              const statusText = m.current_status === 'up' ? 'Up' : m.current_status === 'down' ? 'Down' : 'Pending';
              const statusCls = m.current_status === 'up' ? 'text-emerald-400' : m.current_status === 'down' ? 'text-red-400' : 'text-muted-foreground';
              return (
                <div key={m.monitor_id} className="flex items-center gap-3 px-5 py-3">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} ${m.current_status === 'up' ? 'anim-dot' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{m.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{m.url}</p>
                  </div>
                  <span className={`text-[10px] font-medium ${statusCls}`}>{statusText}</span>
                  <span className={`text-[10px] font-mono ${uptimeColor(m.uptime_24h)}`}>{fmtUptime(m.uptime_24h)}</span>
                  {m.last_latency_ms != null && (
                    <span className="text-[10px] text-muted-foreground font-mono">{m.last_latency_ms.toFixed(0)} ms</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-2">
        {/* Active schedules */}
        <div className="rounded-lg border border-border bg-card animate-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-medium">Active Schedules</h3>
            <button onClick={() => navigate('/schedules')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">View all →</button>
          </div>
          <div className="divide-y divide-border">
            {schedules.length === 0 && <div className="px-5 py-8 text-center text-xs text-muted-foreground">No schedules yet</div>}
            {schedules.slice(0, 5).map(s => (
              <div key={s.schedule_id} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{s.test_config.target_url}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {s.last_status && <ScheduleStatusBadge status={s.last_status} />}
                  <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">{formatInterval(s.interval_seconds)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent tests */}
        <div className="rounded-lg border border-border bg-card animate-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="text-sm font-medium">Recent Tests</h3>
            <button onClick={() => navigate('/history')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">View all →</button>
          </div>
          <div className="divide-y divide-border">
            {history.length === 0 && <div className="px-5 py-8 text-center text-xs text-muted-foreground">No tests yet</div>}
            {history.slice(0, 5).map(e => {
              const hasRate = e.total_requests > 0;
              const sRate = hasRate ? (e.success_rate * 100).toFixed(1) + '%' : '—';
              const sColor = !hasRate ? 'text-muted-foreground' : successColor(e.success_rate);
              return (
                <button key={e.filename} onClick={() => openReport(e)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono truncate">{e.target_url || e.filename}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(e.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`text-xs font-mono font-medium ${sColor}`}>{sRate}</span>
                  {e.throughput_rps > 0 && <span className="text-[10px] text-muted-foreground">{e.throughput_rps.toFixed(1)} req/s</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <ReportModal
        open={!!modalReport}
        onClose={() => setModalReport(null)}
        result={modalReport?.result ?? null}
        title={modalReport?.title}
        subtitle={modalReport?.subtitle}
      />
    </div>
  );
}

function StatCard({ label, value, unit, valueClass, icon }: { label: string; value: string; unit?: string; valueClass?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 animate-in">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">{icon}</svg>
      </div>
      <p className={`text-3xl font-bold font-mono tabular-nums ${valueClass || ''}`}>
        {value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
    </div>
  );
}

function ScheduleStatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <span className="text-[10px] font-mono text-emerald-400">✓</span>;
  if (status === 'running') return <span className="text-[10px] font-mono text-amber-400">…</span>;
  if (status === 'failed') return <span className="text-[10px] font-mono text-red-400">✗</span>;
  return null;
}
