import type { MenuCategoryPublic, MenuItemPublic } from '@shared/api-types';

export const MENU_FILTERS = ['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'no_nuts', 'no_shellfish', 'not_spicy'] as const;
export type MenuFilter = (typeof MENU_FILTERS)[number];

function matchesFilter(item: MenuItemPublic, f: MenuFilter): boolean {
  switch (f) {
    case 'no_nuts':
      return !item.dietary.includes('contains_nuts');
    case 'no_shellfish':
      return !item.dietary.includes('contains_shellfish');
    case 'not_spicy':
      return !item.dietary.includes('spicy');
    default:
      return item.dietary.includes(f);
  }
}

/** Lower-case, accent-free text for forgiving search ("creme" finds "Crème"). */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function filterMenu(
  categories: MenuCategoryPublic[],
  opts: { categoryId: number | 'all'; filters: MenuFilter[]; query: string },
): MenuCategoryPublic[] {
  const q = fold(opts.query.trim());
  return categories
    .filter((c) => opts.categoryId === 'all' || c.id === opts.categoryId)
    .map((c) => ({
      ...c,
      items: c.items.filter((item) => {
        if (!opts.filters.every((f) => matchesFilter(item, f))) return false;
        if (!q) return true;
        const haystack = fold([item.name, item.nameEn, item.description, item.descriptionEn, c.name, c.nameEn].filter(Boolean).join(' '));
        return haystack.includes(q);
      }),
    }))
    .filter((c) => c.items.length > 0);
}

/** Only filters that would actually narrow the current menu are offered. */
export function usefulFilters(categories: MenuCategoryPublic[]): MenuFilter[] {
  const items = categories.flatMap((c) => c.items);
  return MENU_FILTERS.filter((f) => {
    const n = items.filter((i) => matchesFilter(i, f)).length;
    return n > 0 && n < items.length;
  });
}

export function indexMenu(categories: MenuCategoryPublic[] | undefined) {
  const items = new Map<number, MenuItemPublic>();
  const categoryOf = new Map<number, MenuCategoryPublic>();
  for (const c of categories ?? []) {
    for (const i of c.items) {
      items.set(i.id, i);
      categoryOf.set(i.id, c);
    }
  }
  return { items, categoryOf };
}
