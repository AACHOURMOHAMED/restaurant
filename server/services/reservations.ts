import type { z } from 'zod';
import type { ReservationCreated, ReservationPublic, StaffReservation } from '../../shared/api-types.js';
import { computeDayAvailability, type DayClosedReason, type ExistingBooking } from '../../shared/availability.js';
import {
  ACTIVE_RESERVATION_STATUSES,
  type Lang,
  type ReservationStatus,
} from '../../shared/constants.js';
import type {
  reservationInputSchema,
  reservationListQuerySchema,
  reservationUpdateSchema,
} from '../../shared/schemas.js';
import { addDays, daysBetween, parseTime, zonedNow, zonedTimeToUtc, type LocalDate } from '../../shared/time.js';
import type { AppContext } from '../context.js';
import type { Queryable } from '../db.js';
import { AppError, badRequest, conflict, notFound } from '../errors.js';
import { firstName, hmac, newReference, phoneDigits, randomToken, sha256 } from '../lib/util.js';
import { getBookingSettings, getServerSecret, getWeeklyHours, listSpecialDays } from '../repos/settings.js';
import { getTable } from '../repos/tables.js';

export type ReservationInputParsed = z.output<typeof reservationInputSchema>;
type ListQuery = z.output<typeof reservationListQuerySchema>;
type UpdateInput = z.output<typeof reservationUpdateSchema>;

type Row = {
  id: number;
  reference: string;
  token_hash: string;
  status: ReservationStatus;
  date: string;
  time: string;
  starts_at: string;
  duration_minutes: number;
  party_size: number;
  name: string;
  phone: string;
  phone_digits: string;
  email: string | null;
  notes: string | null;
  staff_note: string | null;
  table_id: number | null;
  table_number?: string | null;
  source: string;
  lang: Lang;
  created_at: string;
  updated_at: string;
};

/**
 * Transactions that check the book and then write to it (new bookings, guest cancellations, staff
 * changes) take this lock, so they run one after the other even across server instances: two
 * requests can never both take the last covers of a slot, or both insert one idempotency key.
 */
const LOCK = 'reservations';

/** Ids arrive unbounded from requests; one beyond INTEGER can't exist (Postgres would reject it), so it becomes 0, which matches no row. */
const rowId = (id: number) => (Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : 0);

const REASON_TO_ERROR: Record<DayClosedReason, [string, string]> = {
  past_date: ['DATE_IN_PAST', 'This date is in the past'],
  too_far: ['DATE_TOO_FAR', 'This date is too far ahead'],
  closed: ['CLOSED', 'The restaurant is closed on this date'],
  booking_disabled: ['BOOKING_DISABLED', 'Online booking is currently unavailable'],
  party_too_large: ['PARTY_TOO_LARGE', 'Please call the restaurant for large groups'],
  no_slots: ['SLOT_UNAVAILABLE', 'No more tables are available on this date'],
};

/** Which status changes staff may make. */
const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ['confirmed', 'declined', 'cancelled'],
  confirmed: ['seated', 'completed', 'no_show', 'cancelled', 'pending'],
  seated: ['completed', 'confirmed'],
  completed: ['seated'],
  no_show: ['confirmed', 'seated'],
  declined: ['pending', 'confirmed'],
  cancelled: ['pending', 'confirmed'],
};

export async function activeBookingsOn(q: Queryable, date: LocalDate, excludeId?: number): Promise<ExistingBooking[]> {
  const placeholders = ACTIVE_RESERVATION_STATUSES.map(() => '?').join(',');
  // Quoted aliases: Postgres folds unquoted names to lower case.
  return q.many<ExistingBooking>(
    `SELECT time, party_size AS "partySize", duration_minutes AS "durationMinutes" FROM reservations
     WHERE date = ? AND status IN (${placeholders}) AND id != ?`,
    [date, ...ACTIVE_RESERVATION_STATUSES, rowId(excludeId ?? 0)],
  );
}

