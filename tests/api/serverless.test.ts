import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN, makeApp, ORIGIN, postReservation, reservationPayload, type TestApp } from '../helpers';

// Behaviour specific to serverless hosting (Vercel): many short-lived instances, no local disk.
let t: TestApp;
afterEach(async () => {
  await t.close();
});

const serverless = (extra: Parameters<typeof makeApp>[0] = {}) =>
  makeApp({ ...extra, config: { serverless: true, cronSecret: 'cron-secret-for-tests', ...extra.config } });

describe('serverless hosting', () => {
  it('turns the live stream off so dashboards poll instead', async () => {
    t = await serverless();
    const staff = await t.login();
    const res = await staff('GET', '/api/staff/events');
    expect(res.statusCode).toBe(204);
  });

  it('runs the daily housekeeping only for Vercel Cron (CRON_SECRET)', async () => {
    t = await serverless({ config: { retentionDays: 30 } });
    await postReservation(t, reservationPayload());
    const cron = (authorization?: string) =>
      t.app.inject({ method: 'GET', url: '/api/cron/daily', headers: authorization ? { authorization } : {} });
    expect((await cron()).statusCode).toBe(401);
    expect((await cron('Bearer wrong')).statusCode).toBe(401);
    expect((await cron('Bearer cron-secret-for-tests')).json()).toEqual({ erased: 0 });
    t.setNow('2027-01-15T10:00:00Z'); // the booking (6 October) is now over 30 days old
    expect((await cron('Bearer cron-secret-for-tests')).json()).toEqual({ erased: 1 });
  });

  it('refuses the cron endpoint when no secret is configured', async () => {
    t = await serverless({ config: { cronSecret: null } });
    expect((await t.app.inject({ method: 'GET', url: '/api/cron/daily', headers: { authorization: 'Bearer ' } })).statusCode).toBe(401);
  });

  it('explains that photo uploads need a Blob store', async () => {
    t = await serverless({ media: null });
    expect((await t.app.inject('/api/public/site')).json().mediaBase).toBeNull();
    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#b85c38' } }).jpeg().toBuffer();
    const boundary = '----bbpark-test';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="dish.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      photo,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const cookie = (await t.app.inject({ method: 'POST', url: '/api/staff/login', headers: { origin: ORIGIN }, payload: ADMIN })).cookies[0]!;
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/staff/uploads/menu-image',
      headers: { origin: ORIGIN, cookie: `bb_staff=${cookie.value}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('UPLOADS_UNAVAILABLE');
  });

  it('serves dish photos from this server when they are stored on disk', async () => {
    t = await makeApp();
    expect((await t.app.inject('/api/public/site')).json().mediaBase).toBe('/uploads');
  });
});

describe('visitor addresses on Vercel', () => {
  it("one visitor's failed sign-ins don't lock anyone else out", async () => {
    // The real Vercel configuration: every request reaches the function from the platform's proxy
    // (here 127.0.0.1), which puts the visitor's address in X-Forwarded-For.
    t = await makeApp({ env: { VERCEL: '1', DATABASE_URL: 'postgres://unused@localhost/x' }, config: { database: 'memory' } });
    const login = (ip: string, email: string, password: string) =>
      t.app.inject({
        method: 'POST',
        url: '/api/staff/login',
        remoteAddress: '127.0.0.1',
        headers: { origin: ORIGIN, 'x-forwarded-for': ip },
        payload: { email, password },
      });
    const attacker = '198.51.100.66';
    // 5 wrong passwords for the admin's account, then 15 more for other accounts: both limits reached…
    for (let i = 0; i < 5; i++) expect((await login(attacker, ADMIN.email, 'wrong-password')).statusCode).toBe(401);
    expect((await login(attacker, ADMIN.email, 'wrong-password')).statusCode).toBe(429);
    for (let i = 0; i < 15; i++) expect((await login(attacker, `nobody${i}@test.local`, 'wrong-password')).statusCode).toBe(401);
    expect((await login(attacker, 'someone@test.local', 'wrong-password')).statusCode).toBe(429);
    // …for that visitor only: the admin, elsewhere, still signs in.
    expect((await login('41.250.10.20', ADMIN.email, ADMIN.password)).statusCode).toBe(200);
  });
});

describe('throttles shared through the database', () => {
  it('lets no more than 5 wrong passwords through, even all at once', async () => {
    t = await makeApp();
    const attempt = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/staff/login',
        headers: { origin: ORIGIN },
        payload: { email: ADMIN.email, password: 'wrong-password' },
      });
    const codes = (await Promise.all(Array.from({ length: 12 }, attempt))).map((r) => r.statusCode);
    expect(codes.filter((c) => c === 401)).toHaveLength(5);
    expect(codes.filter((c) => c === 429)).toHaveLength(7);
  });

  it('forgets the failures of a successful sign-in', async () => {
    t = await makeApp();
    const attempt = (password: string) =>
      t.app.inject({ method: 'POST', url: '/api/staff/login', headers: { origin: ORIGIN }, payload: { email: ADMIN.email, password } });
    for (let i = 0; i < 4; i++) expect((await attempt('wrong-password')).statusCode).toBe(401);
    expect((await attempt(ADMIN.password)).statusCode).toBe(200);
    for (let i = 0; i < 5; i++) expect((await attempt('wrong-password')).statusCode).toBe(401);
    expect((await attempt('wrong-password')).statusCode).toBe(429);
  });
});

describe('sample menu from the dashboard', () => {
  it('loads it into an empty menu only, for administrators', async () => {
    t = await makeApp();
    const admin = await t.login();
    expect((await admin('POST', '/api/staff/menu/demo/load')).statusCode).toBe(200);
    expect((await t.app.inject('/api/public/site')).json().demoMenu).toBe(true);
    expect((await admin('POST', '/api/staff/menu/demo/load')).json().error.code).toBe('MENU_NOT_EMPTY');
  });
});
