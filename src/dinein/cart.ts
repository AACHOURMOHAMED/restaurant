import type { MenuItemPublic } from '@shared/api-types';
import { priceSelection } from '@shared/pricing';
import type { Cart, CartLine } from '@/lib/stores';
import type { indexMenu } from '@/menu/filters';

export type PricedLine = {
  line: CartLine;
  item: MenuItemPublic | null;
  unitCents: number;
  totalCents: number;
  problem: 'unavailable' | 'options' | null;
};

export type PricedCart = { lines: PricedLine[]; totalCents: number; count: number; hasProblems: boolean };

/** Prices the cart against the current menu and flags lines that can no longer be ordered. */
export function priceCart(cart: Cart, index: ReturnType<typeof indexMenu>, flagged: ReadonlySet<number> = new Set()): PricedCart {
  let totalCents = 0;
  let count = 0;
  const lines = cart.lines.map((line): PricedLine => {
    const item = index.items.get(line.menuItemId) ?? null;
    count += line.quantity;
    if (!item || !item.available || flagged.has(line.menuItemId)) {
      return { line, item, unitCents: item?.priceCents ?? 0, totalCents: 0, problem: 'unavailable' };
    }
    const priced = priceSelection(item, line.optionIds);
    if (!priced.ok) return { line, item, unitCents: item.priceCents, totalCents: 0, problem: 'options' };
    const lineTotal = priced.unitPriceCents * line.quantity;
    totalCents += lineTotal;
    return { line, item, unitCents: priced.unitPriceCents, totalCents: lineTotal, problem: null };
  });
  return { lines, totalCents, count, hasProblems: lines.some((l) => l.problem) };
}
