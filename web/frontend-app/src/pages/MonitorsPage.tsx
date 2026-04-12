import { useCallback, useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip } from 'chart.js';
import { getMonitors, createMonitor, toggleMonitor, deleteMonitor, getMonitor, getMonitorHistory } from '../lib/api';
import { useToast } from '../components/Toast';
import { fmtUptime, uptimeColor } from '../lib/utils';
import type { MonitorStatus, ProbeResult } from '../lib/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

type View = 'list' | 'detail';

export default function MonitorsPage() {
  const toast = useToast();
  const [list, setList] = useState<MonitorStatus[]>([]);
  const [view, setView] = useState<View>('list');
  const [showForm, setShowForm] = useState(false);
  const [detail, setDetail] = useState<{ monitor: MonitorStatus; history: ProbeResult[] } | null>(null);

  // Form
  const [mName, setMName] = useState('My Service');
  const [mUrl, setMUrl] = useState('');
  const [mInterval, setMInterval] = useState(60);
  const [mTimeout, setMTimeout] = useState(5000);

  const load = useCallback(async () => {
    try { setList(await getMonitors()); } catch { toast('Failed to load monitors', 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMonitor({ name: mName, url: mUrl, interval_seconds: mInterval, timeout_ms: mTimeout });
      toast('Monitor created');
      setShowForm(false);
      load();
    } catch (err: any) { toast(err.message, 'error'); }
  };

  const handleToggle = async (m: MonitorStatus) => {
    await toggleMonitor(m.monitor_id, !m.enabled);
    toast(m.enabled ? 'Monitor paused' : 'Monitor resumed');
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this monitor and all its probe data?')) return;
    await deleteMonitor(id);
    toast('Monitor deleted');
    load();
  };

  const openDetail = async (id: string) => {
    try {
      const [m, h] = await Promise.all([getMonitor(id), getMonitorHistory(id, 90)]);
      setDetail({ monitor: m, history: h });
      setView('detail');
    } catch { toast('Failed to load monitor detail', 'error'); }
  };

  const inputCls = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-ring focus-visible:outline-none focus-visible:ring-1 font-mono';

  if (view === 'detail' && detail) return <DetailView detail={detail} onBack={() => setView('list')} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Uptime Monitors</h2>
          <p className="text-sm text-muted-foreground mt-1">Track availability and response time across your endpoints.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Add Monitor
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 animate-in rounded-lg border border-border bg-card p-6 space-y-5">
          <h3 className="text-sm font-medium">Add Monitor</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name</label>
              <input type="text" value={mName} onChange={e => setMName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">URL <span className="text-red-500">*</span></label>
              <input type="url" required placeholder="https://api.example.com/health" value={mUrl} onChange={e => setMUrl(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Check Interval (seconds)</label>
              <input type="number" min={10} value={mInterval} onChange={e => setMInterval(+e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Timeout (ms)</label>
              <input type="number" min={500} value={mTimeout} onChange={e => setMTimeout(+e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-input bg-transparent hover:bg-accent transition-colors">Cancel</button>
            <button type="submit" className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors">Create</button>
          </div>
        </form>
      )}

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <svg className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          <p className="text-sm text-muted-foreground">No monitors yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add one to start tracking uptime.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(m => {
            const dotColor = m.current_status === 'up' ? 'bg-emerald-500' : m.current_status === 'down' ? 'bg-red-500' : 'bg-zinc-500';
            const statusText = m.current_status === 'up' ? 'Up' : m.current_status === 'down' ? 'Down' : 'Pending';
            const statusTxt = m.current_status === 'up' ? 'text-emerald-400' : m.current_status === 'down' ? 'text-red-400' : 'text-muted-foreground';
            const latency = m.last_latency_ms != null ? m.last_latency_ms.toFixed(0) + ' ms' : '—';
            const lastChecked = m.last_checked_at ? new Date(m.last_checked_at).toLocaleTimeString() : 'Never';

            return (
              <div key={m.monitor_id} className="rounded-lg border border-border bg-card p-5 animate-in">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 mb-1">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${m.current_status === 'up' ? 'anim-dot' : ''}`} />
                      <h4 className="text-sm font-medium truncate">{m.name}</h4>
                      <span className={`text-xs font-medium ${statusTxt}`}>{statusText}</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate ml-4 mb-3">{m.url}</p>
                    <div className="flex items-center gap-5 ml-4 flex-wrap">
                      {(['24h', '7d', '30d'] as const).map(w => {
                        const key = `uptime_${w}` as keyof MonitorStatus;
                        const v = m[key] as number | null;
                        return (
                          <div key={w} className="text-center">
                            <p className="text-[10px] text-muted-foreground mb-0.5">{w}</p>
                            <p className={`text-sm font-bold font-mono ${uptimeColor(v)}`}>{fmtUptime(v)}</p>
                          </div>
                        );
                      })}
                      <div className="border-l border-border pl-5">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Latency</p>
                        <p className="text-sm font-mono">{latency}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Last checked</p>
                        <p className="text-sm text-muted-foreground">{lastChecked}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Interval</p>
                        <p className="text-sm text-muted-foreground">{m.interval_seconds}s</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => openDetail(m.monitor_id)} title="View detail"
                      className="inline-flex items-center justify-center rounded-md h-8 w-8 border border-input hover:bg-accent transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button onClick={() => handleToggle(m)} title={m.enabled ? 'Pause' : 'Resume'}
                      className="inline-flex items-center justify-center rounded-md h-8 w-8 border border-input hover:bg-accent transition-colors">
                      {m.enabled
                        ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>}
                    </button>
                    <button onClick={() => handleDelete(m.monitor_id)} title="Delete"
                      className="inline-flex items-center justify-center rounded-md h-8 w-8 border border-input hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailView({ detail, onBack }: { detail: { monitor: MonitorStatus; history: ProbeResult[] }; onBack: () => void }) {
  const { monitor: m, history } = detail;
  const strip = [...history].reverse();
  const withLatency = strip.filter((p): p is ProbeResult & { latency_ms: number } => p.latency_ms != null).slice(-50);

  const dotColor = m.current_status === 'up' ? 'bg-emerald-500 anim-dot' : m.current_status === 'down' ? 'bg-red-500' : 'bg-zinc-500';
  const statusText = m.current_status === 'up' ? 'Up' : m.current_status === 'down' ? 'Down' : 'Pending';
  const statusTxt = m.current_status === 'up' ? 'text-emerald-400' : m.current_status === 'down' ? 'text-red-400' : 'text-muted-foreground';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          Back to Monitors
        </button>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className={`text-xs ${statusTxt}`}>{statusText}</span>
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight">{m.name}</h2>
        <p className="text-sm text-muted-foreground font-mono mt-1">{m.url}</p>
      </div>

      {/* Uptime cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(['24h', '7d', '30d'] as const).map(w => {
          const key = `uptime_${w}` as keyof MonitorStatus;
          const v = m[key] as number | null;
          return (
            <div key={w} className="rounded-lg border border-border bg-card p-5">
              <p className="text-xs font-medium text-muted-foreground mb-2">Uptime ({w})</p>
              <p className={`text-3xl font-bold font-mono tabular-nums ${uptimeColor(v)}`}>
                {v == null ? '—' : v.toFixed(2) + '%'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Status strip */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Recent probe results</h3>
          <span className="text-xs text-muted-foreground">
            {m.last_checked_at ? `Last checked: ${new Date(m.last_checked_at).toLocaleString()}` : 'Not checked yet'}
          </span>
        </div>
        {strip.length > 0 ? (
          <>
            <div className="flex gap-0.5 flex-wrap">
              {strip.map((p, i) => (
                <div key={i} className={`${p.is_up ? 'bg-emerald-500' : 'bg-red-500'} h-8 flex-1 rounded-sm min-w-[4px]`}
                  title={`${new Date(p.checked_at).toLocaleString()} — ${p.is_up ? 'Up' : 'Down'}${p.latency_ms != null ? ' — ' + p.latency_ms.toFixed(0) + 'ms' : ''}${p.status_code ? ' — HTTP ' + p.status_code : ''}`} />
              ))}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-muted-foreground">Oldest</span>
              <span className="text-[10px] text-muted-foreground">Latest</span>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">No probe data yet</div>
        )}
      </div>

      {/* Latency chart */}
      {withLatency.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5 mb-6">
          <h3 className="text-sm font-medium mb-4">Response time</h3>
          <div className="relative h-48">
            <Line
              data={{
                labels: withLatency.map(p => new Date(p.checked_at).toLocaleTimeString()),
                datasets: [{
                  label: 'Latency (ms)',
                  data: withLatency.map(p => p.latency_ms),
                  borderColor: 'rgb(251,191,36)',
                  backgroundColor: 'rgba(251,191,36,0.1)',
                  tension: 0.3,
                  pointRadius: 3,
                  fill: true,
                  pointBackgroundColor: withLatency.map(p => p.is_up ? 'rgb(52,211,153)' : 'rgb(248,113,113)'),
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                  x: { ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 9 }, maxTicksLimit: 8, maxRotation: 0 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                  y: { ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true, title: { display: true, text: 'ms', color: 'rgba(255,255,255,0.3)', font: { size: 10 } } },
                },
              }}
            />
          </div>
        </div>
      )}

      {/* Probe log */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-5 py-4 border-b border-border"><h3 className="text-sm font-medium">Probe log</h3></div>
        <div className="divide-y divide-border">
          {history.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-muted-foreground">No probe data yet. First check will run within one interval.</div>
          ) : (
            history.slice(0, 30).map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.is_up ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <div className="flex-1 text-xs">
                  <span className={p.is_up ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>{p.is_up ? 'Up' : 'Down'}</span>
                </div>
                <div className="flex items-center gap-3">
                  {p.status_code && <span className="text-xs font-mono text-muted-foreground">HTTP {p.status_code}</span>}
                  {p.latency_ms != null && <span className="text-xs font-mono text-muted-foreground">{p.latency_ms.toFixed(0)} ms</span>}
                  {p.error_type && <span className="text-xs font-mono text-red-400/70">{p.error_type}</span>}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{new Date(p.checked_at).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
