import { expect, test } from '@playwright/test';
import type { StaffOrder } from '../../shared/api-types';
import { staff, trackErrors } from './helpers';

test.describe('At the restaurant — entering the table number', () => {
  test('from the website: enter the number shown on the table, then order', async ({ page, request }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await page.getByRole('link', { name: 'Saisir le numéro de table' }).click();
    await expect(page).toHaveURL(/\/table$/);

    await page.getByLabel('Numéro de table').fill('99');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByText('Aucune table ne porte ce numéro. Vérifiez le numéro indiqué sur votre table.')).toBeVisible();

    // What guests type is normalised: "Table 06" → table 6.
    await page.getByLabel('Numéro de table').fill('Table 06');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page).toHaveURL(/\/order$/);
    await expect(page.getByTestId('table-pill')).toHaveText('Table 6');
    await expect(page.getByTestId('table-label')).toHaveCount(0); // typed by the guest → already confirmed

    // A dish with a required choice.
    await page.getByRole('button', { name: 'Ajouter Thé à la menthe' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('radio', { name: 'Sans sucre' }).check();
    await sheet.getByRole('button', { name: 'Augmenter la quantité' }).click();
    await sheet.getByRole('button', { name: /^Ajouter · / }).click();

    await page.getByTestId('cart-bar').click();
    const cart = page.getByRole('dialog');
    await expect(cart.getByTestId('cart-total')).toHaveText(/40\s?DH/);
    await cart.getByLabel(/Remarque pour toute la commande/).fill('Deux verres, merci');
    await cart.getByTestId('send-order').click();
    await expect(page.getByTestId('order-sent')).toBeVisible();

    const api = await staff(request);
    const orders = await api.get<StaffOrder[]>('/api/staff/orders?scope=open');
    const order = orders.find((o) => o.tableNumber === '6')!;
    expect(order).toMatchObject({ note: 'Deux verres, merci', totalCents: 4000 });
    expect(order.lines[0]).toMatchObject({ quantity: 2, name: 'Thé à la menthe', options: [{ name: 'Sans sucre' }] });
    expect(errors).toEqual([]);
  });

  test('anyone can browse the menu; a valid table is only required to send the order', async ({ page }) => {
    await page.goto('/order');
    await expect(page.getByText('Vous consultez la carte. Identifiez votre table au moment de commander.')).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter Salade marocaine' }).click();
    await page.getByTestId('cart-bar').click();
    const cart = page.getByRole('dialog');
    await expect(cart.getByText('Identifiez votre table pour envoyer la commande.')).toBeVisible();
    await expect(cart.getByTestId('send-order')).toBeDisabled();
    await cart.getByLabel('Numéro de table').fill('4');
    await cart.getByRole('button', { name: 'Continuer' }).click();
    await expect(cart.getByTestId('send-order')).toBeEnabled();
    await cart.getByTestId('send-order').click();
    await expect(page.getByTestId('order-sent')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Table 4' })).toBeVisible();
  });

  test('repeated taps on "send" never create duplicate orders', async ({ page, request }) => {
    await page.goto('/table');
    await page.getByRole('button', { name: /Saisir le numéro de table/ }).click();
    await page.getByLabel('Numéro de table').fill('7');
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Ajouter Jus d’orange pressé' }).click();
    await page.getByTestId('cart-bar').click();
    const send = page.getByRole('dialog').getByTestId('send-order');
    await send.evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
      b.click();
    });
    await expect(page.getByTestId('order-sent')).toBeVisible();
    const api = await staff(request);
    const orders = await api.get<StaffOrder[]>('/api/staff/orders?scope=open');
    expect(orders.filter((o) => o.tableNumber === '7')).toHaveLength(1);
  });
});
