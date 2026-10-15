import { restaurant } from '@content/restaurant';
import type { DietaryLabel } from '@shared/constants';
import {
  Beef,
  CakeSlice,
  ChefHat,
  Coffee,
  Fish,
  Flame,
  Leaf,
  MilkOff,
  Nut,
  Salad,
  Shell,
  Sprout,
  UtensilsCrossed,
  WheatOff,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useI18n } from '@/i18n';
import { MOTION_OK, type Gsap } from '@/lib/motion';
import { BACKUP_PHOTO_BASE } from '@/lib/menuFallback';
import { useSite } from '@/lib/queries';
import { cn } from './ui';

// ─── Logo ────────────────────────────────────────────────────────────────────

/** Official logo when provided (content/restaurant.ts → logo), otherwise a typographic wordmark. */
export function Logo({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  if (restaurant.logo) {
    return <img src={restaurant.logo} alt={restaurant.name} className={cn('h-9 w-auto', className)} />;
  }
  const [first, ...rest] = restaurant.wordmark.split(' ');
  return (
    <span
      className={cn(
        'font-display inline-flex items-baseline gap-[0.35em] text-[1.6rem] leading-none font-medium tracking-[0.06em]',
        tone === 'light' ? 'text-cream-50' : 'text-ink-900',
        className,
      )}
    >
      <span>{first}</span>{' '}
      {rest.length > 0 && <span className="text-[0.62em] font-semibold tracking-[0.32em] text-gold-500">{rest.join(' ')}</span>}
    </span>
  );
}

/** Divider: hairlines either side of a small eight-pointed star (the khatam of zellige tilework). */
export function Ornament({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('flex items-center gap-3', className)}>
      <span className="h-px w-10 bg-current opacity-50" />
      <svg viewBox="0 0 24 24" className="size-[1.15rem] shrink-0" fill="none" stroke="currentColor" strokeWidth={1}>
        <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />
        <path d="M5.3 5.3h13.4v13.4H5.3Z" />
      </svg>
      <span className="h-px w-10 bg-current opacity-50" />
    </span>
  );
}

// ─── Photos ──────────────────────────────────────────────────────────────────

type PhotoEntry = { width: number; height: number; widths: number[]; base: string; placeholder: string };
const manifestModules = import.meta.glob<Record<string, PhotoEntry>>('../generated/photos.json', {
  eager: true,
  import: 'default',
});
const manifest: Record<string, PhotoEntry> = Object.values(manifestModules)[0] ?? {};

export const hasPhoto = (name: string | null | undefined) => !!name && !!manifest[name];

const PLACEHOLDER_ICONS = {
  fish: Fish,
  shell: Shell,
  salad: Salad,
  meat: Beef,
  dessert: CakeSlice,
  drink: Coffee,
  chef: ChefHat,
  table: UtensilsCrossed,
} satisfies Record<string, LucideIcon>;
export type PlaceholderIcon = keyof typeof PLACEHOLDER_ICONS;
export type PhotoTone = 'dark' | 'warm' | 'light';

// ─── Illustrative photos ─────────────────────────────────────────────────────

/**
 * True for the photos listed in `restaurant.illustrations`: AI-generated stand-ins that illustrate the
 * cuisine but are not pictures of B&B Park. Wherever one is shown, show an <IllustrationNote> with it
 * (or pass `caption` to <Photo>).
 */
export const isIllustration = (name: string | null | undefined): boolean => !!name && restaurant.illustrations.includes(name);

export type CaptionCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const CORNERS: Record<CaptionCorner, string> = {
  'top-left': 'top-3 left-3',
  'top-right': 'top-3 right-3',
  'bottom-left': 'bottom-3 left-3',
  'bottom-right': 'bottom-3 right-3',
};

/**
 * Small "Photo d'illustration" tag, absolutely positioned in `corner` of the nearest positioned ancestor
 * (`corner={null}` to place it yourself). Light text on dark glass: readable (AA) over any photo.
 */
