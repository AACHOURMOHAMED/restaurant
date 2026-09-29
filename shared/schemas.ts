/**
 * Validation schemas shared by the browser (instant feedback) and the server
 * (authoritative validation). Custom messages are stable error *codes* that
 * the UI translates (see src/i18n).
 */
import { z } from 'zod';
import { rangesAreValid } from './availability';
import { DIETARY_LABELS, LANGS, LIMITS, ORDER_STATUSES, RESERVATION_STATUSES, STAFF_ROLES } from './constants';
import { isValidDateString, isValidTimeString, isValidTimeZone } from './time';

/** Accepts local ("06 12 34 56 78") and international ("+212 6 12 34 56 78") formats. */
export function isPlausiblePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!/^[+(\d][\d\s().-]*$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'too_long')
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const langSchema = z.enum(LANGS);
export const dateSchema = z.string('invalid_date').refine(isValidDateString, 'invalid_date');
export const timeSchema = z.string('invalid_time').refine(isValidTimeString, 'invalid_time');

// ─── Public: reservations ────────────────────────────────────────────────────

export const reservationInputSchema = z.object({
  name: z.string('name_required').trim().min(2, 'name_required').max(LIMITS.nameMax, 'too_long'),
  phone: z
    .string('phone_required')
    .trim()
    .min(1, 'phone_required')
    .max(LIMITS.phoneMax, 'invalid_phone')
    .refine(isPlausiblePhone, 'invalid_phone'),
  email: z
    .string()
    .trim()
    .max(LIMITS.emailMax, 'too_long')
    .refine((v) => v === '' || EMAIL_RE.test(v), 'invalid_email')
    .optional()
    .nullable()
    .transform((v) => (v ? v.toLowerCase() : null)),
  date: dateSchema,
  time: timeSchema,
  partySize: z
    .number('invalid_party')
    .int('invalid_party')
    .min(1, 'invalid_party')
    .max(LIMITS.partySizeHardMax, 'invalid_party'),
  notes: optionalText(LIMITS.reservationNotesMax),
  lang: langSchema.optional(),
});
export type ReservationInput = z.input<typeof reservationInputSchema>;

export const availabilityQuerySchema = z.object({
  date: dateSchema,
  party: z.coerce.number().int().min(1).max(LIMITS.partySizeHardMax),
});

export const calendarQuerySchema = z.object({
  party: z.coerce.number().int().min(1).max(LIMITS.partySizeHardMax),
});

// ─── Public: tables & orders ─────────────────────────────────────────────────

export const tableLookupSchema = z.union([
  z.object({ code: z.string().trim().min(1).max(64) }),
  z.object({ number: z.string('table_required').trim().min(1, 'table_required').max(LIMITS.tableLabelMax, 'too_long') }),
]);

export const orderInputSchema = z.object({
  tableCode: z.string('table_required').trim().min(1, 'table_required').max(64),
  items: z
    .array(
      z.object({
        menuItemId: z.number().int().positive(),
        quantity: z.number().int().min(1, 'invalid_quantity').max(LIMITS.orderQuantityMax, 'invalid_quantity'),
        optionIds: z.array(z.number().int().positive()).max(30).default([]),
        note: optionalText(LIMITS.orderItemNoteMax),
      }),
    )
    .min(1, 'empty_cart')
    .max(LIMITS.orderLinesMax, 'too_many_items'),
  note: optionalText(LIMITS.orderNoteMax),
  /** Total the guest reviewed; if prices changed meanwhile the order is refused so they can re-check. */
  expectedTotalCents: z.number().int().nonnegative().optional(),
  lang: langSchema.optional(),
});
export type OrderInput = z.input<typeof orderInputSchema>;

// ─── Staff ───────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3, 'email_required').max(LIMITS.emailMax),
  password: z.string().min(1, 'password_required').max(200),
});

export const passwordSchema = z.string().min(10, 'password_too_short').max(200, 'too_long');

export const staffUserCreateSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(LIMITS.emailMax)
    .refine((v) => EMAIL_RE.test(v), 'invalid_email'),
  name: z.string().trim().min(2, 'name_required').max(LIMITS.nameMax, 'too_long'),
  role: z.enum(STAFF_ROLES),
  password: passwordSchema,
});

export const staffUserUpdateSchema = z.object({
  name: z.string().trim().min(2, 'name_required').max(LIMITS.nameMax).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  active: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'password_required').max(200),
  newPassword: passwordSchema,
});

export const reservationUpdateSchema = z.object({
  status: z.enum(RESERVATION_STATUSES).optional(),
  tableId: z.number().int().positive().nullable().optional(),
  staffNote: optionalText(500),
});

export const staffReservationCreateSchema = reservationInputSchema.extend({
  status: z.enum(['pending', 'confirmed']).default('confirmed'),
  tableId: z.number().int().positive().nullable().optional(),
  /** Staff may knowingly exceed online capacity (e.g. phone bookings). */
  ignoreCapacity: z.boolean().default(false),
  source: z.enum(['phone', 'walk_in', 'staff']).default('phone'),
});

