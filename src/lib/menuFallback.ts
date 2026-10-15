/**
 * When the menu cannot be loaded (database or server down), the site still shows one: the last menu this
 * browser loaded, or else the backup menu from content/menu.ts. Either way it is marked `offline`, so the
 * page says so and ordering stays off (dish ids may no longer match the live menu).
 */
import type { MenuCategoryPublic, PublicMenu } from '@shared/api-types';
import { ApiError } from './api';

export type MenuResult = PublicMenu & {
  /** Set when this is not the live menu: 'saved' = last one this browser loaded; 'backup' / 'sample' = content/menu.ts. */
  offline?: 'saved' | 'backup' | 'sample';
};

const SAVED_KEY = 'bbpark.menu';

export function saveMenu(menu: PublicMenu): void {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(menu));
  } catch {
    // Storage full or blocked (private mode): the backup menu still covers an outage.
  }
}

function savedMenu(): PublicMenu | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const menu = raw ? (JSON.parse(raw) as PublicMenu) : null;
    return menu && Array.isArray(menu.categories) && menu.categories.length > 0 ? menu : null;
  } catch {
    return null;
  }
}

/** Errors that mean "the menu service is down", as opposed to a bad request: network, 5xx, no backend. */
export function isOutage(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status >= 500 || err.code === 'BACKEND_UNAVAILABLE';
}

/** The menu to show during an outage (loaded on demand: most visits never need it). */
export async function fallbackMenu(): Promise<MenuResult> {
  const saved = savedMenu();
  if (saved) return { ...saved, offline: 'saved' };
  const [{ backupMenu, dishPhotoName }, { default: photos }] = await Promise.all([
    import('@content/menu'),
    import('@/generated/menu-photos.json'),
  ]);
  const photoKeys = photos as Record<string, string>;
  let id = 0;
  const categories: MenuCategoryPublic[] = backupMenu.categories.map((c) => {
    const categoryId = --id; // negative: never an id of the live menu
    return {
      id: categoryId,
      name: c.name,
      nameEn: c.nameEn,
      description: null,
      descriptionEn: null,
      items: c.items
        .filter((item) => item.visible !== false)
        .map((item) => {
          const image = photoKeys[dishPhotoName(item.name)] ?? null;
          return {
            id: --id,
            categoryId,
            name: item.name,
            nameEn: item.nameEn ?? null,
            description: item.description ?? null,
            descriptionEn: item.descriptionEn ?? null,
            priceCents: item.priceCents,
            image,
            imageBase: image ? BACKUP_PHOTO_BASE : null,
            dietary: item.dietary ?? [],
            isSpecial: item.isSpecial ?? false,
            available: item.available ?? true,
            optionGroups: (item.optionGroups ?? []).map((g) => ({
              id: --id,
              name: g.name,
              nameEn: g.nameEn ?? null,
              minSelect: g.minSelect ?? 0,
              maxSelect: g.maxSelect ?? 1,
              options: g.options.map((o) => ({
                id: --id,
                name: o.name,
                nameEn: o.nameEn ?? null,
                priceDeltaCents: o.priceDeltaCents ?? 0,
                available: o.available ?? true,
              })),
            })),
          };
        }),
    };
  });
  return {
    categories,
    updatedAt: '1970-01-01T00:00:00.000Z',
    offline: backupMenu.isSample ? 'sample' : 'backup',
  };
}

/** Backup-menu dish photos are built into the site (npm run photos → public/photos/menu). */
export const BACKUP_PHOTO_BASE = '/photos';