export function IllustrationNote({
  corner = 'bottom-left',
  compact = false,
  className,
}: {
  corner?: CaptionCorner | null;
  /** Tighter lettering, for photos narrower than ~12rem. */
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        'pointer-events-none z-[3] inline-flex items-center gap-1.5 rounded-full bg-ink-950/75 px-2.5 py-[0.35rem] text-[9.5px] leading-none font-semibold tracking-[0.18em] whitespace-nowrap text-cream-50/90 uppercase ring-1 ring-cream-50/10 backdrop-blur-[6px]',
        compact && 'gap-1 px-2 text-[8.5px] tracking-[0.06em]',
        corner && ['absolute', CORNERS[corner]],
        className,
      )}
    >
      <span aria-hidden className="size-1 shrink-0 rounded-full bg-gold-400" />
      {t.preview.illustration}
    </span>
  );
}

// ─── Placeholder art ─────────────────────────────────────────────────────────

/**
 * One tile of a zellige / moucharabieh lattice — an eight-pointed star (khatam) linked to its neighbours,
 * small diamonds where four tiles meet — drawn with hairlines that stay hairlines at any size.
 */
function zelligeTile(color: string, opacity: number): string {
  const a = 12.22; // upright square of the star (the diamond has a radius of 11)
  const b = 27.78;
  const d = [
    'M20 9 31 20 20 31 9 20Z',
    `M${a} ${a}H${b}V${b}H${a}Z`,
    'M20 0V9M20 31V40M0 20H9M31 20H40',
    `M0 0 ${a} ${a}M40 0 ${b} ${a}M0 40 ${a} ${b}M40 40 ${b} ${b}`,
    'M0-4 4 0 0 4-4 0ZM40-4 44 0 40 4 36 0ZM0 36 4 40 0 44-4 40ZM40 36 44 40 40 44 36 40Z',
  ].join('');
  const stroke = `fill='none' stroke='${color}' stroke-width='1' vector-effect='non-scaling-stroke'`;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>` +
    `<path d='${d}' ${stroke} stroke-opacity='${opacity}'/>` +
    `<circle cx='20' cy='20' r='3.2' ${stroke} stroke-opacity='${(opacity * 0.75).toFixed(2)}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const PLACEHOLDER_TONES: Record<PhotoTone, { ground: string; pattern: string; medallion: string; ink: string; vignette: string }> = {
  dark: {
    ground: 'radial-gradient(120% 95% at 50% 40%, #3b2a1f 0%, #241a14 50%, #120d0a 100%)',
    pattern: zelligeTile('#deb877', 0.27),
    medallion: 'radial-gradient(circle at 50% 30%, #33251b, #16100c)',
    ink: 'text-gold-300/85',
    vignette: 'radial-gradient(closest-side, transparent 50%, rgb(13 9 7 / 0.6))',
  },
  warm: {
    ground: 'radial-gradient(120% 100% at 60% 25%, #7d4f33 0%, #4f3322 50%, #241912 100%)',
    pattern: zelligeTile('#f3e1bf', 0.24),
    medallion: 'radial-gradient(circle at 50% 30%, #613f2a, #2e1f16)',
    ink: 'text-gold-200/90',
    vignette: 'radial-gradient(closest-side, transparent 50%, rgb(20 12 8 / 0.55))',
  },
  light: {
    ground: 'radial-gradient(120% 100% at 40% 25%, #f7efe2 0%, #ebdcc4 55%, #dcc6a6 100%)',
    pattern: zelligeTile('#86673a', 0.36),
    medallion: 'radial-gradient(circle at 50% 30%, #fcf8f1, #efe3cf)',
    ink: 'text-gold-700/85',
    vignette: 'radial-gradient(closest-side, transparent 60%, rgb(134 103 58 / 0.18))',
  },
};

/** The zellige lattice as a CSS `background-image` (repeat it at any `background-size`), for decorative panels. */
export const zelligePattern = (tone: PhotoTone = 'light') => PLACEHOLDER_TONES[tone].pattern;

/**
 * Drawn stand-in wherever a photo is missing (menu thumbnails, dish sheet, specials, page photos): a fine
 * gold zellige lattice on a warm ground, with the category's icon in a small medallion. Sized in container
 * units, so it reads as well on a 56 px thumbnail as on a full-width card. The parent must give it a size.
 */
