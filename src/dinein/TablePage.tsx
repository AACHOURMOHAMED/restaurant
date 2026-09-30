import type { TableResolved } from '@shared/api-types';
import { BookOpen, Hash, ScanLine, UtensilsCrossed } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Button, ButtonLink, Notice, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError, errorMessage } from '@/lib/api';
import { clearTable, setTable, tableStore, useTable } from '@/lib/stores';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { TableNumberForm, useResolveTable } from './table';

const QrScanner = lazy(() => import('./QrScanner'));

type Mode = 'choose' | 'scan' | 'resolving' | 'enter' | 'current';
type NavState = { autoScan?: boolean; enter?: boolean } | null;

/** Remembers a scanned table; keeps it confirmed if the guest re-scans the table they already confirmed. */
export function rememberScannedTable(table: TableResolved) {
  const current = tableStore.get();
  setTable(table, current?.code === table.code && current.confirmed);
}

export default function TablePage() {
  const { t } = useI18n();
  useDocumentTitle(t.table.title);
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as NavState;
  const [params] = useSearchParams();
  const table = useTable();
  const resolve = useResolveTable();
  const fromGeneralQr = params.get('src') === 'qr';
  const returnTo = '/order';

  const [mode, setMode] = useState<Mode>(() => {
    if (fromGeneralQr || state?.enter) return 'enter';
    if (state?.autoScan) return 'scan';
    return table ? 'current' : 'choose';
  });
  const [message, setMessage] = useState<string | null>(fromGeneralQr ? t.table.generalQr : null);

  const onManual = (resolved: TableResolved) => {
    setTable(resolved, true);
    navigate(returnTo);
  };

  return (
    <div className="container-x max-w-xl">
      <h1 className="font-display mt-4 text-[2.6rem] leading-[1.02] font-medium">{t.table.title}</h1>
      <p className="mt-3 text-taupe-600">{t.table.intro}</p>

      <div className="mt-8">
        {mode === 'current' && table && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-3xl bg-white/80 p-5 ring-1 ring-cream-200">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-gold-400 font-display text-2xl font-bold text-ink-950">{table.number}</div>
              <div>
                <p className="text-[12px] font-semibold tracking-[0.18em] text-taupe-500 uppercase">{t.table.youAreAt}</p>
                <p className="font-display text-3xl font-medium">{t.table.tableN(table.number)}</p>
              </div>
            </div>
            <ButtonLink to="/order" variant="dark" size="lg" className="w-full">
              <UtensilsCrossed className="size-5" aria-hidden />
              {t.order.title}
            </ButtonLink>
            <Button
              variant="outline-dark"
              size="lg"
              className="w-full"
              onClick={() => {
                clearTable();
                setMode('choose');
              }}
            >
              {t.table.changeTable}
            </Button>
          </div>
        )}

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setMode('scan');
              }}
              className="group flex w-full items-center gap-5 rounded-3xl bg-ink-900 p-6 text-left text-cream-50 shadow-lift transition-transform active:scale-[0.99]"
            >
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gold-400 text-ink-950">
                <ScanLine className="size-7" aria-hidden />
              </span>
              <span>
                <span className="block font-display text-2xl font-medium">{t.table.scan}</span>
                <span className="mt-1 block text-sm text-cream-100/70">{t.table.scanHint}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setMode('enter');
              }}
              className="flex w-full items-center gap-5 rounded-3xl bg-white/85 p-6 text-left ring-1 ring-cream-200 transition-transform active:scale-[0.99]"
            >
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-cream-200 text-ink-900">
                <Hash className="size-7" aria-hidden />
              </span>
              <span>
                <span className="block font-display text-2xl font-medium">{t.table.enter}</span>
                <span className="mt-1 block text-sm text-taupe-600">{t.table.enterHint}</span>
              </span>
            </button>
          </div>
        )}

        {mode === 'resolving' && (
          <div className="py-16 text-center text-taupe-500">
            <Spinner label={t.table.checking} />
          </div>
        )}

        {mode === 'scan' && (
          <Suspense
            fallback={
              <div className="py-16 text-center text-taupe-500">
                <Spinner label={t.table.cameraStarting} />
              </div>
            }
          >
            <QrScanner
              onDetected={(payload) => {
                if (payload.kind === 'general') {
                  setMessage(t.table.generalQr);
                  setMode('enter');
                  return;
                }
                // Leave "scan" for good: the camera must not restart while the table is being checked.
                setMode('resolving');
                resolve.mutate(
                  { code: payload.code },
                  {
                    onSuccess: (resolved) => {
                      rememberScannedTable(resolved);
                      navigate(returnTo);
                    },
                    onError: (err) => {
                      setMessage(err instanceof ApiError && err.status === 404 ? t.table.invalidQr : errorMessage(t, err));
                      setMode('enter');
                    },
                  },
                );
              }}
              onCancel={() => setMode(table ? 'current' : 'choose')}
              onUseNumber={() => setMode('enter')}
            />
          </Suspense>
        )}

        {mode === 'enter' && (
          <div className="space-y-5">
            {message && <Notice tone="info">{message}</Notice>}
            <div className="rounded-3xl bg-white/85 p-6 ring-1 ring-cream-200">
              <h2 className="font-display mb-4 text-2xl font-medium">{t.table.enterTitle}</h2>
              <TableNumberForm onResolved={onManual} />
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setMode('scan')}>
              <ScanLine className="size-4.5" aria-hidden />
              {t.table.scan}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-10 border-t border-cream-300/70 pt-6 text-center">
        <Link to="/order" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-700 underline-offset-4 hover:underline">
          <BookOpen className="size-4" aria-hidden />
          {t.table.justBrowse}
        </Link>
      </div>
    </div>
  );
}
