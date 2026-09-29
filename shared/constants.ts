export const LANGS = ['fr', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'fr';

/** Dietary / allergen labels a dish can carry. Labels are set per dish by staff. */
export const DIETARY_LABELS = [
  'vegetarian',
  'vegan',
  'gluten_free',
  'dairy_free',
  'spicy',
  'contains_nuts',
  'contains_shellfish',
] as const;
export type DietaryLabel = (typeof DIETARY_LABELS)[number];

export const RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'declined',
  'cancelled',
  'seated',
  'completed',
  'no_show',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Reservations that hold capacity. */
export const ACTIVE_RESERVATION_STATUSES: readonly ReservationStatus[] = ['pending', 'confirmed', 'seated'];

export const ORDER_STATUSES = ['received', 'preparing', 'ready', 'served', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = ['received', 'preparing', 'ready'];

export const STAFF_ROLES = ['admin', 'staff'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Limits shared by client-side and server-side validation. */
export const LIMITS = {
  nameMax: 80,
  phoneMax: 32,
  emailMax: 120,
  reservationNotesMax: 500,
  orderItemNoteMax: 200,
  orderNoteMax: 300,
  orderLinesMax: 50,
  orderQuantityMax: 20,
  partySizeHardMax: 50,
  tableLabelMax: 40,
} as const;

/** How long a guest's table selection stays valid on their phone. */
export const TABLE_SESSION_TTL_MS = 4 * 60 * 60 * 1000;
