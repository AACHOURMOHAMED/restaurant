import type { z } from 'zod';
import { restaurant } from '../../content/restaurant';
import type { OrderCreated, OrderLinePublic, OrderPublic, StaffOrder } from '../../shared/api-types';
import { openStatus } from '../../shared/availability';
import { OPEN_ORDER_STATUSES, type Lang, type OrderStatus } from '../../shared/constants';
import { priceSelection } from '../../shared/pricing';
import type { orderInputSchema } from '../../shared/schemas';
import { zonedNow, zonedTimeToUtc } from '../../shared/time';
import type { AppContext } from '../context';
import { immediate, type DB } from '../db';
import { AppError, conflict, notFound } from '../errors';
import { hmac, newReference, sha256 } from '../lib/util';
import { getOrderableItems } from '../repos/menu';
import {
  getBookingSettings,
  getOrderingSettings,
  getServerSecret,
  getWeeklyHours,
  listSpecialDays,
} from '../repos/settings';
import { findTableByCode } from '../repos/tables';

export type OrderInputParsed = z.output<typeof orderInputSchema>;

type OrderRow = {
  id: number;
  reference: string;
  table_id: number | null;
  table_number: string;
  status: OrderStatus;
  note: string | null;
  total_cents: number;
  currency: string;
  lang: Lang;
  created_at: string;
  updated_at: string;
};
type LineRow = {
  order_id: number;
  name: string;
  name_en: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  options: string;
  note: string | null;
};

function linesFor(db: DB, orderIds: number[]): Map<number, OrderLinePublic[]> {
  const out = new Map<number, OrderLinePublic[]>();
  if (orderIds.length === 0) return out;
  const rows = db
    .prepare(
      `SELECT * FROM order_lines WHERE order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY order_id, position`,
    )
    .all(...orderIds) as LineRow[];
  for (const r of rows) {
    const list = out.get(r.order_id) ?? [];
    list.push({
      name: r.name,
      nameEn: r.name_en,
      quantity: r.quantity,
      unitPriceCents: r.unit_price_cents,
      lineTotalCents: r.line_total_cents,
      options: JSON.parse(r.options) as OrderLinePublic['options'],
      note: r.note,
    });
    out.set(r.order_id, list);
  }
  return out;
}

function toPublic(row: OrderRow, lines: OrderLinePublic[]): OrderPublic {
  return {
    reference: row.reference,
    status: row.status,
    tableNumber: row.table_number,
    totalCents: row.total_cents,
    currency: row.currency,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lines,
  };
}

function tokenFor(db: DB, idempotencyKey: string) {
  return hmac(getServerSecret(db), `order:${idempotencyKey}`);
}

function uniqueReference(db: DB) {
  for (;;) {
    const ref = newReference('C');
    if (!db.prepare('SELECT 1 FROM orders WHERE reference = ?').get(ref)) return ref;
  }
}

