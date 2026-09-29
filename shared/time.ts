/**
 * Time-zone helpers built on Intl only (no date library).
 * Restaurant dates are wall-clock strings in the restaurant's time zone:
 *   LocalDate = 'YYYY-MM-DD', time = 'HH:MM'.
 */

export type LocalDate = string;
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const pad2 = (n: number) => String(n).padStart(2, '0');

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-4]):([0-5]\d)$/;

export function isValidDateString(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidTimeString(value: string): boolean {
  const m = TIME_RE.exec(value);
  if (!m) return false;
  return !(m[1] === '24' && m[2] !== '00');
}

/** 'HH:MM' → minutes after midnight ('24:00' → 1440). */
export function parseTime(value: string): number {
  if (!isValidTimeString(value)) throw new Error(`Invalid time: ${value}`);
  const [h, m] = value.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Minutes after midnight → 'HH:MM' (wraps past midnight). */
export function formatMinutes(total: number): string {
  const m = ((total % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

function splitDate(date: LocalDate): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, mo, d] = splitDate(date);
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function isoWeekday(date: LocalDate): IsoWeekday {
  const [y, mo, d] = splitDate(date);
  const day = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const [y1, m1, d1] = splitDate(a);
  const [y2, m2, d2] = splitDate(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

function zonedParts(timeZone: string, instant: Date) {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour === 24 ? 0 : out.hour!,
    minute: out.minute!,
    second: out.second!,
  };
}

/** The current wall-clock date/time at the restaurant. */
export function zonedNow(timeZone: string, now: Date = new Date()) {
  const p = zonedParts(timeZone, now);
  const date = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  return { date, minutes: p.hour * 60 + p.minute, weekday: isoWeekday(date) };
}

function offsetMs(timeZone: string, utcMs: number): number {
  const p = zonedParts(timeZone, new Date(utcMs));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock time at the restaurant → absolute instant. */
export function zonedTimeToUtc(date: LocalDate, time: string, timeZone: string): Date {
  const [y, mo, d] = splitDate(date);
  const minutes = parseTime(time);
  const guess = Date.UTC(y, mo - 1, d, 0, minutes);
  const first = offsetMs(timeZone, guess);
  let utc = guess - first;
  const second = offsetMs(timeZone, utc);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

/** Absolute instant → wall-clock date/time at the restaurant. */
export function utcToZoned(instant: Date, timeZone: string): { date: LocalDate; time: string } {
  const p = zonedParts(timeZone, instant);
  return { date: `${p.year}-${pad2(p.month)}-${pad2(p.day)}`, time: `${pad2(p.hour)}:${pad2(p.minute)}` };
}
