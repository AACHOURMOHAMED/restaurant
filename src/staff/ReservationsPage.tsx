import type { AvailabilityResponse, StaffReservation, StaffTable } from '@shared/api-types';
import type { ReservationStatus } from '@shared/constants';
import { LIMITS } from '@shared/constants';
import { addDays } from '@shared/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Mail, MessageCircle, Phone, Plus, Search, TriangleAlert, Users } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, cn, Sheet, Spinner, TextArea, TextField } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useI18n } from '@/i18n';
import { api, ApiError, errorMessage, fieldErrors } from '@/lib/api';
import { formatDateFull, formatDateLong, formatInstant, ucfirst } from '@/lib/format';
import { useSite } from '@/lib/queries';
import { staffKeys, useReservationCounts, useReservations, useTables } from './api';
import { Badge, EmptyState, PageHeader, Segmented, Select, useConfirm } from './kit';
import { useStaffContext } from './StaffApp';
import { staffStringsFor, useStaffT } from './strings';

const HIDDEN_BY_DEFAULT: ReservationStatus[] = ['declined', 'cancelled', 'no_show'];
const STATUS_TONE: Record<ReservationStatus, 'gold' | 'green' | 'dark' | 'neutral' | 'red' | 'blue'> = {
  pending: 'gold',
  confirmed: 'green',
  seated: 'blue',
  completed: 'neutral',
  declined: 'red',
  cancelled: 'neutral',
  no_show: 'red',
};

/** International number for WhatsApp links; local Moroccan numbers (06…, 05…) get the +212 prefix. */
function whatsappNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.length === 10 && digits.startsWith('0')) return `212${digits.slice(1)}`;
  return digits.length >= 8 ? digits : null;
}

