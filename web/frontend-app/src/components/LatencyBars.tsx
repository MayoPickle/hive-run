import type { LatencySummary } from '../lib/types';

export default function LatencyBars({ latency }: { latency: LatencySummary }) {
  const maxLat = Math.max(latency.p99, latency.max, 1);
  const bars = [
    { label: 'Min', value: latency.min, color: 'bg-emerald-500/80' },
    { label: 'P50', value: latency.p50, color: 'bg-sky-500/80' },
    { label: 'Avg', value: latency.average, color: 'bg-violet-500/80' },
    { label: 'P95', value: latency.p95, color: 'bg-amber-500/80' },
    { label: 'P99', value: latency.p99, color: 'bg-orange-500/80' },
    { label: 'Max', value: latency.max, color: 'bg-red-500/80' },
  ];

  return (
    <div className="space-y-3">
      {bars.map(b => {
        const pct = Math.max((b.value / maxLat) * 100, 1.5);
        return (
          <div key={b.label} className="flex items-center gap-3">
            <span className="w-8 text-[11px] font-medium text-muted-foreground text-right">{b.label}</span>
            <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
              <div className={`latency-bar ${b.color} h-full rounded-full`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-24 text-xs font-mono text-right tabular-nums">{b.value.toFixed(2)} ms</span>
          </div>
        );
      })}
    </div>
  );
}
