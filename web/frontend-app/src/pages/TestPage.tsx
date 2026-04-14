import { useState, useEffect, useRef } from 'react';
import { runTest, getJobStatus } from '../lib/api';
import { useToast } from '../components/Toast';
import ResultView from '../components/ResultView';
import type { TestConfig, JobStatus } from '../lib/types';
import { useAuth } from '../lib/auth';

const PRESETS: Record<string, Partial<TestConfig>> = {
  smoke:  { duration: '10s', concurrency: 5, qps: 10, ramp_up: '2s' },
  stress: { duration: '60s', concurrency: 100, qps: 0, ramp_up: '10s' },
  soak:   { duration: '300s', concurrency: 20, qps: 50, ramp_up: '15s' },
  spike:  { duration: '30s', concurrency: 200, qps: 0, ramp_up: '1s' },
};

type Phase = 'form' | 'running' | 'results';

export default function TestPage() {
  const toast = useToast();
  const { canOperate, canUseProxy } = useAuth();
  const [phase, setPhase] = useState<Phase>('form');
  const [elapsed, setElapsed] = useState(0);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Form state
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [duration, setDuration] = useState('30s');
  const [concurrency, setConcurrency] = useState(10);
  const [rampUp, setRampUp] = useState('5s');
  const [qps, setQps] = useState(0);
  const [timeout, setTimeout_] = useState('3000');
  const [proxy, setProxy] = useState(false);
  const [headers, setHeaders] = useState('');
  const [body, setBody] = useState('');
  const [errorRate, setErrorRate] = useState(0.5);
  const [timeoutRate, setTimeoutRate] = useState(0.3);
  const [minSamples, setMinSamples] = useState(20);
  const [retryCount, setRetryCount] = useState(0);
  const [retryBackoff, setRetryBackoff] = useState('200');

  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(tickRef.current); }, []);
  useEffect(() => {
    if (!canUseProxy) {
      setProxy(false);
    }
  }, [canUseProxy]);

  const applyPreset = (name: string) => {
    const p = PRESETS[name];
    if (!p) return;
    if (p.duration) setDuration(p.duration);
    if (p.concurrency) setConcurrency(p.concurrency);
    if (p.qps !== undefined) setQps(p.qps);
    if (p.ramp_up) setRampUp(p.ramp_up);
    toast(`Applied "${name}" preset`);
  };

  const collectConfig = (): TestConfig => {
    const hdrs: Record<string, string> = {};
    headers.trim().split('\n').forEach(line => {
      const i = line.indexOf(':');
      if (i > 0) hdrs[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return {
      target_url: url, method, duration, concurrency, ramp_up: rampUp, timeout,
      qps, headers: hdrs, body, use_proxy: canUseProxy ? proxy : false,
      stop_on_error_rate: errorRate, stop_on_timeout_rate: timeoutRate,
      min_samples_before_stop: minSamples, retry_count: retryCount, retry_backoff: retryBackoff,
    };
  };

  const startTest = async () => {
    if (!canOperate) {
      toast('Your role is read-only', 'error');
      return;
    }
    try {
      const { job_id } = await runTest(collectConfig());
      localStorage.setItem('activeJobId', job_id);
      setPhase('running');
      setElapsed(0);
      tickRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
      pollRef.current = setInterval(async () => {
        try {
          const j = await getJobStatus(job_id);
          if (j.status === 'completed') {
            stopPolling();
            localStorage.removeItem('activeJobId');
            setJob(j);
            setPhase('results');
            toast('Load test completed');
          } else if (j.status === 'failed') {
            stopPolling();
            localStorage.removeItem('activeJobId');
            toast(j.error || 'Test failed', 'error');
            setPhase('form');
          }
        } catch {}
      }, 2000);
    } catch (err: any) {
      toast(err.message || 'Failed to start', 'error');
    }
  };

  const stopPolling = () => {
    clearInterval(pollRef.current);
    clearInterval(tickRef.current);
  };

  const cancel = () => {
    stopPolling();
    localStorage.removeItem('activeJobId');
    setPhase('form');
  };

  const inputCls = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground ring-ring focus-visible:outline-none focus-visible:ring-1 font-mono';

  return (
    <div>
      {/* ── Form ── */}
      {phase === 'form' && (
        <section className="animate-in">
          <div className="mb-6">
            <h2 className="text-xl font-semibold tracking-tight">New Load Test</h2>
            <p className="text-sm text-muted-foreground mt-1">Configure and launch a load test against your target endpoint.</p>
          </div>
          {!canOperate && (
            <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Your account is read-only. Viewers can inspect results but cannot launch new load tests.
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); startTest(); }} className="space-y-6">
            <fieldset disabled={!canOperate} className={!canOperate ? 'space-y-6 opacity-70' : 'space-y-6'}>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left column */}
              <div className="lg:col-span-8 space-y-6">
                {/* Target */}
                <div className="rounded-lg border border-border bg-card p-6 space-y-5">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                    Target
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    <div className="sm:col-span-4">
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">URL <span className="text-red-500">*</span></label>
                      <input type="url" required placeholder="https://api.example.com/health" value={url} onChange={e => setUrl(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Method</label>
                      <select value={method} onChange={e => setMethod(e.target.value)} className={inputCls}>
                        {['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Duration</label>
                      <input type="text" value={duration} onChange={e => setDuration(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Concurrency</label>
                      <input type="number" min={1} value={concurrency} onChange={e => setConcurrency(+e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ramp Up</label>
                      <input type="text" value={rampUp} onChange={e => setRampUp(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Max QPS <span className="text-muted-foreground/60 font-normal">(0=∞)</span></label>
                      <input type="number" min={0} value={qps} onChange={e => setQps(+e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Timeout (ms)</label>
                      <input type="text" value={timeout} onChange={e => setTimeout_(e.target.value)} className={inputCls} />
                    </div>
                    <div className="flex items-end">
                      <label className="inline-flex items-center gap-2.5 h-9 cursor-pointer select-none">
                        <div className="relative">
                          <input type="checkbox" checked={proxy} onChange={e => setProxy(e.target.checked)} className="sr-only peer" disabled={!canUseProxy} />
                          <div className="w-9 h-5 rounded-full bg-secondary peer-checked:bg-emerald-500 transition-colors" />
                          <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-foreground transition-transform peer-checked:translate-x-4" />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">Bright Data Proxy</span>
                      </label>
                      {!canUseProxy && (
                        <span className="ml-3 text-[11px] text-muted-foreground">Requires proxy permission</span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Request */}
                <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                  <h3 className="text-sm font-medium">Request</h3>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Headers <span className="font-normal text-muted-foreground/60">(one per line, Key: Value)</span></label>
                    <textarea rows={3} placeholder={'Authorization: Bearer token\nContent-Type: application/json'} value={headers} onChange={e => setHeaders(e.target.value)}
                      className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground ring-ring focus-visible:outline-none focus-visible:ring-1 font-mono resize-y" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Body</label>
                    <textarea rows={3} placeholder='{"key":"value"}' value={body} onChange={e => setBody(e.target.value)}
                      className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground ring-ring focus-visible:outline-none focus-visible:ring-1 font-mono resize-y" />
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="lg:col-span-4 space-y-6">
                {/* Advanced */}
                <div className="rounded-lg border border-border bg-card">
                  <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex w-full items-center justify-between p-4 text-sm font-medium hover:bg-accent/50 rounded-lg transition-colors">
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/></svg>
                      Advanced
                    </span>
                    <svg className={`w-4 h-4 text-muted-foreground transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
                  </button>
                  {showAdvanced && (
                    <div className="border-t border-border p-4 space-y-3">
                      <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Error Rate Threshold</label><input type="number" value={errorRate} min={0} max={1} step={0.05} onChange={e => setErrorRate(+e.target.value)} className={inputCls} /></div>
                      <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Timeout Rate Threshold</label><input type="number" value={timeoutRate} min={0} max={1} step={0.05} onChange={e => setTimeoutRate(+e.target.value)} className={inputCls} /></div>
                      <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Min Samples</label><input type="number" value={minSamples} min={1} onChange={e => setMinSamples(+e.target.value)} className={inputCls} /></div>
                      <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Retry Count</label><input type="number" value={retryCount} min={0} onChange={e => setRetryCount(+e.target.value)} className={inputCls} /></div>
                      <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Retry Backoff (ms)</label><input type="text" value={retryBackoff} onChange={e => setRetryBackoff(e.target.value)} className={inputCls} /></div>
                    </div>
                  )}
                </div>

                {/* Run button */}
                <button type="submit" disabled={!canOperate} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 w-full bg-primary text-primary-foreground shadow hover:bg-primary/90 gap-2 disabled:cursor-not-allowed disabled:opacity-60">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>
                  {canOperate ? 'Run Load Test' : 'Read-only'}
                </button>

                {/* Presets */}
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-3">Quick Presets</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.keys(PRESETS).map(name => (
                      <button key={name} type="button" onClick={() => applyPreset(name)}
                        className="inline-flex items-center justify-center rounded-md border border-input bg-transparent px-3 h-8 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors capitalize">
                        {name === 'smoke' ? '🔍' : name === 'stress' ? '🔥' : name === 'soak' ? '💧' : '⚡'} {name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            </fieldset>
          </form>
        </section>
      )}

      {/* ── Running ── */}
      {phase === 'running' && (
        <section className="flex flex-col items-center justify-center py-24 animate-in">
          <div className="rounded-lg border border-border bg-card p-10 text-center space-y-6 max-w-md w-full">
            <div className="flex justify-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500 anim-dot" />
              <div className="w-2 h-2 rounded-full bg-amber-500 anim-dot" style={{ animationDelay: '.15s' }} />
              <div className="w-2 h-2 rounded-full bg-amber-500 anim-dot" style={{ animationDelay: '.3s' }} />
            </div>
            <div>
              <p className="text-sm font-medium">Running load test</p>
              <p className="text-xs text-muted-foreground mt-1">Sending requests to target…</p>
            </div>
            <div className="inline-flex items-baseline gap-1">
              <span className="text-4xl font-bold font-mono tabular-nums">{elapsed}</span>
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>
            <div>
              <button type="button" onClick={cancel} className="inline-flex items-center justify-center rounded-md text-xs font-medium h-8 px-4 border border-input bg-transparent hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors">Cancel</button>
            </div>
          </div>
        </section>
      )}

      {/* ── Results ── */}
      {phase === 'results' && job?.result && (
        <section className="animate-in space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Results</h2>
            <button onClick={() => { localStorage.removeItem('activeJobId'); setPhase('form'); }} className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 border border-input bg-transparent hover:bg-accent hover:text-accent-foreground transition-colors gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              New Test
            </button>
          </div>
          <ResultView result={job.result} stoppedEarly={job.stopped_early} stopReason={job.stop_reason} />
        </section>
      )}
    </div>
  );
}
