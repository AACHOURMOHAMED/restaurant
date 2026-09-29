import { restaurant } from '@content/restaurant';
import type { ReservationPublic } from '@shared/api-types';
import type { ReservationStatus } from '@shared/constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus, CircleCheck, Clock, Copy, Hourglass, Phone, Users, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { Button, ButtonA, ButtonLink, cn, Notice, Sheet, Spinner } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useI18n } from '@/i18n';
import { api, ApiError, errorMessage } from '@/lib/api';
import { formatDateFull, telHref, ucfirst } from '@/lib/format';
import { useSite } from '@/lib/queries';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { PageHero } from '@/site/PageHero';
import { downloadIcs } from './ics';

const STATUS_STYLE: Record<ReservationStatus, string> = {
  pending: 'bg-gold-400/20 text-gold-700 ring-gold-500/40',
  confirmed: 'bg-olive-500/15 text-olive-600 ring-olive-500/40',
  seated: 'bg-olive-500/15 text-olive-600 ring-olive-500/40',
  completed: 'bg-ink-900/8 text-ink-700 ring-ink-900/15',
  declined: 'bg-terracotta-400/15 text-terracotta-600 ring-terracotta-500/35',
  cancelled: 'bg-ink-900/8 text-ink-600 ring-ink-900/15',
  no_show: 'bg-ink-900/8 text-ink-600 ring-ink-900/15',
};

