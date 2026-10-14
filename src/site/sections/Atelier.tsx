import { restaurant } from '@content/restaurant';
import { useEffect, useRef, useState, type HTMLAttributes, type RefObject } from 'react';
import type { PizzaArt } from '@/assets/pizza';
import { Photo } from '@/components/brand';
import { Button, cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { MOTION_OK, scrollToId, useMotion } from '@/lib/motion';

/** Glimpsed, blurred, behind the oven step. */
const FIRE_PHOTO = 'illustration-braises.jpg';
const FIRE_IS_ILLUSTRATION = restaurant.illustrations.includes(FIRE_PHOTO);

/**
 * Scroll units of the timeline. The section is 480svh tall: the stage stays in view (CSS sticky) for
 * 380svh of scrolling, spread over T.total units (≈ 28svh each).
 */
const T = { dough: 0.25, sauce: 1.9, cheese: 3.5, toppings: 4.9, bake: 7.3, box: 9.0, drop: 10.25, lid: 10.95, settle: 12.15, total: 13.5 };
/** When each step's text takes over (same order as t.atelier.steps). */
const STEP_AT = [0, T.sauce, T.cheese, T.toppings, T.bake, T.box];
/** The open lid leans back by this much (and is closed at 0). */
const LID_OPEN = -118;

/** Inline SVG artwork (our own static files), so its layers can be animated one by one. */
function Art({ svg, className, ...rest }: { svg: string } & HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('[&>svg]:block [&>svg]:size-full', className)} dangerouslySetInnerHTML={{ __html: svg }} {...rest} />;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The drawings (~45 KB gzipped) are a separate chunk, fetched when the section comes within 1.5 screens. */
function usePizzaArt(ref: RefObject<HTMLElement | null>) {
  const [art, setArt] = useState<PizzaArt | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const load = () =>
      void import('@/assets/pizza').then(
        (m) => !cancelled && setArt(m.art),
        () => undefined, // offline: the stage simply stays empty
      );
    if (typeof IntersectionObserver === 'undefined') {
      load();
      return () => void (cancelled = true);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        load();
      },
      { rootMargin: '150% 0px' },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [ref]);
  return art;
}

type Sparks = { setActive(on: boolean): void; stop(): void };

/**
 * Sparks rising from the oven during the bake step: ≤ 40 sprites on a canvas (devicePixelRatio ≤ 1.5),
 * drawn only while the step is on screen and the tab visible. Never created with reduced motion or Save-Data.
 */
function startSparks(canvas: HTMLCanvasElement): Sparks {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setActive() {}, stop() {} };
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const s = sprite.getContext('2d');
  if (s) {
    const g = s.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,244,214,1)');
    g.addColorStop(0.18, 'rgba(255,190,110,0.9)');
    g.addColorStop(0.45, 'rgba(230,110,40,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = g;
    s.fillRect(0, 0, 32, 32);
  }
  type P = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; phase: number };
  let w = 0;
  let h = 0;
  const ps: P[] = [];
  const spawn = (p: Partial<P>, initial: boolean): P =>
    Object.assign(p, {
      x: w * (0.15 + Math.random() * 0.7),
      y: initial ? h * (0.3 + Math.random() * 0.7) : h * (0.9 + Math.random() * 0.15),
      vx: -8 + Math.random() * 16,
      vy: -(30 + Math.random() * 55),
      age: 0,
      life: 2.5 + Math.random() * 3.5,
      size: 8 + Math.random() ** 2 * 18,
      phase: Math.random() * 6.3,
    });
  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(40, Math.max(12, Math.round((w * h) / 30000)));
    ps.length = Math.min(ps.length, count);
    while (ps.length < count) ps.push(spawn({}, true));
  };
  let raf = 0;
  let last = 0;
  let active = false;
  let onScreen = false;
  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(now - last, 100) / 1000;
    last = now;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of ps) {
      p.age += dt;
      if (p.age > p.life || p.y < -20) spawn(p, false);
      p.x += (p.vx + Math.sin(p.age * 1.7 + p.phase) * 14) * dt;
      p.y += p.vy * dt;
      const k = p.age / p.life;
      ctx.globalAlpha = Math.min(1, k * 6) * (1 - k) * (0.65 + 0.35 * Math.sin(p.age * 11 + p.phase));
      const size = p.size * (1 - 0.4 * k);
      ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    if (active && onScreen && !document.hidden) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf && active && onScreen && !document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => {
    onScreen = !!e?.isIntersecting;
    kick();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', kick);
  return {
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on) kick();
      else ctx.clearRect(0, 0, w, h);
    },
    stop() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', kick);
    },
  };
}

