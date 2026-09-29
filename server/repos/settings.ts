import { restaurant } from '../../content/restaurant.js';
import {
  DEFAULT_BOOKING_SETTINGS,
  type BookingSettings,
  type SpecialDay,
  type TimeRange,
  type WeeklyHours,
} from '../../shared/availability.js';
import {
  bookingSettingsSchema,
  DEFAULT_ORDERING_SETTINGS,
  orderingSettingsSchema,
  weeklyHoursSchema,
  type OrderingSettings,
} from '../../shared/schemas.js';
import type { LocalDate } from '../../shared/time.js';
import type { Queryable } from '../db.js';
import { randomToken } from '../lib/util.js';

async function read<T>(q: Queryable, key: string): Promise<T | undefined> {
  const row = await q.one<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? (JSON.parse(row.value) as T) : undefined;
}

async function write(q: Queryable, key: string, value: unknown): Promise<void> {
  await q.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), new Date().toISOString()],
  );
}

export async function getBookingSettings(q: Queryable): Promise<BookingSettings> {
  const stored = (await read<Partial<BookingSettings>>(q, 'booking')) ?? {};
  const merged = { ...DEFAULT_BOOKING_SETTINGS, timeZone: restaurant.timeZone, ...stored };
  const parsed = bookingSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : { ...DEFAULT_BOOKING_SETTINGS, timeZone: restaurant.timeZone };
}

export async function setBookingSettings(q: Queryable, settings: BookingSettings): Promise<void> {
  await write(q, 'booking', settings);
}

export async function getOrderingSettings(q: Queryable): Promise<OrderingSettings> {
  const stored = (await read<Partial<OrderingSettings>>(q, 'ordering')) ?? {};
  const parsed = orderingSettingsSchema.safeParse({ ...DEFAULT_ORDERING_SETTINGS, ...stored });
  return parsed.success ? parsed.data : DEFAULT_ORDERING_SETTINGS;
}

export async function setOrderingSettings(q: Queryable, settings: OrderingSettings): Promise<void> {
  await write(q, 'ordering', settings);
}

export async function getWeeklyHours(q: Queryable): Promise<WeeklyHours> {
  const parsed = weeklyHoursSchema.safeParse((await read(q, 'hours')) ?? restaurant.defaultHours);
  return (parsed.success ? parsed.data : restaurant.defaultHours) as WeeklyHours;
}

export async function setWeeklyHours(q: Queryable, hours: WeeklyHours): Promise<void> {
  await write(q, 'hours', hours);
}

type SpecialDayRow = { date: string; closed: number; hours: string; note: string | null };
const toSpecialDay = (r: SpecialDayRow): SpecialDay => ({
  date: r.date,
  closed: r.closed === 1,
  hours: JSON.parse(r.hours) as TimeRange[],
  note: r.note,
});

export async function listSpecialDays(q: Queryable, from?: LocalDate, to?: LocalDate): Promise<SpecialDay[]> {
  const rows = await q.many<SpecialDayRow>(
    `SELECT * FROM special_days WHERE (?::text IS NULL OR date >= ?) AND (?::text IS NULL OR date <= ?) ORDER BY date`,
    [from ?? null, from ?? null, to ?? null, to ?? null],
  );
  return rows.map(toSpecialDay);
}

export async function upsertSpecialDay(q: Queryable, day: SpecialDay): Promise<void> {
  await q.run(
    `INSERT INTO special_days (date, closed, hours, note) VALUES (?, ?, ?, ?)
     ON CONFLICT (date) DO UPDATE SET closed = excluded.closed, hours = excluded.hours, note = excluded.note`,
    [day.date, day.closed ? 1 : 0, JSON.stringify(day.closed ? [] : day.hours), day.note],
  );
}

export async function deleteSpecialDay(q: Queryable, date: LocalDate): Promise<boolean> {
  return (await q.run('DELETE FROM special_days WHERE date = ?', [date])) > 0;
}

export async function getFlag(q: Queryable, key: string): Promise<boolean> {
  return (await read<boolean>(q, key)) === true;
}

export async function setFlag(q: Queryable, key: string, value: boolean): Promise<void> {
  await write(q, key, value);
}

/**
 * Secret used to derive guests' status-link tokens. Generated on first use — insert-if-absent, so
 * two server instances starting together agree on one secret (overwriting it would break links).
 */
export async function getServerSecret(q: Queryable): Promise<string> {
  const existing = await read<string>(q, 'server_secret');
  if (existing) return existing;
  await q.run(`INSERT INTO settings (key, value, updated_at) VALUES ('server_secret', ?, ?) ON CONFLICT (key) DO NOTHING`, [
    JSON.stringify(randomToken(48)),
    new Date().toISOString(),
  ]);
  return (await read<string>(q, 'server_secret'))!;
}

export async function touchMenu(q: Queryable): Promise<void> {
  await write(q, 'menu_updated_at', new Date().toISOString());
}

export async function menuUpdatedAt(q: Queryable): Promise<string> {
  return (await read<string>(q, 'menu_updated_at')) ?? '1970-01-01T00:00:00.000Z';
}

/** Base URL of uploaded dish photos ('/uploads' on disk; the Blob store's origin on Vercel). */
export async function getMediaBase(q: Queryable, fallback: string | null): Promise<string | null> {
  return (await read<string>(q, 'media_base')) ?? fallback;
}

export async function setMediaBase(q: Queryable, base: string): Promise<void> {
  if ((await read<string>(q, 'media_base')) !== base) await write(q, 'media_base', base);
}