/** `activeBookingsOn` for every date from `from` to `to` (inclusive), in one query: dates without bookings are absent. */
export async function activeBookingsBetween(
  q: Queryable,
  from: LocalDate,
  to: LocalDate,
): Promise<Map<LocalDate, ExistingBooking[]>> {
  const placeholders = ACTIVE_RESERVATION_STATUSES.map(() => '?').join(',');
  const rows = await q.many<ExistingBooking & { date: LocalDate }>(
    `SELECT date, time, party_size AS "partySize", duration_minutes AS "durationMinutes" FROM reservations
     WHERE date >= ? AND date <= ? AND status IN (${placeholders})`,
    [from, to, ...ACTIVE_RESERVATION_STATUSES],
  );
  const byDate = new Map<LocalDate, ExistingBooking[]>();
  for (const { date, ...booking } of rows) {
    const list = byDate.get(date);
    if (list) list.push(booking);
    else byDate.set(date, [booking]);
  }
  return byDate;
}

async function tokenFor(q: Queryable, idempotencyKey: string) {
  return hmac(await getServerSecret(q), `reservation:${idempotencyKey}`);
}

function canGuestCancel(row: Row, now: Date) {
  return (row.status === 'pending' || row.status === 'confirmed') && new Date(row.starts_at) > now;
}

export function toPublic(row: Row, now: Date): ReservationPublic {
  return {
    reference: row.reference,
    status: row.status,
    date: row.date,
    time: row.time,
    partySize: row.party_size,
    firstName: firstName(row.name),
    canCancel: canGuestCancel(row, now),
  };
}

type StaffFields = Omit<StaffReservation, 'samePhoneUpcoming' | 'sameSlotAs'>;

