import type { z } from 'zod';
import type {
  MenuCategoryPublic,
  MenuItemPublic,
  MenuOptionGroupPublic,
  PublicMenu,
  StaffMenu,
  StaffMenuCategory,
  StaffMenuItem,
} from '../../shared/api-types.js';
import type { DietaryLabel } from '../../shared/constants.js';
import type { menuCategoryInputSchema, menuItemInputSchema, menuItemPatchSchema } from '../../shared/schemas.js';
import { atomically, type Db, type Queryable, rowId } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { getMediaBase, menuUpdatedAt, touchMenu } from './settings.js';

/**
 * Advisory lock held by menu changes that read before they write (next sort position, "does this
 * category still exist?", a dish's current option groups…), so two edits never interleave.
 */
export const MENU_LOCK = 'menu';

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
  image_base: string | null;
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

async function loadGroups(q: Queryable, itemIds: number[]): Promise<Map<number, MenuOptionGroupPublic[]>> {
  const byItem = new Map<number, MenuOptionGroupPublic[]>();
  if (itemIds.length === 0) return byItem;
  const placeholders = itemIds.map(() => '?').join(',');
  const groups = await q.many<GroupRow>(
    `SELECT * FROM menu_option_groups WHERE item_id IN (${placeholders}) ORDER BY sort_order, id`,
    itemIds,
  );
  if (groups.length === 0) return byItem;
  const options = await q.many<OptionRow>(
    `SELECT * FROM menu_options WHERE group_id IN (${groups.map(() => '?').join(',')}) ORDER BY sort_order, id`,
    groups.map((g) => g.id),
  );
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
    imageBase: r.image_base,
    dietary: JSON.parse(r.dietary) as DietaryLabel[],
    isSpecial: r.is_special === 1,
    available: r.available === 1,
    visible: r.visible === 1,
    sortOrder: r.sort_order,
    optionGroups: groups.get(r.id) ?? [],
  };
}

