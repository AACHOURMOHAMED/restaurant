/**
 * SAMPLE DATA FOR PREVIEWS AND TESTS ONLY.
 *
 * This is NOT B&B Park's menu: dish names, descriptions and prices are
 * placeholders so every feature (menu, ordering, dashboard) can be tried
 * before the real menu is entered. While it is loaded, the website shows a
 * "sample menu" notice, and staff can remove it in one click from
 * Dashboard → Menu → "Supprimer le menu d'exemple". The dishes live in content/menu.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dishPhotoName, SAMPLE_MENU } from '../../content/menu.js';
import { menuItemInputSchema } from '../../shared/schemas.js';
import type { Db } from '../db.js';
import { createCategory, createItem, hasDemoMenu, markCategoryDemo, MENU_LOCK } from '../repos/menu.js';
import { setMediaBase, touchMenu } from '../repos/settings.js';
import { createTable, listTables, TABLES_LOCK } from '../repos/tables.js';
import { deleteMenuImage, processMenuImage } from '../services/images.js';
import type { MediaStore } from '../storage.js';

export { dishPhotoName };

/** Loads the sample menu in one transaction; does nothing while it is already loaded. */
export async function seedDemoMenu(db: Db, now = new Date()): Promise<void> {
  await db.tx(
    async (tx) => {
      if (await hasDemoMenu(tx)) return;
      for (const cat of SAMPLE_MENU) {
        const categoryId = await createCategory(
          tx,
          { name: cat.name, nameEn: cat.nameEn, description: null, descriptionEn: null, visible: true },
          now,
        );
        await markCategoryDemo(tx, categoryId);
        for (const item of cat.items) {
          await createItem(tx, menuItemInputSchema.parse({ ...item, categoryId }), now, { demo: true });
        }
      }
    },
    { lock: MENU_LOCK },
  );
}

/**
 * Sample dish photos: content/photos/menu/<dish-name>.jpg (see dishPhotoName) is attached to the
 * matching sample dish that has no photo yet, through the same pipeline and media store as dashboard
 * uploads. Photos are processed outside any transaction (they can take a while).
 */
export async function attachDemoPhotos(db: Db, store: MediaStore, dir = path.resolve('content/photos/menu')): Promise<number> {
  if (!fs.existsSync(dir)) return 0;
  const files = new Map(
    fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((f) => [f.replace(/\.[^.]+$/, ''), path.join(dir, f)] as const),
  );
  const dishes = await db.many<{ id: number; name: string }>(
    'SELECT id, name FROM menu_items WHERE is_demo = 1 AND image IS NULL ORDER BY id',
  );
  let attached = 0;
  let baseSaved = false;
  for (const dish of dishes) {
    const file = files.get(dishPhotoName(dish.name));
    if (!file) continue;
    const { image, base } = await processMenuImage(fs.readFileSync(file), store);
    if (!baseSaved) {
      await setMediaBase(db, base); // before any dish shows the photo, so its URL can be built
      baseSaved = true;
    }
    // Only onto a dish still without a photo: another run may have attached one meanwhile.
    if ((await db.run('UPDATE menu_items SET image = ?, image_base = ? WHERE id = ? AND image IS NULL', [image, base, dish.id])) === 0) {
      await deleteMenuImage(image, store);
      continue;
    }
    attached++;
  }
  if (attached > 0) await touchMenu(db); // new ETag, so browsers fetch the menu with its photos
  return attached;
}

/** Twelve sample tables so the QR and table-number flows can be tried (only into an empty floor plan). */
export async function seedDemoTables(db: Db, now = new Date()): Promise<void> {
  await db.tx(
    async (tx) => {
      if ((await listTables(tx)).length > 0) return;
      for (let n = 1; n <= 12; n++) {
        await createTable(tx, { number: String(n), seats: n % 3 === 0 ? 6 : n % 2 === 0 ? 4 : 2, area: null, active: true }, now);
      }
    },
    { lock: TABLES_LOCK },
  );
}
