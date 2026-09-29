import type { FastifyInstance } from 'fastify';
import type { StaffSettings } from '../../shared/api-types';
import { computeDayAvailability } from '../../shared/availability';
import {
  availabilityQuerySchema,
  bookingSettingsSchema,
  changePasswordSchema,
  dateSchema,
  loginSchema,
  menuCategoryInputSchema,
  menuItemInputSchema,
  menuItemPatchSchema,
  orderListQuerySchema,
  orderingSettingsSchema,
  orderStatusUpdateSchema,
  reorderSchema,
  reservationListQuerySchema,
  reservationUpdateSchema,
  specialDaySchema,
  staffReservationCreateSchema,
  staffUserCreateSchema,
  staffUserUpdateSchema,
  tableInputSchema,
  weeklyHoursSchema,
} from '../../shared/schemas';
import type { AppContext } from '../context';
import { AppError, badRequest, notFound } from '../errors';
import { actorOf, idParam, isSameOrigin, parse, STAFF_COOKIE, staffGuard } from '../http';
import * as menu from '../repos/menu';
import {
  deleteSpecialDay,
  getBookingSettings,
  getOrderingSettings,
  getWeeklyHours,
  listSpecialDays,
  setBookingSettings,
  setOrderingSettings,
  setWeeklyHours,
  upsertSpecialDay,
} from '../repos/settings';
import * as tables from '../repos/tables';
import {
  changeOwnPassword,
  createSession,
  createUser,
  destroySession,
  getSessionUser,
  listUsers,
  login,
  updateUser,
} from '../services/auth';
import { deleteMenuImage, processMenuImage } from '../services/images';
import { listOrders, updateOrderStatus } from '../services/orders';
import {
  activeBookingsOn,
  createReservation,
  getStaffReservation,
  listReservations,
  reservationCounts,
  updateReservation,
} from '../services/reservations';

