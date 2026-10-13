import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, trackErrors } from './helpers';

/** Where the "L'atelier" section sits on the page. */
const geometry = (page: Page) =>
  page.locator('#atelier').evaluate((el: HTMLElement) => ({
    top: el.getBoundingClientRect().top + window.scrollY,
    height: el.offsetHeight,
    vh: window.innerHeight,
  }));

const scrollToY = (page: Page, y: number) => page.evaluate((top) => window.scrollTo(0, top), y);

/** cos(lid angle): 1 when the lid lies closed over the box, negative while it stands open. */
const lidCos = (page: Page) => page.locator('[data-atelier-lid]').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m22);

const opacity = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => Number(getComputedStyle(el).opacity));

test.describe('L’atelier: a pizza made, baked and boxed while scrolling', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the stage stays above the action bar; at the end the box is closed and the CTA leads to the menu', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    const section = page.locator('#atelier');

    // The drawings are a lazy chunk, fetched as the section approaches.
    let g = await geometry(page);
    await scrollToY(page, g.top - g.vh);
    await expect(section.locator('[data-atelier-pizza] svg')).toBeAttached();
    g = await geometry(page);
    expect(g.height).toBeGreaterThan(3 * g.vh); // a long, scroll-driven section

    // Mid-way (seafood step): the whole stage is on screen, between the header and the bottom action bar.
    await scrollToY(page, g.top + 0.45 * (g.height - g.vh));
    await expect.poll(() => opacity(page, '[data-step="3"]'), { timeout: 8000 }).toBe(1);
    const stage = (await section.locator('[data-atelier-stage] > div').boundingBox())!;
    const header = (await page.locator('header.fixed').boundingBox())!;
    const bar = (await page.locator('a[href="/reservation"]').filter({ hasText: 'Réserver une table' }).last().boundingBox())!;
    expect(stage.width).toBeGreaterThan(200);
    expect(stage.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(stage.y + stage.height).toBeLessThanOrEqual(bar.y - 6);

    // Into the box: the lid stands open, nothing spills sideways.
    await scrollToY(page, g.top + 0.79 * (g.height - g.vh));
    await expect.poll(() => lidCos(page), { timeout: 8000 }).toBeLessThan(-0.3);
    await expectNoHorizontalOverflow(page);

    // The end: lid closed, box shown, last step and the CTA visible.
    await scrollToY(page, g.top + g.height - g.vh);
    await expect.poll(() => lidCos(page), { timeout: 8000 }).toBeGreaterThan(0.99);
    await expect.poll(() => opacity(page, '[data-atelier-lid-wrap]')).toBe(1);
    await expect.poll(() => opacity(page, '[data-step="5"]')).toBe(1);
    await expect.poll(() => opacity(page, '[data-atelier-cta]')).toBe(1);
    const cta = section.getByRole('button', { name: 'Voir la carte' });
    await expect(cta).toBeInViewport();
    await expect(section.locator('[data-atelier-lid]')).toContainText('DEPUIS 2010'); // the B&B seal on the lid
    await expectNoHorizontalOverflow(page);

    await cta.click();
    await expect(page.getByRole('heading', { name: 'Notre carte' })).toBeInViewport();
    expect(errors).toEqual([]);
  });
});

test.describe('L’atelier with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a short, static composition: the pizza in its open box beside every step', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#atelier');
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator('[data-atelier-pizza] svg')).toBeVisible();

    const { height, vh } = await geometry(page);
    expect(height).toBeLessThan(2 * vh);

    const steps = section.locator('[data-step]');
    await expect(steps).toHaveCount(6);
    for (const step of await steps.all()) {
      await expect(step).toBeVisible();
      expect(await step.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
    }
    await expect(section.locator('[data-atelier-board]')).toBeHidden();
    expect(await lidCos(page)).toBeLessThan(0); // the box waits open
    await expect(section.getByRole('button', { name: 'Voir la carte' })).toBeVisible();

    // The words printed on the box follow the language.
    await page.getByRole('group', { name: 'Langue' }).first().getByRole('button', { name: 'en' }).click();
    await expect(section.locator('[data-atelier-lid]')).toContainText('SINCE 2010');
    await expect(section.getByRole('button', { name: 'See the menu' })).toBeVisible();
  });
});
