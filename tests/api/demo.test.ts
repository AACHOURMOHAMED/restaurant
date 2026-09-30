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
});
