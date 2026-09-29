import sharp from 'sharp';
import { badRequest } from '../errors.js';
import { newImageKey } from '../lib/util.js';
import type { MediaStore } from '../storage.js';

/** Widths generated for every dish photo (served as WebP). */
export const MENU_IMAGE_WIDTHS = [480, 960, 1440] as const;
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif']);

/**
 * Validates an uploaded photo by decoding it (the browser-supplied type is not
 * trusted), fixes its orientation, strips metadata (including GPS) and stores
 * responsive WebP versions. Returns the image key stored on the dish and the base
 * URL the files are served from.
 */
export async function processMenuImage(buffer: Buffer, store: MediaStore): Promise<{ image: string; base: string }> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    meta = await sharp(buffer, { limitInputPixels: 60_000_000 }).metadata();
  } catch {
    throw badRequest('INVALID_IMAGE', 'This file is not a supported image');
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw badRequest('INVALID_IMAGE', 'Unsupported image format');
  if ((meta.width ?? 0) < 300 || (meta.height ?? 0) < 200) {
    throw badRequest('IMAGE_TOO_SMALL', 'Please upload a photo at least 300 × 200 pixels');
  }

  const key = newImageKey();
  const bases = await Promise.all(
    MENU_IMAGE_WIDTHS.map(async (width) => {
      const body = await sharp(buffer, { limitInputPixels: 60_000_000 })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      return store.put(menuImagePath(key, width), body, 'image/webp');
    }),
  );
  return { image: key, base: bases[0]! };
}

/** `menu/<key>-<width>.webp` — the client builds the same path (see DishImage). */
export const menuImagePath = (key: string, width: number) => `menu/${key}-${width}.webp`;

export async function deleteMenuImage(key: string, store: MediaStore): Promise<void> {
  if (!/^[a-z0-9-]{6,64}$/.test(key)) return;
  await store.remove(MENU_IMAGE_WIDTHS.map((w) => menuImagePath(key, w)));
}
