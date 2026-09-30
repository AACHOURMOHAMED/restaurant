import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from './ui';

type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
type ToastApi = { show(message: string, tone?: Toast['tone']): void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (message: string, tone: Toast['tone'] = 'info') => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => {
          const Icon = t.tone === 'success' ? CircleCheck : t.tone === 'error' ? CircleAlert : Info;
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-md animate-toast-in items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lift ring-1',
                t.tone === 'error' ? 'bg-ink-900 text-cream-50 ring-terracotta-500/50' : 'bg-ink-900 text-cream-50 ring-gold-400/30',
              )}
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', t.tone === 'error' ? 'text-terracotta-400' : 'text-gold-400')} aria-hidden />
              <p className="flex-1 leading-snug">{t.message}</p>
              <button type="button" onClick={() => dismiss(t.id)} className="-m-1 rounded-full p-1 text-cream-100/60 hover:text-cream-50" aria-label="×">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
