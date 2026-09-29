import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, Outlet, ScrollRestoration } from 'react-router';
import { Logo } from '@/components/brand';
import { cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { observeHeaderHeight } from '@/lib/motion';
import { useTable } from '@/lib/stores';
import { LanguageSwitch, PreviewBanner } from '@/site/SiteLayout';

/** Compact, app-like layout for the at-the-restaurant experience. */
export function DineInLayout() {
  const { t } = useI18n();
  const table = useTable();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => (ref.current ? observeHeaderHeight(ref.current) : undefined), []);

  return (
    <div className="min-h-svh bg-cream-100">
      <header ref={ref} className="fixed inset-x-0 top-0 z-50">
        <PreviewBanner />
        <div className="border-b border-cream-50/10 bg-ink-950/92 backdrop-blur-md">
          <div className="container-x flex h-16 items-center justify-between gap-3 text-cream-50">
            <Link to="/" aria-label={t.nav.home} className="shrink-0">
              <Logo className="text-[1.35rem]" />
            </Link>
            <div className="flex items-center gap-2">
              {table && (
                <Link
                  to="/table"
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold ring-1',
                    table.confirmed ? 'bg-gold-400 text-ink-950 ring-gold-400' : 'text-gold-300 ring-gold-400/60',
                  )}
                  aria-label={`${t.table.tableN(table.number)} — ${t.table.changeTable}`}
                  data-testid="table-pill"
                >
                  {table.confirmed && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                  {t.table.tableN(table.number)}
                </Link>
              )}
              <LanguageSwitch />
            </div>
          </div>
        </div>
      </header>
      <main id="main" className="pt-[calc(var(--header-h,4rem)+1.25rem)] pb-36">
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}
