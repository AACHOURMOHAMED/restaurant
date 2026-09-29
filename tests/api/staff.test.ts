import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, makeApp, ORIGIN, postReservation, reservationPayload, STAFF, type TestApp } from '../helpers';

let t: TestApp;
beforeEach(async () => {
  t = await makeApp();
});
afterEach(async () => {
  await t.close();
});

describe('staff authentication', () => {
  it('protects every staff endpoint', async () => {
    for (const url of ['/api/staff/me', '/api/staff/reservations', '/api/staff/orders', '/api/staff/menu', '/api/staff/tables', '/api/staff/settings']) {
      const res = await t.app.inject(url);
      expect(res.statusCode, url).toBe(401);
    }
  });

  it('rejects wrong passwords and throttles repeated failures', async () => {
    const attempt = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/staff/login',
        headers: { origin: ORIGIN },
        payload: { email: ADMIN.email, password: 'wrong-password' },
      });
    for (let i = 0; i < 5; i++) expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).json().error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('sets a hardened session cookie', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/staff/login',
      headers: { origin: ORIGIN },
      payload: { email: ADMIN.email, password: ADMIN.password },
    });
    const cookie = res.cookies.find((c) => c.name === 'bb_staff')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    expect(cookie.path).toBe('/api/staff');
    expect(res.json()).toEqual({ id: 1, email: ADMIN.email, name: ADMIN.name, role: 'admin' });
  });

  it('refuses cross-site state changes (CSRF)', async () => {
    const staff = await t.login();
    const cookie = (await t.app.inject({
      method: 'POST',
      url: '/api/staff/login',
      headers: { origin: ORIGIN },
      payload: { email: ADMIN.email, password: ADMIN.password },
    })).cookies[0]!.value;
    const evil = await t.app.inject({
      method: 'PUT',
      url: '/api/staff/settings/ordering',
      headers: { origin: 'https://evil.example', cookie: `bb_staff=${cookie}` },
      payload: { enabled: false, onlyDuringOpeningHours: true },
    });
    expect(evil.statusCode).toBe(403);
    expect(evil.json().error.code).toBe('CSRF');
    expect((await staff('GET', '/api/staff/settings')).json().ordering.enabled).toBe(true);
  });

  it('signs out', async () => {
    const staff = await t.login();
    await staff('POST', '/api/staff/logout');
    expect((await staff('GET', '/api/staff/me')).statusCode).toBe(401);
  });
});

describe('roles', () => {
  it('lets waiters handle reservations and orders but not settings or the menu', async () => {
    const waiter = await t.login(STAFF);
    expect((await waiter('GET', '/api/staff/reservations')).statusCode).toBe(200);
    const { booking } = (await waiter('GET', '/api/staff/settings')).json();
    expect((await waiter('PUT', '/api/staff/settings/booking', booking)).statusCode).toBe(403);
    expect((await waiter('POST', '/api/staff/tables', { number: '40', seats: 2 })).statusCode).toBe(403);
    expect((await waiter('GET', '/api/staff/users')).statusCode).toBe(403);
  });
});

describe('reservation management', () => {
  it('shows contact details to staff only and supports table assignment with conflict warnings', async () => {
    const a = (await postReservation(t, reservationPayload())).json();
    await postReservation(t, reservationPayload({ name: 'Youssef Alami', phone: '0661000000', time: '20:30' }));
    const staff = await t.login();
    const table = (await staff('POST', '/api/staff/tables', { number: '8', seats: 4, area: null })).json();

    const list = (await staff('GET', '/api/staff/reservations?date=2026-10-06')).json();
    expect(list.reservations).toHaveLength(2);
    expect(list.reservations[0]).toMatchObject({ reference: a.reference, phone: '06 12 34 56 78', email: 'samira@example.com' });
    expect(list.counts.pendingUpcoming).toBe(2);

    const first = await staff('PATCH', `/api/staff/reservations/${list.reservations[0].id}`, { status: 'confirmed', tableId: table.id });
    expect(first.json().warnings).toEqual([]);
    const second = await staff('PATCH', `/api/staff/reservations/${list.reservations[1].id}`, { status: 'confirmed', tableId: table.id });
    expect(second.json().reservation.tableNumber).toBe('8');
    expect(second.json().warnings).toEqual([{ reference: a.reference, time: '20:00', name: 'Samira Benali' }]);
  });

  it('enforces sensible status transitions', async () => {
    await postReservation(t, reservationPayload());
    const staff = await t.login();
    const [r] = (await staff('GET', '/api/staff/reservations')).json().reservations;
    expect((await staff('PATCH', `/api/staff/reservations/${r.id}`, { status: 'declined' })).statusCode).toBe(200);
    const bad = await staff('PATCH', `/api/staff/reservations/${r.id}`, { status: 'seated' });
    expect(bad.json().error.code).toBe('INVALID_TRANSITION');
  });

  it('lets staff record phone bookings beyond online capacity', async () => {
    const staff = await t.login();
    const res = await staff('POST', '/api/staff/reservations', {
      ...reservationPayload({ date: '2026-10-09', time: '13:00' }), // Friday: closed online
      ignoreCapacity: true,
      status: 'confirmed',
      source: 'phone',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ status: 'confirmed', source: 'phone' });
  });

  it('searches reservations', async () => {
    await postReservation(t, reservationPayload());
    const staff = await t.login();
    expect((await staff('GET', '/api/staff/reservations?q=Samira')).json().reservations).toHaveLength(1);
    expect((await staff('GET', '/api/staff/reservations?q=Nobody')).json().reservations).toHaveLength(0);
  });
});

