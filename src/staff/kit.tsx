import { useCallback, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Button, cn, Sheet } from '@/components/ui';
import { useStaffT } from './strings';

export function PageHeader({ title, children, intro }: { title: ReactNode; children?: ReactNode; intro?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="font-display text-[2.4rem] leading-none font-medium md:text-5xl">{title}</h1>
        {intro && <p className="mt-2 max-w-2xl text-sm text-taupe-600">{intro}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn('rounded-3xl bg-white p-5 shadow-soft ring-1 ring-cream-200 md:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-2xl font-medium">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  size = 'md',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <label htmlFor={id} className={cn('font-semibold', size === 'sm' ? 'text-sm' : 'text-[15px]')}>
          {label}
        </label>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-taupe-600">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative shrink-0 rounded-full transition-colors duration-200',
          size === 'sm' ? 'h-6 w-10' : 'h-7 w-12',
          checked ? 'bg-olive-500' : 'bg-cream-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform duration-200',
            size === 'sm' ? 'size-5' : 'size-6',
            checked && (size === 'sm' ? 'translate-x-4' : 'translate-x-5'),
          )}
        />
      </button>
    </div>
  );
}

export function Select({
  label,
  className,
  children,
  hideLabel,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hideLabel?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={cn('text-[13px] font-semibold text-ink-800', hideLabel && 'sr-only')}>
        {label}
      </label>
      <select
        id={id}
        className={cn(
          'h-11 rounded-xl border border-cream-300 bg-white px-3 text-[15px] outline-none focus:border-gold-500 focus:ring-4 focus:ring-gold-400/20',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'green' | 'red' | 'dark' | 'blue'; className?: string }) {
  const tones = {
    neutral: 'bg-cream-100 text-ink-700 ring-cream-300',
    gold: 'bg-gold-200/60 text-gold-700 ring-gold-400/50',
    green: 'bg-olive-500/12 text-olive-600 ring-olive-500/35',
    red: 'bg-terracotta-400/12 text-terracotta-600 ring-terracotta-500/35',
    dark: 'bg-ink-900 text-cream-50 ring-ink-900',
    blue: 'bg-sea-500/10 text-sea-500 ring-sea-500/30',
  };
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-bold tracking-wide whitespace-nowrap ring-1 ring-inset', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-full bg-white p-1 ring-1 ring-cream-200">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 rounded-full px-4 text-[13px] font-semibold whitespace-nowrap transition-colors',
            value === o.value ? 'bg-ink-900 text-cream-50' : 'text-ink-700 hover:bg-cream-100',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-cream-300 bg-white/50 px-6 py-14 text-center text-taupe-600">{children}</div>;
}

/** Promise-based confirmation dialog: `if (await confirm('…')) …` */
export function useConfirm() {
  const s = useStaffT();
  const [state, setState] = useState<{ message: string; danger: boolean } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((message: string, opts: { danger?: boolean } = {}) => {
    setState({ message, danger: opts.danger ?? true });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState(null);
  };

  const dialog = (
    <Sheet
      open={!!state}
      onClose={() => close(false)}
      title={s.confirmTitle}
      closeLabel={s.close}
      footer={
        <div className="flex gap-3 pb-1">
          <Button variant="outline-dark" className="flex-1" onClick={() => close(false)}>
            {s.no}
          </Button>
          <Button variant={state?.danger ? 'danger' : 'dark'} className="flex-1" onClick={() => close(true)} data-testid="confirm-yes">
            {s.yes}
          </Button>
        </div>
      }
    >
      <p className="px-5 pb-6 text-ink-700 sm:px-7">{state?.message}</p>
    </Sheet>
  );
  return { confirm, dialog };
}

export function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}
