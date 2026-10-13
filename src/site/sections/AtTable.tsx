import { Hash, ScanLine } from 'lucide-react';
import { useRef } from 'react';
import { hasPhoto, IllustrationNote, isIllustration, Ornament, Photo, photoMotion } from '@/components/brand';
import { ButtonLink, cn } from '@/components/ui';
import { useI18n } from '@/i18n';
import { revealIn, useMotion } from '@/lib/motion';

/** A laid table, behind the "already seated?" invitation (file in content/photos/). */
const BACKDROP = 'illustration-table-poissons.jpg';

/** Four gold corner marks with a slow scanning sheen — a camera viewfinder, echoing the QR code on the table. */
function Viewfinder({ className }: { className?: string }) {
  const corner = 'absolute size-[22%] border-gold-300/90';
  return (
    <div aria-hidden className={className}>
      <span className={`${corner} top-0 left-0 rounded-tl-[1.1rem] border-t-[1.5px] border-l-[1.5px]`} />
      <span className={`${corner} top-0 right-0 rounded-tr-[1.1rem] border-t-[1.5px] border-r-[1.5px]`} />
      <span className={`${corner} bottom-0 left-0 rounded-bl-[1.1rem] border-b-[1.5px] border-l-[1.5px]`} />
      <span className={`${corner} right-0 bottom-0 rounded-br-[1.1rem] border-r-[1.5px] border-b-[1.5px]`} />
      <span className="absolute inset-[6%] overflow-hidden rounded-[0.8rem]">
        <span className="absolute inset-x-0 top-0 h-2/5 animate-scroll-cue bg-linear-to-b from-transparent via-gold-300/10 to-gold-300/35 [animation-duration:3.6s] motion-reduce:hidden" />
      </span>
    </div>
  );
}

export function AtTable() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const photo = hasPhoto(BACKDROP);

  useMotion(
    (m) => {
      revealIn(m, ref.current);
      photoMotion(m, ref.current);
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className="grain relative isolate overflow-hidden bg-ink-950 text-cream-50" aria-labelledby="at-table-title">
      {photo ? (
        // Phones: a band of photo above the text. Desktop: the right half, fading into the dark on the left.
        <div className="absolute inset-x-0 top-0 -z-10 h-[min(84vw,30rem)] overflow-hidden md:inset-y-0 md:left-auto md:h-auto md:w-[58%]">
          <div data-parallax="7" className="absolute inset-x-0 -inset-y-[9%]">
            <Photo name={BACKDROP} alt="" sizes="(min-width: 768px) 58vw, 100vw" imgClassName="object-[56%_50%]" />
          </div>
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(13_9_7/0.5)_0%,transparent_28%,transparent_52%,rgb(13_9_7/0.85)_80%,#0d0907_100%)] md:bg-[linear-gradient(to_right,#0d0907_0%,rgb(13_9_7/0.72)_16%,rgb(13_9_7/0.18)_42%,transparent_60%),linear-gradient(to_top,rgb(13_9_7/0.6)_0%,transparent_30%),linear-gradient(to_bottom,rgb(13_9_7/0.45)_0%,transparent_22%)]"
          />
          <Viewfinder className="absolute top-[14%] left-1/2 aspect-square w-[min(46%,15rem)] -translate-x-1/2 md:top-1/2 md:left-[58%] md:w-[min(38%,17rem)] md:-translate-y-1/2" />
          {isIllustration(BACKDROP) && <IllustrationNote corner="bottom-right" className="max-md:top-3 max-md:bottom-auto" />}
        </div>
      ) : (
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(90%_140%_at_85%_0%,rgba(184,92,56,0.45),transparent_60%),radial-gradient(70%_120%_at_0%_100%,rgba(20,15,12,0.6),transparent_65%)]" />
      )}

      <div className={cn('container-x relative grid items-center pb-20 md:min-h-[40rem] md:grid-cols-12 md:py-32', photo ? 'pt-[calc(min(84vw,30rem)-5rem)]' : 'pt-20')}>
        <div className="md:col-span-6">
          <p className="eyebrow text-gold-300" data-reveal>
            {t.atTable.eyebrow}
          </p>
          <h2
            id="at-table-title"
            className="font-display mt-6 text-[clamp(2.8rem,7vw,5rem)] leading-[0.95] font-medium tracking-[-0.01em]"
            data-reveal
          >
            {t.atTable.title}
          </h2>
          <Ornament className="mt-7 text-gold-400" />
          <p className="mt-7 max-w-md text-[1.05rem] leading-relaxed text-cream-100/85 md:text-lg" data-reveal>
            {t.atTable.text}
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap [&>a]:whitespace-nowrap" data-reveal>
            <ButtonLink to="/table" state={{ autoScan: true }} variant="light" size="lg">
              <ScanLine className="size-5" aria-hidden />
              {t.atTable.scan}
            </ButtonLink>
            <ButtonLink to="/table" state={{ enter: true }} variant="outline-light" size="lg" className="backdrop-blur-[2px]">
              <Hash className="size-5" aria-hidden />
              {t.atTable.enter}
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
