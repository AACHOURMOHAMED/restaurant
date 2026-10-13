import { useEffect, useRef } from 'react';

/**
 * Rising embers — a sparse layer of warm sparks drifting up over the hero photo.
 *
 * Built to cost next to nothing:
 *  - at most 60 particles, each drawn as ONE pre-rendered glow sprite with additive blending;
 *  - devicePixelRatio capped at 1.5, ~30 fps on small screens;
 *  - the loop stops while the canvas is off-screen or the tab is hidden;
 *  - never runs with reduced motion or Save-Data (the hero only loads this chunk after the page is idle).
 *
 * The canvas fills its parent, which must be positioned and sized by the caller.
 */

type Ember = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  age: number;
  life: number;
  swayAmp: number;
  swayFreq: number;
  swayPhase: number;
  flickerFreq: number;
  flickerPhase: number;
  sprite: number;
};

const MAX_PARTICLES = 60;
const MIN_PARTICLES = 14;
/** One ember per this many CSS pixels² of canvas. */
const AREA_PER_EMBER = 26_000;
const SPRITE = 64;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A soft, hot-centred glow: white-gold core fading through orange to nothing. */
function makeSprite(core: string, glow: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const g = c.getContext('2d');
  if (!g) return c;
  const r = SPRITE / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255, 248, 230, 1)');
  grad.addColorStop(0.13, core);
  grad.addColorStop(0.32, glow);
  grad.addColorStop(0.62, 'rgba(160, 60, 20, 0.06)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, SPRITE, SPRITE);
  return c;
}

/** Embers are pure decoration: skipped for reduced motion and data-saving connections. */
export function embersAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData !== true;
}

export default function Embers({
  className,
  /** 0…1 — where along the width most embers rise (0.5 = evenly spread; higher = more on the right). */
  bias = 0.5,
}: {
  className?: string;
  bias?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !embersAllowed()) return;

    const sprites = [
      makeSprite('rgba(255, 216, 146, 1)', 'rgba(238, 152, 62, 0.42)'), // gold
      makeSprite('rgba(255, 176, 96, 1)', 'rgba(224, 100, 40, 0.46)'), // orange
      makeSprite('rgba(255, 200, 124, 1)', 'rgba(210, 124, 52, 0.38)'), // amber
    ];
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 0;
    let height = 0;
    let embers: Ember[] = [];
    let frameGap = 0; // minimum ms between frames (30 fps on small screens)

    // x position: `bias` above 0.5 pushes the distribution to the right (where the photos are bright).
    const exponent = bias >= 0.5 ? 1 - (bias - 0.5) * 1.2 : 1 + (0.5 - bias) * 1.6;
    const spawn = (e: Ember, initial: boolean) => {
      e.x = width * Math.random() ** exponent;
      e.y = initial ? height * (0.35 + Math.random() * 0.75) : height * (0.82 + Math.random() * 0.3);
      e.vx = -5 + Math.random() * 9;
      e.vy = -(16 + Math.random() * 30);
      e.size = 1 + Math.random() ** 3 * 2.2; // mostly small sparks, the odd bigger ember
      e.alpha = 0.7 + Math.random() * 0.3;
      e.life = 4.5 + Math.random() * 6.5;
      e.age = initial ? Math.random() * e.life * 0.7 : 0;
      e.swayAmp = 6 + Math.random() * 16;
      e.swayFreq = 0.4 + Math.random() * 0.9;
      e.swayPhase = Math.random() * Math.PI * 2;
      e.flickerFreq = 4 + Math.random() * 9;
      e.flickerPhase = Math.random() * Math.PI * 2;
      e.sprite = Math.floor(Math.random() * sprites.length);
      return e;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      frameGap = width < 768 ? 1000 / 30 : 0;
      const count = Math.round(Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, (width * height) / AREA_PER_EMBER)));
      if (embers.length > count) embers = embers.slice(0, count);
      while (embers.length < count) embers.push(spawn({} as Ember, true));
    };

    let raf = 0;
    let last = 0;
    let running = false;
    let onScreen = false;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const elapsed = now - last;
      if (elapsed < frameGap - 2) return;
      const dt = Math.min(elapsed, 100) / 1000; // long pauses don't make embers jump
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        e.age += dt;
        e.x += (e.vx + Math.sin(e.age * e.swayFreq + e.swayPhase) * e.swayAmp) * dt;
        e.y += e.vy * dt;
        if (e.age >= e.life || e.y < -24) {
          spawn(e, false);
          continue;
        }
        const p = e.age / e.life;
        const envelope = smoothstep(0, 0.14, p) * (1 - smoothstep(0.5, 1, p));
        const flicker = 0.68 + 0.32 * Math.sin(e.age * e.flickerFreq + e.flickerPhase) * Math.sin(e.age * e.flickerFreq * 0.37 + 1.7);
        const a = e.alpha * envelope * flicker;
        if (a <= 0.01) continue;
        const s = e.size * 12 * (1 - 0.4 * p); // cools and shrinks as it rises
        ctx.globalAlpha = a;
        ctx.drawImage(sprites[e.sprite]!, e.x - s / 2, e.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      if (canvas.style.opacity !== '1') canvas.style.opacity = '1';
    };

    const start = () => {
      if (running || !onScreen || document.hidden) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      onScreen = !!entry?.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onReduced = () => {
      if (!reduced.matches) return;
      stop();
      io.disconnect();
      ctx.clearRect(0, 0, width, height);
      canvas.style.opacity = '0';
    };
    reduced.addEventListener('change', onReduced);

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      reduced.removeEventListener('change', onReduced);
    };
  }, [bias]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={className}
      style={{
        opacity: 0,
        transition: 'opacity 2.4s cubic-bezier(0.33, 1, 0.68, 1)',
      }}
    />
  );
}
