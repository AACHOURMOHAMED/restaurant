import type { z } from 'zod';
import type { ReservationCreated, ReservationPublic, StaffReservation } from '../../shared/api-types';
import { computeDayAvailability, type DayClosedReason } from '../../shared/availability';
import {
  ACTIVE_RESERVATION_STATUSES,
  type Lang,
  type ReservationStatus,
} from '../../shared/constants';
import type {
  reservationInputSchema,
  reservationListQuerySchema,
  reservationUpdateSchema,
} from '../../shared/schemas';
import { addDays, daysBetween, parseTime, zonedNow, zonedTimeToUtc, type LocalDate } from '../../shared/time';
import type { AppContext } from '../context';
import { immediate, type DB } from '../db';
import { AppError, badRequest, conflict, notFound } from '../errors';
import { firstName, hmac, newReference, phoneDigits, randomToken, sha256 } from '../lib/util';
import { getBookingSettings, getServerSecret, getWeeklyHours, listSpecialDays } from '../repos/settings';
import { getTable } from '../repos/tables';

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

export function activeBookingsOn(db: DB, date: LocalDate, excludeId?: number) {
  const placeholders = ACTIVE_RESERVATION_STATUSES.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT time, party_size AS partySize, duration_minutes AS durationMinutes FROM reservations
       WHERE date = ? AND status IN (${placeholders}) AND id != ?`,
    )
    .all(date, ...ACTIVE_RESERVATION_STATUSES, excludeId ?? -1) as {
    time: string;
    partySize: number;
    durationMinutes: number;
  }[];
}

function tokenFor(db: DB, idempotencyKey: string) {
  return hmac(getServerSecret(db), `reservation:${idempotencyKey}`);
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

export function toStaff(row: Row): StaffReservation {
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

function getRow(db: DB, id: number): Row | undefined {
  return db.prepare(`${SELECT_WITH_TABLE} WHERE r.id = ?`).get(id) as Row | undefined;
}

function logEvent(db: DB, id: number, status: ReservationStatus, actor: string, now: Date) {
  db.prepare('INSERT INTO reservation_events (reservation_id, status, actor, at) VALUES (?, ?, ?, ?)').run(
    id,
    status,
    actor,
    now.toISOString(),
  );
}

function uniqueReference(db: DB) {
  for (;;) {
    const ref = newReference('R');
    if (!db.prepare('SELECT 1 FROM reservations WHERE reference = ?').get(ref)) return ref;
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

export function createReservation(
  ctx: AppContext,
  input: ReservationInputParsed,
  opts: CreateOptions,
): { reservation: ReservationCreated; created: boolean; id: number } {
  const { db } = ctx;
  const now = ctx.clock.now();
  const key = opts.idempotencyKey ?? `staff:${randomToken(16)}`;
  const token = tokenFor(db, key);

  const result = immediate(db, () => {
    const existing = db.prepare('SELECT * FROM reservations WHERE idempotency_key = ?').get(key) as Row | undefined;
    if (existing) return { row: existing, created: false };

    const settings = getBookingSettings(db);
    const today = zonedNow(settings.timeZone, now).date;

    if (opts.ignoreCapacity) {
      if (daysBetween(today, input.date) < 0) throw new AppError(409, 'DATE_IN_PAST', 'This date is in the past');
    } else {
      const day = computeDayAvailability({
        date: input.date,
        partySize: input.partySize,
        settings,
        weekly: getWeeklyHours(db),
        specialDays: listSpecialDays(db, input.date, input.date),
        existing: activeBookingsOn(db, input.date),
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

    const digits = phoneDigits(input.phone);
    if (opts.source === 'web') {
      const placeholders = ACTIVE_RESERVATION_STATUSES.map(() => '?').join(',');
      const same = db
        .prepare(
          `SELECT 1 FROM reservations WHERE phone_digits = ? AND date = ? AND time = ? AND status IN (${placeholders})`,
        )
        .get(digits, input.date, input.time, ...ACTIVE_RESERVATION_STATUSES);
      if (same) throw conflict('DUPLICATE_RESERVATION', 'A reservation already exists for this phone number at this time');
      const upcoming = db
        .prepare(`SELECT COUNT(*) AS n FROM reservations WHERE phone_digits = ? AND date >= ? AND status IN (${placeholders})`)
        .get(digits, today, ...ACTIVE_RESERVATION_STATUSES) as { n: number };
      if (upcoming.n >= 3) throw conflict('TOO_MANY_RESERVATIONS', 'Too many upcoming reservations for this phone number');
    }

    if (opts.tableId != null) {
      const table = getTable(db, opts.tableId);
      if (!table) throw badRequest('VALIDATION', 'Unknown table', { tableId: 'invalid_table' });
    }

    const status: ReservationStatus =
      opts.source === 'web' ? (settings.requireApproval ? 'pending' : 'confirmed') : (opts.status ?? 'confirmed');
    const ts = now.toISOString();
    const info = db
      .prepare(
        `INSERT INTO reservations (reference, token_hash, status, date, time, starts_at, duration_minutes, party_size,
           name, phone, phone_digits, email, notes, table_id, source, lang, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        uniqueReference(db),
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
        key,
        ts,
        ts,
      );
    const id = Number(info.lastInsertRowid);
    logEvent(db, id, status, opts.actor, now);
    return { row: getRow(db, id)!, created: true };
  });

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

