import { restaurant } from '@content/restaurant';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { hasPhoto, Photo, PhotoPlaceholder, type PlaceholderIcon } from '@/components/brand';
import { cn, IconButton } from '@/components/ui';
import { useI18n } from '@/i18n';
import { revealIn, useGSAP } from '@/lib/motion';

/** Mosaic that tiles cleanly on 2 columns (phones) and 4 columns (desktop). */
const TILE_LAYOUT = [
  'col-span-2 row-span-2',
  'col-span-1 row-span-1',
  'col-span-1 row-span-2',
  'col-span-1 row-span-1',
  'col-span-2 row-span-1',
  'col-span-2 row-span-1',
];
const PLACEHOLDERS: { icon: PlaceholderIcon; tone: 'dark' | 'warm' | 'light' }[] = [
  { icon: 'table', tone: 'dark' },
  { icon: 'fish', tone: 'warm' },
  { icon: 'drink', tone: 'light' },
  { icon: 'shell', tone: 'dark' },
  { icon: 'chef', tone: 'warm' },
  { icon: 'dessert', tone: 'light' },
];

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
            <figcaption className="mt-4 text-center text-sm text-cream-100/80">{loc(current.alt)}</figcaption>
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

export function Gallery() {
  const { t, loc } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const photos = restaurant.gallery.filter((g) => hasPhoto(g.photo));
  const preview = restaurant.status === 'preview';

  useGSAP(() => revealIn(ref.current), { scope: ref });

  if (photos.length === 0 && !preview) return null;
  return (
    <section ref={ref} id="galerie" className="bg-cream-50 py-24 md:py-32" aria-labelledby="gallery-title">
      <div className="container-x">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow text-gold-600" data-reveal>
              {t.gallery.eyebrow}
            </p>
            <h2 id="gallery-title" className="font-display mt-6 text-[clamp(2.6rem,6vw,4.4rem)] leading-none font-medium" data-reveal>
              {t.gallery.title}
            </h2>
          </div>
          {photos.length === 0 && (
            <p className="max-w-sm text-sm text-taupe-500" data-reveal>
              {t.gallery.placeholder}
            </p>
          )}
        </div>

        <ul className="mt-12 grid auto-rows-[9.5rem] grid-cols-2 gap-3 md:auto-rows-[13rem] md:grid-cols-4 md:gap-4" data-stagger>
          {photos.length > 0
            ? photos.map((g, i) => (
                <li key={g.photo} className={cn('overflow-hidden rounded-2xl', TILE_LAYOUT[i % TILE_LAYOUT.length])}>
                  <button
                    type="button"
                    onClick={() => setOpen(restaurant.gallery.indexOf(g))}
                    className="group block h-full w-full"
                    aria-label={`${t.gallery.open} — ${loc(g.alt)}`}
                  >
                    <Photo
                      name={g.photo}
                      alt={loc(g.alt)}
                      sizes="(min-width: 768px) 25vw, 50vw"
                      imgClassName="transition-transform duration-[1.2s] ease-(--ease-out-expo) group-hover:scale-[1.05]"
                    />
                  </button>
                </li>
              ))
            : PLACEHOLDERS.map((p, i) => (
                <li key={i} className={cn('overflow-hidden rounded-2xl', TILE_LAYOUT[i])}>
                  <PhotoPlaceholder icon={p.icon} tone={p.tone} label={i === 0} />
                </li>
              ))}
        </ul>
      </div>
      {photos.length > 0 && <Lightbox index={open} onClose={() => setOpen(null)} onMove={setOpen} />}
    </section>
  );
}
