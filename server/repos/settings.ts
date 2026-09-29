import { restaurant } from '../../content/restaurant';
import {
  DEFAULT_BOOKING_SETTINGS,
  type BookingSettings,
  type SpecialDay,
  type TimeRange,
  type WeeklyHours,
} from '../../shared/availability';
import {
  bookingSettingsSchema,
  DEFAULT_ORDERING_SETTINGS,
  orderingSettingsSchema,
  weeklyHoursSchema,
  type OrderingSettings,
} from '../../shared/schemas';
import type { LocalDate } from '../../shared/time';
import type { DB } from '../db';
import { randomToken } from '../lib/util';

function read<T>(db: DB, key: string): T | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : undefined;
}

function write(db: DB, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

export function getBookingSettings(db: DB): BookingSettings {
  const stored = read<Partial<BookingSettings>>(db, 'booking') ?? {};
  const merged = { ...DEFAULT_BOOKING_SETTINGS, timeZone: restaurant.timeZone, ...stored };
  const parsed = bookingSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : { ...DEFAULT_BOOKING_SETTINGS, timeZone: restaurant.timeZone };
}

export function setBookingSettings(db: DB, settings: BookingSettings): void {
  write(db, 'booking', settings);
}

export function getOrderingSettings(db: DB): OrderingSettings {
  const stored = read<Partial<OrderingSettings>>(db, 'ordering') ?? {};
  const parsed = orderingSettingsSchema.safeParse({ ...DEFAULT_ORDERING_SETTINGS, ...stored });
  return parsed.success ? parsed.data : DEFAULT_ORDERING_SETTINGS;
}

export function setOrderingSettings(db: DB, settings: OrderingSettings): void {
  write(db, 'ordering', settings);
}

export function getWeeklyHours(db: DB): WeeklyHours {
  const parsed = weeklyHoursSchema.safeParse(read(db, 'hours') ?? restaurant.defaultHours);
  return (parsed.success ? parsed.data : restaurant.defaultHours) as WeeklyHours;
}

export function setWeeklyHours(db: DB, hours: WeeklyHours): void {
  write(db, 'hours', hours);
}

type SpecialDayRow = { date: string; closed: number; hours: string; note: string | null };
const toSpecialDay = (r: SpecialDayRow): SpecialDay => ({
  date: r.date,
  closed: r.closed === 1,
  hours: JSON.parse(r.hours) as TimeRange[],
  note: r.note,
});

export function listSpecialDays(db: DB, from?: LocalDate, to?: LocalDate): SpecialDay[] {
  const rows = db
    .prepare(
      `SELECT * FROM special_days WHERE (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?) ORDER BY date`,
    )
    .all(from ?? null, from ?? null, to ?? null, to ?? null) as SpecialDayRow[];
  return rows.map(toSpecialDay);
}

export function upsertSpecialDay(db: DB, day: SpecialDay): void {
  db.prepare(
    `INSERT INTO special_days (date, closed, hours, note) VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET closed = excluded.closed, hours = excluded.hours, note = excluded.note`,
  ).run(day.date, day.closed ? 1 : 0, JSON.stringify(day.closed ? [] : day.hours), day.note);
}

export function deleteSpecialDay(db: DB, date: LocalDate): boolean {
  return db.prepare('DELETE FROM special_days WHERE date = ?').run(date).changes > 0;
}

export function getFlag(db: DB, key: string): boolean {
  return read<boolean>(db, key) === true;
}

export function setFlag(db: DB, key: string, value: boolean): void {
  write(db, key, value);
}

/** Secret used to derive guests' status-link tokens. Generated on first use. */
export function getServerSecret(db: DB): string {
  const existing = read<string>(db, 'server_secret');
  if (existing) return existing;
  const secret = randomToken(48);
  write(db, 'server_secret', secret);
  return secret;
}

export function touchMenu(db: DB): void {
  write(db, 'menu_updated_at', new Date().toISOString());
}

export function menuUpdatedAt(db: DB): string {
  return read<string>(db, 'menu_updated_at') ?? '1970-01-01T00:00:00.000Z';
}
