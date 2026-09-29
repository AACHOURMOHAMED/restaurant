import type { StaffTable } from '@shared/api-types';
import { LIMITS } from '@shared/constants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, Pencil, Plus, Printer, QrCode, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, buttonClass, Notice, Sheet, Spinner, TextField } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useI18n } from '@/i18n';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { staffKeys, useSettings, useTables } from './api';
import { Badge, EmptyState, PageHeader, Switch, useConfirm } from './kit';
import { downloadUrl, generalQrUrl, qrPngDataUrl, svgDataUrl, tableQrUrl, useQrSvg } from './qr';
import { useStaffContext } from './StaffApp';
import { useStaffT } from './strings';

type QrTarget = { label: string; url: string; file: string; table?: StaffTable };

function QrThumb({ url, size = 'size-20' }: { url: string; size?: string }) {
  const svg = useQrSvg(url);
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-xl bg-white p-1 ring-1 ring-cream-200`}>
      {svg ? <img src={svgDataUrl(svg)} alt="" className="h-full w-full" /> : <div className="h-full w-full animate-pulse bg-cream-100" />}
    </div>
  );
}

function QrSheet({ target, onClose, onRegenerate, canEdit }: { target: QrTarget | null; onClose: () => void; onRegenerate: (t: StaffTable) => void; canEdit: boolean }) {
  const s = useStaffT();
  const toast = useToast();
  const svg = useQrSvg(target?.url ?? null);
  return (
    <Sheet open={!!target} onClose={onClose} title={target?.label ?? ''} closeLabel={s.close}>
      {target && (
        <div className="space-y-5 px-5 pb-6 sm:px-7">
          <div className="mx-auto aspect-square w-full max-w-72 rounded-3xl bg-white p-4 ring-1 ring-cream-200">
            {svg ? <img src={svgDataUrl(svg)} alt={`${s.tables.qr} — ${target.label}`} className="h-full w-full" data-testid="qr-image" data-url={target.url} /> : <Spinner />}
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-taupe-500 uppercase">{s.tables.link}</p>
            <p className="mt-1 rounded-xl bg-cream-100 px-3 py-2 font-mono text-sm break-all" data-testid="qr-link">
              {target.url}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              variant="outline-dark"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(target.url).then(() => toast.show(s.tables.copied, 'success'));
              }}
            >
              <Copy className="size-4" aria-hidden />
              {s.tables.copy}
            </Button>
            <Button variant="outline-dark" size="sm" disabled={!svg} onClick={() => svg && downloadUrl(svgDataUrl(svg), `${target.file}.svg`)}>
              <Download className="size-4" aria-hidden />
              SVG
            </Button>
            <Button variant="outline-dark" size="sm" onClick={() => void qrPngDataUrl(target.url).then((png) => downloadUrl(png, `${target.file}.png`))}>
              <Download className="size-4" aria-hidden />
              PNG
            </Button>
          </div>
          {target.table && canEdit && (
            <Button variant="ghost" size="sm" className="w-full text-terracotta-600" onClick={() => onRegenerate(target.table!)}>
              <RefreshCw className="size-4" aria-hidden />
              {s.tables.regenerate}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function TableSheet({ table, onClose }: { table: StaffTable | 'new' | null; onClose: () => void }) {
  const s = useStaffT();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState({ number: '', seats: 4, area: '', active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (table === 'new') setForm({ number: '', seats: 4, area: '', active: true });
    else if (table) setForm({ number: table.number, seats: table.seats, area: table.area ?? '', active: table.active });
    setErrors({});
  }, [table]);

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: staffKeys.tables });
    toast.show(s.saved, 'success');
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      table === 'new'
        ? api('/api/staff/tables', { body: { ...form, area: form.area || null } })
        : api(`/api/staff/tables/${(table as StaffTable).id}`, { method: 'PUT', body: { ...form, area: form.area || null } }),
    onSuccess: done,
    onError: (err) => {
      const f = fieldErrors(t, err);
      setErrors(f);
      if (Object.keys(f).length === 0) toast.show(errorMessage(t, err), 'error');
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/staff/tables/${(table as StaffTable).id}`, { method: 'DELETE' }),
    onSuccess: done,
    onError: (err) => toast.show(errorMessage(t, err), 'error'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <>
      <Sheet open={!!table} onClose={onClose} title={table === 'new' ? s.tables.newTitle : s.tables.editTitle} closeLabel={s.close}>
        <form onSubmit={submit} noValidate className="space-y-4 px-5 pb-6 sm:px-7">
          <TextField
            label={s.tables.number}
            hint={s.tables.numberHint}
            value={form.number}
            maxLength={LIMITS.tableLabelMax}
            onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
            error={errors.number}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label={s.tables.seats}
              type="number"
              min={1}
              max={50}
              value={form.seats}
              onChange={(e) => setForm((f) => ({ ...f, seats: Math.max(1, Number(e.target.value) || 1) }))}
              error={errors.seats}
            />
            <TextField label={s.tables.area} optional={s.optional} placeholder={s.tables.areaPlaceholder} value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} />
          </div>
          <Switch label={s.tables.active} checked={form.active} onChange={(active) => setForm((f) => ({ ...f, active }))} />
          <Button type="submit" variant="dark" className="w-full" loading={save.isPending}>
            {s.save}
          </Button>
          {table !== 'new' && table && (
            <Button
              variant="ghost"
              className="w-full text-terracotta-600"
              loading={remove.isPending}
              onClick={async () => {
                if (await confirm(s.tables.confirmDelete(table.number))) remove.mutate();
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              {s.delete}
            </Button>
          )}
        </form>
      </Sheet>
      {dialog}
    </>
  );
}

