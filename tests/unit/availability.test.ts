import { describe, expect, it } from 'vitest';
import {
  computeDayAvailability,
  DEFAULT_BOOKING_SETTINGS,
  openStatus,
  rangesAreValid,
  type BookingSettings,
  type WeeklyHours,
} from '../../shared/availability';

const TZ = 'Africa/Casablanca';
const noonToEleven = [{ opens: '12:00', closes: '23:00' }];
const WEEK: WeeklyHours = { 1: noonToEleven, 2: noonToEleven, 3: noonToEleven, 4: noonToEleven, 5: [], 6: noonToEleven, 7: noonToEleven };
const settings = (over: Partial<BookingSettings> = {}): BookingSettings => ({
  ...DEFAULT_BOOKING_SETTINGS,
  timeZone: TZ,
  maxCoversPerSlot: null,
  maxConcurrentCovers: null,
  ...over,
});
// Monday 5 Oct 2026, 11:00 local.
const NOW = new Date('2026-10-05T10:00:00Z');

function day(date: string, over: Partial<Parameters<typeof computeDayAvailability>[0]> = {}) {
  return computeDayAvailability({ date, partySize: 2, settings: settings(), weekly: WEEK, existing: [], now: NOW, ...over });
}

describe('computeDayAvailability', () => {
  it('generates slots from opening until the last seating', () => {
    const d = day('2026-10-06');
    expect(d.open).toBe(true);
    expect(d.slots[0]!.time).toBe('12:00');
    expect(d.slots.at(-1)!.time).toBe('22:00'); // 23:00 close − 60 min last seating
    expect(d.slots).toHaveLength(21);
  });

  it('never offers past dates or times inside the notice period', () => {
    expect(day('2026-10-04').reason).toBe('past_date');
    const today = day('2026-10-05', { now: new Date('2026-10-05T13:10:00Z') }); // 14:10 local
    expect(today.slots[0]!.time).toBe('15:30'); // 14:10 + 60 min notice → next slot 15:30
  });

  it('respects closed days, special days and the booking window', () => {
    expect(day('2026-10-09').reason).toBe('closed'); // Friday
    expect(
      day('2026-10-06', { specialDays: [{ date: '2026-10-06', closed: true, hours: [], note: 'Privatisé' }] }).reason,
    ).toBe('closed');
    const special = day('2026-10-09', {
      specialDays: [{ date: '2026-10-09', closed: false, hours: [{ opens: '19:00', closes: '22:00' }], note: null }],
    });
    expect(special.slots.map((s) => s.time)).toEqual(['19:00', '19:30', '20:00', '20:30', '21:00']);
    expect(day('2026-12-31').reason).toBe('too_far');
  });

  it('asks large parties to call and honours the master switch', () => {
    expect(day('2026-10-06', { partySize: 13 }).reason).toBe('party_too_large');
    expect(day('2026-10-06', { settings: settings({ onlineBookingEnabled: false }) }).reason).toBe('booking_disabled');
  });

  it('applies per-slot pacing', () => {
    const d = day('2026-10-06', {
      settings: settings({ maxCoversPerSlot: 6 }),
      existing: [{ time: '20:00', partySize: 5, durationMinutes: 90 }],
    });
    expect(d.slots.find((s) => s.time === '20:00')!.available).toBe(false);
    expect(d.slots.find((s) => s.time === '20:30')!.available).toBe(true);
  });

  it('applies concurrent seating capacity using the reservation duration', () => {
    const d = day('2026-10-06', {
      partySize: 4,
      settings: settings({ maxConcurrentCovers: 10, durationMinutes: 90 }),
      existing: [
        { time: '19:00', partySize: 4, durationMinutes: 90 },
        { time: '20:00', partySize: 4, durationMinutes: 90 },
      ],
    });
    const at = (t: string) => d.slots.find((s) => s.time === t)!.available;
    expect(at('18:00')).toBe(true); // 18:00–19:30 overlaps 19:00 only → 8
    expect(at('19:30')).toBe(false); // overlaps both → 12 > 10
    expect(at('21:30')).toBe(true); // after both
  });

  it('supports services that close after midnight', () => {
    const late: WeeklyHours = { ...WEEK, 6: [{ opens: '19:00', closes: '01:00' }] };
    const d = day('2026-10-10', { weekly: late });
    expect(d.slots.at(-1)!.time).toBe('23:30'); // never past midnight
  });
});

describe('openStatus', () => {
  it('is open during service and gives the closing time', () => {
    expect(openStatus(new Date('2026-10-05T12:00:00Z'), TZ, WEEK)).toEqual({ open: true, closesAt: '23:00' });
  });

  it('gives the next opening when closed (skips closed Friday)', () => {
    // Thursday 8 Oct, 23:30 local.
    expect(openStatus(new Date('2026-10-08T22:30:00Z'), TZ, WEEK)).toEqual({
      open: false,
      nextOpening: { date: '2026-10-10', time: '12:00' },
    });
  });

  it('counts a service running past midnight from the previous day', () => {
    const late: WeeklyHours = { ...WEEK, 1: [{ opens: '19:00', closes: '01:00' }] };
    // Tuesday 00:30 local.
    expect(openStatus(new Date('2026-10-05T23:30:00Z'), TZ, late)).toEqual({ open: true, closesAt: '01:00' });
  });
});

describe('rangesAreValid', () => {
  it('rejects overlapping or empty ranges', () => {
    expect(rangesAreValid([{ opens: '12:00', closes: '15:00' }, { opens: '19:00', closes: '23:00' }])).toBe(true);
    expect(rangesAreValid([{ opens: '12:00', closes: '15:00' }, { opens: '14:00', closes: '23:00' }])).toBe(false);
    expect(rangesAreValid([{ opens: '12:00', closes: '12:05' }])).toBe(false);
  });
});
