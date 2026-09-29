import { restaurant } from '@content/restaurant';
import { ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { Photo } from '@/components/brand';
import { useI18n } from '@/i18n';
import { gsap, MOTION_OK, revealIn, scrollToId, useGSAP } from '@/lib/motion';

export function Story() {
  const { t, loc } = useI18n();
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      revealIn(ref.current);
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          '[data-story-img]',
          { yPercent: -7 },
          { yPercent: 7, ease: 'none', scrollTrigger: { trigger: '[data-story-frame]', start: 'top bottom', end: 'bottom top', scrub: true } },
        );
      });
    },
    { scope: ref },
  );

  const [lead, ...others] = restaurant.story.paragraphs;
  return (
    <section ref={ref} id="histoire" className="relative overflow-hidden bg-cream-50 py-24 md:py-36">
      <div className="container-x grid items-center gap-14 md:grid-cols-12 md:gap-10">
        <div className="relative md:col-span-5" data-reveal>
          <div data-story-frame className="relative aspect-[4/5] overflow-hidden rounded-[2rem] shadow-lift">
            <div data-story-img className="absolute inset-x-0 -inset-y-[9%]">
              <Photo
                name={restaurant.story.photo}
                alt={restaurant.name}
                sizes="(min-width: 768px) 40vw, 100vw"
                placeholderIcon="chef"
                placeholderTone="warm"
              />
            </div>
          </div>
          <div className="absolute -right-3 -bottom-7 rounded-2xl bg-ink-900 px-6 py-5 text-cream-50 shadow-lift md:-right-10">
            <p className="text-[10px] font-semibold tracking-[0.28em] text-gold-400 uppercase">{t.story.since}</p>
            <p className="font-display text-5xl leading-none font-medium">{restaurant.since}</p>
          </div>
        </div>

        <div className="md:col-span-6 md:col-start-7">
          <p className="eyebrow text-gold-600" data-reveal>
            {t.story.eyebrow}
          </p>
          <h2 className="font-display mt-6 text-[clamp(2.6rem,6vw,4.4rem)] leading-[1.02] font-medium text-ink-900" data-reveal>
            {loc(restaurant.story.heading)}
          </h2>
          <div className="mt-8 space-y-5 text-[17px] leading-[1.8] text-ink-600">
            {lead && (
              <p data-reveal className="first-letter:font-display first-letter:float-left first-letter:mt-1 first-letter:mr-3 first-letter:text-[4.2rem] first-letter:leading-[0.8] first-letter:text-gold-600">
                {loc(lead)}
              </p>
            )}
            {others.map((p, i) => (
              <p key={i} data-reveal>
                {loc(p)}
              </p>
            ))}
          </div>
          <button
            type="button"
            data-reveal
            onClick={() => scrollToId('menu')}
            className="group mt-10 inline-flex items-center gap-3 text-sm font-semibold tracking-[0.14em] text-ink-900 uppercase"
          >
            <span className="border-b border-gold-500 pb-1">{t.story.readMore}</span>
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}
