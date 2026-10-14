import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachDemoPhotos, dishPhotoName, seedDemoMenu } from '../../server/seed/demo';
import { makeApp, type TestApp } from '../helpers';

let t: TestApp;
let photos: string;
beforeEach(async () => {
  t = await makeApp();
  photos = fs.mkdtempSync(path.join(os.tmpdir(), 'bbpark-dish-photos-'));
});
afterEach(async () => {
  await t.close();
  fs.rmSync(photos, { recursive: true, force: true });
});

const photo = (name: string) =>
  sharp({ create: { width: 900, height: 700, channels: 3, background: '#b85c38' } })
    .jpeg()
    .toFile(path.join(photos, `${dishPhotoName(name)}.jpg`));

describe('sample menu photos', () => {
  it('names photo files after the dish', () => {
    expect(dishPhotoName('Poisson grillé du jour')).toBe('poisson-grille-du-jour');
    expect(dishPhotoName('Jus d’orange pressé')).toBe('jus-d-orange-presse');
  });

  it('attaches photos to the sample dishes and removes them with the sample menu', async () => {
    await seedDemoMenu(t.ctx.db);
    await photo('Soupe de poisson');
    expect(await attachDemoPhotos(t.ctx.db, t.ctx.media!, photos)).toBe(1);
    expect(await attachDemoPhotos(t.ctx.db, t.ctx.media!, photos)).toBe(0); // already has one

    const menu = (await t.app.inject('/api/public/menu')).json();
    const soup = menu.categories.flatMap((c: { items: { name: string; image: string | null }[] }) => c.items).find((i: { name: string }) => i.name === 'Soupe de poisson');
    expect(soup.image).toMatch(/^[a-z0-9-]+$/);
    expect(soup.imageBase).toBe('/uploads'); // each photo remembers where it is stored
    const files = () => fs.readdirSync(path.join(t.ctx.config.uploadsDir, 'menu'));
    expect(files().filter((f) => f.startsWith(soup.image))).toHaveLength(3);

    const staff = await t.login();
    expect((await staff('POST', '/api/staff/menu/demo/remove')).statusCode).toBe(200);
    expect(files()).toHaveLength(0);
  });

  it('attaches the sample photos shipped in content/photos/menu when the dashboard loads the sample menu', async () => {
    const shipped = fs
      .readdirSync(path.resolve('content/photos/menu'))
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .map((f) => f.replace(/\.[^.]+$/, ''));
    expect(shipped.length).toBeGreaterThan(0);

    const staff = await t.login();
    expect((await staff('POST', '/api/staff/menu/demo/load')).statusCode).toBe(200);

    type Item = { name: string; image: string | null; imageBase: string | null };
    const items: Item[] = (await t.app.inject('/api/public/menu')).json().categories.flatMap((c: { items: Item[] }) => c.items);
    const withPhoto = items.filter((i) => i.image);
    const expected = items.filter((i) => shipped.includes(dishPhotoName(i.name)));
    expect(expected.length).toBeGreaterThan(0);
    expect(withPhoto.map((i) => i.name).sort()).toEqual(expected.map((i) => i.name).sort());
    expect(withPhoto.every((i) => i.imageBase === '/uploads')).toBe(true);
    const files = fs.readdirSync(path.join(t.ctx.config.uploadsDir, 'menu'));
    for (const dish of withPhoto) expect(files.filter((f) => f.startsWith(dish.image!))).toHaveLength(3);
  });
});

describe('sample menu without photo storage', () => {
  it('still loads the sample menu (dishes keep their placeholders)', async () => {
    await t.close();
    t = await makeApp({ media: null });
    const staff = await t.login();
    expect((await staff('POST', '/api/staff/menu/demo/load')).statusCode).toBe(200);
    const menu = (await t.app.inject('/api/public/menu')).json();
    const items = menu.categories.flatMap((c: { items: { image: string | null }[] }) => c.items);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i: { image: string | null }) => i.image === null)).toBe(true);
  });
});