export function PhotoPlaceholder({
  icon = 'table',
  tone = 'dark',
  className,
  label = true,
  style,
}: {
  icon?: PlaceholderIcon;
  tone?: PhotoTone;
  className?: string;
  label?: boolean;
  style?: CSSProperties;
}) {
  const { t } = useI18n();
  const Icon = PLACEHOLDER_ICONS[icon];
  const look = PLACEHOLDER_TONES[tone];
  return (
    <div
      className={cn('grain relative flex h-full w-full items-center justify-center overflow-hidden [container-type:size]', look.ink, className)}
      style={{ backgroundImage: look.ground, ...style }}
      aria-hidden={!label}
    >
      {/* The lattice is centred on the medallion and fades out behind it. */}
      <div
        aria-hidden
        className="absolute inset-0 [mask-image:radial-gradient(circle_closest-side,transparent_24%,#000_64%)]"
        style={{ backgroundImage: look.pattern, backgroundSize: 'clamp(22px, 17cqmin, 64px)', backgroundPosition: 'center' }}
      />
      <div aria-hidden className="absolute inset-0" style={{ backgroundImage: look.vignette }} />
      {/* A fine frame, only where there is room for it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[clamp(0.5rem,5cqmin,1.1rem)] hidden rounded-[inherit] border border-current opacity-25 @min-[9rem]:block"
      />
      <div
        aria-hidden
        className="relative z-[2] flex aspect-square w-[clamp(1.9rem,34cqmin,6.5rem)] items-center justify-center rounded-full shadow-[0_0_0_1px_color-mix(in_srgb,currentColor_55%,transparent),0_12px_30px_-12px_rgb(0_0_0/0.6)]"
        style={{ backgroundImage: look.medallion }}
      >
        <span className="absolute inset-[9%] rounded-full border border-current opacity-30" />
        <Icon className="size-[clamp(0.9rem,46%,2.75rem)]" strokeWidth={1.1} aria-hidden />
      </div>
      {label && (
        <span className="absolute bottom-[clamp(0.6rem,7cqmin,1.4rem)] left-1/2 z-[2] hidden -translate-x-1/2 text-[10px] font-semibold tracking-[0.26em] whitespace-nowrap uppercase @min-[10rem]:block">
          {t.preview.photo}
        </span>
      )}
    </div>
  );
}

/** Restaurant photo from content/photos (responsive AVIF/WebP/JPEG), or a placeholder. */
export function Photo({
  name,
  alt,
  sizes = '100vw',
  priority = false,
  className,
  imgClassName,
  placeholderIcon,
  placeholderTone,
  caption,
}: {
  name: string | null | undefined;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  placeholderIcon?: PlaceholderIcon;
  placeholderTone?: PhotoTone;
  /** Corner for the "illustrative photo" tag, shown when the photo is one of `restaurant.illustrations`. */
  caption?: CaptionCorner;
}) {
  const entry = name ? manifest[name] : undefined;
  if (!entry) return <PhotoPlaceholder icon={placeholderIcon} tone={placeholderTone} className={className} />;
  const set = (ext: string) => entry.widths.map((w) => `/photos/${entry.base}-${w}.${ext} ${w}w`).join(', ');
  const largest = entry.widths.at(-1)!;
  const noted = !!caption && isIllustration(name);
  const picture = (
    <picture className={cn('block h-full w-full', !noted && className)}>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
      <img
        src={`/photos/${entry.base}-${largest}.jpg`}
        srcSet={set('jpg')}
        sizes={sizes}
        width={entry.width}
        height={entry.height}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        className={cn('h-full w-full object-cover', imgClassName)}
        style={{ backgroundImage: `url(${entry.placeholder})`, backgroundSize: 'cover' }}
      />
    </picture>
  );
  if (!noted) return picture;
  return (
    <span className={cn('relative block h-full w-full', className)}>
      {picture}
      <IllustrationNote corner={caption} />
    </span>
  );
}

// ─── Photo motion ────────────────────────────────────────────────────────────

/**
 * Scroll motion for the photos inside `root` (call it inside useMotion; with reduced motion nothing moves
 * and everything is shown as is). Only transform, opacity and clip-path change — no layout work.
 *  - `[data-clip]` frames are unveiled once, by a clip-path wipe (`up` | `down` | `left` | `right`), as
 *    they enter the screen — only those still below the fold, so nothing on screen blinks. Their
 *    `[data-clip-zoom]` content settles from a slight zoom. `data-clip-delay` (s) staggers them.
 *  - `[data-parallax="8"]` content drifts by ±8 % of its own height while its parent crosses the screen
 *    (make it taller than the parent, e.g. `-inset-y-[9%]`, so no edge ever shows).
 *  - `[data-drift="60"]` elements glide 60 px upwards while their parent crosses the screen (depth;
 *    from 768 px wide only, phone layouts leave no room for it).
 */
export function photoMotion({ gsap, ScrollTrigger }: Gsap, root: HTMLElement | null) {
  if (!root) return;
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    const WIPES: Record<string, string> = {
      up: 'inset(100% 0% 0% 0%)',
      down: 'inset(0% 0% 100% 0%)',
      left: 'inset(0% 100% 0% 0%)',
      right: 'inset(0% 0% 0% 100%)',
    };
    // Read every position first, then write (one style recalculation).
    const limit = window.innerHeight;
    const frames = Array.from(root.querySelectorAll<HTMLElement>('[data-clip]')).filter((el) => el.getBoundingClientRect().top > limit);
    for (const el of frames) {
      const zoom = el.querySelector<HTMLElement>('[data-clip-zoom]');
      gsap.set(el, { clipPath: WIPES[el.dataset.clip ?? ''] ?? WIPES.up });
      if (zoom) gsap.set(zoom, { scale: 1.16 });
      ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: () => {
          const delay = Number(el.dataset.clipDelay ?? 0);
          gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'power3.out', delay, clearProps: 'clipPath' });
          if (zoom) gsap.to(zoom, { scale: 1, duration: 2.2, ease: 'expo.out', delay });
        },
      });
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-parallax]')) {
      const amount = Number(el.dataset.parallax || 8);
      gsap.fromTo(
        el,
        { yPercent: -amount },
        { yPercent: amount, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: 0.6 } },
      );
    }
  });
  // Layered drift only where the layout leaves room for it (phone layouts are tighter).
  mm.add(`${MOTION_OK} and (min-width: 768px)`, () => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-drift]')) {
      const distance = Number(el.dataset.drift || 60);
      gsap.fromTo(
        el,
        { y: distance },
        { y: -distance, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: 0.6 } },
      );
    }
  });
}

