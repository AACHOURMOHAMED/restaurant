import type { CalendarDay, AvailabilityResponse } from '@shared/api-types';
import { parseTime, type LocalDate } from '@shared/time';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { cn, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import { dayOfMonth, formatMonthShort, formatWeekdayShort } from '@/lib/format';

// ─── Party size ──────────────────────────────────────────────────────────────

export function PartySize({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const { t } = useI18n();
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className="sr-only">
        {t.reserve.guests}
      </p>
      <div className="flex items-center gap-3" role="group" aria-labelledby={labelId}>
        <button
          type="button"
          className="flex size-14 items-center justify-center rounded-2xl bg-white ring-1 ring-cream-300 transition-colors hover:ring-taupe-300 disabled:opacity-35"
          onClick={() => onChange(Math.max(1, value - 1))}
          disabled={value <= 1}
          aria-label={t.reserve.fewer}
        >
          <Minus className="size-5" />
        </button>
        <output className="font-display min-w-36 text-center text-[1.9rem] leading-none font-semibold" aria-live="polite">
          {t.reserve.guestsCount(value)}
        </output>
        <button
          type="button"
          className="flex size-14 items-center justify-center rounded-2xl bg-white ring-1 ring-cream-300 transition-colors hover:ring-taupe-300 disabled:opacity-35"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={t.reserve.more}
        >
          <Plus className="size-5" />
        </button>
      </div>
    </div>
  );
}

// ─── Date strip ──────────────────────────────────────────────────────────────

export function DateStrip({
  days,
  value,
  onChange,
  loading,
}: {
  days: CalendarDay[];
  value: LocalDate | null;
  onChange: (date: LocalDate) => void;
  loading: boolean;
}) {
  const { t, locale } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const name = useId();
  const statusLabel = (status: CalendarDay['status']) =>
    status === 'closed' ? t.reserve.closedDay : status === 'full' ? t.reserve.full : t.reserve.unavailableDay;

  useEffect(() => {
    if (!value || !scroller.current) return;
    const el = scroller.current.querySelector<HTMLElement>(`[data-date="${value}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [value]);

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{t.reserve.date}</legend>
      <div
        ref={scroller}
        className={cn('no-scrollbar -mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8', loading && 'opacity-60')}
      >
        {days.map((d, i) => {
          const disabled = !d.available;
          const selected = value === d.date;
          const newMonth = i === 0 || d.date.slice(0, 7) !== days[i - 1]!.date.slice(0, 7);
          return (
            <label
              key={d.date}
              data-date={d.date}
              className={cn(
                'relative flex w-[4.4rem] shrink-0 snap-start cursor-pointer flex-col items-center rounded-2xl py-3 ring-1 transition-[background-color,box-shadow,color] duration-200',
                selected ? 'bg-ink-900 text-cream-50 ring-ink-900' : 'bg-white text-ink-900 ring-cream-300 hover:ring-taupe-300',
                disabled && 'cursor-not-allowed bg-cream-100/70 text-taupe-400 ring-cream-200 hover:ring-cream-200',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-500',
              )}
            >
              <input
                type="radio"
                name={name}
                value={d.date}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(d.date)}
                className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none rounded-2xl opacity-0 disabled:cursor-not-allowed"
                aria-label={`${d.date}${d.available ? '' : ` — ${statusLabel(d.status)}`}`}
              />
              <span className={cn('text-[11px] font-semibold tracking-[0.12em] uppercase', selected ? 'text-cream-100' : disabled ? '' : 'text-taupe-600')}>
                {formatWeekdayShort(d.date, locale)}
              </span>
              <span className="font-display mt-0.5 text-[1.9rem] leading-none font-semibold">{dayOfMonth(d.date)}</span>
              <span className={cn('mt-1 text-[11px] font-medium', selected ? 'text-cream-100' : disabled ? '' : newMonth ? 'text-ink-700' : 'text-taupe-600')}>
                {d.available ? formatMonthShort(d.date, locale) : statusLabel(d.status)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// ─── Time slots ──────────────────────────────────────────────────────────────

export function TimeSlots({
  day,
  loading,
  value,
  onChange,
  error,
}: {
  day: AvailabilityResponse | undefined;
  loading: boolean;
  value: string | null;
  onChange: (time: string) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const name = useId();

  const groups = day
    ? [
        { label: t.reserve.lunch, slots: day.slots.filter((s) => parseTime(s.time) < 16 * 60) },
        { label: t.reserve.dinner, slots: day.slots.filter((s) => parseTime(s.time) >= 16 * 60) },
      ].filter((g) => g.slots.length > 0)
    : [];
  const noneAvailable = day && !day.slots.some((s) => s.available);

  return (
    <fieldset className={cn('min-w-0', !day && 'min-h-[15rem]')} aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="sr-only">{t.reserve.time}</legend>
      {loading && !day ? (
        <div className="text-taupe-500">
          <Spinner label={t.reserve.loadingSlots} />
        </div>
      ) : !day ? (
        <p className="text-sm text-taupe-500">{t.reserve.pickDate}</p>
      ) : noneAvailable ? (
        <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-taupe-600">{t.reserve.noSlots}</p>
      ) : (
        <div className={cn('space-y-4', loading && 'opacity-60')}>
          {groups.map((g) => (
            <div key={g.label}>
              {groups.length > 1 && <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-taupe-500 uppercase">{g.label}</p>}
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {g.slots.map((s) => {
                  const selected = value === s.time;
                  return (
                    <label
                      key={s.time}
                      className={cn(
                        'relative flex h-12 cursor-pointer items-center justify-center rounded-xl text-[15px] font-semibold tabular ring-1 transition-colors duration-150',
                        selected ? 'bg-ink-900 text-cream-50 ring-ink-900' : 'bg-white ring-cream-300 hover:ring-taupe-300',
                        !s.available && 'cursor-not-allowed bg-transparent text-taupe-400 line-through ring-cream-200 hover:ring-cream-200',
                        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-500',
                      )}
                    >
                      <input
                        type="radio"
                        name={name}
                        value={s.time}
                        checked={selected}
                        disabled={!s.available}
                        onChange={() => onChange(s.time)}
                        className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none rounded-xl opacity-0 disabled:cursor-not-allowed"
                        aria-label={s.available ? s.time : `${s.time} — ${t.reserve.full}`}
                      />
                      {s.time}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p id={`${name}-error`} className="mt-2 text-[13px] font-medium text-terracotta-600" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
