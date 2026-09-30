import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeApp, newKey, postReservation, reservationPayload, type TestApp } from '../helpers';

let t: TestApp;
beforeEach(async () => {
  t = await makeApp();
});
afterEach(async () => {
  await t.close();
});

describe('public site & availability', () => {
  it('exposes hours and booking rules without private data', async () => {
    const res = await t.app.inject('/api/public/site');
    expect(res.statusCode).toBe(200);
    const site = res.json();
    expect(site.timeZone).toBe('Africa/Casablanca');
    expect(site.hours['5']).toEqual([]); // Friday closed (to confirm with the restaurant)
    expect(site.booking.requireApproval).toBe(true);
    expect(site.today).toBe('2026-10-05');
  });

  it('lists bookable slots for a date', async () => {
    const res = await t.app.inject('/api/public/availability?date=2026-10-05&party=2');
    const day = res.json();
    expect(day.open).toBe(true);
    expect(day.slots[0].time).toBe('12:00'); // now 11:00 + 60 min notice
  });

  it('reports past dates and closed days', async () => {
    expect((await t.app.inject('/api/public/availability?date=2026-10-04&party=2')).json().reason).toBe('past_date');
    expect((await t.app.inject('/api/public/availability?date=2026-10-09&party=2')).json().reason).toBe('closed');
  });

  it('returns a booking calendar for the whole window', async () => {
    const cal = (await t.app.inject('/api/public/calendar?party=2')).json();
    expect(cal.today).toBe('2026-10-05');
    expect(cal.days).toHaveLength(61);
    expect(cal.days.find((d: { date: string }) => d.date === '2026-10-09')).toEqual({
      date: '2026-10-09',
      open: false,
      available: false,
      status: 'closed',
    });
    expect(cal.days[1]).toMatchObject({ date: '2026-10-06', status: 'available' });
  });
});

