import { restaurant } from '@content/restaurant';
import { ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import { IllustrationNote, isIllustration, Ornament, Photo, photoMotion, zelligePattern } from '@/components/brand';
import { useI18n } from '@/i18n';
import { MOTION_OK, revealIn, scrollToId, useMotion } from '@/lib/motion';

/**
 * "Notre histoire": an editorial spread. A tall arched photo (the arch of Moroccan doorways) with a smaller
 * detail photo overlapping it, both unveiled by a clip-path wipe and drifting at different speeds; behind
 * them the year of opening (restaurant.since) in large outlined numerals and a panel of zellige lattice.
 */
export function Story() {
  const { t, loc } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const { photo, detailPhoto } = restaurant.story;

  useMotion(
    (m) => {
      revealIn(m, ref.current);
      photoMotion(m, ref.current);
      // The numerals slide sideways, against the photos' upward drift.
      m.gsap.matchMedia().add(MOTION_OK, () => {
        m.gsap.fromTo(
          '[data-story-year]',
          { xPercent: -5 },
          { xPercent: 4, ease: 'none', scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: 0.6 } },
        );
      });
    },
    { scope: ref },
  );

  const [lead, ...others] = restaurant.story.paragraphs;
  return (
    <section ref={ref} id="histoire" className="relative overflow-hidden bg-cream-50 py-24 md:py-36" aria-labelledby="story-title">
      <div className="container-x grid gap-y-8 md:gap-y-12 lg:grid-cols-12 lg:grid-rows-[1fr_auto_auto_1fr] lg:gap-x-10 lg:gap-y-0">
        <header className="lg:col-span-5 lg:col-start-8 lg:row-start-2">
          <p className="eyebrow text-gold-600" data-reveal>
            {t.story.eyebrow}
          </p>
          <h2
            id="story-title"
            className="font-display mt-6 text-[clamp(2.7rem,7vw,4.6rem)] leading-[0.98] font-medium tracking-[-0.01em] text-ink-900"
            data-reveal
          >
            {loc(restaurant.story.heading)}
          </h2>
          <Ornament className="mt-8 text-gold-500" />
        </header>

        {/* Photos */}
        <div className="relative pt-[clamp(4.5rem,21vw,9.5rem)] pb-[22%] lg:col-span-6 lg:col-start-1 lg:row-span-4 lg:row-start-1 lg:pb-[14%]">
          {/* The year of opening, in outlined numerals (decoration: the heading says it in words). */}
          <p
            aria-hidden
            data-story-year
            className="font-display pointer-events-none absolute top-0 left-0 text-[clamp(7.5rem,36vw,16.5rem)] leading-[0.78] font-medium tracking-[-0.03em] text-transparent select-none [-webkit-text-stroke:1px_var(--color-gold-500)] lg:-left-2"
          >
            {restaurant.since}
          </p>

          <div className="relative mr-[6%] ml-[16%] lg:mr-[8%] lg:ml-[20%]">
            {/* A second arch in hairline, offset behind the photo, and a tile panel peeking out under it. */}
            <div aria-hidden className="absolute inset-0 translate-x-[5%] -translate-y-[3.5%] rounded-t-full rounded-b-[1.25rem] border border-gold-500/45" />
            <div
              aria-hidden
              className="absolute -right-[10%] -bottom-[8%] h-[46%] w-[58%] rounded-[1.25rem] opacity-80 [mask-image:radial-gradient(closest-side,#000_45%,transparent)]"
              style={{ backgroundImage: zelligePattern('light'), backgroundSize: '40px', backgroundPosition: 'center' }}
            />
            <div data-clip className="relative aspect-[4/5] overflow-hidden rounded-t-full rounded-b-[1.25rem] bg-ink-900">
              <div data-parallax="6" className="absolute inset-x-0 -inset-y-[8%]">
                <div data-clip-zoom className="h-full w-full">
                  <Photo name={photo} alt="" sizes="(min-width: 1024px) 34vw, 78vw" placeholderIcon="chef" placeholderTone="warm" />
                </div>
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-ink-950/10 ring-inset" />
              {/* Compact on phones, so it stays clear of the overlapping print. */}
              {isIllustration(photo) && <IllustrationNote corner="bottom-right" className="max-lg:gap-1 max-lg:px-2 max-lg:text-[8.5px] max-lg:tracking-[0.06em]" />}
            </div>

            {detailPhoto && (
              <div data-drift="44" className="absolute -bottom-[22%] -left-[20%] w-[58%] max-[22.5rem]:w-[52%] lg:-bottom-[16%] lg:-left-[26%] lg:w-[52%]">
                {/* A print on cream card, captioned underneath. */}
                <figure className="rounded-[1.25rem] bg-cream-50 p-1.5 shadow-lift sm:p-2">
                  <div data-clip="right" data-clip-delay="0.3" className="relative aspect-[4/3] overflow-hidden rounded-[0.9rem] bg-ink-900">
                    <div data-clip-zoom className="h-full w-full">
                      <Photo name={detailPhoto} alt="" sizes="(min-width: 1024px) 18vw, 44vw" placeholderIcon="drink" placeholderTone="dark" />
                    </div>
                  </div>
                  {isIllustration(detailPhoto) && (
                    <figcaption className="flex items-center gap-1.5 px-1 pt-2 pb-0.5 text-[8.5px] leading-none font-semibold tracking-[0.08em] whitespace-nowrap text-taupe-600 uppercase sm:px-1.5 sm:pt-2.5 sm:text-[10px] sm:tracking-[0.18em]">
                      <span aria-hidden className="size-1 shrink-0 rounded-full bg-gold-500" />
                      {t.preview.illustration}
                    </figcaption>
                  )}
                </figure>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 lg:col-start-8 lg:row-start-3 lg:pt-10">
          <div className="space-y-5 text-[16px] leading-[1.8] text-ink-600 md:text-[17px]">
            {lead && (
              <p
                data-reveal
                className="text-[1.08rem] leading-[1.75] text-ink-800 first-letter:float-left first-letter:mt-1.5 first-letter:mr-3 first-letter:font-display first-letter:text-[4.6rem] first-letter:leading-[0.78] first-letter:text-gold-600 md:text-[1.18rem]"
              >
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
            className="group mt-10 inline-flex items-center gap-4 text-sm font-semibold tracking-[0.16em] text-ink-900 uppercase"
          >
            <span className="relative pb-1.5">
              {t.story.readMore}
              <span className="absolute inset-x-0 bottom-0 h-px origin-left bg-gold-500 transition-transform duration-500 ease-(--ease-out-expo) group-hover:scale-x-[1.12]" />
            </span>
            <span className="flex size-10 items-center justify-center rounded-full ring-1 ring-ink-900/15 transition-[background-color,box-shadow,color] duration-300 group-hover:bg-ink-900 group-hover:text-cream-50 group-hover:ring-ink-900">
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