function ReservationCard({
  r,
  tables,
  onPatch,
  onSamePhone,
  busy,
}: {
  r: StaffReservation;
  tables: StaffTable[];
  onPatch: (patch: { status?: ReservationStatus; tableId?: number | null; staffNote?: string | null }, confirmMessage?: string) => void;
  /** Lists every reservation made with this phone number. */
  onSamePhone: (phone: string) => void;
  busy: boolean;
}) {
  const s = useStaffT();
  const { locale } = useI18n();
  const timeZone = useSite().data?.timeZone ?? 'Africa/Casablanca';
  const [note, setNote] = useState(r.staffNote ?? '');
  useEffect(() => setNote(r.staffNote ?? ''), [r.staffNote]);

  const guest = staffStringsFor(r.lang);
  const guestLocale = r.lang === 'en' ? 'en-GB' : 'fr-FR';
  const firstName = r.name.split(' ')[0] ?? r.name;
  const message =
    r.status === 'confirmed'
      ? guest.res.messageConfirmed(firstName, formatDateLong(r.date, guestLocale), r.time, r.partySize)
      : r.status === 'declined'
        ? guest.res.messageDeclined(firstName, formatDateLong(r.date, guestLocale), r.time)
        : null;
  const wa = whatsappNumber(r.phone);
  const table = tables.find((tb) => tb.id === r.tableId);
  const tooSmall = table && table.seats < r.partySize;

  const actions: { label: string; status: ReservationStatus; variant: 'dark' | 'outline-dark' | 'danger' | 'ghost'; confirm?: string }[] =
    r.status === 'pending'
      ? [
          { label: s.res.actions.confirm, status: 'confirmed', variant: 'dark' },
          { label: s.res.actions.decline, status: 'declined', variant: 'outline-dark', confirm: s.res.confirmDecline },
        ]
      : r.status === 'confirmed'
        ? [
            { label: s.res.actions.seat, status: 'seated', variant: 'dark' },
            { label: s.res.actions.noShow, status: 'no_show', variant: 'ghost', confirm: s.res.confirmNoShow },
            { label: s.res.actions.cancel, status: 'cancelled', variant: 'ghost', confirm: s.res.confirmCancel },
          ]
        : r.status === 'seated'
          ? [{ label: s.res.actions.complete, status: 'completed', variant: 'outline-dark' }]
          : r.status === 'declined' || r.status === 'cancelled'
            ? [{ label: s.res.actions.reopen, status: 'pending', variant: 'ghost' }]
            : r.status === 'no_show'
              ? [{ label: s.res.actions.reopen, status: 'confirmed', variant: 'ghost' }]
              : [];

  return (
    <article
      className={cn(
        'rounded-3xl bg-white p-4 shadow-soft ring-1 sm:p-5',
        r.status === 'pending' ? 'ring-gold-400/70' : 'ring-cream-200',
        HIDDEN_BY_DEFAULT.includes(r.status) && 'opacity-70',
      )}
      data-testid="staff-reservation"
      data-reference={r.reference}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="font-display text-3xl leading-none font-semibold tabular">{r.time}</p>
            <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-taupe-600">
              <Users className="size-3.5" aria-hidden />
              {r.partySize}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-lg leading-tight font-semibold">{r.name}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-taupe-600">
              <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 hover:text-ink-900">
                <Phone className="size-3.5" aria-hidden />
                {r.phone}
              </a>
              {r.email && (
                <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 hover:text-ink-900">
                  <Mail className="size-3.5" aria-hidden />
                  {r.email}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {r.source !== 'web' && <Badge>{s.res.source[r.source] ?? r.source}</Badge>}
          <Badge tone={STATUS_TONE[r.status]}>{s.res.status[r.status]}</Badge>
        </div>
      </div>

      {r.notes && (
        <p className="mt-3 rounded-2xl bg-gold-200/40 px-3 py-2 text-sm text-ink-800">
          <span className="font-semibold">{s.res.notes} : </span>
          {r.notes}
        </p>
      )}

      {r.samePhoneUpcoming > 0 && (
        <p
          className={cn(
            'mt-3 flex items-start gap-2 rounded-2xl px-3 py-2 text-sm',
            r.sameSlotAs || r.samePhoneUpcoming >= 3 ? 'bg-terracotta-400/12 text-terracotta-600' : 'bg-cream-100 text-ink-700',
          )}
          data-testid="same-phone"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {r.sameSlotAs ? (
              <>
                {s.res.sameSlot} <strong className="whitespace-nowrap">{r.sameSlotAs}</strong>
              </>
            ) : (
              s.res.samePhone(r.samePhoneUpcoming)
            )}
            {' · '}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => onSamePhone(r.phone)}>
              {s.res.showSamePhone}
            </button>
          </span>
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <div>
          <Select
            label={s.res.table}
            value={r.tableId ?? ''}
            onChange={(e) => onPatch({ tableId: e.target.value ? Number(e.target.value) : null })}
            disabled={busy}
          >
            <option value="">{s.res.noTable}</option>
            {tables
              .filter((tb) => tb.active || tb.id === r.tableId)
              .map((tb) => (
                <option key={tb.id} value={tb.id}>
                  {tb.number} · {s.res.seats(tb.seats)}
                  {tb.area ? ` · ${tb.area}` : ''}
                </option>
              ))}
          </Select>
          {tooSmall && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-terracotta-600">
              <TriangleAlert className="size-3.5" aria-hidden />
              {s.res.seats(table.seats)} &lt; {r.partySize}
            </p>
          )}
        </div>
        <TextField
          label={s.res.staffNote}
          value={note}
          maxLength={500}
          placeholder={s.res.staffNotePlaceholder}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if ((r.staffNote ?? '') !== note.trim()) onPatch({ staffNote: note.trim() || null });
          }}
          className="h-11"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-cream-200 pt-4">
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a.status}
              variant={a.variant}
              size="sm"
              disabled={busy}
              onClick={() => onPatch({ status: a.status }, a.confirm)}
              className={a.variant === 'ghost' && a.status !== 'pending' && a.status !== 'confirmed' ? 'text-terracotta-600' : undefined}
            >
              {a.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="mr-1 text-xs font-semibold tracking-wide text-taupe-500 uppercase">{s.res.contact}</span>
          <a className="inline-flex h-9 items-center gap-1 rounded-full px-3 ring-1 ring-cream-300 hover:bg-cream-100" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>
            <Phone className="size-3.5" aria-hidden />
            {s.res.call}
          </a>
          <a
            className="inline-flex h-9 items-center gap-1 rounded-full px-3 ring-1 ring-cream-300 hover:bg-cream-100"
            href={`sms:${r.phone.replace(/[^\d+]/g, '')}${message ? `?&body=${encodeURIComponent(message)}` : ''}`}
          >
            <MessageCircle className="size-3.5" aria-hidden />
            {s.res.sms}
          </a>
          {wa && (
            <a
              className="inline-flex h-9 items-center gap-1 rounded-full px-3 ring-1 ring-cream-300 hover:bg-cream-100"
              href={`https://wa.me/${wa}${message ? `?text=${encodeURIComponent(message)}` : ''}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {s.res.whatsapp}
            </a>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-taupe-500">
        {s.res.reference} {r.reference} · {s.res.created} {formatInstant(r.createdAt, timeZone, locale)}
      </p>
    </article>
  );
}

function NewReservationSheet({ open, onClose, tables, defaultDate }: { open: boolean; onClose: () => void; tables: StaffTable[]; defaultDate: string }) {
  const s = useStaffT();
  const { t, lang } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const blank = { name: '', phone: '', email: '', date: defaultDate, time: '', partySize: 2, notes: '', status: 'confirmed', source: 'phone', tableId: '', ignoreCapacity: false };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setForm({ ...blank, date: defaultDate });
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate]);

  const slots = useQuery({
    queryKey: ['staff', 'availability', form.date, form.partySize],
    queryFn: () => api<AvailabilityResponse>(`/api/staff/availability?date=${form.date}&party=${form.partySize}`),
    enabled: open && /^\d{4}-\d{2}-\d{2}$/.test(form.date) && form.partySize > 0,
  });

  const create = useMutation({
    mutationFn: () =>
      api<StaffReservation>('/api/staff/reservations', {
        body: {
          ...form,
          email: form.email || null,
          notes: form.notes || null,
          tableId: form.tableId ? Number(form.tableId) : null,
          lang,
        },
      }),
    onSuccess: () => {
      toast.show(s.res.form.created, 'success');
      void queryClient.invalidateQueries({ queryKey: staffKeys.reservations });
      onClose();
    },
    onError: (err) => {
      const f = fieldErrors(t, err);
      setErrors(f);
      if (Object.keys(f).length === 0) toast.show(errorMessage(t, err), 'error');
    },
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    create.mutate();
  };

  return (
    <Sheet open={open} onClose={onClose} title={s.res.form.title} size="lg" closeLabel={s.close}>
      <form onSubmit={submit} noValidate className="space-y-4 px-5 pb-6 sm:px-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={s.res.form.name} value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} maxLength={LIMITS.nameMax} />
          <TextField label={s.res.form.phone} type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} />
          <TextField label={s.res.form.date} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
          <TextField
            label={s.res.form.party}
            type="number"
            min={1}
            max={LIMITS.partySizeHardMax}
            value={form.partySize}
            onChange={(e) => set('partySize', Math.max(1, Number(e.target.value) || 1))}
            error={errors.partySize}
          />
        </div>
        <div>
          <TextField label={s.res.form.time} type="time" value={form.time} onChange={(e) => set('time', e.target.value)} error={errors.time} step={300} />
          <p className="mt-2 text-xs font-semibold tracking-wide text-taupe-500 uppercase">{s.res.form.slotsHint}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {slots.isFetching && <Spinner className="text-taupe-500" />}
            {slots.data?.slots.map((slot) => (
              <button
                key={slot.time}
                type="button"
                onClick={() => set('time', slot.time)}
                className={cn(
                  'h-8 rounded-lg px-2.5 text-sm font-semibold tabular ring-1',
                  form.time === slot.time ? 'bg-ink-900 text-cream-50 ring-ink-900' : slot.available ? 'bg-white ring-cream-300' : 'text-taupe-400 line-through ring-cream-200',
                )}
              >
                {slot.time}
              </button>
            ))}
            {slots.data && slots.data.slots.length === 0 && <span className="text-sm text-taupe-500">{s.settings.noSlots}</span>}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label={s.res.form.status} value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="confirmed">{s.res.status.confirmed}</option>
            <option value="pending">{s.res.status.pending}</option>
          </Select>
          <Select label={s.res.form.source} value={form.source} onChange={(e) => set('source', e.target.value)}>
            <option value="phone">{s.res.source.phone}</option>
            <option value="walk_in">{s.res.source.walk_in}</option>
            <option value="staff">{s.res.source.staff}</option>
          </Select>
          <Select label={s.res.table} value={form.tableId} onChange={(e) => set('tableId', e.target.value)}>
            <option value="">{s.res.noTable}</option>
            {tables
              .filter((tb) => tb.active)
              .map((tb) => (
                <option key={tb.id} value={tb.id}>
                  {tb.number} · {s.res.seats(tb.seats)}
                </option>
              ))}
          </Select>
        </div>
        <TextField label={s.res.form.email} optional={s.optional} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
        <TextArea label={s.res.form.notes} optional={s.optional} value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} maxLength={LIMITS.reservationNotesMax} />
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-ink-900" checked={form.ignoreCapacity} onChange={(e) => set('ignoreCapacity', e.target.checked)} />
          {s.res.form.ignoreCapacity}
        </label>
        <Button type="submit" variant="dark" size="lg" className="w-full" loading={create.isPending}>
          {s.res.form.submit}
        </Button>
      </form>
    </Sheet>
  );
}

export default function ReservationsPage() {
  const s = useStaffT();
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { live } = useStaffContext();
  const counts = useReservationCounts(live);
  const tables = useTables();
  const { confirm, dialog } = useConfirm();
  const today = counts.data?.today;

  const [tab, setTab] = useState<'day' | 'pending' | 'search'>('day');
  const [date, setDate] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useDeferredValue(query.trim());
  const day = date ?? today ?? null;

  const params: Record<string, string | undefined> =
    tab === 'day' ? { date: day ?? undefined, status: 'all' } : tab === 'pending' ? { from: today, status: 'pending' } : { q, status: 'all' };
  const searchReady = tab !== 'search' || q.length >= 2;
  const showSamePhone = (phone: string) => {
    setTab('search');
    setQuery(phone);
  };
  const list = useReservations(params, { live, enabled: searchReady && (tab !== 'day' || !!day) });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      api<{ reservation: StaffReservation; warnings: { reference: string; time: string; name: string }[] }>(`/api/staff/reservations/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.reservations });
      if (res.warnings.length) toast.show(s.res.conflict(res.warnings.map((w) => `${w.name} (${w.time})`).join(', ')), 'error');
    },
    onError: (err) => toast.show(errorMessage(t, err), 'error'),
  });

  const onPatch = (id: number) => async (body: object, confirmMessage?: string) => {
    if (confirmMessage && !(await confirm(confirmMessage))) return;
    patch.mutate({ id, body });
  };

  const reservations = useMemo(() => {
    const all = list.data?.reservations ?? [];
    if (tab !== 'day' || showAll) return all;
    return all.filter((r) => !HIDDEN_BY_DEFAULT.includes(r.status));
  }, [list.data, tab, showAll]);

  const covers = reservations.filter((r) => !HIDDEN_BY_DEFAULT.includes(r.status)).reduce((n, r) => n + r.partySize, 0);
  const groups = useMemo(() => {
    const map = new Map<string, StaffReservation[]>();
    for (const r of reservations) {
      const key = tab === 'day' ? r.time : r.date;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [reservations, tab]);

  return (
    <>
      <PageHeader title={s.res.title}>
        <Button variant="dark" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          {s.res.newReservation}
        </Button>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented
          label={s.res.title}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'day', label: s.res.tabDay },
            {
              value: 'pending',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {s.res.tabPending}
                  {!!counts.data?.pendingUpcoming && <span className="rounded-full bg-gold-400 px-1.5 text-[11px] leading-5 text-ink-950">{counts.data.pendingUpcoming}</span>}
                </span>
              ),
            },
            { value: 'search', label: s.res.tabSearch },
          ]}
        />
      </div>

      {tab === 'day' && day && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-cream-200">
            <button type="button" aria-label={s.res.previousDay} onClick={() => setDate(addDays(day, -1))} className="flex size-9 items-center justify-center rounded-full hover:bg-cream-100">
              <ChevronLeft className="size-4" />
            </button>
            <label className="relative px-2">
              <span className="font-semibold">{ucfirst(formatDateFull(day, locale))}</span>
              <input type="date" value={day} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={s.res.form.date} />
            </label>
            <button type="button" aria-label={s.res.nextDay} onClick={() => setDate(addDays(day, 1))} className="flex size-9 items-center justify-center rounded-full hover:bg-cream-100">
              <ChevronRight className="size-4" />
            </button>
          </div>
          {day !== today && (
            <Button variant="outline-dark" size="sm" onClick={() => setDate(null)}>
              {s.res.today}
            </Button>
          )}
          <p className="text-sm font-semibold text-taupe-600">{s.res.summary(reservations.filter((r) => !HIDDEN_BY_DEFAULT.includes(r.status)).length, covers)}</p>
          <label className="ml-auto inline-flex items-center gap-2 text-sm text-taupe-600">
            <input type="checkbox" className="size-4 accent-ink-900" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            {s.res.showAll}
          </label>
        </div>
      )}

      {tab === 'search' && (
        <label className="relative mb-6 block max-w-xl">
          <span className="sr-only">{s.search}</span>
          <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-taupe-500" aria-hidden />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={s.res.searchPlaceholder}
            className="h-12 w-full rounded-full bg-white pr-4 pl-11 ring-1 ring-cream-300 outline-none focus:ring-2 focus:ring-gold-500"
          />
        </label>
      )}

      {!searchReady ? null : list.isPending ? (
        <div className="py-16 text-center text-taupe-500">
          <Spinner label={s.loading} />
        </div>
      ) : list.isError ? (
        <EmptyState>{errorMessage(t, list.error)}</EmptyState>
      ) : reservations.length === 0 ? (
        <EmptyState>{tab === 'pending' ? s.res.emptyPending : s.res.empty}</EmptyState>
      ) : (
        <div className="space-y-8">
          {groups.map(([key, items]) => (
            <section key={key}>
              <h2 className="mb-3 flex items-center gap-3 text-sm font-bold tracking-[0.14em] text-taupe-500 uppercase">
                {tab === 'day' ? key : <span>{ucfirst(formatDateFull(key, locale))}</span>}
                <span className="h-px flex-1 bg-cream-300" />
              </h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {items.map((r) => (
                  <ReservationCard
                    key={r.id}
                    r={r}
                    tables={tables.data ?? []}
                    onPatch={onPatch(r.id)}
                    onSamePhone={showSamePhone}
                    busy={patch.isPending && patch.variables?.id === r.id}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <NewReservationSheet open={creating} onClose={() => setCreating(false)} tables={tables.data ?? []} defaultDate={day ?? today ?? ''} />
      {dialog}
      {list.error instanceof ApiError && list.error.status === 403 && <p className="mt-4 text-sm text-terracotta-600">{s.adminOnly}</p>}
    </>
  );
}