function toStaff(row: Row): StaffFields {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    date: row.date,
    time: row.time,
    durationMinutes: row.duration_minutes,
    partySize: row.party_size,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    staffNote: row.staff_note,
    tableId: row.table_id,
    tableNumber: row.table_number ?? null,
    source: row.source,
    lang: row.lang,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_WITH_TABLE = `SELECT r.*, t.number AS table_number FROM reservations r LEFT JOIN dining_tables t ON t.id = r.table_id`;

/**
 * Staff view of reservations, with the other upcoming bookings made with the same phone
 * number: a repeated request, a regular guest, or someone filling the book.
 */
async function staffView(ctx: AppContext, rows: Row[]): Promise<StaffReservation[]> {
  const today = zonedNow((await getBookingSettings(ctx.db)).timeZone, ctx.clock.now()).date;
  const phones = [...new Set(rows.map((r) => r.phone_digits).filter(Boolean))];
  const byPhone = new Map<string, { id: number; reference: string; date: string; time: string }[]>();
  if (phones.length > 0) {
    // In id order, so `sameSlotAs` names the earliest of several such bookings.
    const others = await ctx.db.many<{ id: number; reference: string; phone_digits: string; date: string; time: string }>(
      `SELECT id, reference, phone_digits, date, time FROM reservations
       WHERE phone_digits IN (${phones.map(() => '?').join(',')}) AND date >= ?
         AND status IN (${ACTIVE_RESERVATION_STATUSES.map(() => '?').join(',')})
       ORDER BY id`,
      [...phones, today, ...ACTIVE_RESERVATION_STATUSES],
    );
    for (const o of others) byPhone.set(o.phone_digits, [...(byPhone.get(o.phone_digits) ?? []), o]);
  }
  return rows.map((r) => {
    const others = (byPhone.get(r.phone_digits) ?? []).filter((o) => o.id !== r.id);
    return {
      ...toStaff(r),
      samePhoneUpcoming: others.length,
      sameSlotAs: others.find((o) => o.date === r.date && o.time === r.time)?.reference ?? null,
    };
  });
}

function getRow(q: Queryable, id: number): Promise<Row | undefined> {
  return q.one<Row>(`${SELECT_WITH_TABLE} WHERE r.id = ?`, [rowId(id)]);
}

async function logEvent(q: Queryable, id: number, status: ReservationStatus, actor: string, now: Date) {
  await q.run('INSERT INTO reservation_events (reservation_id, status, actor, at) VALUES (?, ?, ?, ?)', [
    id,
    status,
    actor,
    now.toISOString(),
  ]);
}

async function uniqueReference(q: Queryable) {
  for (;;) {
    const ref = newReference('R');
    if (!(await q.one('SELECT 1 FROM reservations WHERE reference = ?', [ref]))) return ref;
  }
}

export type CreateOptions = {
  source: 'web' | 'phone' | 'walk_in' | 'staff';
  actor: string;
  idempotencyKey?: string;
  /** Staff-created bookings choose their status; web bookings follow the approval setting. */
  status?: 'pending' | 'confirmed';
  ignoreCapacity?: boolean;
  tableId?: number | null;
};

export async function createReservation(
  ctx: AppContext,
  input: ReservationInputParsed,
  opts: CreateOptions,
): Promise<{ reservation: ReservationCreated; created: boolean; id: number }> {
  const { db } = ctx;
  const now = ctx.clock.now();
  const key = opts.idempotencyKey ?? `staff:${randomToken(16)}`;
  const token = await tokenFor(db, key);
  // Only a fingerprint of the key is stored, so the status link can't be rebuilt from the database.
  const keyHash = sha256(key);

  const result = await db.tx(async (tx) => {
    const existing = await tx.one<Row>('SELECT * FROM reservations WHERE idempotency_key = ?', [keyHash]);
    if (existing) return { row: existing, created: false };

    const settings = await getBookingSettings(tx);
    const today = zonedNow(settings.timeZone, now).date;

    if (opts.ignoreCapacity) {
      if (daysBetween(today, input.date) < 0) throw new AppError(409, 'DATE_IN_PAST', 'This date is in the past');
    } else {
      const day = computeDayAvailability({
        date: input.date,
        partySize: input.partySize,
        settings,
        weekly: await getWeeklyHours(tx),
        specialDays: await listSpecialDays(tx, input.date, input.date),
        existing: await activeBookingsOn(tx, input.date),
        now,
      });
      if (day.reason) {
        const [code, message] = REASON_TO_ERROR[day.reason];
        throw new AppError(409, code, message);
      }
      const slot = day.slots.find((s) => s.time === input.time);
      if (!slot) throw new AppError(409, 'SLOT_UNAVAILABLE', 'This time is not available');
      if (!slot.available) throw new AppError(409, 'SLOT_FULL', 'This time is fully booked');
    }

    // A request that repeats a booking (same phone, same time) or comes from a phone that already
    // holds several upcoming bookings is accepted, but always waits for staff, who see it flagged.
    // Refusing it would tell anyone whether a number has a booking, and would let a stranger
    // block a guest by booking with their number first.
    const digits = phoneDigits(input.phone);
    let needsReview = false;
    if (opts.source === 'web') {
      const placeholders = ACTIVE_RESERVATION_STATUSES.map(() => '?').join(',');
      const same = await tx.one(
        `SELECT 1 FROM reservations WHERE phone_digits = ? AND date = ? AND time = ? AND status IN (${placeholders})`,
        [digits, input.date, input.time, ...ACTIVE_RESERVATION_STATUSES],
      );
      const upcoming = await tx.one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM reservations WHERE phone_digits = ? AND date >= ? AND status IN (${placeholders})`,
        [digits, today, ...ACTIVE_RESERVATION_STATUSES],
      );
      needsReview = Boolean(same) || (upcoming?.n ?? 0) >= 3;
    }

    if (opts.tableId != null) {
      const table = await getTable(tx, opts.tableId);
      if (!table) throw badRequest('VALIDATION', 'Unknown table', { tableId: 'invalid_table' });
    }

    const status: ReservationStatus =
      opts.source === 'web'
        ? settings.requireApproval || needsReview
          ? 'pending'
          : 'confirmed'
        : (opts.status ?? 'confirmed');
    const ts = now.toISOString();
    const { id } = (await tx.one<{ id: number }>(
      `INSERT INTO reservations (reference, token_hash, status, date, time, starts_at, duration_minutes, party_size,
         name, phone, phone_digits, email, notes, table_id, source, lang, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        await uniqueReference(tx),
        sha256(token),
        status,
        input.date,
        input.time,
        zonedTimeToUtc(input.date, input.time, settings.timeZone).toISOString(),
        settings.durationMinutes,
        input.partySize,
        input.name,
        input.phone,
        digits,
        input.email,
        input.notes,
        opts.tableId ?? null,
        opts.source,
        input.lang ?? 'fr',
        keyHash,
        ts,
        ts,
      ],
    ))!;
    await logEvent(tx, id, status, opts.actor, now);
    return { row: (await getRow(tx, id))!, created: true };
  }, { lock: LOCK });

  if (result.created) {
    ctx.events.publish({ type: 'reservation.created', id: result.row.id });
    ctx.notifier.send('reservation.created', {
      reference: result.row.reference,
      status: result.row.status,
      date: result.row.date,
      time: result.row.time,
      partySize: result.row.party_size,
      source: result.row.source,
    });
  }
  return {
    reservation: { ...toPublic(result.row, now), statusToken: token },
    created: result.created,
    id: result.row.id,
  };
}

