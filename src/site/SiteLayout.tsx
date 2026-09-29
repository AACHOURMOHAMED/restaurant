import { restaurant } from '@content/restaurant';
import { CalendarDays, Menu as MenuIcon, Phone, QrCode, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { Logo, SocialIcon } from '@/components/brand';
import { ButtonLink, cn, IconButton } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { telHref } from '@/lib/format';
import { observeHeaderHeight, scrollToId } from '@/lib/motion';
import { useSite } from '@/lib/queries';

const SECTIONS = [
  { id: 'menu', key: 'menu' },
  { id: 'histoire', key: 'story' },
  { id: 'galerie', key: 'gallery' },
  { id: 'infos', key: 'visit' },
] as const;

export function useSectionNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (id: string) => {
    if (pathname === '/') scrollToId(id);
    else navigate(`/#${id}`);
  };
}

export function LanguageSwitch({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t.nav.language} className={cn('inline-flex rounded-full p-0.5 text-[11px] font-bold tracking-[0.14em]', tone === 'light' ? 'bg-cream-50/10' : 'bg-ink-900/6', className)}>
      {(['fr', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={cn(
            'h-8 min-w-10 rounded-full px-2.5 uppercase transition-colors',
            lang === l
              ? tone === 'light'
                ? 'bg-cream-50 text-ink-900'
                : 'bg-ink-900 text-cream-50'
              : tone === 'light'
                ? 'text-cream-100/70 hover:text-cream-50'
                : 'text-ink-600 hover:text-ink-900',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function PreviewBanner() {
  const { t } = useI18n();
  const site = useSite();
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('bb-preview-hidden') === '1';
    } catch {
      return false;
    }
  });
  const backendDown =
    site.isError && site.error instanceof ApiError && ['NETWORK', 'BACKEND_UNAVAILABLE', 'INTERNAL'].includes(site.error.code);

  if (backendDown) {
    return (
      <div className="bg-terracotta-600 px-4 py-2 text-center text-[12.5px] leading-snug font-medium text-white" role="status">
        {t.preview.backendDown}
      </div>
    );
  }
  if (restaurant.status !== 'preview' || hidden) return null;
  return (
    <div className="flex items-center justify-center gap-3 bg-gold-400 px-4 py-1.5 text-[12px] leading-snug font-semibold text-ink-950">
      <span className="text-center">{t.preview.banner}</span>
      <button
        type="button"
        className="shrink-0 rounded-full px-2 py-0.5 underline underline-offset-2 hover:bg-ink-950/10"
        onClick={() => {
          try {
            sessionStorage.setItem('bb-preview-hidden', '1');
          } catch {
            /* ignore */
          }
          setHidden(true);
        }}
      >
        {t.preview.dismiss}
      </button>
    </div>
  );
}

function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const goSection = useSectionNav();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const go = (id: string) => {
    onClose();
    window.setTimeout(() => goSection(id), 60);
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={t.nav.openMenu}
      className="grain m-0 h-dvh max-h-none w-full max-w-none border-0 bg-ink-950 p-0 text-cream-50 open:animate-fade-in backdrop:bg-transparent"
    >
      <div className="container-x flex h-full flex-col pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex h-14 items-center justify-between">
          <Logo />
          <IconButton label={t.nav.closeMenu} onClick={onClose} className="text-cream-50 hover:bg-cream-50/10">
            <X className="size-6" />
          </IconButton>
        </div>
        <nav className="mt-10 flex flex-1 flex-col gap-1">
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              className="group flex items-baseline gap-4 py-2 text-left"
            >
              <span className="w-6 text-xs font-semibold text-gold-500 tabular">0{i + 1}</span>
              <span className="font-display text-[2.6rem] leading-tight font-medium transition-colors group-hover:text-gold-300">
                {t.nav[s.key]}
              </span>
            </button>
          ))}
          <Link to="/table" onClick={onClose} className="group mt-2 flex items-baseline gap-4 py-2">
            <span className="w-6 text-xs font-semibold text-gold-500 tabular">05</span>
            <span className="font-display text-[2.6rem] leading-tight font-medium italic transition-colors group-hover:text-gold-300">
              {t.nav.atTable}
            </span>
          </Link>
        </nav>
        <div className="flex flex-col gap-4">
          <ButtonLink to="/reservation" onClick={onClose} variant="gold" size="lg" className="w-full">
            <CalendarDays className="size-5" aria-hidden />
            {t.nav.reserveTable}
          </ButtonLink>
          <div className="flex items-center justify-between">
            <a href={telHref(restaurant.contact.phone)} className="text-sm text-cream-100/80 underline-offset-4 hover:underline">
              {restaurant.contact.phoneDisplay}
            </a>
            <LanguageSwitch />
          </div>
        </div>
      </div>
    </dialog>
  );
}

function Header({ overlay }: { overlay: boolean }) {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const goSection = useSectionNav();
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => (headerRef.current ? observeHeaderHeight(headerRef.current) : undefined), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const solid = !overlay || scrolled;
  return (
    <header ref={headerRef} className="fixed inset-x-0 top-0 z-50">
      <PreviewBanner />
      <div
        className={cn(
          'transition-[background-color,border-color,backdrop-filter] duration-500',
          solid ? 'border-b border-cream-50/10 bg-ink-950/85 backdrop-blur-md' : 'border-b border-transparent',
        )}
      >
        <div className="container-x flex h-[4.5rem] items-center justify-between gap-6 text-cream-50">
          <Link to="/" aria-label={`${restaurant.name} — ${t.nav.home}`} className="shrink-0">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goSection(s.id)}
                className="rounded-full px-3.5 py-2 text-[13px] font-semibold tracking-wide text-cream-100/85 transition-colors hover:text-gold-300"
              >
                {t.nav[s.key]}
              </button>
            ))}
            <Link
              to="/table"
              className="rounded-full px-3.5 py-2 text-[13px] font-semibold tracking-wide text-cream-100/85 transition-colors hover:text-gold-300"
            >
              {t.nav.atTable}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <ButtonLink to="/reservation" variant="gold" size="sm" className="hidden h-10 px-5 md:inline-flex">
              {t.nav.reserveTable}
            </ButtonLink>
            <IconButton label={t.nav.openMenu} onClick={() => setNavOpen(true)} className="text-cream-50 hover:bg-cream-50/10 lg:hidden">
              <MenuIcon className="size-6" />
            </IconButton>
          </div>
        </div>
      </div>
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />
    </header>
  );
}

