import {
  addDays,
  daysBetween,
  formatMinutes,
  isoWeekday,
  parseTime,
  zonedNow,
  type IsoWeekday,
  type LocalDate,
} from './time.js';

export type TimeRange = { opens: string; closes: string };
export type WeeklyHours = Record<IsoWeekday, TimeRange[]>;
export type SpecialDay = { date: LocalDate; closed: boolean; hours: TimeRange[]; note: string | null };

export type BookingSettings = {
  /** IANA zone of the restaurant, e.g. 'Africa/Casablanca'. */
  timeZone: string;
  /** Master switch for online reservations. */
  onlineBookingEnabled: boolean;
  /** When true, every online request starts as "pending" until staff confirm it. */
  requireApproval: boolean;
  slotIntervalMinutes: number;
  /** How long a table is expected to be occupied. */
  durationMinutes: number;
  /** Minimum notice before a same-day booking. */
  minNoticeMinutes: number;
  /** How far ahead guests can book. */
  maxDaysAhead: number;
  /** Larger parties are asked to call. */
  maxPartySize: number;
  /** Pacing: max guests arriving in the same slot (null = no limit). */
  maxCoversPerSlot: number | null;
  /** Max guests from online bookings seated at the same time (null = no limit). */
  maxConcurrentCovers: number | null;
  /** Last bookable arrival time before closing. */
  lastSeatingBeforeCloseMinutes: number;
};

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  timeZone: 'Africa/Casablanca',
  onlineBookingEnabled: true,
  requireApproval: true,
  slotIntervalMinutes: 30,
  durationMinutes: 90,
  minNoticeMinutes: 60,
  maxDaysAhead: 60,
  maxPartySize: 12,
  maxCoversPerSlot: 16,
  maxConcurrentCovers: 40,
  lastSeatingBeforeCloseMinutes: 60,
};

export type ExistingBooking = { time: string; partySize: number; durationMinutes: number };
export type Slot = { time: string; available: boolean };
export type DayClosedReason =
  | 'past_date'
  | 'too_far'
  | 'closed'
  | 'booking_disabled'
  | 'party_too_large'
  | 'no_slots';
export type DayAvailability = {
  date: LocalDate;
  open: boolean;
  reason: DayClosedReason | null;
  slots: Slot[];
};

type MinuteRange = { start: number; end: number };

/** Converts ranges to minutes; a closing time at or before the opening time means "after midnight". */
export function toMinuteRanges(ranges: TimeRange[]): MinuteRange[] {
  return ranges
    .map((r) => {
      const start = parseTime(r.opens);
      let end = parseTime(r.closes);
      if (end <= start) end += 1440;
      return { start, end };
    })
    .sort((a, b) => a.start - b.start);
}

export function rangesForDate(
  date: LocalDate,
  weekly: WeeklyHours,
  specialDays: readonly SpecialDay[] = [],
): { ranges: TimeRange[]; special: SpecialDay | null } {
  const special = specialDays.find((s) => s.date === date) ?? null;
  if (special) return { ranges: special.closed ? [] : special.hours, special };
  return { ranges: weekly[isoWeekday(date)] ?? [], special: null };
}

/** All candidate arrival times for a day, ignoring capacity and "now". */
export function candidateTimes(ranges: TimeRange[], settings: BookingSettings): number[] {
  const set = new Set<number>();
  const step = Math.max(5, settings.slotIntervalMinutes);
  for (const { start, end } of toMinuteRanges(ranges)) {
    const lastStart = end - settings.lastSeatingBeforeCloseMinutes;
    for (let t = start; t <= lastStart && t < 1440; t += step) set.add(t);
  }
  return [...set].sort((a, b) => a - b);
}

function peakLoad(existing: { start: number; end: number; covers: number }[], from: number, to: number) {
  const points = [from, ...existing.map((b) => b.start).filter((s) => s > from && s < to)];
  let peak = 0;
  for (const x of points) {
    let load = 0;
    for (const b of existing) if (b.start <= x && x < b.end) load += b.covers;
    peak = Math.max(peak, load);
  }
  return peak;
}

