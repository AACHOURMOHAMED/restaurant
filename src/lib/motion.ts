import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger, useGSAP);
// Mobile browsers resize the viewport when the address bar hides; don't recompute on that.
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger, useGSAP };

export const MOTION_OK = '(prefers-reduced-motion: no-preference)';

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Scroll-triggered reveals inside `root`:
 *  - `[data-reveal]` fades/slides in once when it enters the viewport;
 *  - children of `[data-stagger]` appear in a staggered cascade.
 * Only `opacity`/transform are animated — never `visibility` — so content
 * below the fold stays in the accessibility tree and reachable with Tab.
 * Nothing is animated (and everything stays visible) with reduced motion.
 * Call inside useGSAP so everything is reverted on unmount.
 */
export function revealIn(root: HTMLElement | null) {
  if (!root) return;
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        opacity: 0,
        y: Number(el.dataset.revealY ?? 34),
        duration: 1.15,
        delay: Number(el.dataset.revealDelay ?? 0),
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });
    root.querySelectorAll<HTMLElement>('[data-stagger]').forEach((group) => {
      const items = Array.from(group.children) as HTMLElement[];
      if (items.length === 0) return;
      gsap.set(items, { opacity: 0, y: 28 });
      ScrollTrigger.batch(items, {
        start: 'top 92%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { opacity: 1, y: 0, duration: 0.85, ease: 'power3.out', stagger: 0.075, overwrite: true }),
      });
    });
  });
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
