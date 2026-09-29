import { restaurant } from '@content/restaurant';
import { formatPrice } from '@shared/money';
import { daysBetween, type LocalDate } from '@shared/time';
import { useI18n } from '@/i18n';

/** Capitalises only the first letter ("lundi 5 octobre" → "Lundi 5 octobre"), unlike CSS `capitalize`. */
export const ucfirst = (s: string) => (s ? s[0]!.toLocaleUpperCase() + s.slice(1) : s);

const utcDate = (date: LocalDate) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12));
};

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = locale + JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options });
    cache.set(key, f);
  }
  return f;
}

/** "lundi 5 octobre" / "Monday 5 October" */
export const formatDateLong = (date: LocalDate, locale: string) =>
  dtf(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(utcDate(date));

/** "lundi 5 octobre 2026" */
export const formatDateFull = (date: LocalDate, locale: string) =>
  dtf(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(utcDate(date));

export const formatWeekdayShort = (date: LocalDate, locale: string) =>
  dtf(locale, { weekday: 'short' }).format(utcDate(date)).replace('.', '');

export const formatMonthShort = (date: LocalDate, locale: string) =>
  dtf(locale, { month: 'short' }).format(utcDate(date)).replace('.', '');

export const dayOfMonth = (date: LocalDate) => Number(date.slice(8, 10));

/** Clock time of an ISO instant at the restaurant ("20:05"). */
export function formatInstantTime(iso: string, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  );
}

/** Short date + time of an ISO instant at the restaurant ("29 sept. 20:05"). */
export function formatInstant(iso: string, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** "aujourd’hui", "demain" or the weekday + date. */
export function relativeDay(date: LocalDate, today: LocalDate, labels: { today: string; tomorrow: string }, locale: string) {
  const diff = daysBetween(today, date);
  if (diff === 0) return labels.today;
  if (diff === 1) return labels.tomorrow;
  return formatDateLong(date, locale);
}

export function usePrice() {
  const { lang } = useI18n();
  return (cents: number) => formatPrice(cents, lang, restaurant.currency.symbol);
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