// ─── Dishes ──────────────────────────────────────────────────────────────────

const CATEGORY_ICON_HINTS: [RegExp, PlaceholderIcon][] = [
  [/poisson|fish|mer|sea|crevette|prawn|fruits de mer/i, 'fish'],
  [/entrée|starter|salade|salad/i, 'salad'],
  [/viande|meat|grill/i, 'meat'],
  [/dessert|sucr/i, 'dessert'],
  [/boisson|drink|café|coffee|thé|tea/i, 'drink'],
];

export function iconForCategory(name: string | undefined): PlaceholderIcon {
  if (!name) return 'table';
  return CATEGORY_ICON_HINTS.find(([re]) => re.test(name))?.[1] ?? 'table';
}

/**
 * Dish photo uploaded from the dashboard, or a placeholder themed by category.
 * With `showLabel`, the placeholder says "photo coming soon" and, while the sample menu is shown, a sample
 * dish's photo (an illustration, see content/photos/menu) carries the "illustrative photo" tag — the parent
 * must then be positioned (`relative`).
 */
export function DishImage({
  image,
  base: imageBase,
  alt,
  sizes = '(min-width: 768px) 320px, 100vw',
  icon = 'table',
  tone = 'dark',
  className,
  priority,
  showLabel = false,
}: {
  image: string | null;
  /** Where this photo is stored (the dish's `imageBase`); defaults to the site's current photo address. */
  base?: string | null;
  alt: string;
  sizes?: string;
  icon?: PlaceholderIcon;
  tone?: PhotoTone;
  className?: string;
  priority?: boolean;
  showLabel?: boolean;
}) {
  // Photos live on this server ('/uploads') or on the photo storage's CDN (Vercel Blob).
  const site = useSite().data;
  const base = imageBase ?? site?.mediaBase;
  if (!image || !base) return <PhotoPlaceholder icon={icon} tone={tone} className={className} label={showLabel} />;
  const src = (w: number) => `${base}/menu/${image}-${w}.webp`;
  const img = (
    <img
      src={src(960)}
      srcSet={`${src(480)} 480w, ${src(960)} 960w, ${src(1440)} 1440w`}
      sizes={sizes}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('h-full w-full object-cover', className)}
    />
  );
  // Sample-menu and backup-menu photos (content/photos/menu) are illustrations.
  if (!showLabel || !(site?.demoMenu || imageBase === BACKUP_PHOTO_BASE)) return img;
  return (
    <>
      {img}
      <IllustrationNote corner="bottom-left" />
    </>
  );
}

