import { restaurant } from '@content/restaurant';
import type { TimeRange } from '@shared/availability';
import { isoWeekday, type IsoWeekday } from '@shared/time';
import { Mail, MapPin, Navigation, Phone } from 'lucide-react';
import { useRef } from 'react';
import { Ornament, SocialIcon, zelligePattern } from '@/components/brand';
import { ButtonA, cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { formatDateLong, telHref, ucfirst } from '@/lib/format';
import { useReveal } from '@/lib/motion';
import { useSite } from '@/lib/queries';
import { OpenStatusBadge } from '../OpenStatusBadge';

const rangesText = (ranges: TimeRange[]) => ranges.map((r) => `${r.opens} – ${r.closes}`).join('  ·  ');

const label = 'text-[11px] font-semibold tracking-[0.24em] text-cream-100/55 uppercase';

export function Visit() {
  const { t, loc, locale } = useI18n();
  const site = useSite();
  const ref = useRef<HTMLElement>(null);
  useReveal(ref);

  const a = restaurant.address;
  const today = site.data ? isoWeekday(site.data.today) : null;
  const specials = (site.data?.specialDays ?? []).slice(0, 5);
  const socials = (Object.entries(restaurant.social) as [keyof typeof restaurant.social, string | null][]).filter(
    (e): e is [keyof typeof restaurant.social, string] => !!e[1],
  );

  return (
    <section ref={ref} id="infos" className="grain relative overflow-hidden bg-ink-900 py-24 text-cream-50 md:py-36" aria-labelledby="visit-title">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[35%] -left-[25%] h-[85vmax] w-[85vmax] rounded-full bg-[radial-gradient(closest-side,rgba(222,184,119,0.1),rgba(184,92,56,0.05)_55%,transparent_75%)]"
      />
      <div className="container-x relative grid gap-16 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <p className="eyebrow text-gold-400" data-reveal>
            {t.visit.eyebrow}
          </p>
          <h2
            id="visit-title"
            className="font-display mt-6 text-[clamp(2.8rem,7vw,5rem)] leading-[0.95] font-medium tracking-[-0.01em]"
            data-reveal
          >
            {t.visit.title}
          </h2>
          <Ornament className="mt-7 text-gold-400" />

          <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" data-reveal>
            <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <h3 className={cn(label, 'flex items-center gap-2.5')}>
                <MapPin className="size-4 text-gold-400" aria-hidden />
                {t.visit.address}
              </h3>
              <address className="font-display mt-4 text-[1.65rem] leading-[1.25] not-italic md:text-[1.85rem]">
                {a.street}
                {a.complement && (
                  <>
                    <br />
                    {a.complement}
                  </>
                )}
                <br />
                {a.postalCode} {a.city}, {loc(a.country)}
              </address>
              {a.landmark && <p className="mt-3 max-w-md text-sm leading-relaxed text-cream-100/65 italic">{loc(a.landmark)}</p>}
            </div>

            <div>
              <h3 className={cn(label, 'flex items-center gap-2.5')}>
                <Phone className="size-4 text-gold-400" aria-hidden />
                {t.visit.contact}
              </h3>
              <a
                href={telHref(restaurant.contact.phone)}
                className="font-display mt-3 inline-block text-[1.65rem] leading-tight tabular transition-colors hover:text-gold-300 md:text-[1.85rem]"
              >
                {restaurant.contact.phoneDisplay}
              </a>
              {restaurant.contact.email && (
                <a href={`mailto:${restaurant.contact.email}`} className="mt-2 flex items-center gap-2 text-cream-100/80 hover:text-gold-300">
                  <Mail className="size-4" aria-hidden />
                  {restaurant.contact.email}
                </a>
              )}
            </div>

            {socials.length > 0 && (
              <div>
                <h3 className={label}>{t.visit.follow}</h3>
                <ul className="mt-3 flex gap-2">
                  {socials.map(([name, url]) => (
                    <li key={name}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={name}
                        className="flex size-12 items-center justify-center rounded-full ring-1 ring-cream-50/15 transition-colors duration-300 hover:bg-gold-400 hover:text-ink-950 hover:ring-gold-400"
                      >
                        <SocialIcon name={name} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-12 flex flex-col gap-3 sm:flex-row" data-reveal>
            <ButtonA href={a.mapsUrl} target="_blank" rel="noopener noreferrer" variant="gold" size="lg">
              <Navigation className="size-4.5" aria-hidden />
              {t.visit.directions}
            </ButtonA>
            <ButtonA href={telHref(restaurant.contact.phone)} variant="outline-light" size="lg">
              <Phone className="size-4.5" aria-hidden />
              {t.visit.callUs}
            </ButtonA>
          </div>
        </div>

        <div className="lg:col-span-6 lg:col-start-7 lg:pt-4" data-reveal>
          <div className="relative overflow-hidden rounded-[2rem] bg-linear-to-b from-ink-800 to-ink-900 ring-1 ring-cream-50/10">
            {/* A strip of zellige lattice across the top of the card. */}
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-32 opacity-60 [mask-image:linear-gradient(to_bottom,#000,transparent)]"
              style={{ backgroundImage: zelligePattern('dark'), backgroundSize: '40px', backgroundPosition: 'center top' }}
            />
            <div className="relative p-6 pt-9 md:p-10 md:pt-12">
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <h3 className="font-display text-[2.1rem] leading-none font-medium md:text-[2.5rem]">{t.visit.hours}</h3>
                <OpenStatusBadge className="rounded-full bg-ink-950/60 px-3.5 py-1.5 text-sm text-cream-100/85 ring-1 ring-cream-50/10" />
              </div>
              <dl className="mt-8 divide-y divide-cream-50/10 border-t border-cream-50/10">
                {([1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]).map((d) => {
                  const ranges = site.data?.hours[d] ?? restaurant.defaultHours[d];
                  const isToday = today === d;
                  return (
                    <div
                      key={d}
                      className={cn(
                        'relative flex items-baseline justify-between gap-4 py-4 transition-colors',
                        isToday && 'text-gold-300 before:absolute before:inset-y-3 before:-left-6 before:w-0.5 before:rounded-full before:bg-gold-400 md:before:-left-10',
                      )}
                    >
                      <dt className="flex items-center gap-3 font-medium">
                        {t.visit.weekdays[d - 1]}
                        {isToday && (
                          <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.16em] uppercase">
                            {t.visit.today}
                          </span>
                        )}
                      </dt>
                      <dd className={cn('text-right tabular', ranges.length === 0 && 'text-cream-100/50 italic')}>
                        {ranges.length ? rangesText(ranges) : t.visit.closed}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {specials.length > 0 && (
                <div className="mt-6 rounded-2xl bg-gold-400/10 p-4 ring-1 ring-gold-400/20">
                  <h4 className="text-xs font-semibold tracking-[0.2em] text-gold-300 uppercase">{t.visit.exceptional}</h4>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {specials.map((s) => (
                      <li key={s.date} className="flex justify-between gap-4">
                        <span>{ucfirst(formatDateLong(s.date, locale))}</span>
                        <span className="text-right text-cream-100/80">
                          {s.closed ? t.visit.closed : rangesText(s.hours)}
                          {s.note ? ` — ${s.note}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {a.mapEmbedUrl && (
        <div className="container-x relative mt-14" data-reveal>
          <iframe
            title={`${t.visit.directions} — ${restaurant.name}`}
            src={a.mapEmbedUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-80 w-full rounded-[2rem] border-0 grayscale-[0.3]"
          />
        </div>
      )}
    </section>
  );
}
