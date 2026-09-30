import clsx, { type ClassValue } from 'clsx';
import { LoaderCircle, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({ extend: { theme: { shadow: ['soft', 'lift', 'glow'] } } });

/** Joins class names; later Tailwind classes override conflicting earlier ones (e.g. `hidden` beats `inline-flex`). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// ─── Buttons ─────────────────────────────────────────────────────────────────

type Variant = 'gold' | 'dark' | 'light' | 'outline-light' | 'outline-dark' | 'ghost' | 'ghost-light' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-wide transition-[background-color,color,border-color,box-shadow,transform] duration-300 ease-(--ease-soft) disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none';
const variants: Record<Variant, string> = {
  gold: 'bg-gold-400 text-ink-950 hover:bg-gold-300 shadow-glow',
  dark: 'bg-ink-900 text-cream-50 hover:bg-ink-700',
  light: 'bg-cream-50 text-ink-900 hover:bg-white',
  'outline-light': 'border border-cream-100/35 text-cream-50 hover:border-cream-50 hover:bg-cream-50/8',
  'outline-dark': 'border border-ink-900/20 text-ink-900 hover:border-ink-900/60 hover:bg-ink-900/[0.03]',
  ghost: 'text-ink-800 hover:bg-ink-900/5',
  'ghost-light': 'text-cream-100 hover:bg-cream-50/10',
  danger: 'bg-terracotta-500 text-white hover:bg-terracotta-600',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-12 px-6 text-sm',
  lg: 'h-14 px-8 text-[15px]',
};

export const buttonClass = (variant: Variant = 'dark', size: Size = 'md', className?: string) =>
  cn(base, variants[variant], sizes[size], className);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({
  variant,
  size,
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export function ButtonA({
  variant,
  size,
  className,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return <a className={buttonClass(variant, size, className)} {...rest} />;
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-full transition-colors duration-200 disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2', className)}>
      <LoaderCircle className="size-5 animate-spin" aria-hidden />
      {label && <span>{label}</span>}
    </span>
  );
}

// ─── Form fields ─────────────────────────────────────────────────────────────

const fieldBase =
  'w-full rounded-xl border bg-white/80 px-4 text-[16px] text-ink-900 placeholder:text-taupe-400 transition-[border-color,box-shadow] duration-200 outline-none focus:border-gold-500 focus:ring-4 focus:ring-gold-400/20';

type FieldShellProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: string;
  id: string;
  children: ReactNode;
  className?: string;
};

function FieldShell({ label, hint, error, optional, id, children, className }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold tracking-wide text-ink-800">
        {label}
        {optional && <span className="ml-1.5 font-normal text-taupe-500">({optional})</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] font-medium text-terracotta-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-taupe-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: string;
  wrapperClassName?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, optional, className, wrapperClassName, id, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} id={fieldId} className={wrapperClassName}>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(fieldBase, 'h-12', error ? 'border-terracotta-500' : 'border-cream-300', className)}
        {...rest}
      />
    </FieldShell>
  );
});

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: string;
  wrapperClassName?: string;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, optional, className, wrapperClassName, id, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} id={fieldId} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(fieldBase, 'min-h-24 py-3 leading-relaxed', error ? 'border-terracotta-500' : 'border-cream-300', className)}
        {...rest}
      />
    </FieldShell>
  );
});

// ─── Sheet (accessible modal: bottom sheet on phones, centred dialog on desktop) ─

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  hideTitle?: boolean;
  closeLabel?: string;
  tone?: 'light' | 'dark';
};

export function Sheet({ open, onClose, title, children, footer, size = 'md', hideTitle, closeLabel = 'Fermer', tone = 'light' }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
    } else if (dialog.open) {
      dialog.close();
    }
    // Runs when `open` flips or the sheet unmounts: always release the scroll lock.
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      // With a hidden title the content provides its own visible heading; avoid announcing it twice.
      aria-labelledby={hideTitle ? undefined : titleId}
      aria-label={hideTitle && typeof title === 'string' ? title : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        document.documentElement.style.overflow = '';
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[28px] border-0 p-0 backdrop:bg-ink-950/60 backdrop:backdrop-blur-[2px] open:animate-sheet-in sm:m-auto sm:rounded-[24px]',
        size === 'md' ? 'sm:max-w-lg' : 'sm:max-w-2xl',
        tone === 'dark' ? 'bg-ink-900 text-cream-50' : 'bg-cream-50 text-ink-900',
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className={cn('flex items-center justify-between gap-4 px-5 pt-4 pb-2 sm:px-7 sm:pt-6', hideTitle && 'absolute inset-x-0 top-0 z-10')}>
            {!hideTitle && (
              <h2 id={titleId} className="font-display text-2xl leading-tight font-medium">
                {title}
              </h2>
            )}
            <IconButton
              label={closeLabel}
              onClick={onClose}
              className={cn(
                'ml-auto shrink-0',
                hideTitle ? 'bg-ink-950/55 text-cream-50 backdrop-blur hover:bg-ink-950/75' : tone === 'dark' ? 'hover:bg-cream-50/10' : 'hover:bg-ink-900/5',
              )}
            >
              <X className="size-5" />
            </IconButton>
          </div>
          <div className="overflow-y-auto overscroll-contain">{children}</div>
          {footer && (
            <div className={cn('safe-bottom border-t px-5 pt-3 sm:px-7', tone === 'dark' ? 'border-cream-50/10' : 'border-cream-200')}>
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export function Notice({
  tone = 'info',
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-gold-400/40 bg-gold-200/40 text-ink-800',
    warn: 'border-gold-500/50 bg-gold-200/60 text-ink-900',
    error: 'border-terracotta-500/40 bg-terracotta-400/10 text-terracotta-600',
    success: 'border-olive-500/40 bg-olive-500/10 text-olive-600',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-2xl border px-4 py-3 text-sm leading-relaxed', tones[tone], className)}>
      {children}
    </div>
  );
}
