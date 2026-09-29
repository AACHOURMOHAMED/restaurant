import type { WeeklyHours } from './availability.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** schema.org openingHoursSpecification for the weekly hours (days are 1 = Monday … 7 = Sunday). */
export function openingHoursSpecification(hours: WeeklyHours) {
  return Object.entries(hours).flatMap(([day, ranges]) =>
    ranges.map((r) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${DAY_NAMES[Number(day) - 1]}`,
      opens: r.opens,
      closes: r.closes === '24:00' ? '23:59' : r.closes,
    })),
  );
}
