import { useCallback, useEffect, useState } from 'react';
import { getHistory, getReport } from '../lib/api';
import { useToast } from '../components/Toast';
import ReportModal from '../components/ReportModal';
import type { HistoryEntry, TestResult } from '../lib/types';

export default function HistoryPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [modal, setModal] = useState<{ result: TestResult; title: string; subtitle: string } | null>(null);

  const load = useCallback(async () => {
    try { setEntries(await getHistory()); } catch { toast('Failed to load history', 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openReport = async (e: HistoryEntry) => {
    try {
      const r = await getReport(e.filename);
      setModal({ result: r, title: e.target_url || e.filename, subtitle: new Date(e.created_at).toLocaleString() });
    } catch { toast('Failed to load report', 'error'); }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Test History</h2>
        <p className="text-sm text-muted-foreground mt-1">Browse and view past load test reports.</p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
          <svg className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <p className="text-sm text-muted-foreground">No test reports found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(e => {
            const d = new Date(e.created_at).toLocaleString();
            const hasRate = e.total_requests > 0;
            const sRate = hasRate ? (e.success_rate * 100).toFixed(1) : null;

            const badgeColor = !hasRate ? '' : e.success_rate >= 0.95
              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
              : e.success_rate >= 0.8
                ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                : 'text-red-400 border-red-500/30 bg-red-500/10';

            return (
              <button key={e.filename} onClick={() => openReport(e)}
                className="w-full rounded-lg border border-border bg-card hover:bg-accent/40 transition-colors text-left p-4 animate-in">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-xs truncate max-w-xs">{e.target_url || e.filename}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                      <span>{d}</span>
                      {e.total_requests > 0 && <span className="text-foreground font-medium">{e.total_requests.toLocaleString()} reqs</span>}
                      {e.duration_seconds > 0 && <span>{e.duration_seconds.toFixed(1)}s</span>}
                      {e.throughput_rps > 0 && <span>{e.throughput_rps.toFixed(1)} req/s</span>}
                      {e.avg_latency_ms > 0 && <span>avg {e.avg_latency_ms.toFixed(1)} ms</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {sRate != null && (
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono font-medium ${badgeColor}`}>{sRate}%</span>
                    )}
                    <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ReportModal
        open={!!modal}
        onClose={() => setModal(null)}
        result={modal?.result ?? null}
        title={modal?.title}
        subtitle={modal?.subtitle}
      />
    </div>
  );
}
