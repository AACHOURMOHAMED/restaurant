import { restaurant } from '@content/restaurant';
import { MapPin, Phone } from 'lucide-react';
import { useRef } from 'react';
import { hasPhoto, Photo } from '@/components/brand';
import { Button, ButtonLink } from '@/components/ui';
import { useI18n } from '@/i18n';
import { telHref } from '@/lib/format';
import { gsap, MOTION_OK, scrollToId, useGSAP } from '@/lib/motion';
import { OpenStatusBadge } from '../OpenStatusBadge';

/**
 * Candle-lit abstract backdrop used until the restaurant's hero photo is added.
 * The glows are positioned in viewport units (not % of the hero) so they stay put while the text loads.
 */
function HeroBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-ink-950">
      <div
        data-hero-glow
        className="absolute -top-[30svh] -right-[25vw] h-[110vmax] w-[110vmax] rounded-full bg-[radial-gradient(closest-side,rgba(222,184,119,0.30),rgba(184,92,56,0.12)_52%,transparent_75%)]"
      />
      <div className="absolute top-[calc(145svh_-_95vmax)] -left-[30vw] h-[95vmax] w-[95vmax] rounded-full bg-[radial-gradient(closest-side,rgba(184,92,56,0.30),rgba(120,50,30,0.08)_55%,transparent_75%)]" />
      <span
        data-hero-deco
        aria-hidden
        className="font-display pointer-events-none absolute top-[6vh] -right-[8vw] text-[78vmin] leading-none text-transparent italic select-none [-webkit-text-stroke:1px_rgba(222,184,119,0.20)] md:top-[2vh] md:right-[2vw]"
      >
        &amp;
      </span>
      <div className="absolute inset-y-0 left-[7%] w-px bg-linear-to-b from-transparent via-gold-500/25 to-transparent" />
      <div className="absolute inset-y-0 right-[7%] hidden w-px bg-linear-to-b from-transparent via-gold-500/15 to-transparent md:block" />
    </div>
  );
}

export function Hero() {
  const { t, loc } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const withPhoto = hasPhoto(restaurant.hero.photo);
  const [first, ...rest] = restaurant.name.split(' ');

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ motion: MOTION_OK, small: '(max-width: 767px)' }, (context) => {
        const { motion, small } = context.conditions as { motion: boolean; small: boolean };
        if (!motion) return;
        const intro = gsap.timeline({ defaults: { ease: 'expo.out' } });
        intro
          .from('[data-hero-line]', { yPercent: 115, duration: 1.5, stagger: 0.1 })
          .from('[data-hero-fade]', { opacity: 0, y: 22, duration: 1.1, stagger: 0.09 }, '-=1.05')
          .from('[data-hero-deco]', { opacity: 0, scale: 0.94, duration: 2.2, ease: 'power2.out' }, 0);

        const scroll = { trigger: ref.current, start: 'top top', end: 'bottom top', scrub: true };
        gsap.to('[data-hero-bg]', { yPercent: small ? 8 : 16, scale: 1.05, ease: 'none', scrollTrigger: scroll });
        gsap.to('[data-hero-deco]', { yPercent: small ? 14 : 30, ease: 'none', scrollTrigger: scroll });
        gsap.to('[data-hero-content]', { yPercent: small ? -6 : -14, opacity: 0.1, ease: 'none', scrollTrigger: scroll });
      });
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className="grain relative isolate flex min-h-svh items-end overflow-hidden bg-ink-950 text-cream-50" aria-label={restaurant.name}>
      <div data-hero-bg className="absolute inset-0 -z-10 origin-top will-change-transform">
        {withPhoto ? (
          <>
            <Photo name={restaurant.hero.photo} alt="" priority sizes="100vw" />
            <div className="absolute inset-0 bg-linear-to-t from-ink-950 via-ink-950/55 to-ink-950/35" />
          </>
        ) : (
          <HeroBackdrop />
        )}
      </div>

      <div data-hero-content className="container-x relative z-[2] pt-40 pb-28 md:pb-20">
        <p data-hero-fade className="eyebrow text-gold-400">
          {loc(restaurant.hero.eyebrow)}
        </p>
        <h1 className="font-display mt-7 text-[clamp(4.4rem,17vw,12.5rem)] leading-[0.8] font-medium tracking-[-0.015em]">
          <span className="block overflow-hidden pb-[0.06em]">
            <span data-hero-line className="block">
              {first}
            </span>
          </span>
          {rest.length > 0 && (
            <span className="block overflow-hidden pb-[0.1em]">
              <span data-hero-line className="block pl-[0.6em] font-normal text-gold-300 italic">
                {rest.join(' ')}
              </span>
            </span>
          )}
        </h1>
        <p data-hero-fade className="mt-7 max-w-xl text-lg leading-relaxed text-cream-100/85 md:text-xl">
          {loc(restaurant.hero.subtitle)}
        </p>
        <p data-hero-fade className="font-display mt-2 text-xl text-gold-300/90 italic">
          — {loc(restaurant.tagline)}
        </p>
        <div data-hero-fade className="mt-10 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/reservation" variant="gold" size="lg">
            {t.hero.reserve}
          </ButtonLink>
          <Button variant="outline-light" size="lg" onClick={() => scrollToId('menu')}>
            {t.hero.viewMenu}
          </Button>
        </div>
        <div
          data-hero-fade
          className="mt-12 flex flex-col gap-3 border-t border-cream-50/15 pt-6 text-sm text-cream-100/75 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8"
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

      <button
        type="button"
        onClick={() => scrollToId('histoire')}
        className="absolute right-6 bottom-10 z-[2] hidden flex-col items-center gap-4 text-[10px] font-semibold tracking-[0.3em] text-cream-100/60 uppercase transition-colors hover:text-gold-300 lg:flex"
      >
        <span className="[writing-mode:vertical-rl]">{t.hero.scroll}</span>
        <span className="relative block h-14 w-px overflow-hidden bg-cream-50/20">
          <span className="absolute inset-x-0 top-0 h-1/2 animate-scroll-cue bg-gold-400" />
        </span>
      </button>
    </section>
  );
}
