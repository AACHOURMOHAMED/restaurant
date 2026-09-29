import type { TableResolved } from '@shared/api-types';
import { LIMITS } from '@shared/constants';
import { useMutation } from '@tanstack/react-query';
import { Check, Hash } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, cn, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useSite } from '@/lib/queries';
import { confirmTable, type TableSession } from '@/lib/stores';

export type QrPayload = { kind: 'table'; code: string } | { kind: 'general' } | { kind: 'foreign' } | { kind: 'invalid' };

/**
 * Reads a scanned QR code. Only links to this website are followed — a QR code
 * pointing anywhere else is refused, so a tampered sticker cannot redirect guests.
 */
export function parseQrPayload(text: string, publicUrl: string | null): QrPayload {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return { kind: 'invalid' };
  }
  const allowedHosts = new Set([window.location.host]);
  if (publicUrl) {
    try {
      allowedHosts.add(new URL(publicUrl).host);
    } catch {
      /* ignore bad config */
    }
  }
  if (!allowedHosts.has(url.host)) return { kind: 'foreign' };
  const match = /^\/t\/([a-z0-9]{4,64})\/?$/i.exec(url.pathname);
  if (match) return { kind: 'table', code: match[1]!.toLowerCase() };
  if (url.pathname.replace(/\/+$/, '') === '/table') return { kind: 'general' };
  return { kind: 'invalid' };
}

export function useResolveTable() {
  return useMutation({
    mutationFn: (query: { code: string } | { number: string }) =>
      api<TableResolved>(
        `/api/public/tables/resolve?${'code' in query ? `code=${encodeURIComponent(query.code)}` : `number=${encodeURIComponent(query.number)}`}`,
      ),
  });
}

/** "Enter the number shown on your table" form. */
export function TableNumberForm({
  onResolved,
  autoFocus = false,
  hint,
  className,
}: {
  onResolved: (table: TableResolved) => void;
  autoFocus?: boolean;
  hint?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const site = useSite();
  const resolve = useResolveTable();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (resolve.isPending) return;
    if (!value.trim()) {
      setError(t.fields.table_required);
      return;
    }
    setError(undefined);
    resolve.mutate(
      { number: value.trim() },
      {
        onSuccess: onResolved,
        onError: (err) => setError(err instanceof ApiError ? errorMessage(t, err) : t.errors.generic),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className={cn('space-y-4', className)} aria-label={t.table.enterTitle}>
      <TextField
        label={t.table.numberLabel}
        name="table"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(undefined);
        }}
        inputMode={site.data?.numericTableNumbers === false ? 'text' : 'numeric'}
        autoComplete="off"
        enterKeyHint="go"
        maxLength={LIMITS.tableLabelMax}
        placeholder={t.table.numberPlaceholder}
        hint={hint ?? t.table.enterHint}
        error={error}
        autoFocus={autoFocus}
        className="h-14 text-center font-display text-3xl font-semibold tracking-wide"
      />
      <Button type="submit" variant="dark" size="lg" className="w-full" loading={resolve.isPending}>
        {resolve.isPending ? t.table.checking : t.table.continue}
      </Button>
    </form>
  );
}

/** "Vous êtes à la Table 8 ? — Oui / Changer" shown after a QR scan. */
export function TableConfirmBanner({ table, onChange }: { table: TableSession; onChange: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-3xl bg-ink-900 p-5 text-cream-50 shadow-lift ring-1 ring-gold-400/30" role="region" aria-label={t.table.tableN(table.number)}>
      <div className="flex items-center gap-4">
        <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-gold-400 text-ink-950">
          <Hash className="size-3.5 opacity-70" aria-hidden />
          <span className="font-display -mt-0.5 text-2xl leading-none font-bold">{table.number}</span>
        </div>
        <div>
          <p className="text-[12px] font-semibold tracking-[0.18em] text-gold-300 uppercase">{t.table.youAreAt}</p>
          <p className="font-display text-[1.9rem] leading-tight font-medium" data-testid="table-label">
            {t.table.tableN(table.number)}
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="gold" className="flex-1" onClick={confirmTable}>
          <Check className="size-4.5" aria-hidden />
          {t.table.confirm}
        </Button>
        <Button variant="outline-light" onClick={onChange}>
          {t.table.change}
        </Button>
      </div>
    </div>
  );
}
