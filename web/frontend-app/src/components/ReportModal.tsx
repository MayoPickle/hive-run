import type { TestResult } from '../lib/types';
import ResultView from './ResultView';

interface Props {
  open: boolean;
  onClose: () => void;
  result: TestResult | null;
  title?: string;
  subtitle?: string;
}

export default function ReportModal({ open, onClose, result, title, subtitle }: Props) {
  if (!open || !result) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[85vh] overflow-y-auto rounded-lg border border-border bg-background shadow-2xl animate-in">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-background/95 backdrop-blur">
          <div>
            <p className="text-sm font-medium">{title || 'Report'}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 font-mono">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {/* Body */}
        <div className="p-6">
          <ResultView result={result} />
        </div>
      </div>
    </div>
  );
}
