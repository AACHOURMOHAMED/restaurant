import type { ReactNode } from 'react';
import { cn } from '@/components/ui';

/** Dark, compact header band for inner pages (reservation, status…). */
export function PageHero({ eyebrow, title, children, className }: { eyebrow?: ReactNode; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('grain relative overflow-hidden bg-ink-950 pt-[calc(var(--header-h,4.5rem)+3.5rem)] pb-28 text-cream-50 md:pb-32', className)}>
      <div className="absolute -top-1/2 -right-1/4 h-[70vmax] w-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgba(222,184,119,0.20),transparent_70%)]" />
      <div className="container-x relative">
        {eyebrow && <p className="eyebrow text-gold-400">{eyebrow}</p>}
        <h1 className="font-display mt-5 text-[clamp(2.6rem,7vw,4.8rem)] leading-[0.98] font-medium">{title}</h1>
        {children && <div className="mt-5 max-w-2xl text-lg leading-relaxed text-cream-100/80">{children}</div>}
      </div>
    </div>
  );
}
