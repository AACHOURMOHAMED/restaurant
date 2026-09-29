import { restaurant } from '@content/restaurant';
import type { OrderPublic } from '@shared/api-types';
import type { OrderStatus } from '@shared/constants';
import { useQuery } from '@tanstack/react-query';
import { Check, ChefHat, CircleCheck, ReceiptText, UtensilsCrossed, XCircle } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { ButtonLink, cn, Notice, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatInstantTime, usePrice } from '@/lib/format';
import { useSite } from '@/lib/queries';
import { myOrdersStore } from '@/lib/stores';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

const STEPS: Exclude<OrderStatus, 'cancelled'>[] = ['received', 'preparing', 'ready', 'served'];
const STEP_ICONS = { received: ReceiptText, preparing: ChefHat, ready: UtensilsCrossed, served: CircleCheck };

export default function OrderStatusPage() {
  const { token = '' } = useParams();
  const { state } = useLocation() as { state: { justSent?: boolean } | null };
  const { t, pick, locale } = useI18n();
  useDocumentTitle(t.orderStatus.title);
  const price = usePrice();
  const site = useSite();
  const myOrders = myOrdersStore.use();

  const query = useQuery({
    queryKey: ['order', token],
    queryFn: () => api<OrderPublic>(`/api/public/orders/${encodeURIComponent(token)}`),
    refetchInterval: (q) => (q.state.data && ['served', 'cancelled'].includes(q.state.data.status) ? false : 5000),
    refetchOnWindowFocus: true,
  });
  const order = query.data;
  const s = t.orderStatus;
  const current = order ? STEPS.indexOf(order.status as (typeof STEPS)[number]) : -1;
  const others = myOrders.filter((o) => o.token !== token);

  return (
    <div className="container-x max-w-2xl">
      {query.isPending ? (
        <div className="flex justify-center py-24 text-taupe-500">
          <Spinner label={s.loading} />
        </div>
      ) : query.isError ? (
        <Notice tone="error" className="mt-6">
          {query.error instanceof ApiError && query.error.status === 404 ? s.notFound : errorMessage(t, query.error)}
        </Notice>
      ) : order ? (
        <>
          {state?.justSent && (
            <div className="mt-2 flex items-start gap-4 rounded-3xl bg-olive-500/12 p-5 ring-1 ring-olive-500/30" role="status">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-olive-500 text-white">
                <Check className="size-6" strokeWidth={3} aria-hidden />
              </span>
              <div>
                <p className="font-display text-2xl leading-tight font-semibold" data-testid="order-sent">
                  {s.sentTitle}
                </p>
                <p className="mt-1 text-sm text-ink-700">{s.sentText}</p>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold tracking-[0.18em] text-taupe-500 uppercase">
                {s.reference} {order.reference}
              </p>
              <h1 className="font-display mt-1 text-[2.6rem] leading-none font-medium">{s.table(order.tableNumber)}</h1>
            </div>
            <p className="pb-1 text-sm text-taupe-500">
              {site.data && s.placedAt(formatInstantTime(order.createdAt, site.data.timeZone, locale))}
            </p>
          </div>

          <div className="mt-6 rounded-3xl bg-ink-900 p-5 text-cream-50 sm:p-7" aria-live="polite">
            {order.status === 'cancelled' ? (
              <div className="flex items-center gap-3">
                <XCircle className="size-7 text-terracotta-400" aria-hidden />
                <div>
                  <p className="font-display text-2xl" data-testid="order-status">
                    {s.steps.cancelled}
                  </p>
                  <p className="text-sm text-cream-100/70">{s.help.cancelled}</p>
                </div>
              </div>
            ) : (
              <>
                <ol className="grid grid-cols-4 gap-2">
                  {STEPS.map((step, i) => {
                    const Icon = STEP_ICONS[step];
                    const done = i <= current;
                    return (
                      <li key={step} className="flex flex-col items-center gap-2 text-center">
                        <span
                          className={cn(
                            'flex size-11 items-center justify-center rounded-full ring-1 transition-colors duration-500',
                            i === current ? 'bg-gold-400 text-ink-950 ring-gold-400' : done ? 'bg-gold-400/25 text-gold-300 ring-gold-400/40' : 'text-cream-100/35 ring-cream-50/15',
                          )}
                          aria-hidden
                        >
                          <Icon className="size-5" />
                        </span>
                        <span className={cn('text-[11px] font-semibold tracking-wide sm:text-xs', done ? 'text-cream-50' : 'text-cream-100/40')}>
                          {s.steps[step]}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-5 text-center text-cream-100/85" data-testid="order-status" data-status={order.status}>
                  <span className="sr-only">{s.steps[order.status]} — </span>
                  {s.help[order.status]}
                </p>
                {order.status !== 'served' && (
                  <p className="mt-2 flex items-center justify-center gap-2 text-xs text-cream-100/50">
                    <span className="size-1.5 animate-pulse rounded-full bg-gold-400" aria-hidden />
                    {s.live}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="mt-6 rounded-3xl bg-white/85 p-5 ring-1 ring-cream-200 sm:p-7">
            <ul className="divide-y divide-cream-200">
              {order.lines.map((l, i) => (
                <li key={i} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="font-semibold">
                      <span className="tabular">{l.quantity} ×</span> {pick(l.name, l.nameEn)}
                    </p>
                    {l.options.length > 0 && <p className="text-sm text-taupe-600">{l.options.map((o) => pick(o.name, o.nameEn)).join(' · ')}</p>}
                    {l.note && <p className="mt-0.5 text-sm text-taupe-500 italic">“{l.note}”</p>}
                  </div>
                  <p className="shrink-0 tabular">{price(l.lineTotalCents)}</p>
                </li>
              ))}
            </ul>
            {order.note && <p className="mt-3 rounded-xl bg-cream-100 px-3 py-2 text-sm text-ink-700 italic">“{order.note}”</p>}
            <div className="mt-4 flex items-baseline justify-between border-t border-cream-200 pt-4">
              <span className="text-sm font-semibold text-taupe-600">{t.order.total}</span>
              <span className="font-display text-3xl font-semibold tabular">{price(order.totalCents)}</span>
            </div>
            <p className="mt-2 text-[13px] text-taupe-500">{pick(restaurant.paymentNote.fr, restaurant.paymentNote.en)}</p>
          </div>

          <ButtonLink to="/order" variant="dark" size="lg" className="mt-6 w-full">
            {t.order.orderMore}
          </ButtonLink>

          {others.length > 0 && (
            <div className="mt-8">
              <h2 className="text-[12px] font-bold tracking-[0.18em] text-taupe-500 uppercase">{t.order.myOrders}</h2>
              <ul className="mt-3 space-y-2">
                {others.map((o) => (
                  <li key={o.token}>
                    <Link to={`/order/${o.token}`} className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-3 text-sm ring-1 ring-cream-200">
                      <span className="font-semibold">{o.reference}</span>
                      <span className="text-taupe-500">{s.table(o.tableNumber)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
