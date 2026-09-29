import { restaurant } from '@content/restaurant';
import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { Logo } from '@/components/brand';
import { Button, Spinner } from '@/components/ui';
import { useMe, useSettings, useTables } from './api';
import { generalQrUrl, qrSvg, svgDataUrl, tableQrUrl } from './qr';
import { useStaffT } from './strings';

type Card = { key: string; title: string; subtitle?: string; url: string; fallback: string };

/** Printable A4 sheet of table cards (one QR code per table + the general QR code). */
export default function QrPrintPage() {
  const s = useStaffT();
  const me = useMe();
  const tables = useTables();
  const settings = useSettings();
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const base = settings.data?.publicUrl ?? window.location.origin;
  const host = new URL(base).host;

  const cards: Card[] = [
    ...(tables.data ?? [])
      .filter((tb) => tb.active)
      .map((tb) => ({ key: tb.code, title: `Table ${tb.number}`, url: tableQrUrl(base, tb.code), fallback: s.print.fallback(host, tb.number) })),
    { key: 'general', title: s.print.generalTitle, url: generalQrUrl(base), fallback: s.print.generalFallback(host) },
  ];
  const urls = cards.map((c) => c.url).join('|');

  useEffect(() => {
    document.title = `${s.print.title} · ${restaurant.name}`;
  }, [s]);

  useEffect(() => {
    if (!tables.data || !settings.data) return;
    let cancelled = false;
    void Promise.all(cards.map(async (c) => [c.key, await qrSvg(c.url)] as const)).then((entries) => {
      if (!cancelled) setSvgs(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls]);

  if (me.isError) return <Navigate to="/staff/login?next=/staff/tables" replace />;
  const ready = !!tables.data && !!settings.data && Object.keys(svgs).length === cards.length;

  return (
    <div className="min-h-svh bg-cream-100 print:bg-white">
      <style>{`@page { size: A4; margin: 10mm; }`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-ink-950 px-4 py-3 text-cream-50">
        <Link to="/staff/tables" className="inline-flex items-center gap-2 text-sm">
          <ArrowLeft className="size-4" aria-hidden />
          {s.print.back}
        </Link>
        <p className="font-semibold">{s.print.title}</p>
        <Button variant="gold" size="sm" onClick={() => window.print()} disabled={!ready}>
          <Printer className="size-4" aria-hidden />
          {s.print.printNow}
        </Button>
      </div>
      {!ready ? (
        <div className="py-24 text-center text-taupe-500">
          <Spinner />
        </div>
      ) : (
        <div className="mx-auto grid max-w-[190mm] grid-cols-2 gap-[6mm] p-[6mm] print:p-0">
          {cards.map((c) => (
            <article
              key={c.key}
              className="flex h-[128mm] break-inside-avoid flex-col items-center justify-between rounded-[6mm] border border-dashed border-taupe-300 bg-white px-[8mm] py-[7mm] text-center text-ink-900"
            >
              <div className="flex flex-col items-center">
                <Logo tone="dark" className="text-[7mm]" />
                <p className="font-display mt-[3mm] text-[13mm] leading-none font-semibold">{c.title}</p>
              </div>
              <img src={svgDataUrl(svgs[c.key]!)} alt={c.title} className="h-[62mm] w-[62mm]" />
              <div>
                <p className="text-[3.6mm] font-semibold">{s.print.scan}</p>
                <p className="text-[3.2mm] text-taupe-600">{s.print.scanEn}</p>
                <p className="mt-[2mm] text-[2.8mm] text-taupe-500">{c.fallback}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
