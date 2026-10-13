import { restaurant } from '@content/restaurant';
import { useI18n } from '@/i18n';

/** Small four-pointed gold star between the phrases. */
function Ornament() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="mx-[0.5em] size-[0.32em] shrink-0 fill-gold-400/90">
      <path d="M8 0c.5 4.6 2.9 7 8 8-5.1 1-7.5 3.4-8 8-.5-4.6-2.9-7-8-8 5.1-1 7.5-3.4 8-8Z" />
    </svg>
  );
}

/**
 * A slow band of words between the hero and the story — only facts the site already states
 * (cuisine, services, city, year). Pure CSS: the track holds the list twice and slides by half its
 * width, so the loop is seamless; it pauses on hover and stands still with reduced motion.
 */
export function Marquee() {
  const { t, loc } = useI18n();
  const items = [...t.marquee.items, `${restaurant.address.city} · ${t.story.since} ${restaurant.since}`, loc(restaurant.tagline)];

  const list = (copy: boolean) => (
    <ul className="marquee-list flex shrink-0 items-center" aria-hidden={copy || undefined} aria-label={copy ? undefined : t.marquee.label}>
      {items.map((item, i) => (
        <li key={i} className="flex items-center">
          <span className={i % 2 === 0 ? 'text-cream-100' : 'text-gold-300'}>{item}</span>
          <Ornament />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="marquee relative overflow-hidden border-y border-gold-400/15 bg-ink-950 py-7 md:py-10">
      <div className="marquee-mask">
        <div className="marquee-track font-display flex w-max text-[clamp(2.1rem,5.6vw,4.5rem)] leading-[1.15] font-normal whitespace-nowrap italic">
          {list(false)}
          {list(true)}
        </div>
      </div>
    </div>
  );
}
