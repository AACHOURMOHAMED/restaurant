import type { z } from 'zod';
import type {
  MenuCategoryPublic,
  MenuItemPublic,
  MenuOptionGroupPublic,
  PublicMenu,
  StaffMenu,
  StaffMenuCategory,
  StaffMenuItem,
} from '../../shared/api-types';
import type { DietaryLabel } from '../../shared/constants';
import type { menuCategoryInputSchema, menuItemInputSchema, menuItemPatchSchema } from '../../shared/schemas';
import type { DB } from '../db';
import { badRequest, notFound } from '../errors';
import { getFlag, menuUpdatedAt, setFlag, touchMenu } from './settings';

type CategoryRow = {
  id: number;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  visible: number;
  sort_order: number;
};
type ItemRow = {
  id: number;
  category_id: number;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  price_cents: number;
  image: string | null;
  dietary: string;
  available: number;
  visible: number;
  is_special: number;
  sort_order: number;
};
type GroupRow = {
  id: number;
  item_id: number;
  name: string;
  name_en: string | null;
  min_select: number;
  max_select: number;
  sort_order: number;
};
type OptionRow = {
  id: number;
  group_id: number;
  name: string;
  name_en: string | null;
  price_delta_cents: number;
  available: number;
  sort_order: number;
};

export type CategoryInput = z.output<typeof menuCategoryInputSchema>;
export type ItemInput = z.output<typeof menuItemInputSchema>;
export type ItemPatch = z.output<typeof menuItemPatchSchema>;

function loadGroups(db: DB, itemIds: number[]): Map<number, MenuOptionGroupPublic[]> {
  const byItem = new Map<number, MenuOptionGroupPublic[]>();
  if (itemIds.length === 0) return byItem;
  const placeholders = itemIds.map(() => '?').join(',');
  const groups = db
    .prepare(`SELECT * FROM menu_option_groups WHERE item_id IN (${placeholders}) ORDER BY sort_order, id`)
    .all(...itemIds) as GroupRow[];
  if (groups.length === 0) return byItem;
  const options = db
    .prepare(
      `SELECT * FROM menu_options WHERE group_id IN (${groups.map(() => '?').join(',')}) ORDER BY sort_order, id`,
    )
    .all(...groups.map((g) => g.id)) as OptionRow[];
  const optionsByGroup = new Map<number, OptionRow[]>();
  for (const o of options) {
    const list = optionsByGroup.get(o.group_id) ?? [];
    list.push(o);
    optionsByGroup.set(o.group_id, list);
  }
  for (const g of groups) {
    const list = byItem.get(g.item_id) ?? [];
    list.push({
      id: g.id,
      name: g.name,
      nameEn: g.name_en,
      minSelect: g.min_select,
      maxSelect: g.max_select,
      options: (optionsByGroup.get(g.id) ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        nameEn: o.name_en,
        priceDeltaCents: o.price_delta_cents,
        available: o.available === 1,
      })),
    });
    byItem.set(g.item_id, list);
  }
  return byItem;
}

function toItem(r: ItemRow, groups: Map<number, MenuOptionGroupPublic[]>): StaffMenuItem {
  return {
    id: r.id,
    categoryId: r.category_id,
    name: r.name,
    nameEn: r.name_en,
    description: r.description,
    descriptionEn: r.description_en,
    priceCents: r.price_cents,
    image: r.image,
    dietary: JSON.parse(r.dietary) as DietaryLabel[],
    isSpecial: r.is_special === 1,
    available: r.available === 1,
    visible: r.visible === 1,
    sortOrder: r.sort_order,
    optionGroups: groups.get(r.id) ?? [],
  };
}

function loadMenu(db: DB, visibleOnly: boolean): StaffMenuCategory[] {
  const categories = db
    .prepare(`SELECT * FROM menu_categories ${visibleOnly ? 'WHERE visible = 1' : ''} ORDER BY sort_order, id`)
    .all() as CategoryRow[];
  const items = db
    .prepare(`SELECT * FROM menu_items ${visibleOnly ? 'WHERE visible = 1' : ''} ORDER BY sort_order, id`)
    .all() as ItemRow[];
  const groups = loadGroups(
    db,
    items.map((i) => i.id),
  );
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    nameEn: c.name_en,
    description: c.description,
    descriptionEn: c.description_en,
    visible: c.visible === 1,
    sortOrder: c.sort_order,
    items: items.filter((i) => i.category_id === c.id).map((i) => toItem(i, groups)),
  }));
}

export function getPublicMenu(db: DB): PublicMenu {
  const categories: MenuCategoryPublic[] = loadMenu(db, true)
    .filter((c) => c.items.length > 0)
    .map(({ visible: _v, sortOrder: _s, items, ...c }) => ({
      ...c,
      items: items.map(({ visible: _iv, sortOrder: _is, ...item }): MenuItemPublic => item),
    }));
  return { categories, updatedAt: menuUpdatedAt(db) };
}

