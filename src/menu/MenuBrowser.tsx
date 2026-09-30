import type { MenuCategoryPublic, MenuItemPublic } from '@shared/api-types';
import { Plus, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { DietaryBadges, DishImage, iconForCategory, type PlaceholderIcon } from '@/components/brand';
import { cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { usePrice } from '@/lib/format';
import { MOTION_OK, useMotion } from '@/lib/motion';
import { DishSheet } from './DishSheet';
import { filterMenu, usefulFilters, type MenuFilter } from './filters';

type Props = {
  categories: MenuCategoryPublic[];
  mode: 'browse' | 'order';
  tone?: 'light';
  onAdd?: (item: MenuItemPublic, optionIds: number[], quantity: number, note: string) => void;
  /** Quick "+" on a dish without options. */
  onQuickAdd?: (item: MenuItemPublic) => void;
  /** Heading level of category titles (dish names use the next level). */
  headingLevel?: 2 | 3;
};

function DishRow({
  item,
  icon,
  mode,
  onOpen,
  onQuickAdd,
  headingLevel,
}: {
  item: MenuItemPublic;
  icon: PlaceholderIcon;
  mode: 'browse' | 'order';
  onOpen: () => void;
  onQuickAdd?: () => void;
  headingLevel: 3 | 4;
}) {
  const DishHeading = headingLevel === 3 ? 'h3' : 'h4';
  const { t, pick } = useI18n();
  const price = usePrice();
  const name = pick(item.name, item.nameEn);
  const description = pick(item.description ?? '', item.descriptionEn);
  const needsChoice = item.optionGroups.some((g) => g.minSelect > 0);

  // The whole row opens the dish through the name button's ::after overlay: the button is named
  // by the dish alone, and the heading, price and dietary list stay readable on their own.
  return (
    <li className="dish-row group relative rounded-3xl transition-colors duration-300 hover:bg-white/70">
      <div className={cn('flex gap-4 p-2.5 sm:gap-5 sm:p-3', mode === 'order' && 'pr-16 sm:pr-16', !item.available && 'opacity-55')}>
        <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-ink-800 sm:size-24">
          <DishImage
            image={item.image}
            base={item.imageBase}
            alt=""
            icon={icon}
            sizes="96px"
            className="transition-transform duration-700 ease-(--ease-soft) group-hover:scale-[1.06]"
          />
          {item.isSpecial && (
            <span className="absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full bg-gold-400 text-ink-950 shadow-soft">
              <Star className="size-3 fill-current" aria-hidden />
              <span className="sr-only">{t.menu.special}</span>
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-baseline gap-3">
            <DishHeading className="font-display text-[1.3rem] leading-tight font-semibold text-ink-900 sm:text-[1.4rem]">
              <button
                type="button"
                onClick={onOpen}
                className="text-left outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:after:ring-2 focus-visible:after:ring-gold-500"
              >
                {name}
              </button>
            </DishHeading>
            <span className="leader hidden text-taupe-400 sm:block" aria-hidden />
            <span className="ml-auto shrink-0 text-[15px] font-semibold text-ink-800 tabular">{price(item.priceCents)}</span>
          </div>
          {description && <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-taupe-600">{description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DietaryBadges labels={item.dietary} compact />
            {!item.available && (
              <span className="rounded-full bg-ink-900 px-2 py-0.5 text-[10.5px] font-bold tracking-[0.12em] text-cream-50 uppercase">
                {t.menu.soldOut}
              </span>
            )}
          </div>
        </div>
      </div>
      {mode === 'order' && item.available && (
        <button
          type="button"
          onClick={needsChoice || !onQuickAdd ? onOpen : onQuickAdd}
          aria-label={`${t.order.add} ${name}`}
          className="absolute top-1/2 right-3 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink-900 text-cream-50 shadow-soft transition-transform active:scale-90"
        >
          <Plus className="size-5" />
        </button>
      )}
    </li>
  );
}

export function MenuBrowser({ categories, mode, onAdd, onQuickAdd, headingLevel = 3 }: Props) {
  const CategoryHeading = headingLevel === 2 ? 'h2' : 'h3';
  const { t, pick } = useI18n();
  const [categoryId, setCategoryId] = useState<number | 'all'>('all');
  const [filters, setFilters] = useState<MenuFilter[]>([]);
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<{ item: MenuItemPublic; icon: PlaceholderIcon } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);

  const available = useMemo(() => usefulFilters(categories), [categories]);
  const visible = useMemo(() => filterMenu(categories, { categoryId, filters, query }), [categories, categoryId, filters, query]);
  const viewKey = `${categoryId}|${filters.join(',')}|${query}`;

  // Staggered entrance: on first scroll into view, then a quick cascade whenever the filters change.
  useMotion(
    ({ gsap, ScrollTrigger }) => {
      const root = listRef.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const all = Array.from(root.querySelectorAll<HTMLElement>('.dish-row'));
        if (all.length === 0) return; // menu not loaded yet — the first run is still to come
        const first = firstRun.current;
        firstRun.current = false;
        // On the first run, rows already on screen stay put (GSAP may arrive after they are painted).
        const rows = first ? all.filter((row) => row.getBoundingClientRect().top > window.innerHeight) : all;
        if (rows.length === 0) return;
        if (first) {
          gsap.set(rows, { opacity: 0, y: 26 });
          ScrollTrigger.batch(rows, {
            start: 'top 94%',
            once: true,
            onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06, overwrite: true }),
          });
        } else {
          gsap.fromTo(
            rows.slice(0, 14),
            { opacity: 0, y: 14 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.03, clearProps: 'transform' },
          );
        }
      });
    },
    { scope: listRef, deps: [viewKey, categories] },
  );

  const toggleFilter = (f: MenuFilter) => setFilters((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]));
  const chip = (active: boolean) =>
    cn(
      'h-10 shrink-0 rounded-full px-4 text-[13px] font-semibold tracking-wide whitespace-nowrap transition-colors ring-1',
      active ? 'bg-ink-900 text-cream-50 ring-ink-900' : 'bg-white/60 text-ink-700 ring-cream-300 hover:ring-taupe-300',
    );

  return (
    <div>
      {/* Category tabs + tools — sticky under the header */}
      <div className="sticky top-[var(--header-h,4.5rem)] z-20 -mx-5 bg-cream-100/92 px-5 py-3 backdrop-blur-md md:-mx-8 md:px-8">
        <div className="flex items-center gap-2">
          <div className="no-scrollbar -my-1 flex flex-1 gap-2 overflow-x-auto py-1" role="tablist" aria-label={t.menu.categories}>
            <button type="button" role="tab" aria-selected={categoryId === 'all'} className={chip(categoryId === 'all')} onClick={() => setCategoryId('all')}>
              {t.menu.all}
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={categoryId === c.id}
                className={chip(categoryId === c.id)}
                onClick={() => setCategoryId(c.id)}
              >
                {pick(c.name, c.nameEn)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            aria-controls="menu-tools"
            aria-label={t.menu.filters}
            className={cn(
              'relative flex size-10 shrink-0 items-center justify-center rounded-full ring-1 transition-colors',
              showFilters || filters.length > 0 || query ? 'bg-ink-900 text-cream-50 ring-ink-900' : 'bg-white/60 ring-cream-300',
            )}
          >
            <SlidersHorizontal className="size-4.5" />
            {filters.length > 0 && (
              <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-gold-400 text-[10px] font-bold text-ink-950">
                {filters.length}
              </span>
            )}
          </button>
        </div>
        {showFilters && (
          <div id="menu-tools" className="animate-fade-in pt-3">
            <label className="relative block">
              <span className="sr-only">{t.menu.search}</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-taupe-500" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.menu.search}
                className="h-11 w-full rounded-full bg-white/80 pr-11 pl-11 ring-1 ring-cream-300 outline-none placeholder:text-taupe-400 focus:ring-2 focus:ring-gold-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t.menu.clearSearch}
                  className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full hover:bg-ink-900/5"
                >
                  <X className="size-4" />
                </button>
              )}
            </label>
            {available.length > 0 && (
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto" role="group" aria-label={t.menu.filters}>
                {available.map((f) => (
                  <button key={f} type="button" aria-pressed={filters.includes(f)} onClick={() => toggleFilter(f)} className={chip(filters.includes(f))}>
                    {t.menu.filterLabels[f]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={listRef} className="mt-6 space-y-14">
        {visible.length === 0 && (
          <div className="rounded-3xl bg-white/60 px-6 py-12 text-center ring-1 ring-cream-200">
            <p className="text-taupe-600">{t.menu.noResults}</p>
            <button
              type="button"
              className="mt-3 text-sm font-semibold underline underline-offset-4"
              onClick={() => {
                setFilters([]);
                setQuery('');
                setCategoryId('all');
              }}
            >
              {t.menu.clearFilters}
            </button>
          </div>
        )}
        {visible.map((c) => {
          const icon = iconForCategory(c.name);
          const description = pick(c.description ?? '', c.descriptionEn);
          return (
            <section key={c.id} aria-labelledby={`cat-${c.id}`}>
              <div className="flex items-end justify-between gap-4 border-b border-ink-900/10 pb-3">
                <CategoryHeading id={`cat-${c.id}`} className="font-display text-3xl font-medium text-ink-900 md:text-[2.4rem]">
                  {pick(c.name, c.nameEn)}
                </CategoryHeading>
                <span className="pb-1.5 text-xs font-semibold tracking-[0.18em] text-taupe-500 uppercase">
                  {t.menu.dishCount(c.items.length)}
                </span>
              </div>
              {description && <p className="mt-3 text-taupe-600">{description}</p>}
              <ul className="mt-4 grid gap-x-10 gap-y-1 md:grid-cols-2">
                {c.items.map((item) => (
                  <DishRow
                    key={item.id}
                    item={item}
                    icon={icon}
                    mode={mode}
                    onOpen={() => setSelected({ item, icon })}
                    onQuickAdd={onQuickAdd ? () => onQuickAdd(item) : undefined}
                    headingLevel={headingLevel === 2 ? 3 : 4}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <DishSheet
        item={selected?.item ?? null}
        icon={selected?.icon ?? 'table'}
        mode={mode}
        onClose={() => setSelected(null)}
        onAdd={(item, optionIds, qty, note) => {
          onAdd?.(item, optionIds, qty, note);
          setSelected(null);
        }}
      />
    </div>
  );
}
