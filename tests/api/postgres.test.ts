import { afterEach, describe, expect, it } from 'vitest';
import { seedDemoMenu, seedDemoTables } from '../../server/seed/demo';
import { makeApp, newKey, postReservation, reservationPayload, type TestApp } from '../helpers';

// Behaviour that depends on PostgreSQL itself (run the suite with TEST_DATABASE_URL to exercise a
// real server, where transactions truly run in parallel).
let t: TestApp;
afterEach(async () => {
  await t.close();
});

describe('menu changes in parallel', () => {
  it('two reorders at the same moment both succeed', async () => {
    t = await makeApp();
    await seedDemoMenu(t.ctx.db);
    const staff = await t.login();
    const category = (await staff('GET', '/api/staff/menu')).json().categories.find((c: { items: unknown[] }) => c.items.length >= 5);
    const ids: number[] = category.items.map((i: { id: number }) => i.id);
    for (let round = 0; round < 5; round++) {
      // Built from the same list, as two quick taps on "move up" would be.
      const a = [ids[1]!, ids[0]!, ...ids.slice(2)];
      const b = [...ids.slice(0, 3), ids[4]!, ids[3]!, ...ids.slice(5)];
      const [ra, rb] = await Promise.all([staff('PUT', '/api/staff/menu/items/order', { ids: a }), staff('PUT', '/api/staff/menu/items/order', { ids: b })]);
      expect([ra.statusCode, rb.statusCode]).toEqual([200, 200]);
    }
  });
});

describe('sample menu', () => {
  it('stops being "the sample menu" once its dishes are deleted by hand, and can be loaded again', async () => {
    t = await makeApp();
    const admin = await t.login();
    expect((await admin('POST', '/api/staff/menu/demo/load')).statusCode).toBe(200);
    for (const c of (await admin('GET', '/api/staff/menu')).json().categories) {
      expect((await admin('DELETE', `/api/staff/menu/categories/${c.id}`)).statusCode).toBe(200);
    }
    expect((await t.app.inject('/api/public/site')).json().demoMenu).toBe(false);
    expect((await admin('POST', '/api/staff/menu/demo/load')).statusCode).toBe(200);
    expect((await admin('GET', '/api/staff/menu')).json().categories.length).toBeGreaterThan(0);
  });
});

describe('large amounts', () => {
  it('stores order totals above 21 million dirhams (64-bit amounts)', async () => {
    t = await makeApp({ now: '2026-10-05T18:00:00Z' });
    await seedDemoMenu(t.ctx.db);
    await seedDemoTables(t.ctx.db);
    const admin = await t.login();
    const categoryId = (await admin('GET', '/api/staff/menu')).json().categories[0].id;
    const created = await admin('POST', '/api/staff/menu/items', {
      categoryId,
      name: 'Privatisation du restaurant',
      priceCents: 10_000_000,
      dietary: [],
      available: true,
      visible: true,
      isSpecial: false,
      optionGroups: [],
    });
    expect(created.statusCode).toBe(201);
    const table = (await t.app.inject('/api/public/tables/resolve?number=4')).json();
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/public/orders',
      headers: { 'idempotency-key': newKey() },
      payload: { tableCode: table.code, items: Array.from({ length: 11 }, () => ({ menuItemId: created.json().id, quantity: 20, optionIds: [] })) },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().totalCents).toBe(2_200_000_000);
  });
});

describe('dashboard counters', () => {
  it('report the newest online request, not staff entries', async () => {
    t = await makeApp();
    const staff = await t.login();
    const counts = async () => (await staff('GET', '/api/staff/reservations/counts')).json();
    expect((await counts()).latestRequestId).toBeNull();
    await postReservation(t, reservationPayload());
    const first = (await counts()).latestRequestId;
    expect(first).toBeTypeOf('number');
    const byPhone = await staff('POST', '/api/staff/reservations', {
      ...reservationPayload({ name: 'Karim Alaoui', phone: '06 99 88 77 66', time: '21:00' }),
      source: 'phone',
    });
    expect(byPhone.statusCode).toBe(201);
    expect((await counts()).latestRequestId).toBe(first);
  });
});

describe('PostgreSQL connections', () => {
  it.runIf(!!process.env.TEST_DATABASE_URL)('survive the server closing them', async () => {
    t = await makeApp();
    // Open a few pooled connections, then have the server end every one of them.
    await Promise.all(Array.from({ length: 4 }, () => t.ctx.db.one('SELECT pg_sleep(0.05)')));
    await t.ctx.db.run(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()',
    );
    await new Promise((r) => setTimeout(r, 200));
    let answer: unknown;
    for (let i = 0; i < 5 && answer === undefined; i++) {
      answer = await t.ctx.db.one<{ ok: number }>('SELECT 1 AS ok').catch(() => undefined);
    }
    expect(answer).toEqual({ ok: 1 });
  });
});
