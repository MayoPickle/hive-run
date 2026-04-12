import type { TestResult } from '../lib/types';
import LatencyBars from './LatencyBars';
import { successColor, statusCodeColor } from '../lib/utils';

interface Props {
  result: TestResult;
  stoppedEarly?: boolean;
  stopReason?: string;
}

export default function ResultView({ result: r, stoppedEarly, stopReason }: Props) {
  const rate = (r.success_rate * 100).toFixed(1) + '%';
  const errs = Object.entries(r.error_types || {});
  const timeRange = r.started_at
    ? `${new Date(r.started_at).toLocaleTimeString()} → ${new Date(r.finished_at).toLocaleTimeString()} · ${r.duration_seconds.toFixed(1)}s`
    : '';

  return (
    <div className="space-y-6">
      {/* Safety stop banner */}
      {stoppedEarly && (
        <div className="animate-in rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-destructive mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <p className="text-sm font-medium text-destructive">Safety stop triggered</p>
            <p className="text-xs text-destructive/80 mt-0.5">{stopReason || 'Threshold exceeded'}</p>
          </div>
        </div>
      )}

      {timeRange && <p className="text-sm text-muted-foreground">{timeRange}</p>}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in">
        <Card label="Total Requests" value={r.total_requests.toLocaleString()} />
        <Card label="Success Rate" value={rate} valueClass={successColor(r.success_rate)} />
        <Card label="Throughput" value={r.throughput_rps.toFixed(1)} unit="req/s" />
        <Card label="Avg Latency" value={r.latency_ms.average.toFixed(1)} unit="ms" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Latency bars */}
        <div className="lg:col-span-3 rounded-lg border border-border bg-card p-6 animate-in">
          <h3 className="text-sm font-medium mb-5">Latency Distribution</h3>
          <LatencyBars latency={r.latency_ms} />
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Status codes */}
          <div className="rounded-lg border border-border bg-card p-6 animate-in">
            <h3 className="text-sm font-medium mb-4">Status Codes</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(r.status_codes || {}).length > 0
                ? Object.entries(r.status_codes).map(([c, n]) => (
                    <span key={c} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-mono font-medium ${statusCodeColor(c)}`}>
                      {c}<span className="opacity-60">×{n}</span>
                    </span>
                  ))
                : <span className="text-xs text-muted-foreground">No responses</span>}
            </div>
          </div>

          {/* Breakdown */}
          <div className="rounded-lg border border-border bg-card animate-in">
            <div className="p-4 border-b border-border"><h3 className="text-sm font-medium">Breakdown</h3></div>
            <div className="divide-y divide-border">
              <Row label="Successful" value={r.successful_requests.toLocaleString()} valueClass="text-emerald-400" />
              <Row label="Failed" value={r.failed_requests.toLocaleString()} valueClass="text-red-400" />
              <Row label="Timeouts" value={r.timeout_count.toLocaleString()} valueClass="text-amber-400" />
              <Row label="Duration" value={r.duration_seconds.toFixed(1) + 's'} />
              <Row label="Min Latency" value={r.latency_ms.min.toFixed(1) + ' ms'} />
            </div>
          </div>

          {/* Errors */}
          {errs.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-card animate-in">
              <div className="p-4 border-b border-destructive/20"><h3 className="text-sm font-medium text-red-400">Errors</h3></div>
              <div className="divide-y divide-border">
                {errs.map(([t, n]) => (
                  <div key={t} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-mono text-red-400">{t}</span>
                    <span className="text-xs text-muted-foreground font-mono">×{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, unit, valueClass }: { label: string; value: string; unit?: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-2 font-mono tabular-nums ${valueClass || ''}`}>
        {value}
        {unit && <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium font-mono ${valueClass || ''}`}>{value}</span>
    </div>
  );
}
