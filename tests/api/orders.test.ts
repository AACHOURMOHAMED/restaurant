import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PublicMenu } from '../../shared/api-types';
import { seedDemoMenu, seedDemoTables } from '../../server/seed/demo';
import { makeApp, newKey, type TestApp } from '../helpers';

let t: TestApp;
let menu: PublicMenu;

beforeEach(async () => {
  t = await makeApp({ now: '2026-10-05T18:00:00Z' }); // Monday 19:00 local, restaurant open
  seedDemoMenu(t.ctx.db);
  seedDemoTables(t.ctx.db);
  menu = (await t.app.inject('/api/public/menu')).json();
});
afterEach(async () => {
  await t.close();
});

const item = (name: string) => menu.categories.flatMap((c) => c.items).find((i) => i.name === name)!;

async function resolveTable(query: string) {
  return t.app.inject(`/api/public/tables/resolve?${query}`);
}

function order(payload: Record<string, unknown>, key = newKey()) {
  return t.app.inject({ method: 'POST', url: '/api/public/orders', headers: { 'idempotency-key': key }, payload });
}

describe('table identification', () => {
  it('resolves what the guest types to a table', async () => {
    const res = await resolveTable('number=Table%2008');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ number: '8' });
    const byCode = await resolveTable(`code=${res.json().code}`);
    expect(byCode.json()).toEqual(res.json());
  });

  it('rejects unknown and inactive tables', async () => {
    expect((await resolveTable('number=99')).json().error.code).toBe('TABLE_NOT_FOUND');
    const staff = await t.login();
    const tables = (await staff('GET', '/api/staff/tables')).json();
    const eight = tables.find((x: { number: string }) => x.number === '8');
    await staff('PUT', `/api/staff/tables/${eight.id}`, { number: '8', seats: 4, area: null, active: false });
    expect((await resolveTable('number=8')).json().error.code).toBe('TABLE_INACTIVE');
  });

  it('invalidates old QR codes when a code is regenerated', async () => {
    const before = (await resolveTable('number=3')).json();
    const staff = await t.login();
    const tables = (await staff('GET', '/api/staff/tables')).json();
    const three = tables.find((x: { number: string }) => x.number === '3');
    const after = (await staff('POST', `/api/staff/tables/${three.id}/regenerate-code`)).json();
    expect(after.code).not.toBe(before.code);
    expect((await resolveTable(`code=${before.code}`)).statusCode).toBe(404);
  });
});

