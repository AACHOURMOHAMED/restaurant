import { restaurant } from '@content/restaurant';
import type { TimeRange } from '@shared/availability';
import { isoWeekday, type IsoWeekday } from '@shared/time';
import { Mail, MapPin, Navigation, Phone } from 'lucide-react';
import { useRef } from 'react';
import { SocialIcon } from '@/components/brand';
import { ButtonA, cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { formatDateLong, telHref, ucfirst } from '@/lib/format';
import { useReveal } from '@/lib/motion';
import { useSite } from '@/lib/queries';
import { OpenStatusBadge } from '../OpenStatusBadge';

const rangesText = (ranges: TimeRange[]) => ranges.map((r) => `${r.opens} – ${r.closes}`).join('  ·  ');

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
    <section ref={ref} id="infos" className="grain relative bg-ink-900 py-24 text-cream-50 md:py-32" aria-labelledby="visit-title">
      <div className="container-x grid gap-14 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <p className="eyebrow text-gold-400" data-reveal>
            {t.visit.eyebrow}
          </p>
          <h2 id="visit-title" className="font-display mt-6 text-[clamp(2.6rem,6vw,4.4rem)] leading-none font-medium" data-reveal>
            {t.visit.title}
          </h2>

          <div className="mt-10 space-y-8" data-reveal>
            <div className="flex gap-4">
              <MapPin className="mt-1 size-5 shrink-0 text-gold-400" aria-hidden />
              <div>
                <h3 className="text-xs font-semibold tracking-[0.22em] text-cream-100/55 uppercase">{t.visit.address}</h3>
                <address className="mt-2 text-lg leading-relaxed not-italic">
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
                {a.landmark && <p className="mt-2 text-sm text-cream-100/60 italic">{loc(a.landmark)}</p>}
              </div>
            </div>

            <div className="flex gap-4">
              <Phone className="mt-1 size-5 shrink-0 text-gold-400" aria-hidden />
              <div>
                <h3 className="text-xs font-semibold tracking-[0.22em] text-cream-100/55 uppercase">{t.visit.contact}</h3>
                <a href={telHref(restaurant.contact.phone)} className="mt-2 block text-lg hover:text-gold-300">
                  {restaurant.contact.phoneDisplay}
                </a>
                {restaurant.contact.email && (
                  <a href={`mailto:${restaurant.contact.email}`} className="mt-1 inline-flex items-center gap-2 text-cream-100/80 hover:text-gold-300">
                    <Mail className="size-4" aria-hidden />
                    {restaurant.contact.email}
                  </a>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <ButtonA href={a.mapsUrl} target="_blank" rel="noopener noreferrer" variant="gold">
                <Navigation className="size-4.5" aria-hidden />
                {t.visit.directions}
              </ButtonA>
              <ButtonA href={telHref(restaurant.contact.phone)} variant="outline-light">
                <Phone className="size-4.5" aria-hidden />
                {t.visit.callUs}
              </ButtonA>
            </div>

            {socials.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold tracking-[0.22em] text-cream-100/55 uppercase">{t.visit.follow}</h3>
                <ul className="mt-3 flex gap-2">
                  {socials.map(([name, url]) => (
                    <li key={name}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={name}
                        className="flex size-12 items-center justify-center rounded-full ring-1 ring-cream-50/15 transition-colors hover:bg-cream-50/10 hover:text-gold-300"
                      >
                        <SocialIcon name={name} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-6 lg:col-start-7" data-reveal>
          <div className="rounded-[2rem] bg-ink-800/80 p-6 ring-1 ring-cream-50/10 md:p-9">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-3xl font-medium">{t.visit.hours}</h3>
              <OpenStatusBadge className="text-sm text-cream-100/80" />
            </div>
            <dl className="mt-6 divide-y divide-cream-50/10">
              {([1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]).map((d) => {
                const ranges = site.data?.hours[d] ?? restaurant.defaultHours[d];
                const isToday = today === d;
                return (
                  <div key={d} className={cn('flex items-baseline justify-between gap-4 py-3.5', isToday && 'text-gold-300')}>
                    <dt className="flex items-center gap-3 font-medium">
                      {t.visit.weekdays[d - 1]}
                      {isToday && (
                        <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.16em] uppercase">
                          {t.visit.today}
                        </span>
                      )}
                    </dt>
                    <dd className={cn('text-right tabular', ranges.length === 0 && 'text-cream-100/45 italic')}>
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

      {a.mapEmbedUrl && (
        <div className="container-x mt-14" data-reveal>
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