async function rowByToken(q: Queryable, token: string): Promise<Row | undefined> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return undefined;
  return q.one<Row>('SELECT * FROM reservations WHERE token_hash = ?', [sha256(token)]);
}

export async function getReservationByToken(ctx: AppContext, token: string): Promise<ReservationPublic> {
  const row = await rowByToken(ctx.db, token);
  if (!row) throw notFound('Reservation');
  return toPublic(row, ctx.clock.now());
}

export async function cancelByGuest(ctx: AppContext, token: string): Promise<ReservationPublic> {
  const now = ctx.clock.now();
  const row = await ctx.db.tx(async (tx) => {
    const r = await rowByToken(tx, token);
    if (!r) throw notFound('Reservation');
    if (r.status === 'cancelled') return r;
    if (!canGuestCancel(r, now)) throw conflict('CANNOT_CANCEL', 'This reservation can no longer be cancelled online');
    await tx.run(`UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE id = ?`, [now.toISOString(), r.id]);
    await logEvent(tx, r.id, 'cancelled', 'guest', now);
    return { ...r, status: 'cancelled' as const };
  }, { lock: LOCK });
  ctx.events.publish({ type: 'reservation.updated', id: row.id });
  ctx.notifier.send('reservation.cancelled_by_guest', { reference: row.reference, date: row.date, time: row.time });
  return toPublic(row, now);
}

export async function listReservations(ctx: AppContext, q: ListQuery): Promise<StaffReservation[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.date) (where.push('r.date = ?'), params.push(q.date));
  if (q.from) (where.push('r.date >= ?'), params.push(q.from));
  if (q.to) (where.push('r.date <= ?'), params.push(q.to));
  if (q.status === 'active') {
    where.push(`r.status IN (${ACTIVE_RESERVATION_STATUSES.map(() => '?').join(',')})`);
    params.push(...ACTIVE_RESERVATION_STATUSES);
  } else if (q.status && q.status !== 'all') {
    where.push('r.status = ?');
    params.push(q.status);
  }
  if (q.q) {
    // The text is matched literally: wildcards (and NUL, which Postgres text can't hold) are dropped,
    // and backslashes (the escape character of Postgres's LIKE) are doubled so they match themselves.
    const like = `%${q.q.replace(/[%_\u0000]/g, '').replace(/\\/g, '\\\\')}%`;
    // Phone numbers also match whatever format they were typed in ("+212 6…" finds "06…").
    const digits = phoneDigits(q.q);
    const byDigits = digits.length >= 4 && /^[\d\s+().-]+$/.test(q.q);
    where.push(
      `(r.name ILIKE ? OR r.phone ILIKE ? OR r.reference ILIKE ? OR r.email ILIKE ?${byDigits ? ' OR r.phone_digits LIKE ?' : ''})`,
    );
    params.push(like, like, like, like, ...(byDigits ? [`%${digits}%`] : []));
  }
  const rows = await ctx.db.many<Row>(
    `${SELECT_WITH_TABLE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.date, r.time, r.id LIMIT 500`,
    params,
  );
  return staffView(ctx, rows);
}

