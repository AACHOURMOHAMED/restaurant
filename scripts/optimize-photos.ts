/**
 * Turns the restaurant's photos in content/photos/ into optimised, responsive
 * images in public/photos/ (AVIF + WebP + JPEG at several widths) and writes a
 * manifest used by the <Photo> component. Dish photos in content/photos/menu/ become
 * public/photos/menu/<key>-<width>.webp (the same layout as dashboard uploads) for the
 * backup menu (content/menu.ts). Run automatically by `npm run dev`
 * and `npm run build`; safe to run repeatedly (unchanged photos are skipped).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = path.resolve('content/photos');
const OUT = path.resolve('public/photos');
const MANIFEST = path.resolve('src/generated/photos.json');
const WIDTHS = [480, 960, 1600, 2400];
const MENU_SRC = path.join(SRC, 'menu');
const MENU_MANIFEST = path.resolve('src/generated/menu-photos.json');
const MENU_WIDTHS = [480, 960, 1440]; // server/services/images.ts → MENU_IMAGE_WIDTHS
const EXT = /\.(jpe?g|png|webp|avif|tiff?)$/i;

type Entry = { width: number; height: number; widths: number[]; base: string; placeholder: string; mtime: number };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  const previous: Record<string, Entry> = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const files = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter((f) => EXT.test(f)) : [];
  const manifest: Record<string, Entry> = {};

  for (const file of files) {
    const input = path.join(SRC, file);
    const mtime = Math.floor(fs.statSync(input).mtimeMs);
    // The content hash in the name lets browsers and CDNs cache photos forever: a new photo gets a new URL.
    const hash = crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex').slice(0, 10);
    const base = `${file.replace(EXT, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${hash}`;
    const prev = previous[file];
    if (prev && prev.base === base && fs.existsSync(path.join(OUT, `${base}-${prev.widths[0]}.webp`))) {
      manifest[file] = prev;
      continue;
    }
    const image = sharp(input).rotate();
    const meta = await image.metadata();
    const width = meta.autoOrient?.width ?? meta.width ?? 0;
    const height = meta.autoOrient?.height ?? meta.height ?? 0;
    const widths = WIDTHS.filter((w) => w < width).concat(width <= WIDTHS.at(-1)! ? [width] : []);
    const uniqueWidths = [...new Set(widths.length ? widths : [width])].sort((a, b) => a - b);
    for (const w of uniqueWidths) {
      const resized = sharp(input).rotate().resize({ width: w });
      await resized.clone().avif({ quality: 55 }).toFile(path.join(OUT, `${base}-${w}.avif`));
      await resized.clone().webp({ quality: 78 }).toFile(path.join(OUT, `${base}-${w}.webp`));
      await resized.clone().jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, `${base}-${w}.jpg`));
    }
    const tiny = await sharp(input).rotate().resize({ width: 24 }).blur(2).webp({ quality: 40 }).toBuffer();
    manifest[file] = {
      width,
      height,
      widths: uniqueWidths,
      base,
      placeholder: `data:image/webp;base64,${tiny.toString('base64')}`,
      mtime,
    };
    console.log(`photo: ${file} → ${uniqueWidths.join(', ')} px`);
  }

  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  if (files.length === 0) console.log('photos: none in content/photos yet (placeholders will be shown)');
  await menuPhotos();
}

/** Dish photos for the backup menu: { "<dish-file-name>": "<key>" }, served from /photos/menu/<key>-<width>.webp. */
async function menuPhotos() {
  const out = path.join(OUT, 'menu');
  fs.mkdirSync(out, { recursive: true });
  const files = fs.existsSync(MENU_SRC) ? fs.readdirSync(MENU_SRC).filter((f) => EXT.test(f)) : [];
  const manifest: Record<string, string> = {};
  for (const file of files) {
    const input = path.join(MENU_SRC, file);
    const name = file.replace(EXT, '');
    const hash = crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex').slice(0, 10);
    const key = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${hash}`;
    manifest[name] = key;
    if (MENU_WIDTHS.every((w) => fs.existsSync(path.join(out, `${key}-${w}.webp`)))) continue;
    for (const w of MENU_WIDTHS) {
      const resized = sharp(input).rotate().resize({ width: w, withoutEnlargement: true });
      await resized.webp({ quality: 78 }).toFile(path.join(out, `${key}-${w}.webp`));
    }
    console.log(`dish photo: ${file}`);
  }
  fs.writeFileSync(MENU_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
