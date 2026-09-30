import { expect, test, type Page } from '@playwright/test';
import jsQR from 'jsqr';
import sharp from 'sharp';
import type { PublicMenu, PublicSite, ReservationCreated, TableResolved } from '../../shared/api-types';
import { ADMIN, bookableDates, staff, trackErrors, uniquePhone } from './helpers';

async function signIn(page: Page) {
  await page.goto('/staff');
  await expect(page).toHaveURL(/\/staff\/login/);
  await page.getByLabel('E-mail').fill(ADMIN.email);
  await page.getByLabel('Mot de passe').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Réservations' })).toBeVisible();
}

test.describe('Staff dashboard', () => {
  test('is protected by a login', async ({ page, request }) => {
    const res = await request.get('/api/staff/reservations');
    expect(res.status()).toBe(401);
    await page.goto('/staff/orders');
    await expect(page).toHaveURL(/\/staff\/login/);
    await page.getByLabel('E-mail').fill(ADMIN.email);
    await page.getByLabel('Mot de passe').fill('wrong-password');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText('E-mail ou mot de passe incorrect.')).toBeVisible();
  });

  test('confirms a reservation request and assigns a table', async ({ page, request }) => {
    const errors = trackErrors(page);
    const [date] = await bookableDates(request, 2);
    const created = (await (
      await request.post('/api/public/reservations', {
        headers: { 'idempotency-key': `e2e-staff-${Date.now()}-abcdef` },
        data: { name: 'Karim Staff', phone: uniquePhone(), date, time: '12:30', partySize: 2, lang: 'fr' },
      })
    ).json()) as ReservationCreated;
    expect(created.status).toBe('pending');

    await signIn(page);
    await page.getByRole('tab', { name: /À confirmer/ }).click();
    const card = page.getByTestId('staff-reservation').and(page.locator(`[data-reference="${created.reference}"]`));
    await expect(card).toBeVisible();
    await expect(card).toContainText('Karim Staff');

    const api = await staff(request);
    const t5 = await api.table('5');
    await card.getByLabel('Table').selectOption(String(t5.id));
    await card.getByRole('button', { name: 'Confirmer' }).click();
    await expect(card).toHaveCount(0); // leaves the "to confirm" list

    const guestView = (await (await request.get(`/api/public/reservations/${created.statusToken}`)).json()) as { status: string };
    expect(guestView.status).toBe('confirmed');
    expect(errors).toEqual([]);
  });

  test('shows new table orders live and moves them through the kitchen', async ({ page, request }) => {
    await signIn(page);
    await page.getByRole('link', { name: /Commandes/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Commandes' })).toBeVisible();

    const table = (await (await request.get('/api/public/tables/resolve?number=9')).json()) as TableResolved;
    const menu = (await (await request.get('/api/public/menu')).json()) as PublicMenu;
    const fondant = menu.categories.flatMap((c) => c.items).find((i) => i.name === 'Fondant au chocolat')!;
    const res = await request.post('/api/public/orders', {
      headers: { 'idempotency-key': `e2e-live-${Date.now()}-abcdef` },
      data: { tableCode: table.code, items: [{ menuItemId: fondant.id, quantity: 2 }] },
    });
    expect(res.status()).toBe(201);
    const { statusToken } = (await res.json()) as { statusToken: string };

    // Arrives through the live event stream, without reloading.
    const card = page.locator('[data-testid="staff-order"][data-table="9"]');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('2 × Fondant au chocolat');
    await card.getByTestId('order-next').click();
    await expect(card).toHaveAttribute('data-status', 'preparing');

    const guest = (await (await request.get(`/api/public/orders/${statusToken}`)).json()) as { status: string };
    expect(guest.status).toBe('preparing');
  });

  test('marking a dish sold out updates the public menu', async ({ page, request }) => {
    await signIn(page);
    await page.goto('/staff/menu');
    const row = page.getByTestId('staff-menu-item').filter({ hasText: 'Salade de fruits frais' });
    await row.getByRole('switch').click();
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    const menu = (await (await request.get('/api/public/menu')).json()) as PublicMenu;
    expect(menu.categories.flatMap((c) => c.items).find((i) => i.name === 'Salade de fruits frais')!.available).toBe(false);
    await row.getByRole('switch').click();
    await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  test('each table QR code encodes that table’s link', async ({ page, request }) => {
    await signIn(page);
    await page.goto('/staff/tables');
    const api = await staff(request);
    const t8 = await api.table('8');
    await page.getByTestId('staff-table').filter({ hasText: /^8/ }).getByRole('button', { name: 'QR code' }).click();
    const image = page.getByRole('dialog').getByTestId('qr-image');
    await expect(image).toBeVisible();
    const src = (await image.getAttribute('src'))!;
    const svg = decodeURIComponent(src.slice(src.indexOf(',') + 1));
    const { data, info } = await sharp(Buffer.from(svg)).resize(600).flatten({ background: '#ffffff' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    expect(decoded?.data).toBe(`${new URL(page.url()).origin}/t/${t8.code}`);
    await expect(page.getByRole('dialog').getByTestId('qr-link')).toHaveText(decoded!.data);
  });

  test('booking settings saved in the dashboard apply to the public site', async ({ page, request }) => {
    await signIn(page);
    await page.goto('/staff/settings');
    const approval = page.getByRole('switch', { name: 'Confirmation manuelle par l’équipe' });
    await expect(approval).toHaveAttribute('aria-checked', 'true');
    await approval.click();
    await page.getByRole('button', { name: 'Enregistrer' }).first().click();
    await expect(page.getByText('Modifications enregistrées')).toBeVisible();
    let site = (await (await request.get('/api/public/site')).json()) as PublicSite;
    expect(site.booking.requireApproval).toBe(false);

    await approval.click();
    await page.getByRole('button', { name: 'Enregistrer' }).first().click();
    await expect.poll(async () => ((await (await request.get('/api/public/site')).json()) as PublicSite).booking.requireApproval).toBe(true);
    site = (await (await request.get('/api/public/site')).json()) as PublicSite;
    expect(site.booking.requireApproval).toBe(true);
  });
});