export async function staffRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;
  const staff = { preHandler: staffGuard(ctx) };
  const admin = { preHandler: staffGuard(ctx, 'admin') };
  const now = () => ctx.clock.now();

  // ─── Session ───────────────────────────────────────────────────────────────

  app.post('/api/staff/login', { config: { rateLimit: { max: 30, timeWindow: 15 * 60_000 } } }, async (req, reply) => {
    if (!isSameOrigin(req, config.publicUrl)) throw new AppError(403, 'CSRF', 'Cross-site request refused');
    const { email, password } = parse(loginSchema, req.body);
    const { user, userId } = await login(db, email, password, req.ip, now());
    const token = createSession(db, userId, config.sessionTtlMs, now());
    reply.setCookie(STAFF_COOKIE, token, {
      path: '/api/staff',
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSecure,
      maxAge: Math.floor(config.sessionTtlMs / 1000),
    });
    return user;
  });

  app.post('/api/staff/logout', async (req, reply) => {
    destroySession(db, req.cookies[STAFF_COOKIE]);
    reply.clearCookie(STAFF_COOKIE, { path: '/api/staff' });
    return { ok: true };
  });

  app.get('/api/staff/me', staff, async (req) => req.staff);

  app.post('/api/staff/me/password', staff, async (req) => {
    const body = parse(changePasswordSchema, req.body);
    await changeOwnPassword(db, req.staff!.id, body.currentPassword, body.newPassword);
    return { ok: true };
  });

  // ─── Live events (Server-Sent Events) ────────────────────────────────────────

  app.get('/api/staff/events', staff, (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 4000\n\n');
    const unsubscribe = ctx.events.subscribe((event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
    const token = req.cookies[STAFF_COOKIE];
    const ping = setInterval(() => {
      if (!getSessionUser(db, token, config.sessionTtlMs, now())) return res.end();
      res.write(': ping\n\n');
    }, 25_000);
    req.raw.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
  });

  // ─── Reservations ──────────────────────────────────────────────────────────

  app.get('/api/staff/reservations', staff, async (req) => {
    const q = parse(reservationListQuerySchema, req.query);
    return { reservations: listReservations(ctx, q), counts: reservationCounts(ctx) };
  });

  app.get('/api/staff/reservations/counts', staff, async () => reservationCounts(ctx));

  app.get('/api/staff/reservations/:id', staff, async (req) => getStaffReservation(ctx, idParam(req)));

  app.post('/api/staff/reservations', staff, async (req, reply) => {
    const input = parse(staffReservationCreateSchema, req.body);
    const { id } = createReservation(ctx, input, {
      source: input.source,
      actor: actorOf(req),
      status: input.status,
      ignoreCapacity: input.ignoreCapacity,
      tableId: input.tableId ?? null,
    });
    return reply.code(201).send(getStaffReservation(ctx, id));
  });

  app.patch('/api/staff/reservations/:id', staff, async (req) =>
    updateReservation(ctx, idParam(req), parse(reservationUpdateSchema, req.body), actorOf(req)),
  );

  app.get('/api/staff/availability', staff, async (req) => {
    const { date, party } = parse(availabilityQuerySchema, req.query);
    return computeDayAvailability({
      date,
      partySize: party,
      settings: getBookingSettings(db),
      weekly: getWeeklyHours(db),
      specialDays: listSpecialDays(db, date, date),
      existing: activeBookingsOn(db, date),
      now: now(),
    });
  });

  // ─── Settings ──────────────────────────────────────────────────────────────

  app.get('/api/staff/settings', staff, async (): Promise<StaffSettings> => ({
    booking: getBookingSettings(db),
    ordering: getOrderingSettings(db),
    hours: getWeeklyHours(db),
    specialDays: listSpecialDays(db),
    publicUrl: config.publicUrl,
  }));

  app.put('/api/staff/settings/booking', admin, async (req) => {
    setBookingSettings(db, parse(bookingSettingsSchema, req.body));
    ctx.events.publish({ type: 'settings.updated' });
    return getBookingSettings(db);
  });

  // Any staff member may pause/resume table ordering (e.g. when the kitchen is overloaded).
  app.put('/api/staff/settings/ordering', staff, async (req) => {
    setOrderingSettings(db, parse(orderingSettingsSchema, req.body));
    ctx.events.publish({ type: 'settings.updated' });
    return getOrderingSettings(db);
  });

  app.put('/api/staff/settings/hours', admin, async (req) => {
    setWeeklyHours(db, parse(weeklyHoursSchema, req.body));
    ctx.events.publish({ type: 'settings.updated' });
    return getWeeklyHours(db);
  });

  app.put('/api/staff/special-days/:date', admin, async (req) => {
    const date = parse(dateSchema, (req.params as { date: string }).date);
    const day = parse(specialDaySchema, { ...(req.body as object), date });
    upsertSpecialDay(db, day);
    ctx.events.publish({ type: 'settings.updated' });
    return listSpecialDays(db);
  });

  app.delete('/api/staff/special-days/:date', admin, async (req) => {
    const date = parse(dateSchema, (req.params as { date: string }).date);
    if (!deleteSpecialDay(db, date)) throw notFound('Special day');
    ctx.events.publish({ type: 'settings.updated' });
    return listSpecialDays(db);
  });

  // ─── Tables ────────────────────────────────────────────────────────────────

  app.get('/api/staff/tables', staff, async () => tables.listTables(db));

  app.post('/api/staff/tables', admin, async (req, reply) => {
    const table = tables.createTable(db, parse(tableInputSchema, req.body), now());
    ctx.events.publish({ type: 'tables.updated' });
    return reply.code(201).send(table);
  });

  app.put('/api/staff/tables/order', admin, async (req) => {
    tables.reorderTables(db, parse(reorderSchema, req.body).ids);
    ctx.events.publish({ type: 'tables.updated' });
    return tables.listTables(db);
  });

  app.put('/api/staff/tables/:id', admin, async (req) => {
    const table = tables.updateTable(db, idParam(req), parse(tableInputSchema, req.body), now());
    ctx.events.publish({ type: 'tables.updated' });
    return table;
  });

  app.post('/api/staff/tables/:id/regenerate-code', admin, async (req) => {
    const table = tables.regenerateTableCode(db, idParam(req), now());
    ctx.events.publish({ type: 'tables.updated' });
    return table;
  });

  app.delete('/api/staff/tables/:id', admin, async (req) => {
    tables.deleteTable(db, idParam(req));
    ctx.events.publish({ type: 'tables.updated' });
    return { ok: true };
  });

  // ─── Orders ────────────────────────────────────────────────────────────────

  app.get('/api/staff/orders', staff, async (req) => listOrders(ctx, parse(orderListQuerySchema, req.query).scope));

  app.patch('/api/staff/orders/:id', staff, async (req) =>
    updateOrderStatus(ctx, idParam(req), parse(orderStatusUpdateSchema, req.body).status, actorOf(req)),
  );

  // ─── Menu ──────────────────────────────────────────────────────────────────

  const menuChanged = () => ctx.events.publish({ type: 'menu.updated' });

  app.get('/api/staff/menu', staff, async () => menu.getStaffMenu(db));

  app.post('/api/staff/menu/categories', admin, async (req, reply) => {
    const id = menu.createCategory(db, parse(menuCategoryInputSchema, req.body), now());
    menuChanged();
    return reply.code(201).send({ id });
  });

  app.put('/api/staff/menu/categories/order', admin, async (req) => {
    menu.reorderCategories(db, parse(reorderSchema, req.body).ids);
    menuChanged();
    return { ok: true };
  });

  app.put('/api/staff/menu/categories/:id', admin, async (req) => {
    menu.updateCategory(db, idParam(req), parse(menuCategoryInputSchema, req.body), now());
    menuChanged();
    return { ok: true };
  });

  app.delete('/api/staff/menu/categories/:id', admin, async (req) => {
    menu.deleteCategory(db, idParam(req));
    menuChanged();
    return { ok: true };
  });

  app.post('/api/staff/menu/items', admin, async (req, reply) => {
    const id = menu.createItem(db, parse(menuItemInputSchema, req.body), now());
    menuChanged();
    return reply.code(201).send({ id });
  });

  app.put('/api/staff/menu/items/order', admin, async (req) => {
    menu.reorderItems(db, parse(reorderSchema, req.body).ids);
    menuChanged();
    return { ok: true };
  });

  app.put('/api/staff/menu/items/:id', admin, async (req) => {
    const id = idParam(req);
    const input = parse(menuItemInputSchema, req.body);
    const previousImage = menu.getItemImage(db, id);
    menu.updateItem(db, id, input, now());
    if (previousImage && previousImage !== input.image && !menu.imageInUse(db, previousImage)) {
      await deleteMenuImage(previousImage, config.uploadsDir);
    }
    menuChanged();
    return { ok: true };
  });

  // Availability ("sold out") and price tweaks are allowed for all staff.
  app.patch('/api/staff/menu/items/:id', staff, async (req) => {
    const patch = parse(menuItemPatchSchema, req.body);
    if ((patch.priceCents !== undefined || patch.visible !== undefined || patch.isSpecial !== undefined) && req.staff!.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Administrator access required');
    }
    menu.patchItem(db, idParam(req), patch, now());
    menuChanged();
    return { ok: true };
  });

  app.delete('/api/staff/menu/items/:id', admin, async (req) => {
    const image = menu.deleteItem(db, idParam(req));
    if (image && !menu.imageInUse(db, image)) await deleteMenuImage(image, config.uploadsDir);
    menuChanged();
    return { ok: true };
  });

  app.post('/api/staff/menu/demo/remove', admin, async () => {
    menu.deleteDemoMenu(db);
    menuChanged();
    return { ok: true };
  });

  app.post('/api/staff/uploads/menu-image', admin, async (req, reply) => {
    const file = await req.file();
    if (!file) throw badRequest('VALIDATION', 'No file uploaded');
    const buffer = await file.toBuffer();
    if (file.file.truncated) throw badRequest('IMAGE_TOO_LARGE', 'Photos must be smaller than 12 MB');
    const image = await processMenuImage(buffer, config.uploadsDir);
    return reply.code(201).send({ image });
  });

  // ─── Team ──────────────────────────────────────────────────────────────────

  app.get('/api/staff/users', admin, async () => listUsers(db));

  app.post('/api/staff/users', admin, async (req, reply) => {
    const user = await createUser(db, parse(staffUserCreateSchema, req.body), now());
    return reply.code(201).send(user);
  });

  app.patch('/api/staff/users/:id', admin, async (req) =>
    updateUser(db, idParam(req), parse(staffUserUpdateSchema, req.body), req.staff!.id),
  );

  // Unknown staff API routes → JSON 404 (after auth, so routes aren't discoverable).
  app.all('/api/staff/*', staff, async () => {
    throw notFound('Route');
  });
}
