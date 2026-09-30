import { describe, expect, it } from 'vitest';
import { formatPrice, parseAmountToCents } from '../../shared/money';
import { defaultSelection, priceSelection, type PricedItem } from '../../shared/pricing';
import { isPlausiblePhone } from '../../shared/schemas';
import { normalizeTableNumber } from '../../server/lib/util';

const steak: PricedItem = {
  id: 1,
  priceCents: 17000,
  optionGroups: [
    {
      id: 10,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 100, priceDeltaCents: 0, available: true },
        { id: 101, priceDeltaCents: 0, available: true },
      ],
    },
    {
      id: 11,
      minSelect: 0,
      maxSelect: 1,
      options: [
        { id: 110, priceDeltaCents: 1000, available: true },
        { id: 111, priceDeltaCents: 1500, available: false },
      ],
    },
  ],
};

describe('priceSelection', () => {
  it('adds option prices to the base price', () => {
    expect(priceSelection(steak, [100, 110])).toEqual({ ok: true, unitPriceCents: 18000, optionIds: [100, 110] });
  });

  it('enforces required choices and maximums', () => {
    expect(priceSelection(steak, [])).toEqual({ ok: false, error: { code: 'group_min', groupId: 10 } });
    expect(priceSelection(steak, [100, 101])).toEqual({ ok: false, error: { code: 'group_max', groupId: 10 } });
  });

  it('rejects unknown and unavailable options', () => {
    expect(priceSelection(steak, [100, 999])).toEqual({ ok: false, error: { code: 'option_invalid', optionId: 999 } });
    expect(priceSelection(steak, [100, 111])).toEqual({ ok: false, error: { code: 'option_unavailable', optionId: 111 } });
  });

  it('ignores duplicated option ids', () => {
    expect(priceSelection(steak, [100, 100])).toMatchObject({ ok: true, unitPriceCents: 17000 });
  });

  it('pre-selects the first choice of required single-choice groups', () => {
    expect(defaultSelection(steak)).toEqual([100]);
  });
});

describe('money', () => {
  it('formats prices the Moroccan way', () => {
    expect(formatPrice(12000, 'fr', 'DH')).toBe('120 DH');
    expect(formatPrice(12050, 'fr', 'DH')).toBe('120,50 DH');
    expect(formatPrice(12050, 'en', 'DH')).toBe('120.50 DH');
  });

  it('parses staff-entered amounts', () => {
    expect(parseAmountToCents('120')).toBe(12000);
    expect(parseAmountToCents('120,5')).toBe(12050);
    expect(parseAmountToCents(' 1 200.00 ')).toBe(120000);
    expect(parseAmountToCents('abc')).toBeNull();
  });
});

describe('input normalisation', () => {
  it('matches what guests type to table numbers', () => {
    expect(normalizeTableNumber('8')).toBe('8');
    expect(normalizeTableNumber(' Table 08 ')).toBe('8');
    expect(normalizeTableNumber('#8')).toBe('8');
    expect(normalizeTableNumber('N° 12')).toBe('12');
    expect(normalizeTableNumber('Terrasse  2')).toBe('terrasse 2');
    expect(normalizeTableNumber('north 2')).toBe('north 2');
    expect(normalizeTableNumber('T8')).toBe('t8');
  });

  it('accepts local and international phone numbers', () => {
    expect(isPlausiblePhone('06 12 34 56 78')).toBe(true);
    expect(isPlausiblePhone('+212 6 12 34 56 78')).toBe(true);
    expect(isPlausiblePhone('(0537) 37-06-24')).toBe(true);
    expect(isPlausiblePhone('12345')).toBe(false);
    expect(isPlausiblePhone('call me')).toBe(false);
  });
});