// ─── Dietary labels ──────────────────────────────────────────────────────────

export const DIETARY_ICONS: Record<DietaryLabel, LucideIcon> = {
  vegetarian: Leaf,
  vegan: Sprout,
  gluten_free: WheatOff,
  dairy_free: MilkOff,
  spicy: Flame,
  contains_nuts: Nut,
  contains_shellfish: Shell,
};

const DIETARY_TONE: Record<DietaryLabel, string> = {
  vegetarian: 'text-olive-600 bg-olive-500/10 ring-olive-500/25',
  vegan: 'text-olive-600 bg-olive-500/10 ring-olive-500/25',
  gluten_free: 'text-gold-700 bg-gold-400/15 ring-gold-500/30',
  dairy_free: 'text-sea-500 bg-sea-500/10 ring-sea-500/25',
  spicy: 'text-terracotta-600 bg-terracotta-400/12 ring-terracotta-500/25',
  contains_nuts: 'text-ink-600 bg-ink-900/6 ring-ink-900/15',
  contains_shellfish: 'text-ink-600 bg-ink-900/6 ring-ink-900/15',
};

/** On dark surfaces the labels share one quiet gold style (the colour-coded ones are made for light backgrounds). */
const DIETARY_ON_DARK = 'text-gold-200 bg-cream-50/[0.06] ring-cream-50/15';

export function DietaryBadges({
  labels,
  compact = false,
  tone = 'light',
  className,
}: {
  labels: DietaryLabel[];
  compact?: boolean;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const { t } = useI18n();
  if (labels.length === 0) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label={t.menu.filters}>
      {labels.map((label) => {
        const Icon = DIETARY_ICONS[label];
        return (
          <li
            key={label}
            title={t.dietary[label]}
            className={cn(
              'inline-flex items-center gap-1 rounded-full ring-1 ring-inset',
              compact ? 'size-6 justify-center' : 'h-6 px-2 text-[11px] font-semibold tracking-wide',
              tone === 'dark' ? DIETARY_ON_DARK : DIETARY_TONE[label],
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden strokeWidth={1.75} />
            {compact ? <span className="sr-only">{t.dietary[label]}</span> : t.dietary[label]}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Social icons (brand marks are not part of lucide) ───────────────────────

export function SocialIcon({ name, className }: { name: 'instagram' | 'facebook' | 'tiktok' | 'tripadvisor' | 'whatsapp'; className?: string }) {
  const common = { className: cn('size-5', className), 'aria-hidden': true, viewBox: '0 0 24 24' } as const;
  switch (name) {
    case 'instagram':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.6}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'facebook':
      return (
        <svg {...common} fill="currentColor">
          <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5H16.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg {...common} fill="currentColor">
          <path d="M16.6 5.8a4.3 4.3 0 0 1-1-2.8h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 1 0 4.9 5.7V9.1a7.3 7.3 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.3-1.6z" />
        </svg>
      );
    case 'tripadvisor':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.6}>
          <circle cx="7" cy="13" r="3.5" />
          <circle cx="17" cy="13" r="3.5" />
          <path d="M3 9.5c2.5-2 5.7-3 9-3s6.5 1 9 3M12 6.5 12 9" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3zm0 16.4c-1.4 0-2.8-.4-4-1.1l-.3-.2-2.7.7.7-2.6-.2-.3A7.4 7.4 0 1 1 12 19.4zm4.1-5.5c-.2-.1-1.3-.7-1.6-.7-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6 6 0 0 1-3-2.6c-.2-.4.2-.4.6-1.2.1-.1 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.3-.6 1.5-1.1.2-.6.2-1 .1-1.1l-.4-.3z" />
        </svg>
      );
  }
}
