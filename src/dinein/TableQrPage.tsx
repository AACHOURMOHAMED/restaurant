import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, Notice, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError, errorMessage } from '@/lib/api';
import { setTable } from '@/lib/stores';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { TableNumberForm, useResolveTable } from './table';
import { rememberScannedTable } from './TablePage';

/**
 * Landing page of a table-specific QR code (/t/<code>): identifies the table and
 * opens the menu, where the guest confirms "Table 8" or changes it.
 */
export default function TableQrPage() {
  const { code = '' } = useParams();
  const { t } = useI18n();
  useDocumentTitle(t.order.title);
  const navigate = useNavigate();
  const resolve = useResolveTable();

  useEffect(() => {
    resolve.mutate(
      { code },
      {
        onSuccess: (table) => {
          rememberScannedTable(table);
          navigate('/order', { replace: true });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (!resolve.isError) {
    return (
      <div className="container-x flex max-w-xl justify-center py-24 text-taupe-500">
        <Spinner label={t.table.checking} />
      </div>
    );
  }

  const invalid = resolve.error instanceof ApiError && (resolve.error.status === 404 || resolve.error.code === 'TABLE_INACTIVE');
  return (
    <div className="container-x max-w-xl space-y-5">
      <h1 className="font-display mt-4 text-[2.4rem] leading-tight font-medium">{t.table.enterTitle}</h1>
      <Notice tone={invalid ? 'warn' : 'error'}>{invalid ? t.table.invalidQr : errorMessage(t, resolve.error)}</Notice>
      {!invalid && (
        <Button variant="outline-dark" onClick={() => resolve.mutate({ code })}>
          {t.common.retry}
        </Button>
      )}
      <div className="rounded-3xl bg-white/85 p-6 ring-1 ring-cream-200">
        <TableNumberForm
          autoFocus
          onResolved={(table) => {
            setTable(table, true);
            navigate('/order', { replace: true });
          }}
        />
      </div>
    </div>
  );
}