export default function ReservationStatusPage() {
  const { token = '' } = useParams();
  const { state } = useLocation() as { state: { justCreated?: boolean } | null };
  const { t, locale } = useI18n();
  const toast = useToast();
  const site = useSite();
  const queryClient = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  useDocumentTitle(t.reservationStatus.title);

  const query = useQuery({
    queryKey: ['reservation', token],
    queryFn: () => api<ReservationPublic>(`/api/public/reservations/${encodeURIComponent(token)}`),
    // Pending requests are re-checked so the guest sees the confirmation without reloading.
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 20_000 : false),
    refetchOnWindowFocus: true,
  });

  const cancel = useMutation({
    mutationFn: () => api<ReservationPublic>(`/api/public/reservations/${encodeURIComponent(token)}/cancel`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['reservation', token], data);
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      setConfirmCancel(false);
      toast.show(t.reservationStatus.cancelled, 'success');
    },
    onError: (err) => toast.show(errorMessage(t, err), 'error'),
  });

  const r = query.data;
  const s = t.reservationStatus;
  const helpByStatus: Partial<Record<ReservationStatus, string>> = {
    pending: s.pendingHelp,
    confirmed: s.confirmedHelp,
    declined: s.declinedHelp,
    cancelled: s.cancelledHelp,
  };

  let title: string = s.title;
  let intro: string | null = null;
  if (r && state?.justCreated) {
    if (r.status === 'confirmed') {
      title = t.reserve.confirmedTitle;
      intro = t.reserve.confirmedText;
    } else if (r.status === 'pending') {
      title = t.reserve.pendingTitle;
      intro = t.reserve.pendingText;
    }
  }
  const StatusIcon = r?.status === 'confirmed' || r?.status === 'seated' ? CircleCheck : r?.status === 'pending' ? Hourglass : XCircle;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.show(t.reserve.copied, 'success');
    } catch {
      toast.show(window.location.href, 'info');
    }
  };

  return (
    <>
      <PageHero eyebrow={restaurant.name} title={title}>
        {intro && <p>{intro}</p>}
      </PageHero>
      <div className="container-x relative -mt-16 max-w-3xl pb-28 md:-mt-20">
        <div className="rounded-[2rem] bg-cream-50 p-6 shadow-lift ring-1 ring-cream-200 sm:p-9">
          {query.isPending ? (
            <div className="py-12 text-center text-taupe-500">
              <Spinner label={s.loading} />
            </div>
          ) : query.isError ? (
            <Notice tone="error">
              {query.error instanceof ApiError && query.error.status === 404 ? s.notFound : errorMessage(t, query.error)}
            </Notice>
          ) : r ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <span
                  className={cn('inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1', STATUS_STYLE[r.status])}
                  data-testid="reservation-status"
                >
                  <StatusIcon className="size-4" aria-hidden />
                  {s.status[r.status]}
                </span>
                <span className="text-sm text-taupe-500">
                  {t.reserve.reference} <strong className="font-semibold text-ink-800 tabular">{r.reference}</strong>
                </span>
              </div>

              <dl className="mt-8 grid gap-5 sm:grid-cols-3">
                <div className="flex gap-3">
                  <CalendarDays className="mt-0.5 size-5 text-gold-600" aria-hidden />
                  <div>
                    <dt className="text-xs font-semibold tracking-[0.16em] text-taupe-500 uppercase">{t.reserve.date}</dt>
                    <dd className="mt-1 font-semibold">{ucfirst(formatDateFull(r.date, locale))}</dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Clock className="mt-0.5 size-5 text-gold-600" aria-hidden />
                  <div>
                    <dt className="text-xs font-semibold tracking-[0.16em] text-taupe-500 uppercase">{t.reserve.time}</dt>
                    <dd className="mt-1 font-semibold tabular">{r.time}</dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Users className="mt-0.5 size-5 text-gold-600" aria-hidden />
                  <div>
                    <dt className="text-xs font-semibold tracking-[0.16em] text-taupe-500 uppercase">{t.reserve.guests}</dt>
                    <dd className="mt-1 font-semibold">{t.reserve.guestsCount(r.partySize)}</dd>
                  </div>
                </div>
              </dl>
              <p className="mt-6 text-sm text-taupe-600">{s.for(r.firstName)}</p>
              {helpByStatus[r.status] && <p className="mt-4 leading-relaxed text-ink-700">{helpByStatus[r.status]}</p>}
              {r.status === 'pending' && (
                <p className="mt-2 inline-flex items-center gap-2 text-xs text-taupe-500">
                  <span className="size-1.5 animate-pulse rounded-full bg-gold-500" aria-hidden />
                  {t.orderStatus.live}
                </p>
              )}

              <div className="mt-8 flex flex-col gap-3 border-t border-cream-200 pt-6 sm:flex-row sm:flex-wrap">
                <Button variant="outline-dark" onClick={copyLink}>
                  <Copy className="size-4" aria-hidden />
                  {t.reserve.copyLink}
                </Button>
                {r.status === 'confirmed' && site.data && (
                  <Button
                    variant="outline-dark"
                    onClick={() =>
                      downloadIcs({
                        date: r.date,
                        time: r.time,
                        timeZone: site.data.timeZone,
                        reference: r.reference,
                        partySize: r.partySize,
                        title: `${restaurant.name} — ${t.reserve.guestsCount(r.partySize)}`,
                      })
                    }
                  >
                    <CalendarPlus className="size-4" aria-hidden />
                    {t.reserve.addToCalendar}
                  </Button>
                )}
                <ButtonA href={telHref(restaurant.contact.phone)} variant="ghost">
                  <Phone className="size-4" aria-hidden />
                  {restaurant.contact.phoneDisplay}
                </ButtonA>
                {r.canCancel && (
                  <Button variant="ghost" className="text-terracotta-600 sm:ml-auto" onClick={() => setConfirmCancel(true)}>
                    {s.cancel}
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </div>
        <div className="mt-6 text-center">
          <ButtonLink to="/reservation" variant="ghost">
            {t.reserve.newReservation}
          </ButtonLink>
        </div>
      </div>

      <Sheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={s.cancel}
        closeLabel={t.common.close}
        footer={
          <div className="flex gap-3 pb-1">
            <Button variant="outline-dark" className="flex-1" onClick={() => setConfirmCancel(false)}>
              {s.cancelNo}
            </Button>
            <Button variant="danger" className="flex-1" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              {s.cancelYes}
            </Button>
          </div>
        }
      >
        <p className="px-5 pb-6 text-ink-700 sm:px-7">{s.cancelConfirm}</p>
      </Sheet>
    </>
  );
}
