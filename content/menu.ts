/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  BACKUP MENU — shown on the website only when the live menu (managed in
 *  Dashboard → Menu) cannot be loaded, e.g. while the database is down.
 *
 *  Visitors first see the last menu their own browser loaded; this list is
 *  the last resort. Ordering is switched off while a backup menu is shown.
 *
 *  For now it holds the SAMPLE dishes (also loaded by "demo data"): they are
 *  NOT B&B Park's dishes or prices, and `isSample: true` makes the site say so.
 *  Once the real menu is known, replace the dishes below with it and set
 *  `isSample` to false — the notice then says "may not be up to date".
 *
 *  Photos: content/photos/menu/<dish-name>.jpg (e.g. "Poisson grillé du jour"
 *  → poisson-grille-du-jour.jpg) is shown for the dish with that name.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { MenuItemInput } from '../shared/schemas.js';

export type BackupMenuItem = Omit<MenuItemInput, 'categoryId'>;
export type BackupMenuCategory = {
  name: string;
  nameEn: string;
  items: BackupMenuItem[];
};

const opt = (name: string, nameEn: string, priceDeltaCents = 0) => ({
  name,
  nameEn,
  priceDeltaCents,
});

/** Sample dishes — placeholders, not B&B Park's menu (see above). */
export const SAMPLE_MENU: BackupMenuCategory[] = [
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

/** "Poisson grillé du jour" → "poisson-grille-du-jour" (file name of its sample photo). */
export const dishPhotoName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const backupMenu = {
  /** true while `categories` are the sample dishes rather than B&B Park's own menu. */
  isSample: true,
  categories: SAMPLE_MENU,
};
