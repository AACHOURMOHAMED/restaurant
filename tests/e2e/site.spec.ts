import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, trackErrors } from './helpers';

test.describe('Public website on a phone', () => {
  test('hero, menu navigation, filters, dish details and visit info work', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('B&B');
    await expect(page.getByRole('link', { name: 'Réserver une table' }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('region', { name: 'B&B Park' }).getByRole('button', { name: 'Voir la carte' }).click(); // the hero's
    await expect(page.getByRole('heading', { name: 'Notre carte' })).toBeInViewport();
    await expect(page.getByText('Menu d’exemple pour la démonstration').first()).toBeVisible();

    // Category tabs.
    await page.getByRole('tab', { name: 'Desserts' }).click();
    await expect(page.locator('#menu h3')).toHaveText(['Desserts']);
    await page.getByRole('tab', { name: 'Tout' }).click();

    // Dietary filter + search.
    await page.getByRole('button', { name: 'Régimes & allergènes' }).click();
    await page.getByRole('button', { name: 'Végan' }).click();
    const dishes = page.locator('#menu .dish-row');
    await expect(dishes.first()).toBeVisible();
    for (const name of await dishes.locator('h4').allTextContents()) {
      expect(['Salade marocaine', 'Salade de fruits frais', 'Thé à la menthe', 'Jus d’orange pressé', 'Eau minérale']).toContain(name);
    }
    await page.getByRole('button', { name: 'Végan' }).click();
    await page.getByRole('searchbox', { name: 'Rechercher un plat' }).fill('tajine');
    await expect(dishes).toHaveCount(2);

    // Dish details with dietary labels.
    await dishes.first().getByRole('button').first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: /Tajine/ })).toBeVisible();
    await expect(sheet.getByText('Sans gluten')).toBeVisible();
    await sheet.getByRole('button', { name: 'Fermer' }).click();
    await expect(sheet).toBeHidden();

    // Visit information.
    await expect(page.getByRole('link', { name: 'Itinéraire' })).toHaveAttribute('href', /google\.com\/maps/);
    await expect(page.locator('a[href="tel:+212537370624"]').first()).toBeAttached();
    await expect(page.getByRole('heading', { name: 'Horaires d’ouverture' })).toBeVisible();
    await expect(page.locator('#infos')).toContainText('Vendredi');
    expect(errors).toEqual([]);
  });

  test('a prominent reservation button follows the guest on mobile', async ({ page }) => {
    await page.goto('/');
    await page.mouse.wheel(0, 1600);
    const bar = page.locator('a[href="/reservation"]').filter({ hasText: 'Réserver une table' }).last();
    await expect(bar).toBeInViewport();
    const box = (await bar.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y + box.height).toBeGreaterThan(viewport.height - 120); // anchored to the bottom of the screen
    expect(box.height).toBeGreaterThanOrEqual(44); // comfortable touch target
  });

  test('English version, remembered after reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('group', { name: 'Langue' }).first().getByRole('button', { name: 'en' }).click();
    await expect(page.getByRole('link', { name: 'Reserve a table' }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Reserve a table' }).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('scroll animations reveal sections as they come into view', async ({ page }) => {
    await page.goto('/');
    const heading = page.locator('#infos [data-reveal]').first();
    await expect.poll(() => heading.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.5);
    await heading.scrollIntoViewIfNeeded();
    await expect.poll(() => heading.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 5000 }).toBe(1);
  });

  test('pages never scroll sideways on a phone', async ({ page }) => {
    for (const path of ['/', '/reservation', '/table', '/order', '/reservation/unknown-token-0000000000000', '/staff/login', '/nope']) {
      await page.goto(path);
      await page.waitForTimeout(400);
      await expectNoHorizontalOverflow(page);
    }
  });
});

test.describe('Reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('everything is visible immediately, without animations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const hidden = await page.locator('[data-reveal], [data-stagger] > *').evaluateAll((els) =>
      els.filter((el) => Number(getComputedStyle(el).opacity) < 1 || getComputedStyle(el).visibility === 'hidden').length,
    );
    expect(hidden).toBe(0);
  });
});
