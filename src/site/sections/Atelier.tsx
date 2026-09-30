import boxBaseSvg from '@/assets/pizza/box-base.svg?raw';
import lidInsideSvg from '@/assets/pizza/lid-inside.svg?raw';
import lidOutsideSvg from '@/assets/pizza/lid-outside.svg?raw';
import pizzaSvg from '@/assets/pizza/pizza.svg?raw';
import { useRef, type HTMLAttributes } from 'react';
import { Button, cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { MOTION_OK, scrollToId, useMotion } from '@/lib/motion';

/** Inline SVG artwork (our own static files), so its layers can be animated one by one. */
function Art({ svg, className, ...rest }: { svg: string } & HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('[&>svg]:block [&>svg]:size-full', className)} dangerouslySetInnerHTML={{ __html: svg }} {...rest} />;
}

/** Scroll units of the timeline (the section is 420svh tall; the stage stays in view). */
const T = { sauce: 1.2, cheese: 2.6, toppings: 4, bake: 6.4, lift: 7.6, settle: 8.6, lid: 9.2, end: 10.6, total: 12 };

/**
 * "L'atelier": as the visitor scrolls, a pizza is assembled on its board, baked, then boxed.
 * One scrubbed GSAP timeline drives it; the stage is CSS-sticky (no pinning, so the page height
 * never changes when GSAP arrives). With reduced motion the section is a short, static composition.
 */
