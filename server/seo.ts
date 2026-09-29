/**
 * <head> tags for search engines and link previews, including schema.org
 * "Restaurant" structured data (address, phone, opening hours…).
 * Pure function: used by the server at runtime and by Vite at build time.
 */
import { restaurant } from '../content/restaurant';
import type { WeeklyHours } from '../shared/availability';
import type { Lang } from '../shared/constants';

export const HEAD_START = '<!--head:start-->';
export const HEAD_END = '<!--head:end-->';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderHead(opts: { lang: Lang; publicUrl: string | null; hours: WeeklyHours; shareImage?: string | null }) {
  const { lang } = opts;
  const base = opts.publicUrl ?? null;
  const title = restaurant.seo.title[lang];
  const description = restaurant.seo.description[lang];
  const a = restaurant.address;

  const openingHoursSpecification = Object.entries(opts.hours).flatMap(([day, ranges]) =>
    ranges.map((r) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${DAY_NAMES[Number(day) - 1]}`,
      opens: r.opens,
      closes: r.closes === '24:00' ? '23:59' : r.closes,
    })),
  );

  const sameAs = [restaurant.website, ...Object.values(restaurant.social)].filter(Boolean);
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: restaurant.name,
    description,
    ...(base ? { url: base, hasMenu: `${base}/#menu`, acceptsReservations: `${base}/reservation` } : { acceptsReservations: true }),
    telephone: restaurant.contact.phone,
    ...(restaurant.contact.email ? { email: restaurant.contact.email } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: [a.street, a.complement].filter(Boolean).join(', '),
      addressLocality: a.city,
      postalCode: a.postalCode,
      addressCountry: 'MA',
    },
    servesCuisine: ['Seafood', 'Moroccan', 'International'],
    foundingDate: String(restaurant.since),
    currenciesAccepted: restaurant.currency.code,
    openingHoursSpecification,
    sameAs,
    ...(opts.shareImage && base ? { image: `${base}${opts.shareImage}` } : {}),
  };

  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    base ? `<link rel="canonical" href="${esc(base)}/" />` : '',
    `<meta property="og:type" content="restaurant.restaurant" />`,
    `<meta property="og:site_name" content="${esc(restaurant.name)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:locale" content="${lang === 'fr' ? 'fr_MA' : 'en_US'}" />`,
    base ? `<meta property="og:url" content="${esc(base)}/" />` : '',
    opts.shareImage && base ? `<meta property="og:image" content="${esc(base + opts.shareImage)}" />` : '',
    `<meta name="twitter:card" content="${opts.shareImage ? 'summary_large_image' : 'summary'}" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  ];
  return tags.filter(Boolean).join('\n    ');
}

export function injectHead(html: string, head: string): string {
  const start = html.indexOf(HEAD_START);
  const end = html.indexOf(HEAD_END);
  if (start === -1 || end === -1) return html;
  return `${html.slice(0, start + HEAD_START.length)}\n    ${head}\n    ${html.slice(end)}`;
}
