import { restaurant } from '@content/restaurant';
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { hasPhoto, IllustrationNote, isIllustration, Photo, photoMotion, PhotoPlaceholder, SocialIcon, type PlaceholderIcon, type PhotoTone } from '@/components/brand';
import { cn, IconButton } from '@/components/ui';
import { useI18n } from '@/i18n';
import { revealIn, useMotion } from '@/lib/motion';

/**
 * Editorial mosaic, in groups of four, read in the same order on every screen (the numbers, the lightbox
 * and the keyboard all follow `restaurant.gallery`). Phones (2 columns): a wide photo, two portraits side
 * by side (the second set lower), a wide cinematic strip. Desktop (12 columns): a large landscape and a
 * portrait set lower on the right, then a portrait tucked up under the landscape and a cinematic strip.
 * `frame` sizes the tile, `drift` is its extra scroll speed (px) for depth.
 */
const TILES: { cell: string; frame: string; drift: number; halfOnPhone?: boolean }[] = [
  {
    cell: 'col-span-2 md:col-span-7 md:col-start-1',
    frame: 'aspect-[16/10] md:aspect-[3/2]',
    drift: 0,
  },
  {
    cell: 'md:col-span-4 md:col-start-9 md:mt-[28%]',
    frame: 'aspect-[4/5]',
    drift: 50,
    halfOnPhone: true,
  },
  {
    cell: 'max-md:mt-12 md:col-span-4 md:col-start-2 md:-mt-[30%]',
    frame: 'aspect-[4/5]',
    drift: 30,
    halfOnPhone: true,
  },
  {
    cell: 'col-span-2 md:col-span-6 md:col-start-7 md:mt-[14%]',
    frame: 'aspect-[2/1]',
    drift: 60,
  },
];
/** Sizes hint per tile for the responsive images. */
const SIZES = ['(min-width: 768px) 56vw, 100vw', '(min-width: 768px) 32vw, 50vw', '(min-width: 768px) 32vw, 50vw', '(min-width: 768px) 48vw, 100vw'];
const PLACEHOLDERS: { icon: PlaceholderIcon; tone: PhotoTone }[] = [
  { icon: 'table', tone: 'dark' },
  { icon: 'fish', tone: 'warm' },
  { icon: 'drink', tone: 'light' },
  { icon: 'shell', tone: 'dark' },
];

/** "https://www.instagram.com/bandb.park.kenitra/" → "@bandb.park.kenitra". */
function instagramHandle(url: string): string | null {
  try {
    const user = new URL(url).pathname.split('/').find(Boolean);
    return user ? `@${user}` : null;
  } catch {
    return null;
  }
}