function rowByToken(db: DB, token: string): Row | undefined {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return undefined;
  return db.prepare('SELECT * FROM reservations WHERE token_hash = ?').get(sha256(token)) as Row | undefined;
}

export function getReservationByToken(ctx: AppContext, token: string): ReservationPublic {
  const row = rowByToken(ctx.db, token);
  if (!row) throw notFound('Reservation');
  return toPublic(row, ctx.clock.now());
}

export function cancelByGuest(ctx: AppContext, token: string): ReservationPublic {
  const now = ctx.clock.now();
  const row = immediate(ctx.db, () => {
    const r = rowByToken(ctx.db, token);
    if (!r) throw notFound('Reservation');
    if (r.status === 'cancelled') return r;
    if (!canGuestCancel(r, now)) throw conflict('CANNOT_CANCEL', 'This reservation can no longer be cancelled online');
    ctx.db
      .prepare(`UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE id = ?`)
      .run(now.toISOString(), r.id);
    logEvent(ctx.db, r.id, 'cancelled', 'guest', now);
    return { ...r, status: 'cancelled' as const };
  });
  ctx.events.publish({ type: 'reservation.updated', id: row.id });
  ctx.notifier.send('reservation.cancelled_by_guest', { reference: row.reference, date: row.date, time: row.time });
  return toPublic(row, now);
}

export function listReservations(ctx: AppContext, q: ListQuery) {
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
    const like = `%${q.q.replace(/[%_]/g, '')}%`;
    where.push('(r.name LIKE ? OR r.phone LIKE ? OR r.reference LIKE ? OR r.email LIKE ?)');
    params.push(like, like, like, like);
  }
  const rows = ctx.db
    .prepare(
      `${SELECT_WITH_TABLE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.date, r.time, r.id LIMIT 500`,
    )
    .all(...params) as Row[];
  return rows.map(toStaff);
}

export function reservationCounts(ctx: AppContext) {
  const settings = getBookingSettings(ctx.db);
  const today = zonedNow(settings.timeZone, ctx.clock.now()).date;
  const pending = ctx.db
    .prepare(`SELECT COUNT(*) AS n FROM reservations WHERE status = 'pending' AND date >= ?`)
    .get(today) as { n: number };
  return { pendingUpcoming: pending.n, today };
}

export function getStaffReservation(ctx: AppContext, id: number): StaffReservation {
  const row = getRow(ctx.db, id);
  if (!row) throw notFound('Reservation');
  return toStaff(row);
}

export type TableConflict = { reference: string; time: string; name: string };

export function updateReservation(
  ctx: AppContext,
  id: number,
  patch: UpdateInput,
  actor: string,
): { reservation: StaffReservation; warnings: TableConflict[] } {
  const now = ctx.clock.now();
  const { db } = ctx;
  const updated = immediate(db, () => {
    const row = getRow(db, id);
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
        const table = getTable(db, patch.tableId);
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
    db.prepare(`UPDATE reservations SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(
      ...params,
      now.toISOString(),
      id,
    );
    if (patch.status && patch.status !== row.status) logEvent(db, id, patch.status, actor, now);
    return getRow(db, id)!;
  });

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
  return { reservation: toStaff(updated), warnings: tableConflicts(db, updated) };
}

/** Other active reservations on the same table whose time windows overlap. */
export function tableConflicts(db: DB, r: Row): TableConflict[] {
  if (r.table_id == null || !ACTIVE_RESERVATION_STATUSES.includes(r.status)) return [];
  const others = db
    .prepare(
      `SELECT reference, time, name, duration_minutes FROM reservations
       WHERE table_id = ? AND date = ? AND id != ? AND status IN (${ACTIVE_RESERVATION_STATUSES.map(() => '?').join(',')})`,
    )
    .all(r.table_id, r.date, r.id, ...ACTIVE_RESERVATION_STATUSES) as {
    reference: string;
    time: string;
    name: string;
    duration_minutes: number;
  }[];
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
export function anonymizeOldReservations(ctx: AppContext, days: number): number {
  if (days <= 0) return 0;
  const settings = getBookingSettings(ctx.db);
  const cutoff = addDays(zonedNow(settings.timeZone, ctx.clock.now()).date, -days);
  return ctx.db
    .prepare(
      `UPDATE reservations SET name = '—', phone = '', phone_digits = '', email = NULL, notes = NULL, staff_note = NULL,
         anonymized = 1 WHERE date < ? AND anonymized = 0`,
    )
    .run(cutoff).changes;
}
