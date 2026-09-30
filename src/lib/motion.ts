import { useLayoutEffect, useRef, type DependencyList, type RefObject } from 'react';

export type Gsap = typeof import('./gsap');

let gsapPromise: Promise<Gsap> | null = null;
let gsapLoaded: Gsap | null = null;

/** Loads GSAP + ScrollTrigger once (a separate chunk, fetched after the page has painted). */
export function loadGsap(): Promise<Gsap> {
  gsapPromise ??= import('./gsap').then((m) => (gsapLoaded = m));
  return gsapPromise;
}

export const MOTION_OK = '(prefers-reduced-motion: no-preference)';

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs GSAP code — before paint once GSAP is loaded, otherwise as soon as it arrives.
 * Everything created inside `setup` belongs to a gsap.context (selectors are scoped to
 * `scope`) and is reverted when the component unmounts or `deps` change — the same
 * contract as @gsap/react's useGSAP.
 */
export function useMotion(setup: (m: Gsap) => void | (() => void), { scope, deps = [] }: { scope?: RefObject<Element | null>; deps?: DependencyList } = {}) {
  const setupRef = useRef(setup);
  setupRef.current = setup;
  useLayoutEffect(() => {
    let ctx: gsap.Context | undefined;
    let cancelled = false;
    const run = (m: Gsap) => {
      ctx = m.gsap.context(() => setupRef.current(m), scope?.current ?? undefined);
    };
    if (gsapLoaded) run(gsapLoaded);
    else
      void loadGsap().then((m) => {
        if (!cancelled) run(m);
      });
    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, deps); // the caller's dependency list, as with useEffect
}

/** Elements already on screen (or scrolled past) when the animations are set up stay as they are. */
const belowTheFold = (els: HTMLElement[]) => {
  const limit = window.innerHeight;
  return els.filter((el) => el.getBoundingClientRect().top > limit);
};

/**
 * Scroll-triggered reveals inside `root`:
 *  - `[data-reveal]` fades/slides in once when it enters the viewport;
 *  - children of `[data-stagger]` appear in a staggered cascade.
 * Only `opacity`/transform are animated — never `visibility` — so content
 * below the fold stays in the accessibility tree and reachable with Tab.
 * Nothing is animated (and everything stays visible) with reduced motion.
 * Call inside useMotion so everything is reverted on unmount.
 *
 * Performance: all positions are read first, then elements are hidden with ONE `gsap.set`
 * per group, so the page's styles are recalculated once instead of once per element
 * (interleaving reads and writes cost ~0.5 s of main thread on a mid-range phone).
 */
export function revealIn({ gsap, ScrollTrigger }: Gsap, root: HTMLElement | null) {
  if (!root) return;
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    const singles = belowTheFold(Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]')));
    const groups = Array.from(root.querySelectorAll<HTMLElement>('[data-stagger]')).map((group) =>
      belowTheFold(Array.from(group.children) as HTMLElement[]),
    );
    if (singles.length > 0) {
      gsap.set(singles, { opacity: 0, y: (_i: number, el: HTMLElement) => Number(el.dataset.revealY ?? 34) });
      ScrollTrigger.batch(singles, {
        start: 'top 88%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 1.15,
            ease: 'expo.out',
            delay: (_i: number, el: HTMLElement) => Number(el.dataset.revealDelay ?? 0),
            overwrite: true,
          }),
      });
    }
    const items = groups.flat();
    if (items.length > 0) gsap.set(items, { opacity: 0, y: 28 });
    for (const children of groups) {
      if (children.length === 0) continue;
      ScrollTrigger.batch(children, {
        start: 'top 92%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { opacity: 1, y: 0, duration: 0.85, ease: 'power3.out', stagger: 0.075, overwrite: true }),
      });
    }
  });
}

/** Scroll reveals for a section (see revealIn). Re-run when `deps` change. */
export function useReveal(ref: RefObject<HTMLElement | null>, deps: DependencyList = []) {
  useMotion((m) => revealIn(m, ref.current), { scope: ref, deps });
}

/** Smooth-scrolls to an element (instant with reduced motion). */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

/** Publishes an element's height as the `--header-h` CSS variable (used for sticky offsets). */
export function observeHeaderHeight(el: HTMLElement): () => void {
  const apply = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
  apply();
  const ro = new ResizeObserver(apply);
  ro.observe(el);
  return () => ro.disconnect();
}
