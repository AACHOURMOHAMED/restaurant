import { restaurant } from '@content/restaurant';
import { zonedTimeToUtc } from '@shared/time';

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

/** Downloads an .ics calendar event for a confirmed reservation. */
export function downloadIcs(opts: { date: string; time: string; timeZone: string; reference: string; partySize: number; title: string }) {
  const start = zonedTimeToUtc(opts.date, opts.time, opts.timeZone);
  const end = new Date(start.getTime() + 90 * 60_000);
  const a = restaurant.address;
  const location = [a.street, a.complement, `${a.postalCode} ${a.city}`].filter(Boolean).join(', ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//B&B Park//Reservations//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${opts.reference}@bandbpark`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(opts.title)}`,
    `LOCATION:${escape(location)}`,
    `DESCRIPTION:${escape(`${opts.reference} · ${opts.partySize} · ${restaurant.contact.phoneDisplay}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bbpark-${opts.reference}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
