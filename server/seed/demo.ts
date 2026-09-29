/**
 * SAMPLE DATA FOR PREVIEWS AND TESTS ONLY.
 *
 * This is NOT B&B Park's menu: dish names, descriptions and prices are
 * placeholders so every feature (menu, ordering, dashboard) can be tried
 * before the real menu is entered. While it is loaded, the website shows a
 * "sample menu" notice, and staff can remove it in one click from
 * Dashboard → Menu → "Supprimer le menu d'exemple".
 */
import fs from 'node:fs';
import path from 'node:path';
import type { MenuItemInput } from '../../shared/schemas';
import { menuItemInputSchema } from '../../shared/schemas';
import type { DB } from '../db';
import { createCategory, createItem, markCategoryDemo } from '../repos/menu';
import { setFlag, touchMenu } from '../repos/settings';
import { createTable, listTables } from '../repos/tables';
import { processMenuImage } from '../services/images';

type DemoItem = Omit<MenuItemInput, 'categoryId'>;
type DemoCategory = { name: string; nameEn: string; items: DemoItem[] };

const opt = (name: string, nameEn: string, priceDeltaCents = 0) => ({ name, nameEn, priceDeltaCents });

const DEMO_MENU: DemoCategory[] = [
  {
    name: 'Entrées',
    nameEn: 'Starters',
    items: [
      {
        name: 'Soupe de poisson',
        nameEn: 'Fish soup',
        description: 'Soupe maison, croûtons dorés et rouille.',
        descriptionEn: 'House fish soup with golden croutons and rouille.',
        priceCents: 4500,
      },
      {
        name: 'Crevettes pil-pil',
        nameEn: 'Pil-pil prawns',
        description: 'Crevettes sautées à l’ail, au piment et à l’huile d’olive, servies grésillantes.',
        descriptionEn: 'Prawns sizzled with garlic, chilli and olive oil.',
        priceCents: 7500,
        dietary: ['spicy', 'contains_shellfish', 'gluten_free'],
        isSpecial: true,
      },
      {
        name: 'Salade de la mer',
        nameEn: 'Seafood salad',
        description: 'Crevettes, calamars et moules, vinaigrette aux agrumes.',
        descriptionEn: 'Prawns, squid and mussels with a citrus dressing.',
        priceCents: 7000,
        dietary: ['contains_shellfish', 'gluten_free', 'dairy_free'],
      },
      {
        name: 'Salade marocaine',
        nameEn: 'Moroccan salad',
        description: 'Tomates, poivrons, oignons et herbes fraîches.',
        descriptionEn: 'Tomatoes, peppers, onions and fresh herbs.',
        priceCents: 3500,
        dietary: ['vegan', 'vegetarian', 'gluten_free', 'dairy_free'],
      },
    ],
  },
  {
    name: 'Poissons & fruits de mer',
    nameEn: 'Fish & seafood',
    items: [
      {
        name: 'Poisson grillé du jour',
        nameEn: 'Grilled fish of the day',
        description: 'Selon l’arrivage, grillé et servi avec une sauce vierge.',
        descriptionEn: 'Depending on the catch, grilled and served with sauce vierge.',
        priceCents: 13000,
        dietary: ['gluten_free', 'dairy_free'],
        isSpecial: true,
        optionGroups: [
          {
            name: 'Accompagnement',
            nameEn: 'Side',
            minSelect: 1,
            maxSelect: 1,
            options: [opt('Légumes grillés', 'Grilled vegetables'), opt('Riz', 'Rice'), opt('Frites', 'Fries')],
          },
        ],
      },
      {
        name: 'Friture de la mer',
        nameEn: 'Fried seafood platter',
        description: 'Calamars, crevettes et petits poissons frits, citron et sauce tartare.',
        descriptionEn: 'Fried squid, prawns and small fish with lemon and tartare sauce.',
        priceCents: 12000,
        dietary: ['contains_shellfish'],
      },
      {
        name: 'Paella de la mer',
        nameEn: 'Seafood paella',
        description: 'Riz safrané, crevettes, moules et calamars.',
        descriptionEn: 'Saffron rice with prawns, mussels and squid.',
        priceCents: 15000,
        dietary: ['contains_shellfish', 'gluten_free', 'dairy_free'],
        optionGroups: [
          {
            name: 'Portion',
            nameEn: 'Portion',
            minSelect: 1,
            maxSelect: 1,
            options: [opt('Pour 1 personne', 'For 1'), opt('Pour 2 personnes', 'For 2', 14000)],
          },
        ],
      },
      {
        name: 'Tajine de poisson',
        nameEn: 'Fish tagine',
        description: 'Poisson mariné à la chermoula, pommes de terre, tomates et olives.',
        descriptionEn: 'Chermoula-marinated fish with potatoes, tomatoes and olives.',
        priceCents: 12000,
        dietary: ['gluten_free', 'dairy_free'],
        isSpecial: true,
      },
      {
        name: 'Pâtes aux fruits de mer',
        nameEn: 'Seafood pasta',
        description: 'Linguine, crevettes, moules et calamars, sauce tomate légèrement relevée.',
        descriptionEn: 'Linguine with prawns, mussels and squid in a lightly spiced tomato sauce.',
        priceCents: 11000,
        dietary: ['contains_shellfish'],
      },
    ],
  },
  {
    name: 'Viandes',
    nameEn: 'Meat',
    items: [
      {
        name: 'Entrecôte grillée',
        nameEn: 'Grilled rib-eye',
        description: 'Servie avec frites maison et salade.',
        descriptionEn: 'Served with homemade fries and salad.',
        priceCents: 17000,
        optionGroups: [
          {
            name: 'Cuisson',
            nameEn: 'Cooking',
            minSelect: 1,
            maxSelect: 1,
            options: [opt('Saignante', 'Rare'), opt('À point', 'Medium'), opt('Bien cuite', 'Well done')],
          },
          {
            name: 'Sauce',
            nameEn: 'Sauce',
            minSelect: 0,
            maxSelect: 1,
            options: [opt('Poivre', 'Pepper', 1000), opt('Champignons', 'Mushroom', 1000)],
          },
        ],
      },
      {
        name: 'Brochettes de poulet',
        nameEn: 'Chicken skewers',
        description: 'Poulet mariné aux épices, riz et salade.',
        descriptionEn: 'Spice-marinated chicken with rice and salad.',
        priceCents: 8500,
        dietary: ['gluten_free', 'dairy_free'],
      },
      {
        name: 'Tajine de poulet au citron confit',
        nameEn: 'Chicken tagine with preserved lemon',
        description: 'Poulet mijoté, olives et citron confit.',
        descriptionEn: 'Slow-cooked chicken with olives and preserved lemon.',
        priceCents: 9500,
        dietary: ['gluten_free', 'dairy_free'],
      },
    ],
  },
  {
    name: 'Desserts',
    nameEn: 'Desserts',
    items: [
      {
        name: 'Fondant au chocolat',
        nameEn: 'Chocolate fondant',
        description: 'Cœur coulant, boule de glace vanille.',
        descriptionEn: 'Molten centre with a scoop of vanilla ice cream.',
        priceCents: 5000,
        dietary: ['vegetarian'],
      },
      {
        name: 'Pastilla au lait',
        nameEn: 'Milk pastilla',
        description: 'Feuilles croustillantes, crème à la fleur d’oranger et amandes.',
        descriptionEn: 'Crisp pastry layers, orange-blossom custard and almonds.',
        priceCents: 4500,
        dietary: ['vegetarian', 'contains_nuts'],
      },
      {
        name: 'Salade de fruits frais',
        nameEn: 'Fresh fruit salad',
        description: 'Fruits de saison.',
        descriptionEn: 'Seasonal fruit.',
        priceCents: 4000,
        dietary: ['vegan', 'vegetarian', 'gluten_free', 'dairy_free'],
      },
    ],
  },
  {
    name: 'Boissons',
    nameEn: 'Drinks',
    items: [
      {
        name: 'Thé à la menthe',
        nameEn: 'Mint tea',
        description: 'Servi à la marocaine.',
        descriptionEn: 'Served the Moroccan way.',
        priceCents: 2000,
        dietary: ['vegan', 'vegetarian', 'gluten_free', 'dairy_free'],
        optionGroups: [
          {
            name: 'Sucre',
            nameEn: 'Sugar',
            minSelect: 1,
            maxSelect: 1,
            options: [opt('Sucré', 'Sweetened'), opt('Sans sucre', 'No sugar')],
          },
        ],
      },
      {
        name: 'Jus d’orange pressé',
        nameEn: 'Fresh orange juice',
        priceCents: 2500,
        dietary: ['vegan', 'vegetarian', 'gluten_free', 'dairy_free'],
      },
      {
        name: 'Café',
        nameEn: 'Coffee',
        priceCents: 1800,
        dietary: ['vegetarian', 'gluten_free'],
        optionGroups: [
          {
            name: 'Préparation',
            nameEn: 'Style',
            minSelect: 1,
            maxSelect: 1,
            options: [opt('Expresso', 'Espresso'), opt('Noisette', 'Macchiato', 300), opt('Crème', 'Latte', 500)],
          },
        ],
      },
      {
        name: 'Eau minérale',
        nameEn: 'Mineral water',
        priceCents: 1500,
        dietary: ['vegan', 'vegetarian', 'gluten_free', 'dairy_free'],
        optionGroups: [
          {
            name: 'Format',
            nameEn: 'Size',
            minSelect: 1,
            maxSelect: 1,
            options: [opt('50 cl', '50 cl'), opt('1 L', '1 L', 1000)],
          },
        ],
      },
    ],
  },
];

