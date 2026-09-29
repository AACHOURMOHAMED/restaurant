import type { FastifyInstance } from 'fastify';
import type {
  BookingCalendar,
  PublicSite,
  TableResolved,
} from '../../shared/api-types.js';
import { computeDayAvailability } from '../../shared/availability.js';
import {
  availabilityQuerySchema,
  calendarQuerySchema,
  orderInputSchema,
  reservationInputSchema,
  tableLookupSchema,
} from '../../shared/schemas.js';
import { addDays, zonedNow } from '../../shared/time.js';
import type { AppContext } from '../context.js';
import { AppError, conflict } from '../errors.js';
import { idempotencyKey, parse } from '../http.js';
import { getPublicMenu } from '../repos/menu.js';
import {
  getBookingSettings,
  getFlag,
  getOrderingSettings,
  getMediaBase,
  getWeeklyHours,
  listSpecialDays,
  menuUpdatedAt,
} from '../repos/settings.js';
import { allTablesNumeric, findTableByCode, findTableByNumber } from '../repos/tables.js';
import { createOrder, getOrderByToken } from '../services/orders.js';
import {
  activeBookingsBetween,
  activeBookingsOn,
  cancelByGuest,
  createReservation,
  getReservationByToken,
} from '../services/reservations.js';
import { claim, withdrawEvents } from '../throttle.js';

const limit = (max: number, minutes: number) => ({ rateLimit: { max, timeWindow: minutes * 60_000 } });
const DAILY_BOOKINGS_PER_IP = 20;

export async function publicRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/public/site', async (_req, reply): Promise<PublicSite> => {
    const booking = await getBookingSettings(db);
    const today = zonedNow(booking.timeZone, ctx.clock.now()).date;
    const [hours, specialDays, ordering, demoMenu, numericTableNumbers, mediaBase] = await Promise.all([
      getWeeklyHours(db),
      listSpecialDays(db, today, addDays(today, 90)),
      getOrderingSettings(db),
      getFlag(db, 'demo_menu'),
      allTablesNumeric(db),
      getMediaBase(db, ctx.media?.defaultBase ?? null),
    ]);
    reply.header('Cache-Control', 'no-cache');
    return {
      timeZone: booking.timeZone,
      hours,
      specialDays,
      booking: {
        onlineBookingEnabled: booking.onlineBookingEnabled,
        requireApproval: booking.requireApproval,
        maxPartySize: booking.maxPartySize,
        maxDaysAhead: booking.maxDaysAhead,
      },
      ordering,
      demoMenu,
      today,
      publicUrl: ctx.config.publicUrl,
      numericTableNumbers,
      mediaBase,
    };
  });

  app.get('/api/public/menu', async (req, reply) => {
    const etag = `"menu-${Buffer.from(await menuUpdatedAt(db)).toString('base64url')}"`;
    reply.header('ETag', etag).header('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    return getPublicMenu(db);
  });

  app.get('/api/public/calendar', { config: limit(120, 1) }, async (req): Promise<BookingCalendar> => {
    const { party } = parse(calendarQuerySchema, req.query);
    const settings = await getBookingSettings(db);
    const now = ctx.clock.now();
    const today = zonedNow(settings.timeZone, now).date;
    const last = addDays(today, settings.maxDaysAhead);
    const [weekly, specialDays, bookings] = await Promise.all([
      getWeeklyHours(db),
      listSpecialDays(db, today, last),
      activeBookingsBetween(db, today, last),
    ]);
    const days = [];
    for (let date = today; date <= last; date = addDays(date, 1)) {
      const day = computeDayAvailability({
        date,
        partySize: party,
        settings,
        weekly,
        specialDays,
        existing: bookings.get(date) ?? [],
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
    const [settings, weekly, specialDays, existing] = await Promise.all([
      getBookingSettings(db),
      getWeeklyHours(db),
      listSpecialDays(db, date, date),
      activeBookingsOn(db, date),
    ]);
    return computeDayAvailability({ date, partySize: party, settings, weekly, specialDays, existing, now: ctx.clock.now() });
  });

  // On top of the burst limit: at most DAILY_BOOKINGS_PER_IP new online requests per connection and
  // day, so a script can't fill the reservation book. Generous, because phones on mobile networks
  // often share one public address. Counted in the database, so it holds across server instances.
  app.post('/api/public/reservations', { config: limit(10, 10) }, async (req, reply) => {
    const key = idempotencyKey(req);
    const input = parse(reservationInputSchema, req.body);
    const quota = ctx.config.rateLimit
      ? await claim(db, [{ key: `booking:${req.ip}`, max: DAILY_BOOKINGS_PER_IP }], 24 * 3_600_000, ctx.clock.now())
      : [];
    if (!quota) {
      throw new AppError(429, 'BOOKING_LIMIT', 'Too many reservation requests from this connection today. Please call the restaurant.');
    }
    try {
      const { reservation, created } = await createReservation(ctx, input, { source: 'web', actor: 'guest', idempotencyKey: key });
      // Only new requests count (a retry of the same request returns the first one).
      if (!created) await withdrawEvents(db, quota);
      return reply.code(created ? 201 : 200).send(reservation);
    } catch (err) {
      await withdrawEvents(db, quota);
      throw err;
    }
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
    const table = 'code' in query ? await findTableByCode(db, query.code) : await findTableByNumber(db, query.number);
    if (!table) throw new AppError(404, 'TABLE_NOT_FOUND', 'No table with this number');
    if (!table.active) throw conflict('TABLE_INACTIVE', 'Ordering is not available for this table');
    return { code: table.code, number: table.number };
  });

  app.post('/api/public/orders', { config: limit(30, 10) }, async (req, reply) => {
    const key = idempotencyKey(req);
    const input = parse(orderInputSchema, req.body);
    const { order, created } = await createOrder(ctx, input, key);
    return reply.code(created ? 201 : 200).send(order);
  });

  app.get('/api/public/orders/:token', { config: limit(120, 1) }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return getOrderByToken(ctx, (req.params as { token: string }).token);
  });
}