async function loadMenu(q: Queryable, visibleOnly: boolean): Promise<StaffMenuCategory[]> {
  const categories = await q.many<CategoryRow>(
    `SELECT * FROM menu_categories ${visibleOnly ? 'WHERE visible = 1' : ''} ORDER BY sort_order, id`,
  );
  const items = await q.many<ItemRow>(`SELECT * FROM menu_items ${visibleOnly ? 'WHERE visible = 1' : ''} ORDER BY sort_order, id`);
  const groups = await loadGroups(q, items.map((i) => i.id));
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

export async function getPublicMenu(q: Queryable): Promise<PublicMenu> {
  // Read before the dishes, so the stamp is never newer than the content it is sent with.
  const updatedAt = await menuUpdatedAt(q);
  const categories: MenuCategoryPublic[] = (await loadMenu(q, true))
    .filter((c) => c.items.length > 0)
    .map(({ visible: _v, sortOrder: _s, items, ...c }) => ({
      ...c,
      items: items.map(({ visible: _iv, sortOrder: _is, ...item }): MenuItemPublic => item),
    }));
  return { categories, updatedAt };
}

export async function getStaffMenu(q: Queryable): Promise<StaffMenu> {
  return { categories: await loadMenu(q, false), demo: await hasDemoMenu(q) };
}

/** Items (with options) that can currently be ordered, keyed by id. */
export async function getOrderableItems(q: Queryable, ids: number[]): Promise<Map<number, StaffMenuItem>> {
  const unique = [...new Set(ids)];
  const out = new Map<number, StaffMenuItem>();
  if (unique.length === 0) return out;
  const rows = await q.many<ItemRow>(
    `SELECT i.* FROM menu_items i JOIN menu_categories c ON c.id = i.category_id
     WHERE i.id IN (${unique.map(() => '?').join(',')}) AND i.visible = 1 AND c.visible = 1`,
    unique.map(rowId),
  );
  const groups = await loadGroups(q, rows.map((r) => r.id));
  for (const r of rows) out.set(r.id, toItem(r, groups));
  return out;
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function createCategory(db: Db | Queryable, input: CategoryInput, now: Date): Promise<number> {
  return atomically(db, MENU_LOCK, async (q) => {
    const max = (await q.one<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM menu_categories'))!;
    const ts = now.toISOString();
    const { id } = (await q.one<{ id: number }>(
      `INSERT INTO menu_categories (name, name_en, description, description_en, visible, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [input.name, input.nameEn, input.description, input.descriptionEn, input.visible ? 1 : 0, max.m + 1, ts, ts],
    ))!;
    await touchMenu(q);
    return id;
  });
}

export async function updateCategory(q: Queryable, id: number, input: CategoryInput, now: Date): Promise<void> {
  const changes = await q.run(
    `UPDATE menu_categories SET name = ?, name_en = ?, description = ?, description_en = ?, visible = ?, updated_at = ?
     WHERE id = ?`,
    [input.name, input.nameEn, input.description, input.descriptionEn, input.visible ? 1 : 0, now.toISOString(), rowId(id)],
  );
  if (changes === 0) throw notFound('Category');
  await touchMenu(q);
}

export async function deleteCategory(db: Db | Queryable, id: number): Promise<void> {
  await atomically(db, MENU_LOCK, async (q) => {
    if ((await q.run('DELETE FROM menu_categories WHERE id = ?', [rowId(id)])) === 0) throw notFound('Category');
    await touchMenu(q);
  });
}

export async function reorderCategories(db: Db | Queryable, ids: number[]): Promise<void> {
  await atomically(db, MENU_LOCK, async (q) => {
    for (const [i, id] of ids.entries()) await q.run('UPDATE menu_categories SET sort_order = ? WHERE id = ?', [i + 1, rowId(id)]);
    await touchMenu(q);
  });
}

// ─── Items ───────────────────────────────────────────────────────────────────

async function assertCategory(q: Queryable, id: number): Promise<void> {
  if (!(await q.one('SELECT 1 FROM menu_categories WHERE id = ?', [rowId(id)]))) {
    throw badRequest('VALIDATION', 'Unknown category', { categoryId: 'invalid_category' });
  }
}

/** Upserts option groups/options, keeping existing ids stable so guests' carts stay valid. */
async function saveOptionGroups(q: Queryable, itemId: number, groups: ItemInput['optionGroups']): Promise<void> {
  const existingGroups = await q.many<{ id: number }>('SELECT id FROM menu_option_groups WHERE item_id = ?', [itemId]);
  const existingGroupIds = new Set(existingGroups.map((g) => g.id));
  const keptGroups = new Set<number>();

  for (const [gi, g] of groups.entries()) {
    let groupId: number;
    if (g.id && existingGroupIds.has(g.id)) {
      groupId = g.id;
      await q.run(
        'UPDATE menu_option_groups SET name = ?, name_en = ?, min_select = ?, max_select = ?, sort_order = ? WHERE id = ?',
        [g.name, g.nameEn, g.minSelect, g.maxSelect, gi, groupId],
      );
    } else {
      groupId = (await q.one<{ id: number }>(
        `INSERT INTO menu_option_groups (item_id, name, name_en, min_select, max_select, sort_order) VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [itemId, g.name, g.nameEn, g.minSelect, g.maxSelect, gi],
      ))!.id;
    }
    keptGroups.add(groupId);

    const existingOptions = new Set(
      (await q.many<{ id: number }>('SELECT id FROM menu_options WHERE group_id = ?', [groupId])).map((o) => o.id),
    );
    const keptOptions = new Set<number>();
    for (const [oi, o] of g.options.entries()) {
      if (o.id && existingOptions.has(o.id)) {
        await q.run(
          'UPDATE menu_options SET name = ?, name_en = ?, price_delta_cents = ?, available = ?, sort_order = ? WHERE id = ?',
          [o.name, o.nameEn, o.priceDeltaCents, o.available ? 1 : 0, oi, o.id],
        );
        keptOptions.add(o.id);
      } else {
        const { id } = (await q.one<{ id: number }>(
          `INSERT INTO menu_options (group_id, name, name_en, price_delta_cents, available, sort_order) VALUES (?, ?, ?, ?, ?, ?)
           RETURNING id`,
          [groupId, o.name, o.nameEn, o.priceDeltaCents, o.available ? 1 : 0, oi],
        ))!;
        keptOptions.add(id);
      }
    }
    for (const id of existingOptions) if (!keptOptions.has(id)) await q.run('DELETE FROM menu_options WHERE id = ?', [id]);
  }

  for (const id of existingGroupIds) {
    if (!keptGroups.has(id)) await q.run('DELETE FROM menu_option_groups WHERE id = ?', [id]);
  }
}

export async function createItem(
  db: Db | Queryable,
  input: ItemInput,
  now: Date,
  opts: { demo?: boolean } = {},
): Promise<number> {
  return atomically(db, MENU_LOCK, async (q) => {
    await assertCategory(q, input.categoryId);
    const max = (await q.one<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM menu_items WHERE category_id = ?', [
      input.categoryId,
    ]))!;
    const ts = now.toISOString();
    const { id } = (await q.one<{ id: number }>(
      `INSERT INTO menu_items (category_id, name, name_en, description, description_en, price_cents, image, image_base, dietary,
         available, visible, is_special, sort_order, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        input.categoryId,
        input.name,
        input.nameEn,
        input.description,
        input.descriptionEn,
        input.priceCents,
        input.image,
        input.image ? await getMediaBase(q, null) : null,
        JSON.stringify(input.dietary),
        input.available ? 1 : 0,
        input.visible ? 1 : 0,
        input.isSpecial ? 1 : 0,
        max.m + 1,
        opts.demo ? 1 : 0,
        ts,
        ts,
      ],
    ))!;
    await saveOptionGroups(q, id, input.optionGroups);
    await touchMenu(q);
    return id;
  });
}

export async function getItemImage(q: Queryable, id: number): Promise<string | null | undefined> {
  const row = await q.one<{ image: string | null }>('SELECT image FROM menu_items WHERE id = ?', [rowId(id)]);
  return row ? row.image : undefined;
}

export async function updateItem(db: Db | Queryable, id: number, input: ItemInput, now: Date): Promise<void> {
  await atomically(db, MENU_LOCK, async (q) => {
    await assertCategory(q, input.categoryId);
    const current = await q.one<{ category_id: number; image: string | null; image_base: string | null }>(
      'SELECT category_id, image, image_base FROM menu_items WHERE id = ?',
      [rowId(id)],
    );
    if (!current) throw notFound('Menu item');
    // A new photo is where the latest upload went; an unchanged one stays where it is.
    const imageBase = input.image === current.image ? current.image_base : input.image ? await getMediaBase(q, null) : null;
    let sortClause = '';
    const params: unknown[] = [];
    if (current.category_id !== input.categoryId) {
      const max = (await q.one<{ m: number }>('SELECT COALESCE(MAX(sort_order), 0) AS m FROM menu_items WHERE category_id = ?', [
        input.categoryId,
      ]))!;
      sortClause = ', sort_order = ?';
      params.push(max.m + 1);
    }
    await q.run(
      `UPDATE menu_items SET category_id = ?, name = ?, name_en = ?, description = ?, description_en = ?, price_cents = ?,
         image = ?, image_base = ?, dietary = ?, available = ?, visible = ?, is_special = ?, updated_at = ?${sortClause}
       WHERE id = ?`,
      [
        input.categoryId,
        input.name,
        input.nameEn,
        input.description,
        input.descriptionEn,
        input.priceCents,
        input.image,
        imageBase,
        JSON.stringify(input.dietary),
        input.available ? 1 : 0,
        input.visible ? 1 : 0,
        input.isSpecial ? 1 : 0,
        now.toISOString(),
        ...params,
        id,
      ],
    );
    await saveOptionGroups(q, id, input.optionGroups);
    await touchMenu(q);
  });
}

export async function patchItem(q: Queryable, id: number, patch: ItemPatch, now: Date): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.available !== undefined) (sets.push('available = ?'), params.push(patch.available ? 1 : 0));
  if (patch.visible !== undefined) (sets.push('visible = ?'), params.push(patch.visible ? 1 : 0));
  if (patch.isSpecial !== undefined) (sets.push('is_special = ?'), params.push(patch.isSpecial ? 1 : 0));
  if (patch.priceCents !== undefined) (sets.push('price_cents = ?'), params.push(patch.priceCents));
  if (sets.length === 0) return;
  const changes = await q.run(`UPDATE menu_items SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [
    ...params,
    now.toISOString(),
    rowId(id),
  ]);
  if (changes === 0) throw notFound('Menu item');
  await touchMenu(q);
}

/** Deletes a dish; returns its photo key (null if it had none). */
export async function deleteItem(db: Db | Queryable, id: number): Promise<string | null> {
  return atomically(db, MENU_LOCK, async (q) => {
    const row = await q.one<{ image: string | null }>('DELETE FROM menu_items WHERE id = ? RETURNING image', [rowId(id)]);
    if (!row) throw notFound('Menu item');
    await touchMenu(q);
    return row.image;
  });
}

export async function reorderItems(db: Db | Queryable, ids: number[]): Promise<void> {
  await atomically(db, MENU_LOCK, async (q) => {
    for (const [i, id] of ids.entries()) await q.run('UPDATE menu_items SET sort_order = ? WHERE id = ?', [i + 1, rowId(id)]);
    await touchMenu(q);
  });
}

export async function imageInUse(q: Queryable, image: string): Promise<boolean> {
  return !!(await q.one('SELECT 1 FROM menu_items WHERE image = ? LIMIT 1', [image]));
}

/** Removes every dish/category that came from the sample (demo) menu; returns their photo keys. */
export async function deleteDemoMenu(db: Db | Queryable): Promise<string[]> {
  return atomically(db, MENU_LOCK, async (q) => {
    const images = (await q.many<{ image: string }>('SELECT image FROM menu_items WHERE is_demo = 1 AND image IS NOT NULL')).map(
      (r) => r.image,
    );
    await q.run('DELETE FROM menu_items WHERE is_demo = 1');
    await q.run(
      'DELETE FROM menu_categories WHERE is_demo = 1 AND NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id = menu_categories.id)',
    );
    await q.run('UPDATE menu_categories SET is_demo = 0');
    await touchMenu(q);
    const unused: string[] = [];
    for (const image of images) if (!(await imageInUse(q, image))) unused.push(image);
    return unused;
  });
}

/**
 * Whether sample dishes or categories are on the menu (the site then says it's a sample menu).
 * Read from the menu itself, so it stays right however the sample is removed.
 */
export async function hasDemoMenu(q: Queryable): Promise<boolean> {
  const row = await q.one<{ demo: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM menu_items WHERE is_demo = 1) OR EXISTS (SELECT 1 FROM menu_categories WHERE is_demo = 1) AS demo',
  );
  return row?.demo === true;
}

export async function markCategoryDemo(q: Queryable, id: number): Promise<void> {
  await q.run('UPDATE menu_categories SET is_demo = 1 WHERE id = ?', [rowId(id)]);
}
