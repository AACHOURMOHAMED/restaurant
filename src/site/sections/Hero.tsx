import { restaurant } from '@content/restaurant';
import { MapPin, Phone } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from 'react';
import { hasPhoto, Photo } from '@/components/brand';
import { Button, ButtonLink, cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { telHref } from '@/lib/format';
import { MOTION_OK, scrollToId, useMotion } from '@/lib/motion';
import { OpenStatusBadge } from '../OpenStatusBadge';
import { HERO_SIZES } from './heroImage';

/** The embers canvas is decoration: its code is fetched only once the page is idle. */
const Embers = lazy(() => import('@/components/Embers'));

/** How long each photo stays, and the cross-fade between two (the fade's length is set in app.css). */
const SLIDE_MS = 7500;
const FADE_MS = 2200;

/** Hero photos, first one first (it is the page's LCP image). */
const SLIDES = (restaurant.hero.slides.length > 0 ? restaurant.hero.slides : [restaurant.hero.photo]).filter((name): name is string =>
  hasPhoto(name),
);

/**
 * Candle-lit abstract backdrop used until the restaurant's hero photo is added.
 * The glows are positioned in viewport units (not % of the hero) so they stay put while the text loads.
 */
function HeroBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-ink-950">
      <div className="absolute -top-[30svh] -right-[25vw] h-[110vmax] w-[110vmax] rounded-full bg-[radial-gradient(closest-side,rgba(222,184,119,0.30),rgba(184,92,56,0.12)_52%,transparent_75%)]" />
      <div className="absolute top-[calc(145svh_-_95vmax)] -left-[30vw] h-[95vmax] w-[95vmax] rounded-full bg-[radial-gradient(closest-side,rgba(184,92,56,0.30),rgba(120,50,30,0.08)_55%,transparent_75%)]" />
      <span
        aria-hidden
        className="font-display pointer-events-none absolute top-[6vh] -right-[8vw] text-[78vmin] leading-none text-transparent italic select-none [-webkit-text-stroke:1px_rgba(222,184,119,0.20)] md:top-[2vh] md:right-[2vw]"
      >
        &amp;
      </span>
    </div>
  );
}

const saveData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

