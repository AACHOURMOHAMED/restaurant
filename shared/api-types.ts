import type { BookingSettings, DayAvailability, SpecialDay, WeeklyHours } from './availability.js';
import type {
  DietaryLabel,
  Lang,
  OrderStatus,
  ReservationStatus,
  StaffRole,
} from './constants.js';
import type { OrderingSettings } from './schemas.js';
import type { LocalDate } from './time.js';

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    details?: Record<string, unknown>;
  };
};

// ─── Public ──────────────────────────────────────────────────────────────────

export type PublicSite = {
  timeZone: string;
  hours: WeeklyHours;
  specialDays: SpecialDay[];
  booking: Pick<
    BookingSettings,
    'onlineBookingEnabled' | 'requireApproval' | 'maxPartySize' | 'maxDaysAhead'
  >;
  ordering: OrderingSettings;
  /** True while the sample (demo) menu is loaded instead of the real one. */
  demoMenu: boolean;
  today: LocalDate;
  /** Configured public address (QR codes point here); null when not configured. */
  publicUrl: string | null;
  /** True when every table number is purely numeric (guests get a number keypad). */
  numericTableNumbers: boolean;
  /** Base URL of dish photos ('/uploads', or the photo storage's address); null before any upload. */
  mediaBase: string | null;
};

export type MenuOptionPublic = {
  id: number;
  name: string;
  nameEn: string | null;
  priceDeltaCents: number;
  available: boolean;
};

export type MenuOptionGroupPublic = {
  id: number;
  name: string;
  nameEn: string | null;
  minSelect: number;
  maxSelect: number;
  options: MenuOptionPublic[];
};

export type MenuItemPublic = {
  id: number;
  categoryId: number;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  priceCents: number;
  image: string | null;
  /** Where this dish's photo is served from; null → the site's current photo address (PublicSite.mediaBase). */
  imageBase: string | null;
  dietary: DietaryLabel[];
  isSpecial: boolean;
  available: boolean;
  optionGroups: MenuOptionGroupPublic[];
};

export type MenuCategoryPublic = {
  id: number;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  items: MenuItemPublic[];
};

export type PublicMenu = { categories: MenuCategoryPublic[]; updatedAt: string };

export type CalendarDay = {
  date: LocalDate;
  open: boolean;
  available: boolean;
  /** Why a day cannot be booked: closed, every slot taken, or nothing bookable left (e.g. too late today). */
  status: 'available' | 'closed' | 'full' | 'unavailable';
};
export type BookingCalendar = { today: LocalDate; days: CalendarDay[] };

export type AvailabilityResponse = DayAvailability;

export type ReservationPublic = {
  reference: string;
  status: ReservationStatus;
  date: LocalDate;
  time: string;
  partySize: number;
  /** First name only — contact details are never exposed publicly. */
  firstName: string;
  canCancel: boolean;
};

export type ReservationCreated = ReservationPublic & { statusToken: string };

export type TableResolved = { code: string; number: string };

export type OrderLinePublic = {
  name: string;
  nameEn: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  options: { name: string; nameEn: string | null; priceDeltaCents: number }[];
  note: string | null;
};

export type OrderPublic = {
  reference: string;
  status: OrderStatus;
  tableNumber: string;
  totalCents: number;
  currency: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  lines: OrderLinePublic[];
};

export type OrderCreated = OrderPublic & { statusToken: string };

// ─── Staff ───────────────────────────────────────────────────────────────────

export type StaffMe = { id: number; email: string; name: string; role: StaffRole };

export type StaffReservation = {
  id: number;
  reference: string;
  status: ReservationStatus;
  date: LocalDate;
  time: string;
  durationMinutes: number;
  partySize: number;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  staffNote: string | null;
  tableId: number | null;
  tableNumber: string | null;
  source: string;
  lang: Lang;
  createdAt: string;
  updatedAt: string;
  /** Other upcoming, active reservations made with the same phone number. */
  samePhoneUpcoming: number;
  /** Reference of another active reservation with the same phone at the same date and time. */
  sameSlotAs: string | null;
};

export type StaffTable = {
  id: number;
  number: string;
  code: string;
  seats: number;
  area: string | null;
  active: boolean;
  sortOrder: number;
};

export type StaffOrder = OrderPublic & {
  id: number;
  tableId: number | null;
  statusHistory: { status: OrderStatus; at: string }[];
};

export type StaffMenuItem = MenuItemPublic & { visible: boolean; sortOrder: number };
export type StaffMenuCategory = Omit<MenuCategoryPublic, 'items'> & {
  visible: boolean;
  sortOrder: number;
  items: StaffMenuItem[];
};
export type StaffMenu = { categories: StaffMenuCategory[]; demo: boolean };

export type StaffSettings = {
  booking: BookingSettings;
  ordering: OrderingSettings;
  hours: WeeklyHours;
  specialDays: SpecialDay[];
  publicUrl: string | null;
};

export type StaffUser = StaffMe & { active: boolean; lastLoginAt: string | null; createdAt: string };

export type StaffEvent =
  | { type: 'reservation.created'; id: number }
  | { type: 'reservation.updated'; id: number }
  | { type: 'order.created'; id: number; tableNumber: string }
  | { type: 'order.updated'; id: number }
  | { type: 'menu.updated' }
  | { type: 'settings.updated' }
  | { type: 'tables.updated' };
