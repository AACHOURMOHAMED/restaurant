import type { AvailabilityResponse, StaffSettings } from '@shared/api-types';
import type { BookingSettings, SpecialDay, TimeRange, WeeklyHours } from '@shared/availability';
import type { OrderingSettings } from '@shared/schemas';
import type { IsoWeekday } from '@shared/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button, cn, IconButton, Notice, Spinner, TextField } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useI18n } from '@/i18n';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDateFull, ucfirst } from '@/lib/format';
import { staffKeys, useSettings } from './api';
import { Card, PageHeader, Select, Switch, useConfirm } from './kit';
import { useStaffContext } from './StaffApp';
import { useStaffT } from './strings';

const DAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

function useSave<T>(url: string) {
  const s = useStaffT();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: T) => api(url, { method: 'PUT', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.settings });
      void queryClient.invalidateQueries({ queryKey: ['site'] });
      void queryClient.invalidateQueries({ queryKey: ['staff', 'availability'] });
      toast.show(s.saved, 'success');
    },
    onError: (err) => toast.show(err instanceof ApiError && err.fields ? t.fields[Object.values(err.fields)[0]!] ?? t.fields.invalid! : errorMessage(t, err), 'error'),
  });
}

function RangeEditor({ ranges, onChange, disabled }: { ranges: TimeRange[]; onChange: (r: TimeRange[]) => void; disabled?: boolean }) {
  const s = useStaffT();
  return (
    <div className="space-y-2">
      {ranges.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="time"
            value={r.opens}
            disabled={disabled}
            aria-label="Ouverture / Opens"
            onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, opens: e.target.value } : x)))}
            className="h-10 rounded-xl border border-cream-300 bg-white px-2 tabular"
          />
          <span className="text-taupe-500">–</span>
          <input
            type="time"
            value={r.closes}
            disabled={disabled}
            aria-label="Fermeture / Closes"
            onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, closes: e.target.value } : x)))}
            className="h-10 rounded-xl border border-cream-300 bg-white px-2 tabular"
          />
          <IconButton label={s.delete} className="size-9 hover:bg-terracotta-400/10" onClick={() => onChange(ranges.filter((_, j) => j !== i))} disabled={disabled}>
            <X className="size-4" />
          </IconButton>
        </div>
      ))}
      {ranges.length < 4 && (
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1 text-sm font-semibold text-ink-700 hover:underline"
          onClick={() => onChange([...ranges, ranges.length ? { opens: '19:00', closes: '23:00' } : { opens: '12:00', closes: '23:00' }])}
        >
          <Plus className="size-3.5" aria-hidden />
          {s.settings.addRange}
        </button>
      )}
    </div>
  );
}

function NumberSetting({ label, value, onChange, suffix, nullable, hint, min = 0 }: { label: string; value: number | null; onChange: (v: number | null) => void; suffix: string; nullable?: boolean; hint?: string; min?: number }) {
  const s = useStaffT();
  const id = useId();
  const help = hint ?? (nullable ? s.settings.unlimitedHint : undefined);
  return (
    <div className="flex flex-col gap-1.5 pb-3">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-800">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          min={min}
          inputMode="numeric"
          value={value ?? ''}
          placeholder={nullable ? s.unlimited : undefined}
          aria-describedby={help ? `${id}-hint` : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(nullable ? null : min);
            onChange(Math.max(min, Math.floor(Number(raw))));
          }}
          className="h-11 w-full rounded-xl border border-cream-300 bg-white pr-16 pl-3 tabular outline-none focus:border-gold-500 focus:ring-4 focus:ring-gold-400/20"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-taupe-500">{suffix}</span>
      </div>
      {help && (
        <p id={`${id}-hint`} className="text-[12px] text-taupe-500">
          {help}
        </p>
      )}
    </div>
  );
}