/** Prominent reservation bar for phones; appears once the hero buttons scroll away. */
function MobileActionBar({ hideOnPaths }: { hideOnPaths: boolean }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(pathname !== '/');

  useEffect(() => {
    if (pathname !== '/') {
      setVisible(true);
      return;
    }
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.55);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  if (hideOnPaths) return null;
  return (
    <div
      className={cn(
        'fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 transition-[transform,opacity] duration-500 ease-(--ease-out-expo) md:hidden',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-[140%] opacity-0',
      )}
      aria-hidden={!visible}
    >
      <div className="flex items-center gap-2 rounded-full bg-ink-950/90 p-1.5 shadow-lift ring-1 ring-cream-50/10 backdrop-blur-md">
        <a
          href={telHref(restaurant.contact.phone)}
          aria-label={`${t.nav.call} ${restaurant.contact.phoneDisplay}`}
          tabIndex={visible ? 0 : -1}
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-cream-50 hover:bg-cream-50/10"
        >
          <Phone className="size-5" />
        </a>
        <Link
          to="/reservation"
          tabIndex={visible ? 0 : -1}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-gold-400 text-[15px] font-bold tracking-wide text-ink-950 shadow-glow active:scale-[0.98]"
        >
          <CalendarDays className="size-5" aria-hidden />
          {t.nav.reserveTable}
        </Link>
        <Link
          to="/table"
          aria-label={t.nav.atTable}
          tabIndex={visible ? 0 : -1}
          className="flex size-12 shrink-0 items-center justify-center rounded-full text-cream-50 hover:bg-cream-50/10"
        >
          <QrCode className="size-5" />
        </Link>
      </div>
    </div>
  );
}

function Footer() {
  const { t, loc } = useI18n();
  const goSection = useSectionNav();
  const a = restaurant.address;
  const socials = (Object.entries(restaurant.social) as [keyof typeof restaurant.social, string | null][]).filter(
    (e): e is [keyof typeof restaurant.social, string] => !!e[1],
  );
  return (
    <footer className="grain bg-ink-950 pt-20 pb-32 text-cream-100/80 md:pb-14">
      <div className="container-x grid gap-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo className="text-[2.2rem]" />
          <p className="mt-4 max-w-sm font-display text-xl text-cream-100/70 italic">{loc(restaurant.tagline)}</p>
          <p className="mt-2 text-sm text-cream-100/55">
            {t.footer.tagline} · {t.story.since} {restaurant.since}
          </p>
          {socials.length > 0 && (
            <ul className="mt-6 flex gap-2">
              {socials.map(([name, url]) => (
                <li key={name}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={name}
                    className="flex size-11 items-center justify-center rounded-full ring-1 ring-cream-50/15 transition-colors hover:bg-cream-50/10 hover:text-gold-300"
                  >
                    <SocialIcon name={name} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <nav className="md:col-span-3" aria-label="Footer">
          <ul className="space-y-3 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => goSection(s.id)} className="hover:text-gold-300">
                  {t.nav[s.key]}
                </button>
              </li>
            ))}
            <li>
              <Link to="/reservation" className="hover:text-gold-300">
                {t.nav.reserveTable}
              </Link>
            </li>
            <li>
              <Link to="/table" className="hover:text-gold-300">
                {t.nav.atTable}
              </Link>
            </li>
          </ul>
        </nav>
        <div className="text-sm leading-relaxed md:col-span-4">
          <address className="not-italic">
            {a.street}
            <br />
            {a.complement && (
              <>
                {a.complement}
                <br />
              </>
            )}
            {a.postalCode} {a.city}, {loc(a.country)}
          </address>
          <a href={telHref(restaurant.contact.phone)} className="mt-3 inline-block text-cream-50 hover:text-gold-300">
            {restaurant.contact.phoneDisplay}
          </a>
          {restaurant.contact.email && (
            <a href={`mailto:${restaurant.contact.email}`} className="mt-1 block hover:text-gold-300">
              {restaurant.contact.email}
            </a>
          )}
        </div>
      </div>
      <div className="container-x mt-16 flex flex-col gap-4 border-t border-cream-50/10 pt-6 text-xs text-cream-100/50 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {restaurant.name}. {t.footer.rights}
        </p>
        <div className="flex items-center gap-5">
          <Link to="/staff" className="hover:text-cream-50">
            {t.footer.staff}
          </Link>
          <LanguageSwitch />
        </div>
      </div>
    </footer>
  );
}

export function SiteLayout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] focus:rounded-full focus:bg-gold-400 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-950"
      >
        {t.nav.skip}
      </a>
      <Header overlay={isHome} />
      <main id="main" tabIndex={-1} className="outline-none">
        <Outlet />
      </main>
      <Footer />
      <MobileActionBar hideOnPaths={pathname.startsWith('/reservation')} />
      <ScrollRestoration />
    </>
  );
}
