import { useI18n } from '@/i18n';
import { formatDateLong } from '@/lib/format';
import { useOpenStatus, useSite } from '@/lib/queries';
import { cn } from '@/components/ui';
import { daysBetween } from '@shared/time';

export function OpenStatusBadge({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  const status = useOpenStatus();
  const site = useSite();
  if (!status || !site.data) return null;

  let label: string;
  if (status.open) {
    label = t.status.openUntil(status.closesAt);
  } else if (status.nextOpening) {
    const diff = daysBetween(site.data.today, status.nextOpening.date);
    const day =
      diff === 0 ? t.status.today : diff === 1 ? t.status.tomorrow : formatDateLong(status.nextOpening.date, locale).split(' ')[0];
    label = t.status.closedUntil(`${day} ${t.status.at} ${status.nextOpening.time}`);
  } else {
    label = t.status.closed;
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} role="status">
      <span
        aria-hidden
        className={cn('size-2 rounded-full', status.open ? 'animate-pulse-dot bg-[#86c778]' : 'bg-taupe-400')}
      />
      {label}
    </span>
  );
}