export function computeDayAvailability(input: {
  date: LocalDate;
  partySize: number;
  settings: BookingSettings;
  weekly: WeeklyHours;
  specialDays?: readonly SpecialDay[];
  existing: readonly ExistingBooking[];
  now: Date;
}): DayAvailability {
  const { date, partySize, settings } = input;
  const closed = (reason: DayClosedReason, open = false): DayAvailability => ({ date, open, reason, slots: [] });

  const today = zonedNow(settings.timeZone, input.now);
  const ahead = daysBetween(today.date, date);
  if (ahead < 0) return closed('past_date');
  if (ahead > settings.maxDaysAhead) return closed('too_far');

  const { ranges } = rangesForDate(date, input.weekly, input.specialDays);
  if (ranges.length === 0) return closed('closed');
  if (!settings.onlineBookingEnabled) return closed('booking_disabled', true);
  if (partySize > settings.maxPartySize) return closed('party_too_large', true);

  const earliest = ahead === 0 ? today.minutes + settings.minNoticeMinutes : -Infinity;
  const booked = input.existing.map((b) => {
    const start = parseTime(b.time);
    return { start, end: start + b.durationMinutes, covers: b.partySize };
  });

  const slots: Slot[] = [];
  for (const t of candidateTimes(ranges, settings)) {
    if (t < earliest) continue;
    let available = true;
    if (settings.maxCoversPerSlot != null) {
      const arriving = booked.filter((b) => b.start === t).reduce((sum, b) => sum + b.covers, 0);
      if (arriving + partySize > settings.maxCoversPerSlot) available = false;
    }
    if (available && settings.maxConcurrentCovers != null) {
      if (peakLoad(booked, t, t + settings.durationMinutes) + partySize > settings.maxConcurrentCovers) {
        available = false;
      }
    }
    slots.push({ time: formatMinutes(t), available });
  }

  if (slots.length === 0) return closed('no_slots', true);
  return { date, open: true, reason: null, slots };
}

export type OpenStatus =
  | { open: true; closesAt: string }
  | { open: false; nextOpening: { date: LocalDate; time: string } | null };

/** Is the restaurant open right now, and when does it next open/close? */
export function openStatus(
  now: Date,
  timeZone: string,
  weekly: WeeklyHours,
  specialDays: readonly SpecialDay[] = [],
): OpenStatus {
  const local = zonedNow(timeZone, now);
  const yesterday = addDays(local.date, -1);

  // A service that started yesterday and runs past midnight.
  for (const r of toMinuteRanges(rangesForDate(yesterday, weekly, specialDays).ranges)) {
    if (r.end > 1440 && local.minutes < r.end - 1440) return { open: true, closesAt: formatMinutes(r.end) };
  }
  const todayRanges = toMinuteRanges(rangesForDate(local.date, weekly, specialDays).ranges);
  for (const r of todayRanges) {
    if (local.minutes >= r.start && local.minutes < r.end) return { open: true, closesAt: formatMinutes(r.end) };
  }
  for (const r of todayRanges) {
    if (r.start > local.minutes) return { open: false, nextOpening: { date: local.date, time: formatMinutes(r.start) } };
  }
  for (let i = 1; i <= 14; i++) {
    const date = addDays(local.date, i);
    const first = toMinuteRanges(rangesForDate(date, weekly, specialDays).ranges)[0];
    if (first) return { open: false, nextOpening: { date, time: formatMinutes(first.start) } };
  }
  return { open: false, nextOpening: null };
}

/** Validates a day's ranges: each range must be non-empty and ranges must not overlap. */
export function rangesAreValid(ranges: TimeRange[]): boolean {
  let lastEnd = -1;
  for (const r of toMinuteRanges(ranges)) {
    if (r.end - r.start < 15) return false;
    if (r.start < lastEnd) return false;
    lastEnd = r.end;
  }
  return true;
}