export async function reservationCounts(
  ctx: AppContext,
): Promise<{ pendingUpcoming: number; today: LocalDate; latestRequestId: number | null }> {
  const settings = await getBookingSettings(ctx.db);
  const today = zonedNow(settings.timeZone, ctx.clock.now()).date;
  const row = await ctx.db.one<{ n: number; latest: number | null }>(
    `SELECT (SELECT COUNT(*) FROM reservations WHERE status = 'pending' AND date >= ?) AS n,
            (SELECT MAX(id) FROM reservations WHERE source = 'web') AS latest`,
    [today],
  );
  return { pendingUpcoming: row?.n ?? 0, today, latestRequestId: row?.latest ?? null };
}

export async function getStaffReservation(ctx: AppContext, id: number): Promise<StaffReservation> {
  const row = await getRow(ctx.db, id);
  if (!row) throw notFound('Reservation');
  return (await staffView(ctx, [row]))[0]!;
}

export type TableConflict = { reference: string; time: string; name: string };

export async function updateReservation(
  ctx: AppContext,
  id: number,
  patch: UpdateInput,
  actor: string,
): Promise<{ reservation: StaffReservation; warnings: TableConflict[] }> {
  const now = ctx.clock.now();
  const { db } = ctx;
  const updated = await db.tx(async (tx) => {
    const row = await getRow(tx, id);
    if (!row) throw notFound('Reservation');
    const sets: string[] = [];
    const params: unknown[] = [];

    if (patch.status && patch.status !== row.status) {
      if (!TRANSITIONS[row.status].includes(patch.status)) {
        throw conflict('INVALID_TRANSITION', `Cannot change a ${row.status} reservation to ${patch.status}`);
      }
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (patch.tableId !== undefined && patch.tableId !== row.table_id) {
      if (patch.tableId !== null) {
        const table = await getTable(tx, patch.tableId);
        if (!table) throw badRequest('VALIDATION', 'Unknown table', { tableId: 'invalid_table' });
      }
      sets.push('table_id = ?');
      params.push(patch.tableId);
    }
    if (patch.staffNote !== undefined) {
      sets.push('staff_note = ?');
      params.push(patch.staffNote);
    }
    if (sets.length === 0) return row;
    await tx.run(`UPDATE reservations SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [
      ...params,
      now.toISOString(),
      id,
    ]);
    if (patch.status && patch.status !== row.status) await logEvent(tx, id, patch.status, actor, now);
    return (await getRow(tx, id))!;
  }, { lock: LOCK });

  ctx.events.publish({ type: 'reservation.updated', id });
  if (patch.status) {
    ctx.notifier.send('reservation.updated', {
      reference: updated.reference,
      status: updated.status,
      date: updated.date,
      time: updated.time,
      partySize: updated.party_size,
    });
  }
  return { reservation: (await staffView(ctx, [updated]))[0]!, warnings: await tableConflicts(db, updated) };
}

/** Other active reservations on the same table whose time windows overlap. */
export async function tableConflicts(q: Queryable, r: Row): Promise<TableConflict[]> {
  if (r.table_id == null || !ACTIVE_RESERVATION_STATUSES.includes(r.status)) return [];
  const others = await q.many<{ reference: string; time: string; name: string; duration_minutes: number }>(
    `SELECT reference, time, name, duration_minutes FROM reservations
     WHERE table_id = ? AND date = ? AND id != ? AND status IN (${ACTIVE_RESERVATION_STATUSES.map(() => '?').join(',')})
     ORDER BY time, id`,
    [r.table_id, r.date, r.id, ...ACTIVE_RESERVATION_STATUSES],
  );
  const start = parseTime(r.time);
  const end = start + r.duration_minutes;
  return others
    .filter((o) => {
      const s = parseTime(o.time);
      return s < end && start < s + o.duration_minutes;
    })
    .map((o) => ({ reference: o.reference, time: o.time, name: o.name }));
}

/** Erases guests' personal data from reservations older than `days` days. */
export async function anonymizeOldReservations(ctx: AppContext, days: number): Promise<number> {
  if (days <= 0) return 0;
  const settings = await getBookingSettings(ctx.db);
  const cutoff = addDays(zonedNow(settings.timeZone, ctx.clock.now()).date, -days);
  return ctx.db.run(
    `UPDATE reservations SET name = '—', phone = '', phone_digits = '', email = NULL, notes = NULL, staff_note = NULL,
       anonymized = 1 WHERE date < ? AND anonymized = 0`,
    [cutoff],
  );
}