describe('settings', () => {
  it('validates and saves opening hours, which drive availability', async () => {
    const staff = await t.login();
    const hours = (await staff('GET', '/api/staff/settings')).json().hours;
    const bad = await staff('PUT', '/api/staff/settings/hours', { ...hours, 2: [{ opens: '12:00', closes: '15:00' }, { opens: '14:00', closes: '18:00' }] });
    expect(bad.statusCode).toBe(400);
    const ok = await staff('PUT', '/api/staff/settings/hours', { ...hours, 2: [{ opens: '19:00', closes: '23:00' }] });
    expect(ok.statusCode).toBe(200);
    const slots = (await t.app.inject('/api/public/availability?date=2026-10-06&party=2')).json().slots;
    expect(slots[0].time).toBe('19:00');
  });

  it('closes a specific date', async () => {
    const staff = await t.login();
    const res = await staff('PUT', '/api/staff/special-days/2026-10-06', { closed: true, note: 'Fermeture exceptionnelle' });
    expect(res.statusCode).toBe(200);
    expect((await t.app.inject('/api/public/availability?date=2026-10-06&party=2')).json().reason).toBe('closed');
    await staff('DELETE', '/api/staff/special-days/2026-10-06');
    expect((await t.app.inject('/api/public/availability?date=2026-10-06&party=2')).json().open).toBe(true);
  });

  it('rejects invalid booking settings', async () => {
    const staff = await t.login();
    const { booking } = (await staff('GET', '/api/staff/settings')).json();
    const res = await staff('PUT', '/api/staff/settings/booking', { ...booking, timeZone: 'Mars/Olympus' });
    expect(res.json().error.fields.timeZone).toBe('invalid_timezone');
  });
});

describe('team', () => {
  it('creates staff accounts and prevents removing the last administrator', async () => {
    const admin = await t.login();
    const created = await admin('POST', '/api/staff/users', {
      email: 'chef@test.local',
      name: 'Chef',
      role: 'staff',
      password: 'a-long-password',
    });
    expect(created.statusCode).toBe(201);
    const self = await admin('PATCH', '/api/staff/users/1', { active: false });
    expect(self.json().error.code).toBe('SELF_LOCKOUT');
  });
});

describe('rate limiting', () => {
  it('limits reservation spam from one address', async () => {
    const limited = await makeApp({ rateLimit: true });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await postReservation(limited, reservationPayload({ phone: `06000000${String(i).padStart(2, '0')}`, time: '12:00' }));
        codes.push(res.statusCode);
      }
      expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    } finally {
      await limited.close();
    }
  });
});

describe('website pages', () => {
  it('serves the app for page URLs (any query string) and 404s for missing files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbpark-static-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><head><!--head:start--><!--head:end--></head><body>app</body></html>');
    const site = await makeApp({ staticDir: dir });
    try {
      for (const url of ['/', '/reservation', '/t/abc12345', '/?utm_source=instagram.com&fbclid=a.b']) {
        const res = await site.app.inject({ url, headers: { 'accept-encoding': 'br' } });
        expect(res.statusCode, url).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');
      }
      const html = await site.app.inject('/');
      expect(html.body).toContain('"@type":"Restaurant"');
      expect(html.body).toContain('"telephone":"+212537370624"');
      expect((await site.app.inject('/assets/missing.js')).statusCode).toBe(404);
      expect((await site.app.inject('/api/nope')).statusCode).toBe(404);
    } finally {
      await site.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
