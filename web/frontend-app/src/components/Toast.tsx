import { createContext, useCallback, useContext, useState } from 'react';

type ToastType = 'default' | 'error';
interface Toast { id: number; message: string; type: ToastType }

const ToastCtx = createContext<(msg: string, type?: ToastType) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

let nextId = 0;
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, type: ToastType = 'default') => {
    const id = ++nextId;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast-anim rounded-lg border px-4 py-2.5 text-sm shadow-lg max-w-sm ${
              t.type === 'error'
                ? 'border-destructive/50 bg-destructive text-destructive-foreground'
                : 'border-border bg-card text-foreground'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