export const reservationListQuerySchema = z.object({
  date: dateSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  status: z.enum([...RESERVATION_STATUSES, 'active', 'all']).optional(),
  q: z.string().trim().max(80).optional(),
});

const timeRangeSchema = z.object({ opens: timeSchema, closes: timeSchema });
const dayRangesSchema = z.array(timeRangeSchema).max(4).refine(rangesAreValid, 'invalid_ranges');

export const weeklyHoursSchema = z.object({
  1: dayRangesSchema,
  2: dayRangesSchema,
  3: dayRangesSchema,
  4: dayRangesSchema,
  5: dayRangesSchema,
  6: dayRangesSchema,
  7: dayRangesSchema,
});

export const specialDaySchema = z
  .object({
    date: dateSchema,
    closed: z.boolean(),
    hours: dayRangesSchema.default([]),
    note: optionalText(120),
  })
  .refine((d) => d.closed || d.hours.length > 0, { message: 'hours_required', path: ['hours'] });

export const bookingSettingsSchema = z.object({
  timeZone: z.string().refine(isValidTimeZone, 'invalid_timezone'),
  onlineBookingEnabled: z.boolean(),
  requireApproval: z.boolean(),
  slotIntervalMinutes: z.number().int().min(10).max(120),
  durationMinutes: z.number().int().min(15).max(360),
  minNoticeMinutes: z.number().int().min(0).max(7 * 24 * 60),
  maxDaysAhead: z.number().int().min(0).max(365),
  maxPartySize: z.number().int().min(1).max(LIMITS.partySizeHardMax),
  maxCoversPerSlot: z.number().int().min(1).max(1000).nullable(),
  maxConcurrentCovers: z.number().int().min(1).max(5000).nullable(),
  lastSeatingBeforeCloseMinutes: z.number().int().min(0).max(360),
});

export const orderingSettingsSchema = z.object({
  enabled: z.boolean(),
  onlyDuringOpeningHours: z.boolean(),
});
export type OrderingSettings = z.infer<typeof orderingSettingsSchema>;
export const DEFAULT_ORDERING_SETTINGS: OrderingSettings = { enabled: true, onlyDuringOpeningHours: true };

export const tableInputSchema = z.object({
  number: z.string().trim().min(1, 'table_required').max(LIMITS.tableLabelMax, 'too_long'),
  seats: z.number().int().min(1).max(50),
  area: optionalText(40),
  active: z.boolean().default(true),
});

export const orderStatusUpdateSchema = z.object({ status: z.enum(ORDER_STATUSES) });

export const orderListQuerySchema = z.object({
  scope: z.enum(['open', 'today', 'all']).default('open'),
});

const localizedName = {
  name: z.string().trim().min(1, 'name_required').max(80, 'too_long'),
  nameEn: optionalText(80),
};

export const menuCategoryInputSchema = z.object({
  ...localizedName,
  description: optionalText(240),
  descriptionEn: optionalText(240),
  visible: z.boolean().default(true),
});

export const menuOptionGroupInputSchema = z
  .object({
    id: z.number().int().positive().optional(),
    ...localizedName,
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    options: z
      .array(
        z.object({
          id: z.number().int().positive().optional(),
          ...localizedName,
          priceDeltaCents: z.number().int().min(-100_000).max(1_000_000),
          available: z.boolean().default(true),
        }),
      )
      .min(1, 'options_required')
      .max(30),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { message: 'invalid_min_max', path: ['minSelect'] })
  .refine((g) => g.maxSelect <= g.options.length, { message: 'invalid_min_max', path: ['maxSelect'] });

export const menuItemInputSchema = z.object({
  categoryId: z.number().int().positive(),
  ...localizedName,
  description: optionalText(400),
  descriptionEn: optionalText(400),
  priceCents: z.number().int().min(0, 'invalid_price').max(10_000_000, 'invalid_price'),
  dietary: z.array(z.enum(DIETARY_LABELS)).max(DIETARY_LABELS.length).default([]),
  image: z
    .string()
    .regex(/^[a-z0-9-]{6,64}$/, 'invalid_image')
    .nullable()
    .default(null),
  available: z.boolean().default(true),
  visible: z.boolean().default(true),
  isSpecial: z.boolean().default(false),
  optionGroups: z.array(menuOptionGroupInputSchema).max(10).default([]),
});
export type MenuItemInput = z.input<typeof menuItemInputSchema>;

export const menuItemPatchSchema = z.object({
  available: z.boolean().optional(),
  visible: z.boolean().optional(),
  isSpecial: z.boolean().optional(),
  priceCents: z.number().int().min(0).max(10_000_000).optional(),
});

export const reorderSchema = z.object({ ids: z.array(z.number().int().positive()).max(500) });

// ─── Error helpers ───────────────────────────────────────────────────────────

/** Flattens Zod issues into { "field.path": "error_code" } (first issue per field). */
export function issuesToFields(issues: readonly z.core.$ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_';
    if (!(key in out)) out[key] = /^[a-z_]+$/.test(issue.message) ? issue.message : 'invalid';
  }
  return out;
}