function Lightbox({ index, onClose, onMove }: { index: number | null; onClose: () => void; onMove: (i: number) => void }) {
  const { t, loc } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const touchX = useRef<number | null>(null);
  const photos = restaurant.gallery;
  const open = index !== null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') onMove((index! + 1) % photos.length);
      if (e.key === 'ArrowLeft') onMove((index! - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, onMove, photos.length]);

  const current = index !== null ? photos[index] : null;
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={t.gallery.title}
      className="m-0 h-dvh max-h-none w-full max-w-none border-0 bg-ink-950/95 p-0 text-cream-50 backdrop:bg-ink-950/80"
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null || index === null) return;
        if (end - start < -50) onMove((index + 1) % photos.length);
        if (end - start > 50) onMove((index - 1 + photos.length) % photos.length);
      }}
    >
      {current && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-cream-100/70 tabular">
              {index! + 1} / {photos.length}
            </span>
            <IconButton label={t.gallery.close} onClick={onClose} className="hover:bg-cream-50/10">
              <X className="size-6" />
            </IconButton>
          </div>
          <figure className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-6">
            <div className="relative min-h-0 w-full max-w-5xl flex-1 overflow-hidden rounded-2xl">
              <Photo name={current.photo} alt={loc(current.alt)} sizes="100vw" imgClassName="object-contain" />
            </div>
            <figcaption className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-sm text-cream-100/80">
              {loc(current.alt)}
              {isIllustration(current.photo) && <IllustrationNote corner={null} />}
            </figcaption>
          </figure>
          <div className="absolute inset-y-0 left-2 hidden items-center md:flex">
            <IconButton label={t.gallery.previous} onClick={() => onMove((index! - 1 + photos.length) % photos.length)} className="bg-cream-50/10 hover:bg-cream-50/20">
              <ChevronLeft className="size-6" />
            </IconButton>
          </div>
          <div className="absolute inset-y-0 right-2 hidden items-center md:flex">
            <IconButton label={t.gallery.next} onClick={() => onMove((index! + 1) % photos.length)} className="bg-cream-50/10 hover:bg-cream-50/20">
              <ChevronRight className="size-6" />
            </IconButton>
          </div>
        </div>
      )}
    </dialog>
  );
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function Gallery() {
  const { t, loc } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const photos = restaurant.gallery.filter((g) => hasPhoto(g.photo));
  const preview = restaurant.status === 'preview';
  const instagram = restaurant.social.instagram;
  const handle = instagram ? instagramHandle(instagram) : null;

  useMotion(
    (m) => {
      revealIn(m, ref.current);
      photoMotion(m, ref.current);
    },
    { scope: ref },
  );

  if (photos.length === 0 && !preview) return null;
  return (
    <section ref={ref} id="galerie" className="relative overflow-hidden bg-cream-50 py-24 md:py-36" aria-labelledby="gallery-title">
      <div className="container-x">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <p className="eyebrow text-gold-600" data-reveal>
              {t.gallery.eyebrow}
            </p>
            <h2
              id="gallery-title"
              className="font-display mt-6 text-[clamp(2.7rem,7vw,5.2rem)] leading-[0.96] font-medium tracking-[-0.01em] text-ink-900"
              data-reveal
            >
              {t.gallery.title}
            </h2>
          </div>
          <div className="md:col-span-5 md:flex md:justify-end" data-reveal>
            {photos.length === 0 ? (
              <p className="max-w-sm text-sm text-taupe-500">{t.gallery.placeholder}</p>
            ) : (
              instagram && (
                <a
                  href={instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-4 rounded-full py-1.5 pr-2 text-ink-900"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink-900 text-cream-50 transition-colors duration-300 group-hover:bg-gold-500 group-hover:text-ink-950">
                    <SocialIcon name="instagram" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[11px] font-semibold tracking-[0.2em] text-taupe-500 uppercase">{t.gallery.instagram}</span>
                    {handle && <span className="font-display text-xl leading-tight">{handle}</span>}
                  </span>
                  <ArrowUpRight className="size-4 text-gold-600 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </a>
              )
            )}
          </div>
        </div>

        <div className="mt-14 space-y-3 md:mt-20 md:space-y-8">
          {photos.length > 0
            ? chunks(photos, 4).map((group, gi) => (
                <ul key={gi} className="grid grid-cols-2 gap-3 md:grid-cols-12 md:gap-x-8 md:gap-y-8">
                  {group.map((g, i) => {
                    const tile = TILES[i]!;
                    const index = restaurant.gallery.indexOf(g);
                    const illustrated = isIllustration(g.photo);
                    const alt = loc(g.alt);
                    return (
                      <li key={g.photo} className={cn(group.length === 4 ? tile.cell : 'col-span-2 md:col-span-6')}>
                        <figure data-drift={tile.drift || undefined}>
                          <button
                            type="button"
                            onClick={() => setOpen(index)}
                            className="group block w-full rounded-[1.25rem] text-left"
                            aria-label={`${t.gallery.open} — ${alt}${illustrated ? ` (${t.preview.illustration})` : ''}`}
                          >
                            <span
                              data-clip
                              data-clip-delay={(i % 2) * 0.12}
                              className={cn('relative block overflow-hidden rounded-[1.25rem] bg-ink-900', group.length === 4 ? tile.frame : 'aspect-[3/2]')}
                            >
                              <span data-parallax="6" className="absolute inset-x-0 -inset-y-[8%] block">
                                <span data-clip-zoom className="block h-full w-full">
                                  <Photo
                                    name={g.photo}
                                    alt=""
                                    sizes={SIZES[i] ?? '50vw'}
                                    imgClassName="transition-transform duration-[1.4s] ease-(--ease-out-expo) group-hover:scale-[1.05]"
                                  />
                                </span>
                              </span>
                              <span aria-hidden className="pointer-events-none absolute inset-0 bg-ink-950/0 transition-colors duration-500 group-hover:bg-ink-950/10" />
                              {illustrated && (
                                <IllustrationNote
                                  corner="bottom-left"
                                  className={cn(group.length === 4 && tile.halfOnPhone && 'max-md:gap-1 max-md:px-2 max-md:text-[8.5px] max-md:tracking-[0.06em]')}
                                />
                              )}
                            </span>
                          </button>
                          <figcaption aria-hidden className="mt-3 flex items-baseline gap-3 text-[13px] leading-snug text-taupe-600 max-md:gap-2 max-md:text-[12px]">
                            <span className="font-display shrink-0 text-[15px] text-gold-600 tabular">{String(index + 1).padStart(2, '0')}</span>
                            <span className="min-w-0 text-pretty">{alt}</span>
                          </figcaption>
                        </figure>
                      </li>
                    );
                  })}
                </ul>
              ))
            : (
                <ul className="grid grid-cols-2 gap-3 md:grid-cols-12 md:gap-8">
                  {PLACEHOLDERS.map((p, i) => (
                    <li key={i} className={TILES[i]!.cell}>
                      <div className={cn('overflow-hidden rounded-[1.25rem]', TILES[i]!.frame)}>
                        <PhotoPlaceholder icon={p.icon} tone={p.tone} label={i === 0} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      </div>
      {photos.length > 0 && <Lightbox index={open} onClose={() => setOpen(null)} onMove={setOpen} />}
    </section>
  );
}
