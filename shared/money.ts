import type { Lang } from './constants';

const cache = new Map<string, Intl.NumberFormat>();

function formatter(lang: Lang, fraction: boolean) {
  const key = `${lang}:${fraction}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
      minimumFractionDigits: fraction ? 2 : 0,
      maximumFractionDigits: 2,
    });
    cache.set(key, f);
  }
  return f;
}

/** 12000 → "120 DH", 12050 → "120,50 DH" (fr) / "120.50 DH" (en). */
export function formatPrice(cents: number, lang: Lang, symbol: string): string {
  return `${formatter(lang, cents % 100 !== 0).format(cents / 100)} ${symbol}`;
}

/** Signed price delta for options: "+15 DH", "−5 DH". */
export function formatPriceDelta(cents: number, lang: Lang, symbol: string): string {
  if (cents === 0) return '';
  return `${cents > 0 ? '+' : '−'}${formatPrice(Math.abs(cents), lang, symbol)}`;
}

/** Parses a staff-entered amount ("120", "120,50", "120.5") into cents. */
export function parseAmountToCents(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}
