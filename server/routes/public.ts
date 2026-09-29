import type { FastifyInstance } from 'fastify';
import type {
  BookingCalendar,
  PublicSite,
  TableResolved,
} from '../../shared/api-types';
import { computeDayAvailability } from '../../shared/availability';
import {
  availabilityQuerySchema,
  calendarQuerySchema,
  orderInputSchema,
  reservationInputSchema,
  tableLookupSchema,
} from '../../shared/schemas';
import { addDays, zonedNow } from '../../shared/time';
import type { AppContext } from '../context';
import { AppError, conflict } from '../errors';
import { idempotencyKey, parse } from '../http';
import { getPublicMenu } from '../repos/menu';
import {
  getBookingSettings,
  getFlag,
  getOrderingSettings,
  getWeeklyHours,
  listSpecialDays,
  menuUpdatedAt,
} from '../repos/settings';
import { allTablesNumeric, findTableByCode, findTableByNumber } from '../repos/tables';
import { createOrder, getOrderByToken } from '../services/orders';
import {
  activeBookingsOn,
  cancelByGuest,
  createReservation,
  getReservationByToken,
} from '../services/reservations';

const limit = (max: number, minutes: number) => ({ rateLimit: { max, timeWindow: minutes * 60_000 } });

export async function publicRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/public/site', async (_req, reply): Promise<PublicSite> => {
    const booking = getBookingSettings(db);
    const today = zonedNow(booking.timeZone, ctx.clock.now()).date;
    reply.header('Cache-Control', 'no-cache');
    return {
      timeZone: booking.timeZone,
      hours: getWeeklyHours(db),
      specialDays: listSpecialDays(db, today, addDays(today, 90)),
      booking: {
        onlineBookingEnabled: booking.onlineBookingEnabled,
        requireApproval: booking.requireApproval,
        maxPartySize: booking.maxPartySize,
        maxDaysAhead: booking.maxDaysAhead,
      },
      ordering: getOrderingSettings(db),
      demoMenu: getFlag(db, 'demo_menu'),
      today,
      publicUrl: ctx.config.publicUrl,
      numericTableNumbers: allTablesNumeric(db),
    };
  });

  app.get('/api/public/menu', async (req, reply) => {
    const etag = `"menu-${Buffer.from(menuUpdatedAt(db)).toString('base64url')}"`;
    reply.header('ETag', etag).header('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    return getPublicMenu(db);
  });

  app.get('/api/public/calendar', { config: limit(120, 1) }, async (req): Promise<BookingCalendar> => {
    const { party } = parse(calendarQuerySchema, req.query);
    const settings = getBookingSettings(db);
    const now = ctx.clock.now();
    const today = zonedNow(settings.timeZone, now).date;
    const weekly = getWeeklyHours(db);
    const last = addDays(today, settings.maxDaysAhead);
    const specialDays = listSpecialDays(db, today, last);
    const days = [];
    for (let date = today; date <= last; date = addDays(date, 1)) {
      const day = computeDayAvailability({
        date,
        partySize: party,
        settings,
        weekly,
        specialDays,
        existing: activeBookingsOn(db, date),
        now,
      });
      const available = day.slots.some((s) => s.available);
      const status = day.reason === 'closed' ? 'closed' : available ? 'available' : day.slots.length > 0 ? 'full' : 'unavailable';
      days.push({ date, open: day.reason !== 'closed', available, status } as const);
    }
    return { today, days };
  });

  app.get('/api/public/availability', { config: limit(240, 1) }, async (req) => {
    const { date, party } = parse(availabilityQuerySchema, req.query);
    const settings = getBookingSettings(db);
    return computeDayAvailability({
      date,
      partySize: party,
      settings,
      weekly: getWeeklyHours(db),
      specialDays: listSpecialDays(db, date, date),
      existing: activeBookingsOn(db, date),
      now: ctx.clock.now(),
    });
  });

  app.post('/api/public/reservations', { config: limit(10, 10) }, async (req, reply) => {
    const key = idempotencyKey(req);
    const input = parse(reservationInputSchema, req.body);
    const { reservation, created } = createReservation(ctx, input, { source: 'web', actor: 'guest', idempotencyKey: key });
    return reply.code(created ? 201 : 200).send(reservation);
  });

  app.get('/api/public/reservations/:token', { config: limit(60, 1) }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return getReservationByToken(ctx, (req.params as { token: string }).token);
  });

  app.post('/api/public/reservations/:token/cancel', { config: limit(10, 10) }, async (req) =>
    cancelByGuest(ctx, (req.params as { token: string }).token),
  );

  app.get('/api/public/tables/resolve', { config: limit(60, 1) }, async (req): Promise<TableResolved> => {
    const query = parse(tableLookupSchema, req.query);
    const table = 'code' in query ? findTableByCode(db, query.code) : findTableByNumber(db, query.number);
    if (!table) throw new AppError(404, 'TABLE_NOT_FOUND', 'No table with this number');
    if (!table.active) throw conflict('TABLE_INACTIVE', 'Ordering is not available for this table');
    return { code: table.code, number: table.number };
  });

  app.post('/api/public/orders', { config: limit(30, 10) }, async (req, reply) => {
    const key = idempotencyKey(req);
    const input = parse(orderInputSchema, req.body);
    const { order, created } = createOrder(ctx, input, key);
    return reply.code(created ? 201 : 200).send(order);
  });

  app.get('/api/public/orders/:token', { config: limit(120, 1) }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return getOrderByToken(ctx, (req.params as { token: string }).token);
  });
}