export default function TablesPage() {
  const s = useStaffT();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useStaffContext();
  const tables = useTables();
  const settings = useSettings();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<StaffTable | 'new' | null>(null);
  const [qr, setQr] = useState<QrTarget | null>(null);
  const base = settings.data?.publicUrl ?? window.location.origin;

  const regenerate = useMutation({
    mutationFn: (id: number) => api<StaffTable>(`/api/staff/tables/${id}/regenerate-code`, { method: 'POST' }),
    onSuccess: (table) => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.tables });
      setQr({ label: s.orders.table(table.number), url: tableQrUrl(base, table.code), file: `qr-table-${table.number}`, table });
      toast.show(s.tables.regenerated, 'success');
    },
    onError: (err) => toast.show(errorMessage(t, err), 'error'),
  });

  const toggleActive = useMutation({
    mutationFn: (tb: StaffTable) => api(`/api/staff/tables/${tb.id}`, { method: 'PUT', body: { number: tb.number, seats: tb.seats, area: tb.area, active: !tb.active } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: staffKeys.tables }),
    onError: (err) => toast.show(errorMessage(t, err), 'error'),
  });

  const general: QrTarget = { label: s.tables.general, url: generalQrUrl(base), file: 'qr-general' };

  return (
    <>
      <PageHeader title={s.tables.title} intro={s.tables.intro}>
        {isAdmin && (
          <Button variant="dark" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            {s.tables.add}
          </Button>
        )}
        <Link to="/staff/tables/print" target="_blank" className={buttonClass('outline-dark', 'md')}>
          <Printer className="size-4" aria-hidden />
          {s.tables.print}
        </Link>
      </PageHeader>

      {settings.data && !settings.data.publicUrl && (
        <Notice tone="warn" className="mb-6">
          <span className="inline-flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {s.tables.publicUrlWarning(window.location.origin)}
          </span>
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="flex items-center gap-4 rounded-3xl bg-ink-900 p-4 text-cream-50 shadow-soft">
          <QrThumb url={general.url} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl leading-tight">{s.tables.general}</p>
            <p className="mt-1 text-xs leading-relaxed text-cream-100/70">{s.tables.generalHint}</p>
            <Button variant="gold" size="sm" className="mt-3" onClick={() => setQr(general)}>
              <QrCode className="size-4" aria-hidden />
              {s.tables.qr}
            </Button>
          </div>
        </article>

        {tables.isPending ? (
          <Spinner className="text-taupe-500" />
        ) : (
          (tables.data ?? []).map((tb) => (
            <article key={tb.id} className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-soft ring-1 ring-cream-200" data-testid="staff-table">
              <QrThumb url={tableQrUrl(base, tb.code)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-display text-3xl leading-none font-semibold">{tb.number}</p>
                  <Badge tone={tb.active ? 'green' : 'neutral'}>{tb.active ? s.tables.active : s.tables.inactive}</Badge>
                </div>
                <p className="mt-1 text-sm text-taupe-600">
                  {s.res.seats(tb.seats)}
                  {tb.area ? ` · ${tb.area}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline-dark"
                    size="sm"
                    onClick={() => setQr({ label: s.orders.table(tb.number), url: tableQrUrl(base, tb.code), file: `qr-table-${tb.number}`, table: tb })}
                  >
                    <QrCode className="size-4" aria-hidden />
                    {s.tables.qr}
                  </Button>
                  {isAdmin && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(tb)} aria-label={`${s.edit} ${tb.number}`}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive.mutate(tb)}>
                        {tb.active ? s.tables.deactivate : s.tables.activate}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      {tables.data?.length === 0 && (
        <div className="mt-4">
          <EmptyState>{s.tables.empty}</EmptyState>
        </div>
      )}

      <QrSheet
        target={qr}
        onClose={() => setQr(null)}
        canEdit={isAdmin}
        onRegenerate={async (tb) => {
          if (await confirm(s.tables.confirmRegenerate)) regenerate.mutate(tb.id);
        }}
      />
      <TableSheet table={editing} onClose={() => setEditing(null)} />
      {dialog}
    </>
  );
}
