/**
 * Price computation for dishes with options. Used by the client to display
 * totals and by the server as the single source of truth when an order is
 * submitted (client prices are never trusted).
 */

export type PricedOption = { id: number; priceDeltaCents: number; available: boolean };
export type PricedOptionGroup = { id: number; minSelect: number; maxSelect: number; options: PricedOption[] };
export type PricedItem = { id: number; priceCents: number; optionGroups: PricedOptionGroup[] };

export type SelectionError =
  | { code: 'option_invalid'; optionId: number }
  | { code: 'option_unavailable'; optionId: number }
  | { code: 'group_min'; groupId: number }
  | { code: 'group_max'; groupId: number };

export type SelectionResult =
  | { ok: true; unitPriceCents: number; optionIds: number[] }
  | { ok: false; error: SelectionError };

export function priceSelection(item: PricedItem, optionIds: readonly number[]): SelectionResult {
  const unique = [...new Set(optionIds)];
  const groupOf = new Map<number, { group: PricedOptionGroup; option: PricedOption }>();
  for (const group of item.optionGroups) {
    for (const option of group.options) groupOf.set(option.id, { group, option });
  }

  let unit = item.priceCents;
  const counts = new Map<number, number>();
  for (const id of unique) {
    const hit = groupOf.get(id);
    if (!hit) return { ok: false, error: { code: 'option_invalid', optionId: id } };
    if (!hit.option.available) return { ok: false, error: { code: 'option_unavailable', optionId: id } };
    counts.set(hit.group.id, (counts.get(hit.group.id) ?? 0) + 1);
    unit += hit.option.priceDeltaCents;
  }
  for (const group of item.optionGroups) {
    const n = counts.get(group.id) ?? 0;
    if (n < group.minSelect) return { ok: false, error: { code: 'group_min', groupId: group.id } };
    if (n > group.maxSelect) return { ok: false, error: { code: 'group_max', groupId: group.id } };
  }
  // Keep a stable order (menu order) for display and snapshots.
  const ordered = item.optionGroups.flatMap((g) => g.options.map((o) => o.id)).filter((id) => unique.includes(id));
  return { ok: true, unitPriceCents: Math.max(0, unit), optionIds: ordered };
}

/** Options pre-selected when a dish sheet opens: the first available option of each required single-choice group. */
export function defaultSelection(item: PricedItem): number[] {
  const ids: number[] = [];
  for (const g of item.optionGroups) {
    if (g.minSelect >= 1 && g.maxSelect === 1) {
      const first = g.options.find((o) => o.available);
      if (first) ids.push(first.id);
    }
  }
  return ids;
}
