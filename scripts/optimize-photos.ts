/**
 * Turns the restaurant's photos in content/photos/ into optimised, responsive
 * images in public/photos/ (AVIF + WebP + JPEG at several widths) and writes a
 * manifest used by the <Photo> component. Run automatically by `npm run dev`
 * and `npm run build`; safe to run repeatedly (unchanged photos are skipped).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = path.resolve('content/photos');
const OUT = path.resolve('public/photos');
const MANIFEST = path.resolve('src/generated/photos.json');
const WIDTHS = [480, 960, 1600, 2400];
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
    const base = file.replace(EXT, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const prev = previous[file];
    if (prev && prev.mtime === mtime && fs.existsSync(path.join(OUT, `${base}-${prev.widths[0]}.webp`))) {
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
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