describe('dine-in orders', () => {
  it('prices the order on the server and attaches the table', async () => {
    const table = (await resolveTable('number=8')).json();
    const steak = item('Entrecôte grillée');
    const [cooking, sauce] = steak.optionGroups;
    const soup = item('Soupe de poisson');
    const res = await order({
      tableCode: table.code,
      items: [
        { menuItemId: steak.id, quantity: 2, optionIds: [cooking!.options[1]!.id, sauce!.options[0]!.id], note: 'Sans sel' },
        { menuItemId: soup.id, quantity: 1, optionIds: [] },
      ],
      note: 'Allergie aux noix',
      expectedTotalCents: 2 * (17000 + 1000) + 4500,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ status: 'received', tableNumber: '8', totalCents: 40500, currency: 'MAD' });
    expect(body.lines[0]).toMatchObject({ quantity: 2, unitPriceCents: 18000, note: 'Sans sel' });
    expect(body.lines[0].options.map((o: { name: string }) => o.name)).toEqual(['À point', 'Poivre']);
  });

  it('ignores client-side prices entirely', async () => {
    const table = (await resolveTable('number=2')).json();
    const soup = item('Soupe de poisson');
    const res = await order({
      tableCode: table.code,
      items: [{ menuItemId: soup.id, quantity: 1, optionIds: [], priceCents: 1 }],
    });
    expect(res.json().totalCents).toBe(4500);
  });

  it('never creates duplicates when the same submission is repeated', async () => {
    const table = (await resolveTable('number=5')).json();
    const soup = item('Soupe de poisson');
    const key = newKey();
    const payload = { tableCode: table.code, items: [{ menuItemId: soup.id, quantity: 1, optionIds: [] }] };
    const results = await Promise.all([order(payload, key), order(payload, key), order(payload, key)]);
    const refs = new Set(results.map((r) => r.json().reference));
    expect(refs.size).toBe(1);
    const staff = await t.login();
    expect((await staff('GET', '/api/staff/orders?scope=open')).json()).toHaveLength(1);
  });

  it('requires a valid table', async () => {
    const soup = item('Soupe de poisson');
    const res = await order({ tableCode: 'zzzzzzzz', items: [{ menuItemId: soup.id, quantity: 1 }] });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('TABLE_NOT_FOUND');
    const missing = await order({ items: [{ menuItemId: soup.id, quantity: 1 }] });
    expect(missing.json().error.fields.tableCode).toBe('table_required');
  });

  it('refuses sold-out dishes, invalid options and stale totals', async () => {
    const table = (await resolveTable('number=1')).json();
    const staff = await t.login();
    const soup = item('Soupe de poisson');
    await staff('PATCH', `/api/staff/menu/items/${soup.id}`, { available: false });
    const soldOut = await order({ tableCode: table.code, items: [{ menuItemId: soup.id, quantity: 1 }] });
    expect(soldOut.json().error).toMatchObject({ code: 'ITEM_UNAVAILABLE', details: { menuItemIds: [soup.id] } });

    const steak = item('Entrecôte grillée');
    const noCooking = await order({ tableCode: table.code, items: [{ menuItemId: steak.id, quantity: 1 }] });
    expect(noCooking.json().error.code).toBe('OPTIONS_INVALID');

    const tea = item('Thé à la menthe');
    const stale = await order({
      tableCode: table.code,
      items: [{ menuItemId: tea.id, quantity: 1, optionIds: [tea.optionGroups[0]!.options[0]!.id] }],
      expectedTotalCents: 1000,
    });
    expect(stale.json().error).toMatchObject({ code: 'PRICE_CHANGED', details: { totalCents: 2000 } });
  });

  it('refuses orders while the restaurant is closed or ordering is paused', async () => {
    const table = (await resolveTable('number=1')).json();
    const soup = item('Soupe de poisson');
    const payload = { tableCode: table.code, items: [{ menuItemId: soup.id, quantity: 1 }] };

    t.setNow('2026-10-06T02:00:00Z'); // 03:00 local
    expect((await order(payload)).json().error.code).toBe('ORDERING_CLOSED');

    t.setNow('2026-10-05T18:00:00Z');
    const staff = await t.login();
    await staff('PUT', '/api/staff/settings/ordering', { enabled: false, onlyDuringOpeningHours: true });
    expect((await order(payload)).json().error.code).toBe('ORDERING_DISABLED');
  });

  it('lets staff move the order through the kitchen and the guest follow it', async () => {
    const table = (await resolveTable('number=4')).json();
    const soup = item('Soupe de poisson');
    const created = (await order({ tableCode: table.code, items: [{ menuItemId: soup.id, quantity: 3 }] })).json();

    const staff = await t.login({ email: 'staff@test.local', password: 'staff-password-123' });
    const open = (await staff('GET', '/api/staff/orders?scope=open')).json();
    expect(open[0]).toMatchObject({ tableNumber: '4', status: 'received' });
    await staff('PATCH', `/api/staff/orders/${open[0].id}`, { status: 'preparing' });

    const view = (await t.app.inject(`/api/public/orders/${created.statusToken}`)).json();
    expect(view).toMatchObject({ status: 'preparing', tableNumber: '4', reference: created.reference });
  });
});

describe('menu', () => {
  it('hides dishes staff made invisible and keeps sold-out ones visible but unavailable', async () => {
    const staff = await t.login();
    const soup = item('Soupe de poisson');
    const juice = item('Jus d’orange pressé');
    await staff('PATCH', `/api/staff/menu/items/${soup.id}`, { available: false });
    await staff('PATCH', `/api/staff/menu/items/${juice.id}`, { visible: false });
    const fresh: PublicMenu = (await t.app.inject('/api/public/menu')).json();
    const all = fresh.categories.flatMap((c) => c.items);
    expect(all.find((i) => i.id === soup.id)?.available).toBe(false);
    expect(all.find((i) => i.id === juice.id)).toBeUndefined();
  });

  it('supports conditional requests (ETag)', async () => {
    const first = await t.app.inject('/api/public/menu');
    const etag = first.headers.etag as string;
    const second = await t.app.inject({ url: '/api/public/menu', headers: { 'if-none-match': etag } });
    expect(second.statusCode).toBe(304);
  });

  it('keeps option ids stable when a dish is edited', async () => {
    const staff = await t.login();
    const steak = item('Entrecôte grillée');
    const staffMenu = (await staff('GET', '/api/staff/menu')).json();
    const full = staffMenu.categories.flatMap((c: { items: unknown[] }) => c.items).find((i: { id: number }) => i.id === steak.id);
    const res = await staff('PUT', `/api/staff/menu/items/${steak.id}`, { ...full, priceCents: 18000 });
    expect(res.statusCode).toBe(200);
    const after = (await t.app.inject('/api/public/menu')).json() as PublicMenu;
    const edited = after.categories.flatMap((c) => c.items).find((i) => i.id === steak.id)!;
    expect(edited.priceCents).toBe(18000);
    expect(edited.optionGroups.flatMap((g) => g.options.map((o) => o.id))).toEqual(
      steak.optionGroups.flatMap((g) => g.options.map((o) => o.id)),
    );
  });

  it('removes the sample menu in one step', async () => {
    const staff = await t.login();
    expect((await t.app.inject('/api/public/site')).json().demoMenu).toBe(true);
    await staff('POST', '/api/staff/menu/demo/remove');
    expect((await t.app.inject('/api/public/menu')).json().categories).toHaveLength(0);
    expect((await t.app.inject('/api/public/site')).json().demoMenu).toBe(false);
  });
});