export function getStaffMenu(db: DB): StaffMenu {
  return { categories: loadMenu(db, false), demo: getFlag(db, 'demo_menu') };
}

/** Items (with options) that can currently be ordered, keyed by id. */
export function getOrderableItems(db: DB, ids: number[]): Map<number, StaffMenuItem> {
  const unique = [...new Set(ids)];
  const out = new Map<number, StaffMenuItem>();
  if (unique.length === 0) return out;
  const rows = db
    .prepare(
      `SELECT i.* FROM menu_items i JOIN menu_categories c ON c.id = i.category_id
       WHERE i.id IN (${unique.map(() => '?').join(',')}) AND i.visible = 1 AND c.visible = 1`,
    )
    .all(...unique) as ItemRow[];
  const groups = loadGroups(
    db,
    rows.map((r) => r.id),
  );
  for (const r of rows) out.set(r.id, toItem(r, groups));
  return out;
}

// ─── Categories ──────────────────────────────────────────────────────────────

export function createCategory(db: DB, input: CategoryInput, now: Date): number {
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM menu_categories').get() as { m: number };
  const ts = now.toISOString();
  const info = db
    .prepare(
      `INSERT INTO menu_categories (name, name_en, description, description_en, visible, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.name, input.nameEn, input.description, input.descriptionEn, input.visible ? 1 : 0, max.m + 1, ts, ts);
  touchMenu(db);
  return Number(info.lastInsertRowid);
}

export function updateCategory(db: DB, id: number, input: CategoryInput, now: Date): void {
  const res = db
    .prepare(
      `UPDATE menu_categories SET name = ?, name_en = ?, description = ?, description_en = ?, visible = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(input.name, input.nameEn, input.description, input.descriptionEn, input.visible ? 1 : 0, now.toISOString(), id);
  if (res.changes === 0) throw notFound('Category');
  touchMenu(db);
}

export function deleteCategory(db: DB, id: number): void {
  if (db.prepare('DELETE FROM menu_categories WHERE id = ?').run(id).changes === 0) throw notFound('Category');
  touchMenu(db);
}

export function reorderCategories(db: DB, ids: number[]): void {
  const stmt = db.prepare('UPDATE menu_categories SET sort_order = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => stmt.run(i + 1, id)))();
  touchMenu(db);
}

// ─── Items ───────────────────────────────────────────────────────────────────

function assertCategory(db: DB, id: number) {
  if (!db.prepare('SELECT 1 FROM menu_categories WHERE id = ?').get(id)) {
    throw badRequest('VALIDATION', 'Unknown category', { categoryId: 'invalid_category' });
  }
}

/** Upserts option groups/options, keeping existing ids stable so guests' carts stay valid. */
function saveOptionGroups(db: DB, itemId: number, groups: ItemInput['optionGroups']): void {
  const existingGroups = db.prepare('SELECT id FROM menu_option_groups WHERE item_id = ?').all(itemId) as {
    id: number;
  }[];
  const existingGroupIds = new Set(existingGroups.map((g) => g.id));
  const keptGroups = new Set<number>();

  groups.forEach((g, gi) => {
    let groupId: number;
    if (g.id && existingGroupIds.has(g.id)) {
      groupId = g.id;
      db.prepare(
        'UPDATE menu_option_groups SET name = ?, name_en = ?, min_select = ?, max_select = ?, sort_order = ? WHERE id = ?',
      ).run(g.name, g.nameEn, g.minSelect, g.maxSelect, gi, groupId);
    } else {
      groupId = Number(
        db
          .prepare(
            'INSERT INTO menu_option_groups (item_id, name, name_en, min_select, max_select, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(itemId, g.name, g.nameEn, g.minSelect, g.maxSelect, gi).lastInsertRowid,
      );
    }
    keptGroups.add(groupId);

    const existingOptions = new Set(
      (db.prepare('SELECT id FROM menu_options WHERE group_id = ?').all(groupId) as { id: number }[]).map((o) => o.id),
    );
    const keptOptions = new Set<number>();
    g.options.forEach((o, oi) => {
      if (o.id && existingOptions.has(o.id)) {
        db.prepare(
          'UPDATE menu_options SET name = ?, name_en = ?, price_delta_cents = ?, available = ?, sort_order = ? WHERE id = ?',
        ).run(o.name, o.nameEn, o.priceDeltaCents, o.available ? 1 : 0, oi, o.id);
        keptOptions.add(o.id);
      } else {
        const id = db
          .prepare(
            'INSERT INTO menu_options (group_id, name, name_en, price_delta_cents, available, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          )
          .run(groupId, o.name, o.nameEn, o.priceDeltaCents, o.available ? 1 : 0, oi).lastInsertRowid;
        keptOptions.add(Number(id));
      }
    });
    for (const id of existingOptions) if (!keptOptions.has(id)) db.prepare('DELETE FROM menu_options WHERE id = ?').run(id);
  });

  for (const id of existingGroupIds) {
    if (!keptGroups.has(id)) db.prepare('DELETE FROM menu_option_groups WHERE id = ?').run(id);
  }
}

export function createItem(db: DB, input: ItemInput, now: Date, opts: { demo?: boolean } = {}): number {
  assertCategory(db, input.categoryId);
  return db.transaction(() => {
    const max = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM menu_items WHERE category_id = ?')
      .get(input.categoryId) as { m: number };
    const ts = now.toISOString();
    const id = Number(
      db
        .prepare(
          `INSERT INTO menu_items (category_id, name, name_en, description, description_en, price_cents, image, dietary,
             available, visible, is_special, sort_order, is_demo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.categoryId,
          input.name,
          input.nameEn,
          input.description,
          input.descriptionEn,
          input.priceCents,
          input.image,
          JSON.stringify(input.dietary),
          input.available ? 1 : 0,
          input.visible ? 1 : 0,
          input.isSpecial ? 1 : 0,
          max.m + 1,
          opts.demo ? 1 : 0,
          ts,
          ts,
        ).lastInsertRowid,
    );
    saveOptionGroups(db, id, input.optionGroups);
    touchMenu(db);
    return id;
  })();
}

export function getItemImage(db: DB, id: number): string | null | undefined {
  const row = db.prepare('SELECT image FROM menu_items WHERE id = ?').get(id) as { image: string | null } | undefined;
  return row ? row.image : undefined;
}

export function updateItem(db: DB, id: number, input: ItemInput, now: Date): void {
  assertCategory(db, input.categoryId);
  db.transaction(() => {
    const current = db.prepare('SELECT category_id FROM menu_items WHERE id = ?').get(id) as
      | { category_id: number }
      | undefined;
    if (!current) throw notFound('Menu item');
    let sortClause = '';
    const params: unknown[] = [];
    if (current.category_id !== input.categoryId) {
      const max = db
        .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM menu_items WHERE category_id = ?')
        .get(input.categoryId) as { m: number };
      sortClause = ', sort_order = ?';
      params.push(max.m + 1);
    }
    db.prepare(
      `UPDATE menu_items SET category_id = ?, name = ?, name_en = ?, description = ?, description_en = ?, price_cents = ?,
         image = ?, dietary = ?, available = ?, visible = ?, is_special = ?, updated_at = ?${sortClause}
       WHERE id = ?`,
    ).run(
      input.categoryId,
      input.name,
      input.nameEn,
      input.description,
      input.descriptionEn,
      input.priceCents,
      input.image,
      JSON.stringify(input.dietary),
      input.available ? 1 : 0,
      input.visible ? 1 : 0,
      input.isSpecial ? 1 : 0,
      now.toISOString(),
      ...params,
      id,
    );
    saveOptionGroups(db, id, input.optionGroups);
    touchMenu(db);
  })();
}

export function patchItem(db: DB, id: number, patch: ItemPatch, now: Date): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.available !== undefined) (sets.push('available = ?'), params.push(patch.available ? 1 : 0));
  if (patch.visible !== undefined) (sets.push('visible = ?'), params.push(patch.visible ? 1 : 0));
  if (patch.isSpecial !== undefined) (sets.push('is_special = ?'), params.push(patch.isSpecial ? 1 : 0));
  if (patch.priceCents !== undefined) (sets.push('price_cents = ?'), params.push(patch.priceCents));
  if (sets.length === 0) return;
  const res = db
    .prepare(`UPDATE menu_items SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
    .run(...params, now.toISOString(), id);
  if (res.changes === 0) throw notFound('Menu item');
  touchMenu(db);
}

export function deleteItem(db: DB, id: number): string | null {
  const image = getItemImage(db, id);
  if (image === undefined) throw notFound('Menu item');
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
  touchMenu(db);
  return image;
}

export function reorderItems(db: DB, ids: number[]): void {
  const stmt = db.prepare('UPDATE menu_items SET sort_order = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => stmt.run(i + 1, id)))();
  touchMenu(db);
}

export function imageInUse(db: DB, image: string): boolean {
  return !!db.prepare('SELECT 1 FROM menu_items WHERE image = ? LIMIT 1').get(image);
}

/** Removes every dish/category that came from the sample (demo) menu; returns their photo keys. */
export function deleteDemoMenu(db: DB): string[] {
  return db.transaction(() => {
    const images = (db.prepare('SELECT image FROM menu_items WHERE is_demo = 1 AND image IS NOT NULL').all() as { image: string }[]).map(
      (r) => r.image,
    );
    db.prepare('DELETE FROM menu_items WHERE is_demo = 1').run();
    db.prepare(
      'DELETE FROM menu_categories WHERE is_demo = 1 AND NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id = menu_categories.id)',
    ).run();
    db.prepare('UPDATE menu_categories SET is_demo = 0').run();
    setFlag(db, 'demo_menu', false);
    touchMenu(db);
    return images.filter((image) => !imageInUse(db, image));
  })();
}

export function markCategoryDemo(db: DB, id: number): void {
  db.prepare('UPDATE menu_categories SET is_demo = 1 WHERE id = ?').run(id);
}
