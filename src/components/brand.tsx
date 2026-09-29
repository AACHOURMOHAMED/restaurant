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
      <span>{first}</span>
      {rest.length > 0 && <span className="text-[0.62em] font-semibold tracking-[0.32em] text-gold-500">{rest.join(' ')}</span>}
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

/** Art-directed stand-in shown until the restaurant's own photo is added. */
export function PhotoPlaceholder({
  icon = 'table',
  tone = 'dark',
  className,
  label = true,
  style,
}: {
  icon?: PlaceholderIcon;
  tone?: 'dark' | 'warm' | 'light';
  className?: string;
  label?: boolean;
  style?: CSSProperties;
}) {
  const { t } = useI18n();
  const Icon = PLACEHOLDER_ICONS[icon];
  const tones = {
    dark: 'bg-[radial-gradient(120%_90%_at_25%_15%,#4a3526_0%,#2a1f18_45%,#140f0c_100%)] text-gold-400/35',
    warm: 'bg-[radial-gradient(120%_100%_at_70%_10%,#8a5a3a_0%,#5a3a26_45%,#2a1d15_100%)] text-gold-300/40',
    light: 'bg-[radial-gradient(120%_100%_at_30%_20%,#f3e7d4_0%,#e6d5bc_55%,#d8c3a3_100%)] text-gold-700/35',
  };
  return (
    <div
      className={cn('grain relative flex h-full w-full items-center justify-center overflow-hidden', tones[tone], className)}
      style={style}
      aria-hidden={!label}
    >
      <div className="pointer-events-none absolute inset-3 rounded-[inherit] border border-current opacity-40" />
      <Icon className="size-[22%] max-h-16 min-h-7 max-w-16 min-w-7" strokeWidth={0.9} aria-hidden />
      {label && (
        <span className="absolute bottom-3.5 left-4 text-[10px] font-semibold tracking-[0.22em] uppercase opacity-80">
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
}: {
  name: string | null | undefined;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  placeholderIcon?: PlaceholderIcon;
  placeholderTone?: 'dark' | 'warm' | 'light';
}) {
  const entry = name ? manifest[name] : undefined;
  if (!entry) return <PhotoPlaceholder icon={placeholderIcon} tone={placeholderTone} className={className} />;
  const set = (ext: string) => entry.widths.map((w) => `/photos/${entry.base}-${w}.${ext} ${w}w`).join(', ');
  const largest = entry.widths.at(-1)!;
  return (
    <picture className={cn('block h-full w-full', className)}>
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
}

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

/** Dish photo uploaded from the dashboard, or a placeholder themed by category. */
export function DishImage({
  image,
  alt,
  sizes = '(min-width: 768px) 320px, 100vw',
  icon = 'table',
  tone = 'dark',
  className,
  priority,
  showLabel = false,
}: {
  image: string | null;
  alt: string;
  sizes?: string;
  icon?: PlaceholderIcon;
  tone?: 'dark' | 'warm' | 'light';
  className?: string;
  priority?: boolean;
  showLabel?: boolean;
}) {
  if (!image) return <PhotoPlaceholder icon={icon} tone={tone} className={className} label={showLabel} />;
  const src = (w: number) => `/uploads/menu/${image}-${w}.webp`;
  return (
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

export function DietaryBadges({ labels, compact = false, className }: { labels: DietaryLabel[]; compact?: boolean; className?: string }) {
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
              DIETARY_TONE[label],
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