export function seedDemoMenu(db: DB, now = new Date()): void {
  db.transaction(() => {
    for (const cat of DEMO_MENU) {
      const categoryId = createCategory(
        db,
        { name: cat.name, nameEn: cat.nameEn, description: null, descriptionEn: null, visible: true },
        now,
      );
      markCategoryDemo(db, categoryId);
      for (const item of cat.items) {
        createItem(db, menuItemInputSchema.parse({ ...item, categoryId }), now, { demo: true });
      }
    }
    setFlag(db, 'demo_menu', true);
  })();
}

/** Twelve sample tables so the QR and table-number flows can be tried. */
/** "Poisson grillé du jour" → "poisson-grille-du-jour" (file name of its sample photo). */
export const dishPhotoName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Sample dish photos: content/photos/menu/<dish-name>.jpg (see dishPhotoName) is attached to the
 * matching sample dish that has no photo yet, through the same pipeline as dashboard uploads.
 */
export async function attachDemoPhotos(db: DB, uploadsDir: string, dir = path.resolve('content/photos/menu')): Promise<number> {
  if (!fs.existsSync(dir)) return 0;
  const files = new Map(
    fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((f) => [f.replace(/\.[^.]+$/, ''), path.join(dir, f)] as const),
  );
  const dishes = db.prepare('SELECT id, name FROM menu_items WHERE is_demo = 1 AND image IS NULL').all() as { id: number; name: string }[];
  let attached = 0;
  for (const dish of dishes) {
    const file = files.get(dishPhotoName(dish.name));
    if (!file) continue;
    const image = await processMenuImage(fs.readFileSync(file), uploadsDir);
    db.prepare('UPDATE menu_items SET image = ? WHERE id = ?').run(image, dish.id);
    attached++;
  }
  if (attached > 0) touchMenu(db); // new ETag, so browsers fetch the menu with its photos
  return attached;
}

export function seedDemoTables(db: DB, now = new Date()): void {
  if (listTables(db).length > 0) return;
  for (let n = 1; n <= 12; n++) {
    createTable(db, { number: String(n), seats: n % 3 === 0 ? 6 : n % 2 === 0 ? 4 : 2, area: null, active: true }, now);
  }
}
