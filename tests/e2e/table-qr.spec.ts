import { chromium, devices, expect, test } from '@playwright/test';
import type { StaffOrder } from '../../shared/api-types';
import { BASE, expectNoHorizontalOverflow, staff, trackErrors, writeQrVideo } from './helpers';

test.describe('At the restaurant — table-specific QR code', () => {
  test('the QR code opens the menu with "Table 8"; the guest confirms and orders', async ({ page, request }) => {
    const errors = trackErrors(page);
    const api = await staff(request);
    const t8 = await api.table('8');

    await page.goto(`/t/${t8.code}`);
    await expect(page).toHaveURL(/\/order$/);
    await expect(page.getByTestId('table-label')).toHaveText('Table 8');
    await expectNoHorizontalOverflow(page);

    // Browse and fill the cart; a dish with required options opens its detail sheet.
    await page.getByRole('button', { name: 'Ajouter Soupe de poisson' }).click();
    await page.getByRole('button', { name: 'Ajouter Entrecôte grillée' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('radio', { name: 'À point' }).check();
    await sheet.getByRole('button', { name: /^Ajouter · / }).click();
    await expect(sheet).toBeHidden();

    await page.getByTestId('cart-bar').click();
    const cart = page.getByRole('dialog');
    await expect(cart.getByTestId('cart-line')).toHaveCount(2);
    await expect(cart.getByTestId('cart-total')).toHaveText(/215\s?DH/);

    // The order cannot be sent until the guest confirms the table.
    await expect(cart.getByTestId('send-order')).toBeDisabled();
    await cart.getByRole('button', { name: /Oui, c.est ma table/ }).click();
    await expect(page.getByTestId('table-pill')).toHaveText('Table 8');

    // Quantities, notes and the reviewed total.
    await cart.getByTestId('cart-line').filter({ hasText: 'Soupe de poisson' }).getByRole('button', { name: 'Augmenter la quantité' }).click();
    await expect(cart.getByTestId('cart-total')).toHaveText(/260\s?DH/);
    await cart.getByLabel('Instructions pour la cuisine — Entrecôte grillée').fill('Sauce à part');
    await cart.getByTestId('send-order').click();

    await expect(page).toHaveURL(/\/order\/[\w-]{20,}$/);
    await expect(page.getByTestId('order-sent')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Table 8' })).toBeVisible();
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'received');

    // The kitchen sees the order with the right table and updates it; the guest sees the new status.
    const orders = await api.get<StaffOrder[]>('/api/staff/orders?scope=open');
    const order = orders.find((o) => o.tableNumber === '8' && o.totalCents === 26000)!;
    expect(order.lines.map((l) => [l.quantity, l.name, l.note])).toEqual([
      [2, 'Soupe de poisson', null],
      [1, 'Entrecôte grillée', 'Sauce à part'],
    ]);
    await api.patch(`/api/staff/orders/${order.id}`, { status: 'preparing' });
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'preparing', { timeout: 15_000 });
    expect(errors).toEqual([]);
  });

  test('the guest can change the table suggested by the QR code', async ({ page, request }) => {
    const api = await staff(request);
    const t8 = await api.table('8');
    await page.goto(`/t/${t8.code}`);
    await page.getByRole('button', { name: 'Changer' }).click();
    await expect(page).toHaveURL(/\/table$/);
    await page.getByLabel('Numéro de table').fill('5');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page).toHaveURL(/\/order$/);
    await expect(page.getByTestId('table-pill')).toHaveText('Table 5');
    await expect(page.getByTestId('table-label')).toHaveCount(0);
  });

  test('an unknown or replaced QR code asks for the table number instead', async ({ page }) => {
    await page.goto('/t/notarealcode');
    await expect(page.getByText('Ce QR code n’est plus valide. Saisissez le numéro indiqué sur votre table.')).toBeVisible();
    await page.getByLabel('Numéro de table').fill('3');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByTestId('table-pill')).toHaveText('Table 3');
  });

  test('a general restaurant QR code (no table) asks the guest to enter the table number', async ({ page }) => {
    await page.goto('/table?src=qr');
    await expect(page.getByText('Saisissez le numéro indiqué sur votre table pour commencer.')).toBeVisible();
    await expect(page.getByLabel('Numéro de table')).toBeVisible();
  });
});

test.describe('In-site QR scanner (real camera pipeline with a fake camera feed)', () => {
  async function launchWithCamera(video: string) {
    const browser = await chromium.launch({
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
    });
    const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'fr-FR', permissions: ['camera'], baseURL: BASE });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const w = window as unknown as { __cameraRequests: number };
      w.__cameraRequests = 0;
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (constraints) => {
        w.__cameraRequests++;
        return original(constraints);
      };
    });
    return { browser, page };
  }
  const cameraRequests = (page: import('@playwright/test').Page) =>
    page.evaluate(() => (window as unknown as { __cameraRequests: number }).__cameraRequests);

  test('asks for the camera only after "Scan" is tapped, then identifies the table', async ({ request }, testInfo) => {
    const api = await staff(request);
    const t8 = await api.table('8');
    const video = testInfo.outputPath('table-8.y4m');
    writeQrVideo(`${BASE}/t/${t8.code}`, video);
    const { browser, page } = await launchWithCamera(video);
    try {
      await page.goto('/table');
      await expect(page.getByRole('button', { name: /Scanner le QR code de ma table/ })).toBeVisible();
      expect(await cameraRequests(page)).toBe(0);
      await page.getByRole('button', { name: /Scanner le QR code de ma table/ }).click();
      await expect(page).toHaveURL(/\/order$/, { timeout: 20_000 });
      await expect(page.getByTestId('table-label')).toHaveText('Table 8');
      expect(await cameraRequests(page)).toBe(1);
    } finally {
      await browser.close();
    }
  });

  test('refuses QR codes that point to another website', async ({}, testInfo) => {
    const video = testInfo.outputPath('foreign.y4m');
    writeQrVideo('https://evil.example.com/t/abcdefgh', video);
    const { browser, page } = await launchWithCamera(video);
    try {
      await page.goto('/table');
      await page.getByRole('button', { name: /Scanner le QR code de ma table/ }).click();
      await expect(page.getByText('Ce QR code ne provient pas de B&B Park. Par sécurité, il n’a pas été ouvert.')).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveURL(/\/table$/);
      // Manual entry is always available as a fallback.
      await page.getByRole('button', { name: 'Saisir le numéro à la place' }).click();
      await expect(page.getByLabel('Numéro de table')).toBeVisible();
    } finally {
      await browser.close();
    }
  });
});