export function createOrder(
  ctx: AppContext,
  input: OrderInputParsed,
  idempotencyKey: string,
): { order: OrderCreated; created: boolean; id: number } {
  const { db } = ctx;
  const now = ctx.clock.now();
  const token = tokenFor(db, idempotencyKey);
  // Only a fingerprint of the key is stored, so the status link can't be rebuilt from the database.
  const keyHash = sha256(idempotencyKey);

  const result = immediate(db, () => {
    const existing = db.prepare('SELECT * FROM orders WHERE idempotency_key = ?').get(keyHash) as
      | OrderRow
      | undefined;
    if (existing) return { row: existing, created: false };

    const table = findTableByCode(db, input.tableCode);
    if (!table) throw new AppError(404, 'TABLE_NOT_FOUND', 'Unknown table');
    if (!table.active) throw conflict('TABLE_INACTIVE', 'Ordering is not available for this table');

    const ordering = getOrderingSettings(db);
    if (!ordering.enabled) throw conflict('ORDERING_DISABLED', 'Ordering from the table is currently unavailable');
    if (ordering.onlyDuringOpeningHours) {
      const booking = getBookingSettings(db);
      const status = openStatus(now, booking.timeZone, getWeeklyHours(db), listSpecialDays(db));
      if (!status.open) throw conflict('ORDERING_CLOSED', 'The restaurant is currently closed');
    }

    const items = getOrderableItems(
      db,
      input.items.map((l) => l.menuItemId),
    );
    const unavailable = input.items
      .map((l) => l.menuItemId)
      .filter((id) => {
        const item = items.get(id);
        return !item || !item.available;
      });
    if (unavailable.length > 0) {
      throw conflict('ITEM_UNAVAILABLE', 'Some dishes are no longer available', {
        menuItemIds: [...new Set(unavailable)],
      });
    }

    let total = 0;
    const lines = input.items.map((line) => {
      const item = items.get(line.menuItemId)!;
      const priced = priceSelection(item, line.optionIds);
      if (!priced.ok) {
        throw conflict('OPTIONS_INVALID', 'The options chosen for a dish are no longer valid', {
          menuItemId: item.id,
          reason: priced.error.code,
        });
      }
      const options = item.optionGroups
        .flatMap((g) => g.options)
        .filter((o) => priced.optionIds.includes(o.id))
        .map((o) => ({ name: o.name, nameEn: o.nameEn, priceDeltaCents: o.priceDeltaCents }));
      const lineTotal = priced.unitPriceCents * line.quantity;
      total += lineTotal;
      return { item, line, unit: priced.unitPriceCents, lineTotal, options };
    });

    if (input.expectedTotalCents !== undefined && input.expectedTotalCents !== total) {
      throw conflict('PRICE_CHANGED', 'Prices have changed since the order was reviewed', { totalCents: total });
    }

    const ts = now.toISOString();
    const orderId = Number(
      db
        .prepare(
          `INSERT INTO orders (reference, token_hash, table_id, table_number, status, note, total_cents, currency, lang,
             idempotency_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          uniqueReference(db),
          sha256(token),
          table.id,
          table.number,
          input.note,
          total,
          restaurant.currency.code,
          input.lang ?? 'fr',
          keyHash,
          ts,
          ts,
        ).lastInsertRowid,
    );
    const insertLine = db.prepare(
      `INSERT INTO order_lines (order_id, menu_item_id, name, name_en, quantity, unit_price_cents, line_total_cents,
         options, note, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    lines.forEach((l, i) =>
      insertLine.run(
        orderId,
        l.item.id,
        l.item.name,
        l.item.nameEn,
        l.line.quantity,
        l.unit,
        l.lineTotal,
        JSON.stringify(l.options),
        l.line.note,
        i,
      ),
    );
    db.prepare(`INSERT INTO order_events (order_id, status, actor, at) VALUES (?, 'received', 'guest', ?)`).run(
      orderId,
      ts,
    );
    return { row: db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as OrderRow, created: true };
  });

  const lines = linesFor(db, [result.row.id]).get(result.row.id) ?? [];
  if (result.created) {
    ctx.events.publish({ type: 'order.created', id: result.row.id, tableNumber: result.row.table_number });
    ctx.notifier.send('order.created', {
      reference: result.row.reference,
      tableNumber: result.row.table_number,
      totalCents: result.row.total_cents,
      items: lines.reduce((n, l) => n + l.quantity, 0),
    });
  }
  return {
    order: { ...toPublic(result.row, lines), statusToken: token },
    created: result.created,
    id: result.row.id,
  };
}

export function getOrderByToken(ctx: AppContext, token: string): OrderPublic {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound('Order');
  const row = ctx.db.prepare('SELECT * FROM orders WHERE token_hash = ?').get(sha256(token)) as OrderRow | undefined;
  if (!row) throw notFound('Order');
  return toPublic(row, linesFor(ctx.db, [row.id]).get(row.id) ?? []);
}

function toStaffOrders(db: DB, rows: OrderRow[]): StaffOrder[] {
  const ids = rows.map((r) => r.id);
  const lines = linesFor(db, ids);
  const history = new Map<number, { status: OrderStatus; at: string }[]>();
  if (ids.length > 0) {
    const events = db
      .prepare(
        `SELECT order_id, status, at FROM order_events WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
      )
      .all(...ids) as { order_id: number; status: OrderStatus; at: string }[];
    for (const e of events) {
      const list = history.get(e.order_id) ?? [];
      list.push({ status: e.status, at: e.at });
      history.set(e.order_id, list);
    }
  }
  return rows.map((r) => ({
    ...toPublic(r, lines.get(r.id) ?? []),
    id: r.id,
    tableId: r.table_id,
    statusHistory: history.get(r.id) ?? [],
  }));
}

export function listOrders(ctx: AppContext, scope: 'open' | 'today' | 'all'): StaffOrder[] {
  const { db } = ctx;
  let rows: OrderRow[];
  if (scope === 'open') {
    rows = db
      .prepare(
        `SELECT * FROM orders WHERE status IN (${OPEN_ORDER_STATUSES.map(() => '?').join(',')}) ORDER BY created_at`,
      )
      .all(...OPEN_ORDER_STATUSES) as OrderRow[];
  } else if (scope === 'today') {
    const tz = getBookingSettings(db).timeZone;
    const today = zonedNow(tz, ctx.clock.now()).date;
    const since = zonedTimeToUtc(today, '00:00', tz).toISOString();
    rows = db.prepare('SELECT * FROM orders WHERE created_at >= ? ORDER BY created_at DESC').all(since) as OrderRow[];
  } else {
    rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 300').all() as OrderRow[];
  }
  return toStaffOrders(db, rows);
}

export function updateOrderStatus(ctx: AppContext, id: number, status: OrderStatus, actor: string): StaffOrder {
  const now = ctx.clock.now();
  const row = immediate(ctx.db, () => {
    const current = ctx.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
    if (!current) throw notFound('Order');
    if (current.status === status) return current;
    ctx.db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now.toISOString(), id);
    ctx.db
      .prepare('INSERT INTO order_events (order_id, status, actor, at) VALUES (?, ?, ?, ?)')
      .run(id, status, actor, now.toISOString());
    return ctx.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow;
  });
  ctx.events.publish({ type: 'order.updated', id });
  return toStaffOrders(ctx.db, [row])[0]!;
}
