import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { badRequest } from '../errors';
import { newImageKey } from '../lib/util';

/** Widths generated for every dish photo (served as WebP). */
export const MENU_IMAGE_WIDTHS = [480, 960, 1440] as const;
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'tiff', 'heif']);

/**
 * Validates an uploaded photo by decoding it (the browser-supplied type is not
 * trusted), fixes its orientation, strips metadata (including GPS) and writes
 * responsive WebP versions. Returns the image key stored on the dish.
 */
export async function processMenuImage(buffer: Buffer, uploadsDir: string): Promise<string> {
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
  const dir = path.join(uploadsDir, 'menu');
  await fs.mkdir(dir, { recursive: true });
  await Promise.all(
    MENU_IMAGE_WIDTHS.map((width) =>
      sharp(buffer, { limitInputPixels: 60_000_000 })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(path.join(dir, `${key}-${width}.webp`)),
    ),
  );
  return key;
}

export async function deleteMenuImage(key: string, uploadsDir: string): Promise<void> {
  if (!/^[a-z0-9-]{6,64}$/.test(key)) return;
  await Promise.all(
    MENU_IMAGE_WIDTHS.map((w) => fs.rm(path.join(uploadsDir, 'menu', `${key}-${w}.webp`), { force: true })),
  );
}
