/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  RESTAURANT CONTENT — edit this file to change what the website says.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Everything customer-facing that is *not* managed from the staff dashboard
 *  lives here: name, contact details, story, photos, SEO and social links.
 *  (Menu, opening hours, booking rules and tables are managed in /staff.)
 *
 *  Text fields are bilingual: { fr: '…', en: '…' }. French is the default
 *  language of the site. Set a field to `null` to hide it.
 *
 *  Photos: drop image files into `content/photos/` and reference them here by
 *  file name (e.g. `hero: 'terrasse.jpg'`). `npm run photos` (also run by
 *  `npm run build`) generates optimised, responsive versions automatically.
 *
 *  SOURCES — the official site bandbpark.ma could not be opened from the build
 *  environment, so the details below come from the search-engine index of
 *  bandbpark.ma and from B&B Park's own Facebook page. Anything marked
 *  "TO CONFIRM" must be checked with the restaurant before launch. While
 *  `status` is 'preview', the site shows a discreet banner saying so.
 */

export type Localized = { fr: string; en: string };

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1 = Monday … 7 = Sunday
export type TimeRange = { opens: string; closes: string }; // 'HH:MM', 24h clock

export const restaurant = {
  /** 'preview' until every detail below has been confirmed; then set to 'live'. */
  status: 'preview' as 'preview' | 'live',

  name: 'B&B Park',
  /** Typographic logo used until an official logo file is provided (see `logo`). */
  wordmark: 'B&B PARK',
  /** Path under /public, e.g. '/brand/logo.svg'. TO PROVIDE — no logo file yet. */
  logo: null as string | null,

  /** Source: bandbpark.ma — "Notre Histoire" page ("Depuis son ouverture en 2010"). */
  since: 2010,

  /** Source: bandbpark.ma/menu-restaurant-kenitra page title ("BBPARK – Taste the difference"). */
  tagline: { fr: 'Taste the difference', en: 'Taste the difference' } as Localized,

  /** Source: bandbpark.ma — known for fish & seafood; "partager les saveurs du monde". */
  cuisine: {
    fr: 'Poissons, fruits de mer & saveurs du monde',
    en: 'Fish, seafood & flavours of the world',
  } as Localized,

  hero: {
    eyebrow: { fr: 'Restaurant · Kénitra · Depuis 2010', en: 'Restaurant · Kénitra · Since 2010' } as Localized,
    subtitle: {
      fr: 'Poissons frais, fruits de mer et saveurs du monde, au cœur de Kénitra.',
      en: 'Fresh fish, seafood and flavours of the world, in the heart of Kénitra.',
    } as Localized,
    /** File in content/photos/. TO PROVIDE. */
    photo: null as string | null,
  },

  /** Source: bandbpark.ma "Notre Histoire" + blog article on seafood (paraphrased — TO CONFIRM wording). */
  story: {
    heading: { fr: 'Une adresse de Kénitra depuis 2010', en: 'A Kénitra address since 2010' } as Localized,
    paragraphs: [
      {
        fr: 'Depuis son ouverture en 2010, B&B Park s’efforce de créer un lieu où se rencontrent une cuisine de qualité, un service attentionné et une atmosphère chaleureuse.',
        en: 'Since opening in 2010, B&B Park has set out to create a place where quality cooking, attentive service and a warm atmosphere come together.',
      },
      {
        fr: 'Au cœur de Kénitra, c’est un lieu de rencontre privilégié pour les habitants comme pour les visiteurs — porté par la passion de la gastronomie et l’envie de partager les saveurs du monde.',
        en: 'In the heart of Kénitra, it is a favourite meeting place for locals and visitors alike — driven by a passion for good food and a wish to share flavours from around the world.',
      },
      {
        fr: 'Réputée pour ses poissons et fruits de mer, la cuisine s’appuie sur les recettes de la tradition marocaine, avec une touche moderne. Chaque jour, le poisson frais est sélectionné avant d’être grillé ou cuisiné.',
        en: 'Renowned for fish and seafood, the kitchen draws on traditional Moroccan recipes with a modern touch. Fresh fish is selected every day before being grilled or cooked.',
      },
    ] as Localized[],
    /** File in content/photos/. TO PROVIDE. */
    photo: null as string | null,
  },

  /** Chef details are unknown — leave null until provided. */
  chef: {
    name: null as string | null,
    title: null as Localized | null,
    photo: null as string | null,
  },

  /** Gallery photos (files in content/photos/). TO PROVIDE. */
  gallery: [] as { photo: string; alt: Localized }[],

  contact: {
    /** Source: B&B Park Facebook posts ("☎ 0537370624"). */
    phone: '+212537370624',
    phoneDisplay: '05 37 37 06 24',
    /** Seen in a search summary only ("contact@bandbpark.ma") — TO CONFIRM before enabling. */
    email: null as string | null,
    /** International number without '+', e.g. '2126XXXXXXXX'. TO PROVIDE if WhatsApp is used. */
    whatsapp: null as string | null,
  },

  /** Source: B&B Park Facebook posts ("52 Hassan II Rce Zazia, 14000 Kenitra"). TO CONFIRM exact spelling. */
  address: {
    street: '52, Avenue Hassan II',
    complement: 'Résidence Zazia',
    postalCode: '14000',
    city: 'Kénitra',
    country: { fr: 'Maroc', en: 'Morocco' } as Localized,
    /** Landmarks from B&B Park's Facebook description — TO CONFIRM. */
    landmark: {
      fr: 'Près de la gare de Kénitra, face au Petit Jardin, à proximité de la wilaya.',
      en: 'Near Kénitra train station, opposite the Petit Jardin park, close to the wilaya.',
    } as Localized | null,
    /** Opened by the “Directions” button. Replace with the Google Maps share link of the restaurant if preferred. */
    mapsUrl:
      'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent('B&B Park, 52 Avenue Hassan II, 14000 Kénitra, Maroc'),
    /** Optional Google Maps embed URL (Share → Embed a map → the `src` value). */
    mapEmbedUrl: null as string | null,
  },

  /** Sources: search results for the official accounts. */
  social: {
    instagram: 'https://www.instagram.com/bandb.park.kenitra/',
    facebook: 'https://www.facebook.com/bandb.park.kenitra',
    tiktok: null as string | null,
    tripadvisor: null as string | null,
  },

  /** Current official website (used for SEO `sameAs`). */
  website: 'https://bandbpark.ma',

  /** Prices are stored in cents (centimes). Moroccan menus usually show "DH". */
  currency: { code: 'MAD', symbol: 'DH' },

  /** IANA time zone used for bookings and "open now". */
  timeZone: 'Africa/Casablanca',

  /**
   * Default weekly opening hours, used ONLY to initialise the database the
   * first time. Afterwards, hours are edited in the staff dashboard.
   * Source: Tripadvisor photo caption "ouvre ses portes de Midi à 23H! Fermé
   * tous les Vendredi" — other listings say noon to midnight. TO CONFIRM.
   */
  defaultHours: {
    1: [{ opens: '12:00', closes: '23:00' }],
    2: [{ opens: '12:00', closes: '23:00' }],
    3: [{ opens: '12:00', closes: '23:00' }],
    4: [{ opens: '12:00', closes: '23:00' }],
    5: [], // Friday — closed
    6: [{ opens: '12:00', closes: '23:00' }],
    7: [{ opens: '12:00', closes: '23:00' }],
  } as Record<Weekday, TimeRange[]>,

  /** Shown on the dine-in ordering screen. Online payment is not enabled. */
  paymentNote: {
    fr: 'Aucun paiement en ligne : l’addition se règle directement auprès de notre équipe.',
    en: 'No online payment: the bill is settled directly with our team.',
  } as Localized,

  seo: {
    title: {
      fr: 'B&B Park — Restaurant à Kénitra · Poissons & fruits de mer',
      en: 'B&B Park — Restaurant in Kénitra · Fish & seafood',
    } as Localized,
    description: {
      fr: 'Restaurant au cœur de Kénitra depuis 2010 : poissons, fruits de mer et saveurs du monde. Réservez votre table en ligne.',
      en: 'Restaurant in the heart of Kénitra since 2010: fish, seafood and flavours of the world. Book your table online.',
    } as Localized,
    /** File in content/photos/ used for link previews. TO PROVIDE. */
    shareImage: null as string | null,
  },
};

export type RestaurantContent = typeof restaurant;