function BookingCard({ initial }: { initial: BookingSettings }) {
  const s = useStaffT();
  const { locale } = useI18n();
  const [b, setB] = useState(initial);
  useEffect(() => setB(initial), [initial]);
  const save = useSave<BookingSettings>('/api/staff/settings/booking');
  const [previewDate, setPreviewDate] = useState('');
  const set = <K extends keyof BookingSettings>(k: K, v: BookingSettings[K]) => setB((x) => ({ ...x, [k]: v }));

  const preview = useQuery({
    queryKey: ['staff', 'availability', previewDate || 'today', 2],
    queryFn: () => api<AvailabilityResponse>(`/api/staff/availability?date=${previewDate}&party=2`),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(previewDate),
  });

  return (
    <Card title={s.settings.booking}>
      <p className="-mt-2 mb-5 text-sm text-taupe-600">{s.settings.bookingIntro}</p>
      <div className="space-y-4">
        <Switch label={s.settings.onlineEnabled} checked={b.onlineBookingEnabled} onChange={(v) => set('onlineBookingEnabled', v)} />
        <Switch label={s.settings.requireApproval} description={s.settings.requireApprovalHint} checked={b.requireApproval} onChange={(v) => set('requireApproval', v)} />
      </div>
      <div className="mt-6 grid gap-x-5 gap-y-1 sm:grid-cols-2">
        <Select label={s.settings.slotInterval} value={b.slotIntervalMinutes} onChange={(e) => set('slotIntervalMinutes', Number(e.target.value))}>
          {[15, 20, 30, 45, 60].map((n) => (
            <option key={n} value={n}>
              {n} {s.minutes}
            </option>
          ))}
        </Select>
        <NumberSetting label={s.settings.duration} value={b.durationMinutes} onChange={(v) => set('durationMinutes', v ?? 90)} suffix={s.minutes} min={15} />
        <NumberSetting label={s.settings.minNotice} value={b.minNoticeMinutes} onChange={(v) => set('minNoticeMinutes', v ?? 0)} suffix={s.minutes} />
        <NumberSetting label={s.settings.maxDaysAhead} value={b.maxDaysAhead} onChange={(v) => set('maxDaysAhead', v ?? 0)} suffix={s.days} />
        <NumberSetting label={s.settings.maxPartySize} value={b.maxPartySize} onChange={(v) => set('maxPartySize', v ?? 1)} suffix={s.people} min={1} />
        <NumberSetting label={s.settings.lastSeating} value={b.lastSeatingBeforeCloseMinutes} onChange={(v) => set('lastSeatingBeforeCloseMinutes', v ?? 0)} suffix={s.minutes} />
        <NumberSetting label={s.settings.maxCoversPerSlot} value={b.maxCoversPerSlot} onChange={(v) => set('maxCoversPerSlot', v)} suffix={s.people} nullable min={1} />
        <NumberSetting label={s.settings.maxConcurrentCovers} value={b.maxConcurrentCovers} onChange={(v) => set('maxConcurrentCovers', v)} suffix={s.people} nullable min={1} />
        <TextField label={s.settings.timeZone} value={b.timeZone} onChange={(e) => set('timeZone', e.target.value)} className="h-11" />
      </div>
      <Button variant="dark" className="mt-6" loading={save.isPending} onClick={() => save.mutate(b)}>
        {s.save}
      </Button>

      <div className="mt-8 border-t border-cream-200 pt-6">
        <h3 className="font-semibold">{s.settings.preview}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} className="h-10 rounded-xl border border-cream-300 bg-white px-3" aria-label={s.settings.specialDate} />
          {previewDate && <p className="text-sm text-taupe-600">{s.settings.previewFor(formatDateFull(previewDate, locale))}</p>}
        </div>
        {preview.data && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {preview.data.slots.length === 0 && <span className="text-sm text-taupe-500">{s.settings.noSlots}</span>}
            {preview.data.slots.map((slot) => (
              <span key={slot.time} className={cn('rounded-lg px-2 py-1 text-sm tabular ring-1', slot.available ? 'bg-white ring-cream-300' : 'text-taupe-400 line-through ring-cream-200')}>
                {slot.time}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function HoursCard({ initial }: { initial: WeeklyHours }) {
  const s = useStaffT();
  const { t } = useI18n();
  const [hours, setHours] = useState(initial);
  useEffect(() => setHours(initial), [initial]);
  const save = useSave<WeeklyHours>('/api/staff/settings/hours');
  const setDay = (d: IsoWeekday, ranges: TimeRange[]) => setHours((h) => ({ ...h, [d]: ranges }));

  return (
    <Card
      title={s.settings.hours}
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const first = DAYS.map((d) => hours[d]).find((r) => r.length > 0) ?? [];
            setHours((h) => Object.fromEntries(DAYS.map((d) => [d, h[d].length ? first : []])) as unknown as WeeklyHours);
          }}
        >
          {s.settings.copyToAll}
        </Button>
      }
    >
      <p className="-mt-2 mb-5 text-sm text-taupe-600">{s.settings.hoursIntro}</p>
      <div className="divide-y divide-cream-200">
        {DAYS.map((d) => {
          const open = hours[d].length > 0;
          return (
            <div key={d} className="grid gap-3 py-4 sm:grid-cols-[10rem_1fr] sm:items-start">
              <div className="flex items-center justify-between gap-3 sm:block">
                <p className="font-semibold">{t.visit.weekdays[d - 1]}</p>
                <div className="sm:mt-2">
                  <Switch size="sm" label={open ? s.settings.open : s.settings.closed} checked={open} onChange={(v) => setDay(d, v ? [{ opens: '12:00', closes: '23:00' }] : [])} />
                </div>
              </div>
              {open && <RangeEditor ranges={hours[d]} onChange={(r) => setDay(d, r)} />}
            </div>
          );
        })}
      </div>
      <Button variant="dark" className="mt-4" loading={save.isPending} onClick={() => save.mutate(hours)}>
        {s.save}
      </Button>
    </Card>
  );
}

function SpecialDaysCard({ days }: { days: SpecialDay[] }) {
  const s = useStaffT();
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState<{ date: string; closed: boolean; hours: TimeRange[]; note: string }>({ date: '', closed: true, hours: [], note: '' });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: staffKeys.settings });
    void queryClient.invalidateQueries({ queryKey: ['site'] });
  };
  const add = useMutation({
    mutationFn: () => api(`/api/staff/special-days/${form.date}`, { method: 'PUT', body: { closed: form.closed, hours: form.closed ? [] : form.hours, note: form.note || null } }),
    onSuccess: () => {
      refresh();
      setForm({ date: '', closed: true, hours: [], note: '' });
      toast.show(s.saved, 'success');
    },
    onError: (err) => toast.show(err instanceof ApiError && err.fields ? t.fields[Object.values(err.fields)[0]!] ?? t.fields.invalid! : errorMessage(t, err), 'error'),
  });
  const remove = useMutation({ mutationFn: (date: string) => api(`/api/staff/special-days/${date}`, { method: 'DELETE' }), onSuccess: refresh });

  return (
    <Card title={s.settings.special}>
      <p className="-mt-2 mb-5 text-sm text-taupe-600">{s.settings.specialIntro}</p>
      {days.length === 0 ? (
        <p className="text-sm text-taupe-500">{s.settings.noSpecial}</p>
      ) : (
        <ul className="divide-y divide-cream-200">
          {days.map((d) => (
            <li key={d.date} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">{ucfirst(formatDateFull(d.date, locale))}</p>
                <p className="text-sm text-taupe-600">
                  {d.closed ? s.settings.closed : d.hours.map((r) => `${r.opens}–${r.closes}`).join(', ')}
                  {d.note ? ` · ${d.note}` : ''}
                </p>
              </div>
              <IconButton
                label={s.delete}
                className="size-9 text-terracotta-600 hover:bg-terracotta-400/10"
                onClick={async () => {
                  if (await confirm(`${s.delete} ${formatDateFull(d.date, locale)} ?`)) remove.mutate(d.date);
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 space-y-4 rounded-2xl bg-cream-100 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={s.settings.specialDate} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-11" />
          <TextField label={s.settings.specialNote} optional={s.optional} value={form.note} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="h-11" />
        </div>
        <Switch label={s.settings.specialClosed} checked={form.closed} onChange={(closed) => setForm((f) => ({ ...f, closed, hours: closed ? [] : [{ opens: '12:00', closes: '23:00' }] }))} />
        {!form.closed && <RangeEditor ranges={form.hours} onChange={(hours) => setForm((f) => ({ ...f, hours }))} />}
        <Button variant="dark" size="sm" disabled={!form.date} loading={add.isPending} onClick={() => add.mutate()}>
          <Plus className="size-4" aria-hidden />
          {s.settings.addSpecial}
        </Button>
      </div>
      {dialog}
    </Card>
  );
}

function OrderingCard({ initial }: { initial: OrderingSettings }) {
  const s = useStaffT();
  const save = useSave<OrderingSettings>('/api/staff/settings/ordering');
  const update = (patch: Partial<OrderingSettings>) => save.mutate({ ...initial, ...patch });
  return (
    <Card title={s.settings.ordering}>
      <div className="space-y-4">
        <Switch label={s.settings.orderingEnabled} checked={initial.enabled} disabled={save.isPending} onChange={(enabled) => update({ enabled })} />
        <Switch label={s.settings.orderingOnlyOpen} checked={initial.onlyDuringOpeningHours} disabled={save.isPending} onChange={(onlyDuringOpeningHours) => update({ onlyDuringOpeningHours })} />
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const s = useStaffT();
  const { isAdmin } = useStaffContext();
  const settings = useSettings();
  if (!isAdmin) return <Notice tone="warn">{s.adminOnly}</Notice>;
  const data: StaffSettings | undefined = settings.data;
  return (
    <>
      <PageHeader title={s.settings.title} />
      {!data ? (
        <div className="py-16 text-center text-taupe-500">
          <Spinner label={s.loading} />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <BookingCard initial={data.booking} />
            <OrderingCard initial={data.ordering} />
          </div>
          <div className="space-y-6">
            <HoursCard initial={data.hours} />
            <SpecialDaysCard days={data.specialDays} />
          </div>
        </div>
      )}
    </>
  );
}
