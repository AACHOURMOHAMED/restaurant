import { expect, test, type Page } from '@playwright/test';

/** The menu API answers like a server whose database is down. */
const breakMenu = (page: Page) =>
  page.route('**/api/public/menu', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"INTERNAL","message":"down"}}' }),
  );

test.describe('Menu fallback when the database is down', () => {
  test('a first-time visitor sees the backup menu, labelled as such, with its dish photos', async ({ page }) => {
    await breakMenu(page);
    await page.goto('/#menu');

    const notice = page.getByTestId('menu-offline');
    await expect(notice).toContainText('Impossible de joindre notre carte');
    await expect(notice).toContainText('ce ne sont pas les plats ni les prix de B&B Park');
    await expect(page.locator('#menu .dish-row h4', { hasText: 'Paella de la mer' })).toBeVisible();

    // Dish photos are built into the site, so they show without the server's photo store.
    const photo = page.locator('#menu img[src*="/photos/menu/poisson-grille-du-jour-"]').first();
    await expect(photo).toBeAttached();
    expect(await photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    // Back online: "Réessayer" brings the live menu and the notice goes away.
    await page.unroute('**/api/public/menu');
    await notice.getByRole('button', { name: 'Réessayer' }).click();
    await expect(notice).toBeHidden();
    await expect(page.locator('#menu .dish-row h4', { hasText: 'Paella de la mer' })).toBeVisible();
  });

  test('a returning visitor sees the last menu loaded on their device', async ({ page }) => {
    await page.goto('/#menu');
    await expect(page.locator('#menu .dish-row').first()).toBeVisible();

    await breakMenu(page);
    await page.reload();
    await expect(page.getByTestId('menu-offline')).toContainText('dernière version consultée sur cet appareil');
    await expect(page.locator('#menu .dish-row h4', { hasText: 'Tajine de poisson' })).toBeVisible();
  });

  test('ordering stays off while a fallback menu is shown', async ({ page }) => {
    await breakMenu(page);
    await page.goto('/order');
    await expect(page.getByTestId('menu-offline')).toContainText('La commande en ligne reprendra');
    await expect(page.getByText('Thé à la menthe').first()).toBeAttached();
    await expect(page.getByRole('button', { name: /^Ajouter Thé à la menthe/ })).toHaveCount(0);
  });
});
