import { Hash, ScanLine } from 'lucide-react';
import { useRef } from 'react';
import { ButtonLink } from '@/components/ui';
import { useI18n } from '@/i18n';
import { revealIn, useGSAP } from '@/lib/motion';

export function AtTable() {
  const { t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  useGSAP(() => revealIn(ref.current), { scope: ref });

  return (
    <section ref={ref} className="grain relative overflow-hidden bg-terracotta-600 text-cream-50" aria-labelledby="at-table-title">
      <div className="absolute inset-0 bg-[radial-gradient(90%_140%_at_85%_0%,rgba(236,208,160,0.35),transparent_60%),radial-gradient(70%_120%_at_0%_100%,rgba(20,15,12,0.45),transparent_65%)]" />
      <div className="container-x relative grid items-center gap-10 py-20 md:grid-cols-12 md:py-24">
        <div className="md:col-span-7">
          <p className="eyebrow text-gold-200" data-reveal>
            {t.atTable.eyebrow}
          </p>
          <h2 id="at-table-title" className="font-display mt-6 text-[clamp(2.6rem,6vw,4.4rem)] leading-none font-medium" data-reveal>
            {t.atTable.title}
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-cream-100/90" data-reveal>
            {t.atTable.text}
          </p>
        </div>
        <div className="flex flex-col gap-3 md:col-span-5 md:items-end" data-reveal>
          <ButtonLink to="/table" state={{ autoScan: true }} variant="light" size="lg" className="w-full md:w-auto">
            <ScanLine className="size-5" aria-hidden />
            {t.atTable.scan}
          </ButtonLink>
          <ButtonLink to="/table" state={{ enter: true }} variant="outline-light" size="lg" className="w-full md:w-auto">
            <Hash className="size-5" aria-hidden />
            {t.atTable.enter}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
