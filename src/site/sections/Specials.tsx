import type { MenuItemPublic } from '@shared/api-types';
import { useMemo, useRef, useState } from 'react';
import { DishImage, iconForCategory, type PlaceholderIcon } from '@/components/brand';
import { Button, cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { usePrice } from '@/lib/format';
import { scrollToId, useReveal } from '@/lib/motion';
import { useMenu, useSite } from '@/lib/queries';
import { DishSheet } from '@/menu/DishSheet';

export function Specials() {
  const { t, pick } = useI18n();
  const price = usePrice();
  const menu = useMenu();
  const site = useSite();
  const ref = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<{ item: MenuItemPublic; icon: PlaceholderIcon } | null>(null);

  const specials = useMemo(
    () =>
      (menu.data?.categories ?? [])
        .flatMap((c) => c.items.filter((i) => i.isSpecial && i.available).map((item) => ({ item, category: c })))
        .slice(0, 3),
    [menu.data],
  );

  useReveal(ref, [specials.length]);

  if (specials.length === 0) return null;
  return (
    <section ref={ref} className="grain relative bg-ink-900 py-24 text-cream-50 md:py-32" aria-labelledby="specials-title">
      <div className="container-x">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow text-gold-400" data-reveal>
              {t.specials.eyebrow}
            </p>
            <h2 id="specials-title" className="font-display mt-6 text-[clamp(2.6rem,6vw,4.6rem)] leading-none font-medium" data-reveal>
              {t.specials.title}
            </h2>
          </div>
          <div data-reveal>
            <Button variant="outline-light" onClick={() => scrollToId('menu')}>
              {t.specials.cta}
            </Button>
          </div>
        </div>
        {site.data?.demoMenu && (
          <p className="mt-6 max-w-2xl text-sm text-gold-300/80" data-reveal>
            {t.preview.demoMenu}
          </p>
        )}
        {/* Swipeable carousel on phones, staggered three-column grid on larger screens. */}
        <ul
          className="no-scrollbar -mx-5 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 md:mx-0 md:mt-14 md:grid md:grid-cols-3 md:gap-7 md:overflow-visible md:px-0 md:pb-10"
          data-stagger
        >
          {specials.map(({ item, category }, i) => {
            const icon = iconForCategory(category.name);
            const name = pick(item.name, item.nameEn);
            return (
              <li key={item.id} className={cn('w-[82%] shrink-0 snap-center sm:w-[60%] md:w-auto', i === 1 && 'md:translate-y-10')}>
                {/* The whole card is clickable through the title button's ::after overlay, so the button is named by the dish alone. */}
                <div className="group relative grid overflow-hidden rounded-[1.75rem] bg-ink-800 ring-1 ring-cream-50/10">
                  <div className="aspect-[4/5] overflow-hidden [grid-area:1/1]">
                    <DishImage
                      image={item.image}
                      alt=""
                      icon={icon}
                      tone={i % 2 ? 'warm' : 'dark'}
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="transition-transform duration-[1.4s] ease-(--ease-out-expo) group-hover:scale-[1.06]"
                    />
                  </div>
                  {/* z-10 lifts the text above the image without making it the overlay's containing block. */}
                  <div className="z-10 self-end bg-linear-to-t from-ink-950 via-ink-950/80 to-transparent p-6 pt-28 [grid-area:1/1]">
                    <p className="text-[11px] font-semibold tracking-[0.22em] text-gold-400 uppercase">
                      {pick(category.name, category.nameEn)}
                    </p>
                    <h3 className="font-display mt-2 text-[2rem] leading-[1.05] font-medium">
                      <button
                        type="button"
                        onClick={() => setSelected({ item, icon })}
                        className="text-left outline-none after:absolute after:inset-0 after:rounded-[1.75rem] focus-visible:after:ring-2 focus-visible:after:ring-gold-400"
                      >
                        {name}
                      </button>
                    </h3>
                    {item.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-cream-100/70">
                        {pick(item.description, item.descriptionEn)}
                      </p>
                    )}
                    <p className="mt-4 text-[15px] font-semibold text-gold-300 tabular">{price(item.priceCents)}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <DishSheet item={selected?.item ?? null} icon={selected?.icon ?? 'table'} mode="browse" onClose={() => setSelected(null)} />
    </section>
  );
}