/** Calls `fn` once the page has fully loaded and the browser is idle. Returns a cancel function. */
function afterLoadAndIdle(fn: () => void): () => void {
  let idleId: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const requestIdle = window.requestIdleCallback as typeof window.requestIdleCallback | undefined; // not in Safari
  const idle = () => {
    if (requestIdle) idleId = requestIdle(fn, { timeout: 2000 });
    else timer = setTimeout(fn, 700);
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
  return () => {
    window.removeEventListener('load', idle);
    if (idleId !== undefined) window.cancelIdleCallback(idleId);
    if (timer !== undefined) clearTimeout(timer);
  };
}

/** Calls `fn` once `img` has loaded (or failed). Returns a cancel function. */
function afterImage(img: HTMLImageElement | null | undefined, fn: () => void): () => void {
  if (!img || img.complete) {
    fn();
    return () => undefined;
  }
  img.addEventListener('load', fn, { once: true });
  img.addEventListener('error', fn, { once: true });
  return () => {
    img.removeEventListener('load', fn);
    img.removeEventListener('error', fn);
  };
}

/**
 * True once the page has loaded, the first hero photo (the main image) has arrived and the browser is idle —
 * and only while motion is welcome (no reduced-motion preference, no Save-Data). Gates the slideshow and the
 * embers, so the second photo and the sparks' code never compete with the main image on a slow connection.
 */
function useAmbientMotion(firstImage: () => HTMLImageElement | null | undefined): boolean {
  const [on, setOn] = useState(false);
  const firstImageRef = useRef(firstImage);
  firstImageRef.current = firstImage;
  useEffect(() => {
    const query = window.matchMedia(MOTION_OK);
    let cancel: (() => void) | undefined;
    const update = () => {
      cancel?.();
      cancel = undefined;
      if (!query.matches || saveData()) {
        setOn(false);
        return;
      }
      let cancelIdle: (() => void) | undefined;
      const cancelImage = afterImage(firstImageRef.current(), () => {
        cancelIdle = afterLoadAndIdle(() => setOn(true));
      });
      cancel = () => {
        cancelImage();
        cancelIdle?.();
      };
    };
    update();
    query.addEventListener('change', update);
    return () => {
      cancel?.();
      query.removeEventListener('change', update);
    };
  }, []);
  return on;
}

/** Position of an element in the CSS entrance cascade. */
const order = (i: number) => ({ '--i': i }) as CSSProperties;

export function Hero() {
  const { t, loc } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const [first, ...rest] = restaurant.name.split(' ');

  // ── Slideshow: slow cross-fades (CSS transitions) with a Ken Burns move per photo (CSS animation, from the
  // first paint). The next photo is only fetched once the page is idle; each slide's progress line drives the
  // timing (its animation's end advances the show), so pausing that animation pauses everything.
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ambient = useAmbientMotion(() => slideRefs.current[0]?.querySelector('img'));
  const cycling = ambient && SLIDES.length > 1;
  const cyclingRef = useRef(cycling);
  cyclingRef.current = cycling;
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);

  useEffect(() => {
    if (cycling) return;
    setActive(0);
    setLeaving(null);
  }, [cycling]);

  useEffect(() => {
    if (leaving === null) return;
    const id = setTimeout(() => setLeaving(null), FADE_MS + 200);
    return () => clearTimeout(id);
  }, [leaving]);

  const advance = () => {
    const from = active;
    const to = (active + 1) % SLIDES.length;
    const go = () => {
      if (!cyclingRef.current) return;
      setLeaving(from);
      setActive(to);
    };
    // Wait for the next photo if it is still downloading (slow connections): no fade to a blank frame.
    const img = slideRefs.current[to]?.querySelector('img');
    if (!img || img.complete) go();
    else img.addEventListener('load', go, { once: true });
  };

  // Pause the Ken Burns and progress animations (hence the slideshow) while the hero is off-screen.
  useEffect(() => {
    const el = ref.current;
    if (!el || !cycling) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) delete el.dataset.paused;
      else el.dataset.paused = '';
    });
    io.observe(el);
    return () => {
      io.disconnect();
      delete el.dataset.paused;
    };
  }, [cycling]);

  // The entrance animation is plain CSS (see `hero-line` in app.css); GSAP only drives the scroll parallax.
  useMotion(
    ({ gsap }) => {
      const mm = gsap.matchMedia();
      mm.add({ motion: MOTION_OK, small: '(max-width: 1023px)' }, (context) => {
        const { motion, small } = context.conditions as {
          motion: boolean;
          small: boolean;
        };
        if (!motion) return;
        const scroll = {
          trigger: ref.current,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        };
        gsap.to('[data-hero-bg]', {
          yPercent: small ? 10 : 16,
          scale: 1.05,
          ease: 'none',
          scrollTrigger: scroll,
        });
        gsap.to('[data-hero-content]', {
          yPercent: small ? -4 : -14,
          ease: 'none',
          scrollTrigger: scroll,
        });
        // Desktop: the caption sits on the same line as the address row, so it rises with the text.
        const content = ref.current?.querySelector<HTMLElement>('[data-hero-content]');
        if (!small && content) {
          gsap.to('.hero-caption', {
            y: () => -0.14 * content.offsetHeight,
            ease: 'none',
            scrollTrigger: { ...scroll, invalidateOnRefresh: true },
          });
        }
        // Only the title block dims as it leaves under the header: the buttons and the address row stay fully
        // legible wherever the scroll stops.
        gsap.to('[data-hero-dim]', {
          opacity: 0.15,
          ease: 'none',
          scrollTrigger: {
            trigger: ref.current,
            start: 'top top',
            end: small ? '45% top' : '60% top',
            scrub: true,
          },
        });
      });
    },
    { scope: ref },
  );

  const illustrated = restaurant.illustrations.includes(SLIDES[active] ?? '');

  return (
    <section
      ref={ref}
      data-hero
      className="hero grain relative isolate overflow-hidden bg-ink-950 text-cream-50 lg:flex lg:min-h-svh lg:items-end"
      aria-label={restaurant.name}
    >
      {/* Photos: a tall band at the top on phones and tablets (the dishes stay clear of the text), full-bleed on desktop. */}
      <div
        data-hero-bg
        className="absolute inset-x-0 top-0 -z-10 h-(--hero-photo-h) origin-top overflow-hidden will-change-transform lg:bottom-0 lg:h-auto"
      >
        {SLIDES.length > 0 ? (
          <>
            {SLIDES.map((name, i) =>
              i === 0 || cycling ? (
                <div
                  key={i}
                  ref={(el) => {
                    slideRefs.current[i] = el;
                  }}
                  className="hero-slide"
                  data-state={i === active ? 'active' : i === leaving ? 'leaving' : 'idle'}
                  data-kb={i % 2 === 0 ? 'a' : 'b'}
                >
                  <div className="hero-kb">
                    <Photo name={name} alt="" priority={i === 0} sizes={HERO_SIZES} imgClassName="hero-img" />
                  </div>
                </div>
              ) : null,
            )}
            <div aria-hidden className="hero-scrim" />
          </>
        ) : (
          <HeroBackdrop />
        )}
        <div aria-hidden data-hero-veil className="absolute inset-0 z-[3] bg-ink-950" />
      </div>

      {ambient && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-(--hero-photo-h) lg:bottom-0 lg:h-auto">
          <Suspense fallback={null}>
            <Embers className="block h-full w-full" bias={0.68} />
          </Suspense>
        </div>
      )}

      <div data-hero-content className="container-x relative z-[2] pt-[calc(var(--hero-photo-h)-9.5rem)] pb-12 lg:pt-44 lg:pb-11">
        <div data-hero-dim>
          <p data-hero-fade style={order(0)} className="hero-eyebrow eyebrow text-gold-300">
            {loc(restaurant.hero.eyebrow)}
          </p>
          <h1 className="font-display mt-5 text-[clamp(4.25rem,19vw,10.25rem)] leading-[0.8] font-medium tracking-[-0.02em] lg:mt-7 lg:text-[clamp(6rem,min(11.5vw,18svh),10.25rem)]">
            <span className="block overflow-hidden pb-[0.06em]">
              <span data-hero-line style={order(0)} className="block">
                {first}
              </span>
            </span>
            {rest.length > 0 && (
              <span className="block overflow-hidden pb-[0.1em]">
                <span data-hero-line style={order(1)} className="block pl-[0.62em] font-normal text-gold-300 italic">
                  {rest.join(' ')}
                </span>
              </span>
            )}
          </h1>
          <div className="max-w-[35rem] lg:max-w-[31rem] [text-shadow:0_1px_20px_rgb(13_9_7/0.7)]">
            <p
              data-hero-fade
              style={order(1)}
              className="hero-sub mt-6 text-[1.075rem] leading-relaxed text-cream-100/90 md:text-xl lg:mt-8"
            >
              {loc(restaurant.hero.subtitle)}
            </p>
            <p data-hero-fade style={order(2)} className="font-display mt-3 flex items-center gap-3 text-xl text-gold-300 italic">
              <span aria-hidden className="h-px w-8 bg-gold-400/60" />
              {loc(restaurant.tagline)}
            </p>
          </div>
        </div>
        <div data-hero-fade style={order(3)} className="hero-actions mt-9 flex flex-col gap-3 sm:flex-row lg:mt-11">
          <ButtonLink to="/reservation" variant="gold" size="lg">
            {t.hero.reserve}
          </ButtonLink>
          <Button variant="outline-light" size="lg" className="backdrop-blur-[2px]" onClick={() => scrollToId('menu')}>
            {t.hero.viewMenu}
          </Button>
        </div>
        <div
          data-hero-fade
          style={order(4)}
          className="hero-info mt-12 flex flex-col gap-3 border-t border-cream-50/15 pt-6 text-sm text-cream-100/80 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 lg:mt-14 lg:pr-72"
        >
          <OpenStatusBadge reserve className="min-h-5" />
          <span className="inline-flex items-center gap-2">
            <MapPin className="size-4 text-gold-400" aria-hidden />
            {restaurant.address.street}, {restaurant.address.city}
          </span>
          <a href={telHref(restaurant.contact.phone)} className="inline-flex items-center gap-2 hover:text-gold-300">
            <Phone className="size-4 text-gold-400" aria-hidden />
            {restaurant.contact.phoneDisplay}
          </a>
        </div>
      </div>

      {/* Slide progress + "illustrative photo" caption: top right of the photo on phones, bottom right on desktop. */}
      {SLIDES.length > 0 && (
        <div
          aria-hidden
          className="hero-caption pointer-events-none absolute inset-x-0 top-[calc(var(--header-h,4.5rem)+0.85rem)] z-[2] lg:top-auto lg:bottom-11"
        >
          <div data-hero-fade style={order(5)} className="container-x flex items-center justify-end gap-4">
            {cycling && (
              <span className="hero-progress-group flex items-center gap-1.5">
                {SLIDES.map((_, i) => (
                  <span key={i} className="hero-progress" data-on={i === active || undefined}>
                    {i === active && (
                      <span
                        key={active}
                        style={{ animationDuration: `${SLIDE_MS}ms` }}
                        onAnimationEnd={(e) => {
                          if (e.target === e.currentTarget) advance();
                        }}
                      />
                    )}
                  </span>
                ))}
              </span>
            )}
            <span
              className={cn(
                'text-[10px] font-semibold tracking-[0.24em] text-cream-100/75 uppercase transition-opacity duration-700 [text-shadow:0_1px_8px_rgb(13_9_7/0.9)]',
                !illustrated && 'opacity-0',
              )}
            >
              {t.hero.illustration}
            </span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => scrollToId('histoire')}
        className="absolute right-6 bottom-28 z-[2] hidden flex-col items-center gap-4 text-[10px] font-semibold tracking-[0.3em] text-cream-100/80 uppercase transition-colors [text-shadow:0_1px_10px_rgb(13_9_7/0.9)] hover:text-gold-300 xl:flex"
      >
        <span className="[writing-mode:vertical-rl]">{t.hero.scroll}</span>
        <span className="relative block h-14 w-px overflow-hidden bg-cream-50/20">
          <span className="absolute inset-x-0 top-0 h-1/2 animate-scroll-cue bg-gold-400" />
        </span>
      </button>
    </section>
  );
}
