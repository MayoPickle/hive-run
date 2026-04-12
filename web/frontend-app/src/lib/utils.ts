export function formatInterval(sec: number): string {
  if (sec < 60) return sec + 's';
  if (sec < 3600) return sec / 60 + 'm';
  if (sec < 86400) return sec / 3600 + 'h';
  return sec / 86400 + 'd';
}

export function successColor(rate: number): string {
  if (rate >= 0.95) return 'text-emerald-400';
  if (rate >= 0.8) return 'text-amber-400';
  return 'text-red-400';
}

export function uptimeColor(v: number | null): string {
  if (v == null) return 'text-muted-foreground';
  if (v >= 99) return 'text-emerald-400';
  if (v >= 95) return 'text-amber-400';
  return 'text-red-400';
}

export function statusCodeColor(code: string): string {
  const n = parseInt(code);
  if (n < 300) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  if (n < 400) return 'border-sky-500/30 bg-sky-500/10 text-sky-400';
  if (n < 500) return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
  return 'border-red-500/30 bg-red-500/10 text-red-400';
}

export function fmtUptime(v: number | null): string {
  return v == null ? '—' : v.toFixed(1) + '%';
}