export function Atelier() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);

  useMotion(
    ({ gsap }) => {
      const root = ref.current;
      if (!root) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const svg = root.querySelector<SVGSVGElement>('[data-pizza] svg');
        if (!svg) return;
        const layer = (id: string) => svg.querySelector<SVGGElement>(`#${id}`);
        const board = layer('board');
        const dough = layer('dough');
        const sauce = layer('sauce');
        const cheese = layer('cheese');
        const toppings = layer('toppings');
        const baked = layer('baked');
        const pizza = [dough, sauce, cheese, toppings, baked].filter(Boolean);
        const blobs = cheese ? Array.from(cheese.children) : [];
        const pieces = toppings ? Array.from(toppings.querySelectorAll<SVGGElement>('.topping')) : [];
        const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-step]'));
        const at = (i: number) => [0, T.sauce, T.cheese, T.toppings, T.bake, T.lift][i]!;

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: 0.7 },
        });

        // Parallax: the glow and the copy drift at their own pace.
        tl.fromTo('[data-atelier-glow]', { yPercent: 18 }, { yPercent: -22, duration: T.total }, 0);
        tl.fromTo('[data-atelier-copy]', { y: 36 }, { y: -36, duration: T.total }, 0);
        tl.fromTo('[data-progress]', { scaleX: 0 }, { scaleX: 1, duration: T.total }, 0);

        // 1. Dough
        tl.fromTo(dough, { scale: 0.6, rotation: -25, opacity: 0, svgOrigin: '500 500' }, { scale: 1, rotation: 0, opacity: 1, duration: 1, ease: 'power2.out' }, 0);
        // 2. Sauce, spread in a spiral
        tl.fromTo(sauce, { scale: 0.12, rotation: -160, opacity: 0, svgOrigin: '500 500' }, { scale: 1, rotation: 0, opacity: 1, duration: 1.2, ease: 'power2.out' }, T.sauce);
        // 3. Mozzarella
        tl.fromTo(blobs, { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, opacity: 1, duration: 0.5, stagger: 0.07, ease: 'back.out(1.6)' }, T.cheese);
        // 4. Toppings fall into place one by one
        tl.from(
          pieces,
          {
            y: '-=620',
            rotation: () => gsap.utils.random(-150, 150),
            scale: 1.35,
            opacity: 0,
            transformOrigin: '50% 50%',
            duration: 0.55,
            stagger: { each: (T.bake - T.toppings - 0.55) / Math.max(pieces.length, 1), from: 'random' },
            ease: 'power3.out',
          },
          T.toppings,
        );
        // 5. Baking
        tl.fromTo(baked, { opacity: 0 }, { opacity: 1, duration: 1 }, T.bake);
        tl.fromTo('[data-atelier-heat]', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1.05, duration: 0.7 }, T.bake);
        tl.to('[data-atelier-heat]', { opacity: 0, duration: 0.6 }, T.lift);
        // 6. The board slides away, the box rises underneath, the pizza settles in
        tl.to(pizza, { scale: 1.05, svgOrigin: '500 500', duration: 1, ease: 'power1.out' }, T.lift);
        tl.to(board, { x: -1150, opacity: 0, duration: 1, ease: 'power2.in' }, T.lift);
        tl.fromTo('[data-box-base]', { yPercent: 45, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, ease: 'power2.out' }, T.lift);
        tl.to(pizza, { scale: 0.86, svgOrigin: '500 500', duration: 0.6, ease: 'power2.inOut' }, T.settle);
        // …and the lid closes over it
        tl.set('[data-lid-wrap]', { opacity: 1 }, T.lid);
        tl.fromTo('[data-lid]', { rotationX: -112 }, { rotationX: 0, duration: 1.4, ease: 'power2.inOut' }, T.lid);
        tl.to('[data-stage]', { scale: 0.94, rotation: -3, duration: 1, ease: 'power1.out' }, T.end);
        tl.fromTo('[data-atelier-cta]', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 }, T.end);

        // The step text follows the pizza.
        steps.forEach((step, i) => {
          if (i === 0) return;
          tl.to(steps[i - 1]!, { opacity: 0, y: -14, duration: 0.3 }, at(i));
          tl.fromTo(step, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35 }, at(i) + 0.15);
        });
      });
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      id="atelier"
      aria-labelledby="atelier-title"
      className="relative bg-ink-950 text-cream-50 motion-safe:h-[420svh]"
      data-testid="atelier"
    >
      <div className="grain sticky top-0 flex items-center overflow-hidden py-24 motion-safe:h-svh motion-safe:pt-0 motion-safe:pb-[5.5rem] md:py-32 md:motion-safe:pb-0">
        <div
          aria-hidden
          data-atelier-glow
          className="pointer-events-none absolute top-[12%] left-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(222,184,119,0.20),rgba(184,92,56,0.10)_55%,transparent_75%)]"
        />
        <div className="container-x relative grid w-full items-center gap-8 md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] motion-safe:gap-6 motion-safe:pt-[var(--header-h,4.5rem)]">
          <div data-atelier-copy className="relative z-10">
            <p className="eyebrow text-gold-400">{t.atelier.eyebrow}</p>
            <h2 id="atelier-title" className="font-display mt-3 text-[clamp(2.1rem,6vw,4.4rem)] leading-[0.98] font-medium md:mt-4">
              {t.atelier.title}
            </h2>
            <ol className="mt-5 grid md:mt-8 motion-safe:[grid-template-areas:'stack']">
              {t.atelier.steps.map((step, i) => (
                <li
                  key={step.title}
                  data-step={i}
                  className={cn(
                    'motion-safe:[grid-area:stack] motion-reduce:border-t motion-reduce:border-cream-50/10 motion-reduce:py-3',
                    i > 0 && 'motion-safe:opacity-0',
                  )}
                >
                  <p className="text-[12px] font-semibold tracking-[0.25em] text-gold-400 tabular">
                    {String(i + 1).padStart(2, '0')} / {String(t.atelier.steps.length).padStart(2, '0')}
                  </p>
                  <h3 className="font-display mt-1 text-[1.7rem] leading-tight md:text-[2.1rem]">{step.title}</h3>
                  <p className="mt-1 max-w-sm text-[15px] leading-relaxed text-cream-100/75 md:text-base">{step.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 hidden h-px w-full max-w-sm overflow-hidden bg-cream-50/15 motion-safe:block" aria-hidden>
              <div data-progress className="h-full origin-left bg-gold-400" />
            </div>
            <div data-atelier-cta className="mt-7 motion-safe:opacity-0">
              <Button variant="gold" onClick={() => scrollToId('menu')}>
                {t.atelier.cta}
              </Button>
            </div>
          </div>

          <div
            aria-hidden
            data-stage
            className="relative mx-auto aspect-square w-[min(80vw,40svh)] md:w-[min(60vw,52svh)] lg:w-[min(42vw,70svh)]"
          >
            <div
              data-atelier-heat
              className="absolute inset-[6%] rounded-full bg-[radial-gradient(closest-side,rgba(255,170,90,0.45),rgba(207,118,80,0.18)_60%,transparent_78%)] opacity-0"
            />
            <Art svg={boxBaseSvg} data-box-base className="absolute inset-0 motion-safe:opacity-0 motion-reduce:hidden" />
            <Art svg={pizzaSvg} data-pizza className="absolute inset-0" />
            <div data-lid-wrap className="absolute inset-0 [perspective:1500px] motion-safe:opacity-0 motion-reduce:hidden">
              <div data-lid className="relative size-full origin-[50%_4%] [transform-style:preserve-3d]">
                <Art svg={lidOutsideSvg} className="absolute inset-0 [backface-visibility:hidden]" />
                <Art svg={lidInsideSvg} className="absolute inset-0 [backface-visibility:hidden] [transform:rotateX(180deg)]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
