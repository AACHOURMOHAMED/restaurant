import { QrCode } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ButtonLink, Notice, Spinner } from '@/components/ui';
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

        {site.data?.demoMenu && (
          <Notice tone="warn" className="mt-8 max-w-3xl">
            {t.preview.demoMenu}
          </Notice>
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

        <div className="mt-16 flex flex-col items-start gap-6 rounded-[2rem] bg-ink-900 p-7 text-cream-50 sm:flex-row sm:items-center sm:justify-between md:p-9" data-reveal>
          <div>
            <p className="font-display text-2xl md:text-3xl">{t.menu.orderCta}</p>
            <p className="mt-2 text-sm text-cream-100/65">{t.menu.allergens}</p>
          </div>
          <ButtonLink to="/table" variant="gold" className="shrink-0">
            <QrCode className="size-4.5" aria-hidden />
            {t.nav.atTable}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
