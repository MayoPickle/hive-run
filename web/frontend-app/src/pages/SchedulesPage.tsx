import { useCallback, useEffect, useState } from 'react';
import { getSchedules, createSchedule, toggleSchedule, deleteSchedule } from '../lib/api';
import { useToast } from '../components/Toast';
import { formatInterval } from '../lib/utils';
import type { ScheduleStatus } from '../lib/types';

export default function SchedulesPage() {
  const toast = useToast();
  const [list, setList] = useState<ScheduleStatus[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Form
  const [name, setName] = useState('Health Check');
  const [interval, setInterval_] = useState(300);
  const [sUrl, setSUrl] = useState('');
  const [sMethod, setSMethod] = useState('GET');
  const [sDuration, setSDuration] = useState('10s');
  const [sConcurrency, setSConcurrency] = useState(5);
  const [sQps, setSQps] = useState(10);
  const [sProxy, setSProxy] = useState(false);

  const load = useCallback(async () => {
    try { setList(await getSchedules()); } catch { toast('Failed to load schedules', 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSchedule({
        name,
        interval_seconds: interval,
        test_config: { target_url: sUrl, method: sMethod, duration: sDuration, concurrency: sConcurrency, qps: sQps, use_proxy: sProxy },
      });
      toast('Schedule created');
      setShowForm(false);
      load();
    } catch (err: any) { toast(err.message, 'error'); }
  };

  const handleToggle = async (s: ScheduleStatus) => {
    await toggleSchedule(s.schedule_id, !s.enabled);
    toast(s.enabled ? 'Schedule paused' : 'Schedule resumed');
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this schedule?')) return;
    await deleteSchedule(id);
    toast('Schedule deleted');
    load();
  };

  const inputCls = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-ring focus-visible:outline-none focus-visible:ring-1 font-mono';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Scheduled Tests</h2>
          <p className="text-sm text-muted-foreground mt-1">Recurring load tests that run automatically on a fixed interval.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          New Schedule
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 animate-in rounded-lg border border-border bg-card p-6 space-y-5">
          <h3 className="text-sm font-medium">Create Schedule</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Interval</label>
              <select value={interval} onChange={e => setInterval_(+e.target.value)} className={inputCls}>
                {[60,300,600,900,1800,3600,7200,14400,43200,86400].map(v => (
                  <option key={v} value={v}>{formatInterval(v)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target URL <span className="text-red-500">*</span></label>
              <input type="url" required placeholder="https://api.example.com/health" value={sUrl} onChange={e => setSUrl(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Method</label>
              <select value={sMethod} onChange={e => setSMethod(e.target.value)} className={inputCls}>
                {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Duration</label>
              <input type="text" value={sDuration} onChange={e => setSDuration(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Concurrency</label>
              <input type="number" min={1} value={sConcurrency} onChange={e => setSConcurrency(+e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Max QPS</label>
              <input type="number" min={0} value={sQps} onChange={e => setSQps(+e.target.value)} className={inputCls} />
            </div>
          </div>
          <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
            <div className="relative">
              <input type="checkbox" checked={sProxy} onChange={e => setSProxy(e.target.checked)} className="sr-only peer" />
              <div className="w-9 h-5 rounded-full bg-secondary peer-checked:bg-emerald-500 transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-foreground transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Bright Data Proxy</span>
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-input bg-transparent hover:bg-accent transition-colors">Cancel</button>
            <button type="submit" className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors">Create</button>
          </div>
        </form>
      )}

      {/* List */}
      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <svg className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <p className="text-sm text-muted-foreground">No scheduled tests yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Create one to run load tests on a recurring interval.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(s => {
            const lastRun = s.last_run_at ? new Date(s.last_run_at).toLocaleString() : 'Never';
            return (
              <div key={s.schedule_id} className="rounded-lg border border-border bg-card p-5 animate-in">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${s.enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                      <h4 className="text-sm font-medium truncate">{s.name}</h4>
                      <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">{formatInterval(s.interval_seconds)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 ml-4 font-mono truncate">{s.test_config.target_url}</p>
                    <div className="flex items-center gap-4 mt-2.5 ml-4 text-[11px] text-muted-foreground">
                      <span>Runs: <span className="text-foreground font-medium">{s.run_count}</span></span>
                      <span>Last: {lastRun}</span>
                      {s.last_status && <StatusBadge status={s.last_status} />}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-4 shrink-0">
                    <button onClick={() => handleToggle(s)} title={s.enabled ? 'Pause' : 'Resume'}
                      className="inline-flex items-center justify-center rounded-md h-8 w-8 border border-input hover:bg-accent transition-colors">
                      {s.enabled
                        ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>}
                    </button>
                    <button onClick={() => handleDelete(s.schedule_id)} title="Delete"
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

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'completed'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
    : status === 'running'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
      : 'border-red-500/30 bg-red-500/10 text-red-400';
  return <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-mono ${cls}`}>{status}</span>;
}
