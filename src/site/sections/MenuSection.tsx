import { Info } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Notice, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import { loadGsap, useReveal } from '@/lib/motion';
import { useMenu, useSite } from '@/lib/queries';
import { MenuBrowser } from '@/menu/MenuBrowser';

export function MenuSection() {
  const { t } = useI18n();
  const menu = useMenu();
  const site = useSite();
  const ref = useRef<HTMLElement>(null);

  useReveal(ref);

  // The menu changes the page height once loaded: recompute scroll-trigger positions.
  useEffect(() => {
    if (!menu.data) return;
    const id = requestAnimationFrame(() => void loadGsap().then(({ ScrollTrigger }) => ScrollTrigger.refresh()));
    return () => cancelAnimationFrame(id);
  }, [menu.data]);

  const categories = menu.data?.categories ?? [];
  // The live menu could not be loaded: a saved or backup one is shown (see lib/menuFallback).
  const offline = menu.data?.offline;
  return (
    <section ref={ref} id="menu" className="relative bg-cream-100 py-24 md:py-32" aria-labelledby="menu-title">
      <div className="container-x">
        <div className="max-w-3xl">
          <p className="eyebrow text-gold-600" data-reveal>
            {t.menu.eyebrow}
          </p>
          <h2 id="menu-title" className="font-display mt-6 text-[clamp(2.8rem,7vw,5.4rem)] leading-[0.95] font-medium" data-reveal>
            {t.menu.title}
          </h2>
          <p className="mt-5 text-lg text-taupe-600" data-reveal>
            {t.menu.intro}
          </p>
        </div>

        {offline ? (
          <Notice tone="warn" className="mt-8 max-w-3xl" data-testid="menu-offline">
            {t.menu.offline[offline]}{' '}
            <button type="button" className="font-semibold underline underline-offset-4" onClick={() => void menu.refetch()}>
              {t.menu.retry}
            </button>
          </Notice>
        ) : (
          site.data?.demoMenu && (
            <Notice tone="warn" className="mt-8 max-w-3xl">
              {t.preview.demoMenu}
            </Notice>
          )
        )}

        <div className="mt-10">
          {menu.isPending ? (
            <div className="flex justify-center py-20 text-taupe-500">
              <Spinner label={t.menu.loading} />
            </div>
          ) : menu.isError ? (
            <div className="rounded-3xl bg-white/60 px-6 py-12 text-center ring-1 ring-cream-200">
              <p className="text-taupe-600">{t.menu.error}</p>
              <button type="button" className="mt-3 text-sm font-semibold underline underline-offset-4" onClick={() => void menu.refetch()}>
                {t.menu.retry}
              </button>
            </div>
          ) : categories.length === 0 ? (
            <p className="rounded-3xl bg-white/60 px-6 py-12 text-center text-taupe-600 ring-1 ring-cream-200">{t.menu.empty}</p>
          ) : (
            <MenuBrowser categories={categories} mode="browse" />
          )}
        </div>

        {/* The "already seated? order from your phone" invitation is the section right below (AtTable):
            the menu only closes on the allergy note. */}
        <p className="mt-14 flex items-start gap-3 border-t border-ink-900/10 pt-6 text-sm leading-relaxed text-taupe-600 md:mt-16" data-reveal>
          <Info className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden />
          {t.menu.allergens}
        </p>
      </div>
    </section>
  );
}