function useSparks(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const sparks = useRef<Sparks | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (!canvas || saveData || !window.matchMedia(MOTION_OK).matches) return;
    const idle = window.requestIdleCallback as typeof window.requestIdleCallback | undefined; // not in Safari
    const start = () => (sparks.current = startSparks(canvas));
    const id = idle ? idle(start, { timeout: 3000 }) : window.setTimeout(start, 1200);
    return () => {
      if (idle) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
      sparks.current?.stop();
      sparks.current = null;
    };
  }, [canvasRef]);
  return sparks;
}

/**
 * "L'atelier": as the visitor scrolls, a pizza is made on its board — dough, sauce spread in a spiral,
 * mozzarella, seafood — baked, slid into a kraft box whose lid closes on the B&B seal.
 * One scrubbed GSAP timeline drives it; the stage is CSS-sticky (no pinning, so the page height never
 * changes when GSAP arrives). With reduced motion the section is a short, static composition: the pizza
 * in its open box beside the list of steps.
 */
export function Atelier() {
  const { t, locale } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const sparksCanvas = useRef<HTMLCanvasElement>(null);
  const art = usePizzaArt(ref);
  const sparks = useSparks(sparksCanvas);

  useMotion(
    ({ gsap, ScrollTrigger }) => {
      const root = ref.current;
      if (!root || !art) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const q = <E extends Element>(sel: string) => root.querySelector<E>(sel);
        const all = <E extends Element>(sel: string) => Array.from(root.querySelectorAll<E>(sel));
        const dough = q('#atl-dough');
        const sauce = q('#atl-sauce');
        const spiral = q<SVGPathElement>('#atl-p-spiral');
        const baked = q('#atl-baked');
        const cta = q<HTMLElement>('[data-atelier-cta]');
        if (!dough || !sauce || !spiral || !baked || !cta) return;
        const patches = all('#atl-cheese .atl-patch');
        const pieces = all('#atl-toppings .atl-topping');
        const steps = all<HTMLElement>('[data-step]');
        const segments = all<HTMLElement>('[data-segment]');
        const len = spiral.getTotalLength();
        const done = (T.settle + 0.6) / T.total;

        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.8,
            onUpdate: ({ progress }) => {
              const time = progress * T.total;
              sparks.current?.setActive(time > T.bake - 0.1 && time < T.box + 0.3);
              cta.style.pointerEvents = progress >= done ? '' : 'none';
            },
          },
        });
        cta.style.pointerEvents = 'none';

        // Ambient light drifts slowly the whole way.
        tl.fromTo('[data-atelier-glow]', { yPercent: 14 }, { yPercent: -10, duration: T.total }, 0);

        // 1. The dough spins in, like a base tossed by hand.
        tl.from(dough, { autoAlpha: 0, scale: 0.3, rotation: -260, svgOrigin: '500 500', duration: 1.4, ease: 'power3.out' }, T.dough);

        // 2. The sauce spreads in a spiral (a thick stroke drawn along a spiral path masks it).
        tl.from(sauce, { autoAlpha: 0, duration: 0.01 }, T.sauce);
        tl.from(sauce, { rotation: -70, svgOrigin: '500 500', duration: 1.4, ease: 'power1.out' }, T.sauce);
        tl.fromTo(spiral, { strokeDasharray: `${len} ${len}`, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.4, ease: 'power1.inOut' }, T.sauce);
        tl.set(sauce, { attr: { mask: 'none' } }, T.sauce + 1.45); // fully spread: drop the (costly) mask

        // 3. Mozzarella, from the centre outwards.
        tl.from(patches, { autoAlpha: 0, scale: 0.15, transformOrigin: '50% 50%', duration: 0.55, stagger: 0.075, ease: 'back.out(1.8)' }, T.cheese);

        // 4. The toppings drop in one by one.
        const each = (T.bake - 0.25 - T.toppings - 0.5) / Math.max(pieces.length, 1);
        tl.from(
          pieces,
          {
            autoAlpha: 0,
            y: '-=150',
            scale: 1.8,
            rotation: (i: number) => ((i * 47) % 120) - 60,
            transformOrigin: '50% 50%',
            duration: 0.5,
            stagger: each,
            ease: 'power3.out',
          },
          T.toppings,
        );

        // 5. The oven: firelight, sparks, a golden crust.
        tl.fromTo('[data-atelier-fire]', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, T.bake - 0.1);
        tl.to('[data-atelier-fire]', { autoAlpha: 0, duration: 0.6 }, T.box - 0.1);
        tl.fromTo('[data-atelier-heat]', { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1.08, duration: 0.9, ease: 'power2.out' }, T.bake);
        tl.to('[data-atelier-heat]', { autoAlpha: 0, duration: 0.6 }, T.box);
        tl.from(baked, { autoAlpha: 0, duration: 1.2, ease: 'power1.inOut' }, T.bake + 0.25);
        tl.to('[data-atelier-pizza]', { scale: 1.025, duration: 0.6, yoyo: true, repeat: 1, ease: 'sine.inOut' }, T.bake + 0.2);

        // 6. Into the box: the pizza lifts off its board, the camera pulls back to make room for the open
        //    lid, the board drifts away while the open box slides in underneath, and the pizza settles.
        tl.to('[data-atelier-pizza]', { scale: 1.06, duration: 0.5, ease: 'power2.out' }, T.box);
        tl.to('[data-atelier-scene]', { scale: 0.78, yPercent: 12, duration: 0.9, ease: 'power2.inOut' }, T.box);
        tl.to('[data-atelier-board]', { xPercent: -18, scale: 0.9, rotation: -8, autoAlpha: 0, duration: 0.9, ease: 'power2.in' }, T.box + 0.15);
        tl.fromTo(
          ['[data-atelier-box]', '[data-atelier-lid-wrap]'],
          { xPercent: 125, rotation: 5, autoAlpha: 0 },
          { xPercent: 0, rotation: 0, autoAlpha: 1, duration: 1, ease: 'power3.out' },
          T.box + 0.45,
        );
        tl.to('[data-atelier-pizza]', { scale: 0.94, duration: 0.55, ease: 'power2.in' }, T.drop);

        // 7. The lid closes (it accelerates, then lands with a small bump)…
        tl.fromTo('[data-atelier-lid]', { rotationX: LID_OPEN }, { rotationX: 0, duration: 1.05, ease: 'power2.in' }, T.lid);
        tl.set('[data-atelier-pizza]', { autoAlpha: 0 }, T.lid + 1.1); // hidden under the lid: no need to paint it
        tl.to('[data-atelier-scene]', { scale: 0.765, duration: 0.1, yoyo: true, repeat: 1, ease: 'power1.out' }, T.lid + 1); // ends as the settle begins
        // …and the box settles, turned slightly, the seal facing the viewer.
        tl.to('[data-atelier-scene]', { scale: 0.9, yPercent: 2, rotation: -4, duration: 0.9, ease: 'power3.out' }, T.settle);
        tl.to('[data-atelier-glow]', { opacity: 1, scale: 1.15, duration: 0.9 }, T.settle);
        tl.fromTo(cta, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, T.settle + 0.3);

        // The step texts follow the pizza; the progress bar fills step by step.
        steps.forEach((step, i) => {
          if (i === 0) return;
          tl.to(steps[i - 1]!, { opacity: 0, y: -14, duration: 0.3 }, STEP_AT[i]! - 0.15);
          tl.fromTo(step, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35 }, STEP_AT[i]! + 0.1);
        });
        segments.forEach((seg, i) => {
          const from = STEP_AT[i] ?? 0;
          tl.fromTo(seg, { scaleX: 0 }, { scaleX: 1, duration: (STEP_AT[i + 1] ?? T.settle) - from }, from);
        });

        // Sections above may change height after loading (menu, photos): keep the trigger positions right.
        // A refresh restores the scroll position, which would cut a smooth scroll short (e.g. "Voir la
        // carte" from the hero), so it waits until the page has stopped scrolling.
        let timer = 0;
        let lastScroll = 0;
        let height = document.body.offsetHeight;
        const onScroll = () => void (lastScroll = performance.now());
        const refreshWhenIdle = () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => (performance.now() - lastScroll < 400 ? refreshWhenIdle() : ScrollTrigger.refresh()), 300);
        };
        const ro = new ResizeObserver(() => {
          if (document.body.offsetHeight === height) return;
          height = document.body.offsetHeight;
          refreshWhenIdle();
        });
        ro.observe(document.body);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
          ro.disconnect();
          window.removeEventListener('scroll', onScroll);
          window.clearTimeout(timer);
          cta.style.pointerEvents = '';
          sparks.current?.setActive(false);
        };
      });
    },
    { scope: ref, deps: [art] },
  );

  const since = t.atelier.box.since(restaurant.since).toLocaleUpperCase(locale);
  const lidInside = art?.lidInside.replace('{{greeting}}', xml(t.atelier.box.greeting));
  const lidOutside = art?.lidOutside.replace('{{since}}', xml(since));

  return (
    <section
      ref={ref}
      id="atelier"
      aria-labelledby="atelier-title"
      className="relative bg-ink-950 text-cream-50 motion-safe:h-[480svh]"
      data-testid="atelier"
    >
      <div className="grain sticky top-0 overflow-hidden motion-safe:flex motion-safe:h-svh motion-safe:flex-col motion-safe:pt-[calc(var(--header-h,4.5rem)+1rem)] motion-safe:pb-[calc(6.25rem+env(safe-area-inset-bottom))] motion-reduce:py-24 md:motion-safe:pb-10 md:motion-reduce:py-32">
        {/* The oven, glimpsed: a blurred, darkened photo behind the bake step. */}
        <div aria-hidden data-atelier-fire className="pointer-events-none invisible absolute inset-0 opacity-0 [will-change:opacity] motion-reduce:hidden">
          <Photo
            name={FIRE_PHOTO}
            alt=""
            sizes="320px"
            className="absolute inset-0"
            imgClassName="scale-125 blur-2xl brightness-[0.8] saturate-[1.3]"
            placeholderTone="warm"
          />
          {/* A warm wash (multiply): dimmed white-yellow flames would otherwise read grey-olive. */}
          <div className="absolute inset-0 bg-[rgb(207_118_80/0.42)] mix-blend-multiply" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(13,9,7,0.86),rgba(13,9,7,0.2)_30%,rgba(13,9,7,0.15)_60%,rgba(13,9,7,0.9)_78%)] lg:bg-[linear-gradient(to_right,rgba(13,9,7,0.92),rgba(13,9,7,0.5)_42%,rgba(13,9,7,0.05))]" />
          <canvas ref={sparksCanvas} className="absolute inset-0 size-full will-change-transform" />
        </div>
        <div
          aria-hidden
          data-atelier-glow
          className="pointer-events-none absolute top-[14%] left-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(222,184,119,0.2),rgba(184,92,56,0.1)_55%,transparent_75%)] opacity-80 lg:left-[64%]"
        />

        <div className="container-x relative z-10 grid w-full min-h-0 flex-1 gap-x-16 gap-y-4 motion-safe:max-lg:[@media(max-height:760px)]:gap-y-3 [grid-template-areas:'head'_'stage'_'steps'] motion-safe:grid-rows-[auto_minmax(0,1fr)_auto] motion-reduce:gap-y-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:[grid-template-areas:'._stage'_'head_stage'_'steps_stage'_'._stage'] lg:motion-safe:grid-rows-[1fr_auto_auto_1fr] lg:motion-reduce:items-center">
          <header className="[grid-area:head]">
            <p className="eyebrow text-gold-400 motion-safe:max-lg:[@media(max-height:760px)]:hidden">{t.atelier.eyebrow}</p>
            <h2 id="atelier-title" className="font-display mt-3 text-[clamp(2rem,6vw,4.4rem)] leading-[0.98] font-medium text-balance md:mt-5 motion-safe:max-lg:[@media(max-height:760px)]:mt-0 motion-safe:max-lg:[@media(max-height:760px)]:text-[1.55rem]">
              {t.atelier.title}
            </h2>
          </header>

          <div aria-hidden data-atelier-stage className="relative [grid-area:stage] motion-safe:min-h-0 motion-safe:[container-type:size] motion-reduce:mx-auto motion-reduce:w-[min(100%,30rem)] max-md:motion-reduce:w-[82%]">
            <div className="relative aspect-square motion-safe:absolute motion-safe:inset-0 motion-safe:m-auto motion-safe:size-[min(100cqw,100cqh)] [container-type:size]">
              <div
                data-atelier-heat
                className="invisible absolute inset-[4%] rounded-full bg-[radial-gradient(closest-side,rgba(255,170,90,0.5),rgba(207,118,80,0.2)_60%,transparent_80%)] opacity-0"
              />
              {art && (
                <div data-atelier-scene className="absolute inset-0 motion-safe:[transform:scale(1.1)] motion-reduce:[transform:translateY(11%)_scale(0.76)]">
                  <Art svg={art.board} data-atelier-board className="absolute inset-0 motion-safe:will-change-transform motion-reduce:hidden" />
                  <Art svg={art.boxBase} data-atelier-box className="absolute inset-0 motion-safe:invisible motion-safe:opacity-0" />
                  <Art svg={art.pizza} data-atelier-pizza className="absolute inset-0 motion-safe:will-change-transform motion-reduce:scale-[0.94]" />
                  <div data-atelier-lid-wrap className="absolute inset-0 [perspective:240cqw] motion-safe:invisible motion-safe:opacity-0">
                    <div data-atelier-lid className="relative size-full origin-[50%_5%] [transform-style:preserve-3d] [transform:rotateX(-118deg)]">
                      <Art svg={lidOutside!} className="absolute inset-0 [backface-visibility:hidden]" />
                      <Art svg={lidInside!} className="absolute inset-0 [backface-visibility:hidden] [transform:rotateX(180deg)]" />
                    </div>
                  </div>
                </div>
              )}
              {FIRE_IS_ILLUSTRATION && (
                <p
                  aria-hidden
                  data-atelier-fire
                  className="invisible absolute bottom-0 left-0 text-[10px] font-semibold tracking-[0.2em] text-cream-100/80 uppercase opacity-0 [text-shadow:0_1px_6px_rgba(0,0,0,0.8)] motion-reduce:hidden"
                >
                  {t.atelier.illustration}
                </p>
              )}
            </div>
          </div>

          <div className="[grid-area:steps] lg:mt-8">
            <ol className="grid motion-safe:[grid-template-areas:'stack']">
              {t.atelier.steps.map((step, i) => (
                <li
                  key={i} // by position: the same elements keep their animation when the language changes
                  data-step={i}
                  className={cn(
                    'motion-safe:[grid-area:stack] motion-reduce:border-t motion-reduce:border-cream-50/10 motion-reduce:py-3 md:motion-reduce:py-4',
                    i > 0 && 'motion-safe:opacity-0',
                  )}
                >
                  <p className="text-[12px] font-semibold tracking-[0.25em] text-gold-400 tabular">
                    {String(i + 1).padStart(2, '0')} <span className="text-cream-100/60">/ {String(t.atelier.steps.length).padStart(2, '0')}</span>
                  </p>
                  <h3 className="font-display mt-1 text-[1.65rem] leading-tight md:text-[2.1rem] lg:text-[2.5rem] motion-safe:max-lg:[@media(max-height:760px)]:text-[1.35rem] max-md:motion-reduce:text-[1.4rem]">{step.title}</h3>
                  <p className="mt-1 max-w-sm text-[15px] leading-relaxed text-cream-100/80 md:text-base motion-safe:max-lg:[@media(max-height:760px)]:hidden">{step.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-center gap-5 md:mt-7 motion-safe:max-lg:[@media(max-height:760px)]:mt-2">
              <div aria-hidden className="flex max-w-xs flex-1 gap-1.5 motion-reduce:hidden">
                {t.atelier.steps.map((_, i) => (
                  <span key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-cream-50/15">
                    <span data-segment className="block size-full origin-left scale-x-0 bg-gold-400" />
                  </span>
                ))}
              </div>
              <div data-atelier-cta className="shrink-0 focus-within:opacity-100! motion-reduce:mt-2">
                <Button variant="gold" onClick={() => scrollToId('menu')}>
                  {t.atelier.cta}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
