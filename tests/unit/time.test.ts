import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatMinutes,
  isoWeekday,
  isValidDateString,
  isValidTimeString,
  parseTime,
  utcToZoned,
  zonedNow,
  zonedTimeToUtc,
} from '../../shared/time';

describe('date helpers', () => {
  it('validates real calendar dates only', () => {
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2026-02-29')).toBe(false);
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('26-01-01')).toBe(false);
  });

  it('validates times', () => {
    expect(isValidTimeString('00:00')).toBe(true);
    expect(isValidTimeString('23:59')).toBe(true);
    expect(isValidTimeString('24:00')).toBe(true);
    expect(isValidTimeString('24:30')).toBe(false);
    expect(isValidTimeString('7:30')).toBe(false);
    expect(parseTime('12:30')).toBe(750);
    expect(formatMinutes(1440 + 30)).toBe('00:30');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-05', '2026-10-12')).toBe(7);
  });

  it('computes ISO weekdays (Monday = 1, Sunday = 7)', () => {
    expect(isoWeekday('2026-10-05')).toBe(1);
    expect(isoWeekday('2026-10-09')).toBe(5);
    expect(isoWeekday('2026-10-11')).toBe(7);
  });
});

describe('time zones', () => {
  it('converts Kénitra wall-clock time to UTC (UTC+1 outside Ramadan)', () => {
    expect(zonedTimeToUtc('2026-10-05', '20:00', 'Africa/Casablanca').toISOString()).toBe('2026-10-05T19:00:00.000Z');
  });

  it('round-trips through utcToZoned', () => {
    const instant = zonedTimeToUtc('2026-07-14', '13:45', 'Africa/Casablanca');
    expect(utcToZoned(instant, 'Africa/Casablanca')).toEqual({ date: '2026-07-14', time: '13:45' });
  });

  it('handles daylight-saving zones', () => {
    // Paris is UTC+2 in summer and UTC+1 in winter.
    expect(zonedTimeToUtc('2026-07-01', '12:00', 'Europe/Paris').toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(zonedTimeToUtc('2026-12-01', '12:00', 'Europe/Paris').toISOString()).toBe('2026-12-01T11:00:00.000Z');
  });

  it('reports the restaurant-local date, not the server date', () => {
    // 23:30 UTC on the 5th is already the 6th at 00:30 in Kénitra.
    const now = zonedNow('Africa/Casablanca', new Date('2026-10-05T23:30:00Z'));
    expect(now).toEqual({ date: '2026-10-06', minutes: 30, weekday: 2 });
  });
});
