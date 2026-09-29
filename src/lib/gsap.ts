// GSAP lives in its own chunk, loaded after the first paint (see `loadGsap` in motion.ts),
// so the page's first download is ~40 KB lighter. Nothing on screen needs it to appear.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
// Mobile browsers resize the viewport when the address bar hides; don't recompute on that.
ScrollTrigger.config({ ignoreMobileResize: true });

export { gsap, ScrollTrigger };