describe('creating reservations', () => {
  it('creates a pending request when staff approval is required', async () => {
    const res = await postReservation(t, reservationPayload());
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('pending');
    expect(body.reference).toMatch(/^R-[A-Z0-9]{6}$/);
    expect(body.firstName).toBe('Samira');
    expect(body.statusToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    // Contact details are never echoed back publicly.
    expect(res.body).not.toContain('06 12 34 56 78');
    expect(res.body).not.toContain('samira@example.com');
  });

  it('confirms instantly when approval is not required and capacity allows', async () => {
    const staff = await t.login();
    const settings = (await staff('GET', '/api/staff/settings')).json();
    await staff('PUT', '/api/staff/settings/booking', { ...settings.booking, requireApproval: false });
    const res = await postReservation(t, reservationPayload());
    expect(res.json().status).toBe('confirmed');
  });

  it('is idempotent: retrying with the same key returns the same reservation', async () => {
    const key = newKey();
    const first = await postReservation(t, reservationPayload(), key);
    const second = await postReservation(t, reservationPayload(), key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().reference).toBe(first.json().reference);
    expect(second.json().statusToken).toBe(first.json().statusToken);
    // Only a fingerprint of the key is stored: a copy of the database can't rebuild status links.
    const stored = (await t.ctx.db.one<{ k: string }>('SELECT idempotency_key AS k FROM reservations'))!;
    expect(stored.k).toBe(crypto.createHash('sha256').update(key).digest('hex'));
  });

  it('requires an idempotency key', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/public/reservations', payload: reservationPayload() });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('rejects past dates, closed days and times outside the slots', async () => {
    const past = await postReservation(t, reservationPayload({ date: '2026-10-04' }));
    expect(past.statusCode).toBe(409);
    expect(past.json().error.code).toBe('DATE_IN_PAST');

    const earlierToday = await postReservation(t, reservationPayload({ date: '2026-10-05', time: '11:30' }));
    expect(earlierToday.json().error.code).toBe('SLOT_UNAVAILABLE');

    const friday = await postReservation(t, reservationPayload({ date: '2026-10-09' }));
    expect(friday.json().error.code).toBe('CLOSED');

    const offGrid = await postReservation(t, reservationPayload({ time: '20:10' }));
    expect(offGrid.json().error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('validates fields and returns per-field error codes', async () => {
    const res = await postReservation(
      t,
      reservationPayload({ name: 'A', phone: 'abc', email: 'nope', partySize: 0, date: '2026-02-30' }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error.fields).toMatchObject({
      name: 'name_required',
      phone: 'invalid_phone',
      email: 'invalid_email',
      partySize: 'invalid_party',
      date: 'invalid_date',
    });
  });

  it('accepts a reservation without e-mail or special requests', async () => {
    const res = await postReservation(t, reservationPayload({ email: '', notes: '' }));
    expect(res.statusCode).toBe(201);
  });

  it('holds a repeated request for staff instead of refusing it', async () => {
    // Refusing would reveal whether a number has a booking; accepting blindly would double-book.
    const staff = await t.login();
    const { booking } = (await staff('GET', '/api/staff/settings')).json();
    await staff('PUT', '/api/staff/settings/booking', { ...booking, requireApproval: false });

    const first = (await postReservation(t, reservationPayload())).json();
    expect(first.status).toBe('confirmed');
    const again = await postReservation(t, reservationPayload({ phone: '+212 6 12 34 56 78' })); // same number, other format
    expect(again.statusCode).toBe(201);
    expect(again.json().status).toBe('pending');

    const list = (await staff('GET', '/api/staff/reservations?date=2026-10-06')).json().reservations;
    expect(list.find((r: { reference: string }) => r.reference === again.json().reference)).toMatchObject({
      samePhoneUpcoming: 1,
      sameSlotAs: first.reference,
    });
    // Staff find every booking of that number, whatever format it was typed in.
    expect((await staff('GET', '/api/staff/reservations?q=0612345678')).json().reservations).toHaveLength(2);
  });

  it('never refuses a guest because their number already holds bookings, but asks staff to check', async () => {
    const staff = await t.login();
    const { booking } = (await staff('GET', '/api/staff/settings')).json();
    await staff('PUT', '/api/staff/settings/booking', { ...booking, requireApproval: false });
    for (const time of ['12:00', '13:00', '19:00']) {
      expect((await postReservation(t, reservationPayload({ time }))).json().status).toBe('confirmed');
    }
    const fourth = await postReservation(t, reservationPayload({ time: '21:00' }));
    expect(fourth.statusCode).toBe(201);
    expect(fourth.json().status).toBe('pending');
  });

  it('stops accepting bookings when a slot is full', async () => {
    const staff = await t.login();
    const { booking } = (await staff('GET', '/api/staff/settings')).json();
    await staff('PUT', '/api/staff/settings/booking', { ...booking, maxCoversPerSlot: 6 });
    expect((await postReservation(t, reservationPayload({ partySize: 4 }))).statusCode).toBe(201);
    const full = await postReservation(t, reservationPayload({ partySize: 4, phone: '0700000000' }));
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe('SLOT_FULL');
    const slots = (await t.app.inject('/api/public/availability?date=2026-10-06&party=4')).json().slots;
    expect(slots.find((s: { time: string }) => s.time === '20:00').available).toBe(false);
  });
});

describe('reservation status link', () => {
  it('shows status to the guest and reflects staff confirmation', async () => {
    const created = (await postReservation(t, reservationPayload())).json();
    const view = await t.app.inject(`/api/public/reservations/${created.statusToken}`);
    expect(view.json()).toMatchObject({ status: 'pending', firstName: 'Samira', canCancel: true });
    expect(view.body).not.toContain('06 12');

    const staff = await t.login();
    const list = (await staff('GET', '/api/staff/reservations?date=2026-10-06')).json();
    const id = list.reservations[0].id;
    const upd = await staff('PATCH', `/api/staff/reservations/${id}`, { status: 'confirmed' });
    expect(upd.statusCode).toBe(200);
    expect((await t.app.inject(`/api/public/reservations/${created.statusToken}`)).json().status).toBe('confirmed');
  });

  it('lets the guest cancel an upcoming reservation', async () => {
    const created = (await postReservation(t, reservationPayload())).json();
    const res = await t.app.inject({ method: 'POST', url: `/api/public/reservations/${created.statusToken}/cancel` });
    expect(res.json()).toMatchObject({ status: 'cancelled', canCancel: false });
  });

  it('returns 404 for unknown tokens', async () => {
    const res = await t.app.inject('/api/public/reservations/this-token-does-not-exist-000000');
    expect(res.statusCode).toBe(404);
  });
});
