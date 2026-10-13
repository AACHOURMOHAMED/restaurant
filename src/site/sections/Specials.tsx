import type { MenuItemPublic } from '@shared/api-types';
import { ArrowUpRight } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { DietaryBadges, DishImage, iconForCategory, IllustrationNote, photoMotion, type PlaceholderIcon } from '@/components/brand';
import { Button, cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { usePrice } from '@/lib/format';
import { revealIn, scrollToId, useMotion } from '@/lib/motion';
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
  // Sample-menu photos are illustrations (see content/photos/menu), and say so.
  const demo = site.data?.demoMenu === true;

  useMotion(
    (m) => {
      revealIn(m, ref.current);
      photoMotion(m, ref.current);
      // The menu arrived and the page grew (this section and the menu below): re-measure every scroll trigger.
      if (specials.length > 0) m.ScrollTrigger.refresh();
    },
    { scope: ref, deps: [specials.length] },
  );

  if (specials.length === 0) return null;
  return (
    <section ref={ref} className="grain relative overflow-hidden bg-ink-900 pt-24 pb-16 text-cream-50 md:pt-36 md:pb-24" aria-labelledby="specials-title">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[30%] -right-[20%] h-[80vmax] w-[80vmax] rounded-full bg-[radial-gradient(closest-side,rgba(222,184,119,0.13),rgba(184,92,56,0.06)_55%,transparent_75%)]"
      />
      <div className="container-x relative">
        <div className="grid gap-8 md:grid-cols-12 md:items-end">
          <div className="md:col-span-8">
            <p className="eyebrow text-gold-400" data-reveal>
              {t.specials.eyebrow}
            </p>
            <h2
              id="specials-title"
              className="font-display mt-6 text-[clamp(2.8rem,7.5vw,5.6rem)] leading-[0.95] font-medium tracking-[-0.01em]"
              data-reveal
            >
              {t.specials.title}
            </h2>
          </div>
          <div className="flex flex-col gap-5 md:col-span-4 md:items-end md:text-right" data-reveal>
            {demo && <p className="max-w-sm text-sm leading-relaxed text-gold-200/80">{t.preview.demoMenu}</p>}
            <Button variant="outline-light" onClick={() => scrollToId('menu')} className="self-start md:self-end">
              {t.specials.cta}
            </Button>
          </div>
        </div>

        {/* Swipeable carousel on phones; on larger screens three columns, the middle one set lower. */}
        <ul
          className="no-scrollbar -mx-5 mt-14 flex snap-x snap-mandatory scroll-px-5 gap-5 overflow-x-auto px-5 pb-2 md:mx-0 md:mt-20 md:grid md:grid-cols-3 md:gap-8 md:overflow-visible md:px-0 md:pb-0 lg:gap-10"
          data-stagger
        >
          {specials.map(({ item, category }, i) => {
            const icon = iconForCategory(category.name);
            const name = pick(item.name, item.nameEn);
            const description = item.description ? pick(item.description, item.descriptionEn) : null;
            return (
              <li key={item.id} className={cn('w-[80%] shrink-0 snap-start sm:w-[56%] md:w-auto', i === 1 && 'md:mt-20')}>
                {/* The whole card opens the dish through the title button's ::after overlay; the button is named by the dish alone. */}
                <article className="group relative">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[1.6rem] bg-ink-800 ring-1 ring-cream-50/10">
                    <div data-parallax="5" className="absolute inset-x-0 -inset-y-[6%]">
                      <div className="h-full w-full transition-transform duration-[1.4s] ease-(--ease-out-expo) group-hover:scale-[1.06]">
                        <DishImage
                          image={item.image}
                          base={item.imageBase}
                          alt=""
                          icon={icon}
                          tone={i % 2 ? 'warm' : 'dark'}
                          sizes="(min-width: 768px) 30vw, 80vw"
                        />
                      </div>
                    </div>
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-ink-950/55 to-transparent" />
                    <span aria-hidden className="font-display absolute top-4 left-5 text-xl text-cream-50/90 tabular">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {demo && item.image && <IllustrationNote corner="top-right" />}
                    <span
                      aria-hidden
                      className="absolute right-4 bottom-4 flex h-11 items-center gap-2 rounded-full bg-cream-50 px-4 text-[13px] font-semibold text-ink-900 opacity-0 shadow-lift transition-[opacity,translate] duration-500 ease-(--ease-out-expo) [translate:0_0.75rem] group-focus-within:opacity-100 group-focus-within:[translate:0_0] group-hover:opacity-100 group-hover:[translate:0_0] max-md:hidden"
                    >
                      {t.specials.details}
                      <ArrowUpRight className="size-4" />
                    </span>
                  </div>
                  <div className="mt-6 px-1">
                    <p className="text-[11px] font-semibold tracking-[0.24em] text-gold-400 uppercase">{pick(category.name, category.nameEn)}</p>
                    <h3 className="font-display mt-2.5 text-[1.85rem] leading-[1.05] font-medium md:text-[2.05rem]">
                      <button
                        type="button"
                        onClick={() => setSelected({ item, icon })}
                        className="text-left outline-none after:absolute after:-inset-2 after:rounded-[1.9rem] focus-visible:after:ring-2 focus-visible:after:ring-gold-400"
                      >
                        {name}
                      </button>
                    </h3>
                    {description && <p className="mt-2.5 line-clamp-2 text-[15px] leading-relaxed text-cream-100/65">{description}</p>}
                    <div className="mt-5 flex items-center gap-4 border-t border-cream-50/10 pt-4">
                      <p className="text-[17px] font-semibold text-gold-300 tabular">{price(item.priceCents)}</p>
                      <DietaryBadges labels={item.dietary} compact tone="dark" className="ml-auto justify-end" />
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
      <DishSheet item={selected?.item ?? null} icon={selected?.icon ?? 'table'} mode="browse" onClose={() => setSelected(null)} />
    </section>
  );
}
