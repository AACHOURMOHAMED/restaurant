import type { z } from 'zod';
import { restaurant } from '../../content/restaurant.js';
import type { OrderCreated, OrderLinePublic, OrderPublic, StaffOrder } from '../../shared/api-types.js';
import { openStatus } from '../../shared/availability.js';
import { OPEN_ORDER_STATUSES, type Lang, type OrderStatus } from '../../shared/constants.js';
import { priceSelection } from '../../shared/pricing.js';
import type { orderInputSchema } from '../../shared/schemas.js';
import { zonedNow, zonedTimeToUtc } from '../../shared/time.js';
import type { AppContext } from '../context.js';
import type { Queryable } from '../db.js';
import { AppError, conflict, notFound } from '../errors.js';
import { hmac, newReference, sha256 } from '../lib/util.js';
import { getOrderableItems } from '../repos/menu.js';
import {
  getBookingSettings,
  getOrderingSettings,
  getServerSecret,
  getWeeklyHours,
  listSpecialDays,
} from '../repos/settings.js';
import { findTableByCode } from '../repos/tables.js';

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

/**
 * Order writes (new orders, status changes) take this lock, so they run one after the other even
 * across server instances: a repeated submission always finds the order its first copy created.
 */
const LOCK = 'orders';

/** Ids arrive unbounded from requests; one beyond INTEGER can't exist (Postgres would reject it), so it becomes 0, which matches no row. */
const rowId = (id: number) => (Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : 0);

async function linesFor(q: Queryable, orderIds: number[]): Promise<Map<number, OrderLinePublic[]>> {
  const out = new Map<number, OrderLinePublic[]>();
  if (orderIds.length === 0) return out;
  const rows = await q.many<LineRow>(
    `SELECT * FROM order_lines WHERE order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY order_id, position`,
    orderIds,
  );
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

async function tokenFor(q: Queryable, idempotencyKey: string) {
  return hmac(await getServerSecret(q), `order:${idempotencyKey}`);
}

async function uniqueReference(q: Queryable) {
  for (;;) {
    const ref = newReference('C');
    if (!(await q.one('SELECT 1 FROM orders WHERE reference = ?', [ref]))) return ref;
  }
}

export async function createOrder(
  ctx: AppContext,
  input: OrderInputParsed,
  idempotencyKey: string,
): Promise<{ order: OrderCreated; created: boolean; id: number }> {
  const { db } = ctx;
  const now = ctx.clock.now();
  const token = await tokenFor(db, idempotencyKey);
  // Only a fingerprint of the key is stored, so the status link can't be rebuilt from the database.
  const keyHash = sha256(idempotencyKey);

  const result = await db.tx(async (tx) => {
    const existing = await tx.one<OrderRow>('SELECT * FROM orders WHERE idempotency_key = ?', [keyHash]);
    if (existing) return { row: existing, created: false };

    const table = await findTableByCode(tx, input.tableCode);
    if (!table) throw new AppError(404, 'TABLE_NOT_FOUND', 'Unknown table');
    if (!table.active) throw conflict('TABLE_INACTIVE', 'Ordering is not available for this table');

    const ordering = await getOrderingSettings(tx);
    if (!ordering.enabled) throw conflict('ORDERING_DISABLED', 'Ordering from the table is currently unavailable');
    if (ordering.onlyDuringOpeningHours) {
      const booking = await getBookingSettings(tx);
      const status = openStatus(now, booking.timeZone, await getWeeklyHours(tx), await listSpecialDays(tx));
      if (!status.open) throw conflict('ORDERING_CLOSED', 'The restaurant is currently closed');
    }

    const items = await getOrderableItems(
      tx,
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
    const { id: orderId } = (await tx.one<{ id: number }>(
      `INSERT INTO orders (reference, token_hash, table_id, table_number, status, note, total_cents, currency, lang,
         idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [
        await uniqueReference(tx),
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
      ],
    ))!;
    // Every line in one statement: a single round trip to the database, however long the order.
    if (lines.length > 0) {
      await tx.run(
        `INSERT INTO order_lines (order_id, menu_item_id, name, name_en, quantity, unit_price_cents, line_total_cents,
           options, note, position) VALUES ${lines.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`,
        lines.flatMap((l, i) => [
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
        ]),
      );
    }
    await tx.run(`INSERT INTO order_events (order_id, status, actor, at) VALUES (?, 'received', 'guest', ?)`, [
      orderId,
      ts,
    ]);
    return { row: (await tx.one<OrderRow>('SELECT * FROM orders WHERE id = ?', [orderId]))!, created: true };
  }, { lock: LOCK });

  const lines = (await linesFor(db, [result.row.id])).get(result.row.id) ?? [];
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

export async function getOrderByToken(ctx: AppContext, token: string): Promise<OrderPublic> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound('Order');
  const row = await ctx.db.one<OrderRow>('SELECT * FROM orders WHERE token_hash = ?', [sha256(token)]);
  if (!row) throw notFound('Order');
  return toPublic(row, (await linesFor(ctx.db, [row.id])).get(row.id) ?? []);
}

async function toStaffOrders(q: Queryable, rows: OrderRow[]): Promise<StaffOrder[]> {
  const ids = rows.map((r) => r.id);
  const lines = await linesFor(q, ids);
  const history = new Map<number, { status: OrderStatus; at: string }[]>();
  if (ids.length > 0) {
    const events = await q.many<{ order_id: number; status: OrderStatus; at: string }>(
      `SELECT order_id, status, at FROM order_events WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
      ids,
    );
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

export async function listOrders(ctx: AppContext, scope: 'open' | 'today' | 'all'): Promise<StaffOrder[]> {
  const { db } = ctx;
  let rows: OrderRow[];
  // `id` breaks ties between orders placed in the same millisecond, so the order of the list is stable.
  if (scope === 'open') {
    rows = await db.many<OrderRow>(
      `SELECT * FROM orders WHERE status IN (${OPEN_ORDER_STATUSES.map(() => '?').join(',')}) ORDER BY created_at, id`,
      [...OPEN_ORDER_STATUSES],
    );
  } else if (scope === 'today') {
    const tz = (await getBookingSettings(db)).timeZone;
    const today = zonedNow(tz, ctx.clock.now()).date;
    const since = zonedTimeToUtc(today, '00:00', tz).toISOString();
    rows = await db.many<OrderRow>('SELECT * FROM orders WHERE created_at >= ? ORDER BY created_at DESC, id DESC', [
      since,
    ]);
  } else {
    rows = await db.many<OrderRow>('SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 300');
  }
  return toStaffOrders(db, rows);
}

export async function updateOrderStatus(
  ctx: AppContext,
  id: number,
  status: OrderStatus,
  actor: string,
): Promise<StaffOrder> {
  const now = ctx.clock.now();
  const row = await ctx.db.tx(async (tx) => {
    const current = await tx.one<OrderRow>('SELECT * FROM orders WHERE id = ?', [rowId(id)]);
    if (!current) throw notFound('Order');
    if (current.status === status) return current;
    await tx.run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', [status, now.toISOString(), id]);
    await tx.run('INSERT INTO order_events (order_id, status, actor, at) VALUES (?, ?, ?, ?)', [
      id,
      status,
      actor,
      now.toISOString(),
    ]);
    return (await tx.one<OrderRow>('SELECT * FROM orders WHERE id = ?', [id]))!;
  }, { lock: LOCK });
  ctx.events.publish({ type: 'order.updated', id });
  return (await toStaffOrders(ctx.db, [row]))[0]!;
}
