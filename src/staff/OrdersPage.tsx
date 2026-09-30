import type { OrderingSettings } from '@shared/schemas';
import type { StaffOrder } from '@shared/api-types';
import type { OrderStatus } from '@shared/constants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, cn, Spinner } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { formatInstantTime, usePrice } from '@/lib/format';
import { useSite } from '@/lib/queries';
import { staffKeys, useOrders, useSettings } from './api';
import { Badge, EmptyState, minutesSince, PageHeader, Segmented, Switch, useConfirm } from './kit';
import { useStaffContext } from './StaffApp';
import { useStaffT } from './strings';

const FLOW: OrderStatus[] = ['received', 'preparing', 'ready', 'served'];
const COLUMNS = ['received', 'preparing', 'ready'] as const;

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function OrderCard({ order, now, onStatus, busy }: { order: StaffOrder; now: number; onStatus: (status: OrderStatus, confirm?: string) => void; busy: boolean }) {
  const s = useStaffT();
  const { pick } = useI18n();
  const price = usePrice();
  const minutes = minutesSince(order.createdAt, now);
  const index = FLOW.indexOf(order.status);
  const next = FLOW[index + 1];
  const previous = index > 0 ? FLOW[index - 1] : undefined;
  const late = (order.status === 'received' && minutes >= 5) || (order.status === 'preparing' && minutes >= 25);
  const fresh = order.status === 'received' && minutes < 1;

  return (
    <article
      className={cn(
        'rounded-3xl bg-white p-4 shadow-soft ring-1 transition-shadow',
        order.status === 'received' ? 'ring-gold-400' : 'ring-cream-200',
        fresh && 'shadow-glow',
      )}
      data-testid="staff-order"
      data-table={order.tableNumber}
      data-status={order.status}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-[2.1rem] leading-none font-semibold">{s.orders.table(order.tableNumber)}</p>
          <p className="mt-1 text-xs text-taupe-500">{order.reference}</p>
        </div>
        <Badge tone={late ? 'red' : 'neutral'}>
          <Clock className="size-3" aria-hidden />
          {s.orders.ago(minutes)}
        </Badge>
      </div>
      <ul className="mt-4 space-y-2.5">
        {order.lines.map((l, i) => (
          <li key={i} className="text-[15px] leading-snug">
            <span className="font-bold tabular">{l.quantity} ×</span> <span className="font-semibold">{pick(l.name, l.nameEn)}</span>
            {l.options.length > 0 && <p className="text-sm text-taupe-600">{l.options.map((o) => pick(o.name, o.nameEn)).join(' · ')}</p>}
            {l.note && <p className="mt-0.5 rounded-lg bg-gold-200/50 px-2 py-1 text-sm font-medium text-ink-800">“{l.note}”</p>}
          </li>
        ))}
      </ul>
      {order.note && (
        <p className="mt-3 rounded-xl bg-terracotta-400/10 px-3 py-2 text-sm text-ink-800">
          <span className="font-semibold">{s.orders.note} : </span>
          {order.note}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between border-t border-cream-200 pt-3 text-sm">
        <span className="text-taupe-500">{s.orders.total}</span>
        <span className="font-semibold tabular">{price(order.totalCents)}</span>
      </div>
      {order.status !== 'served' && order.status !== 'cancelled' && (
        <div className="mt-3 flex gap-2">
          {previous && (
            <Button variant="outline-dark" size="md" className="w-12 px-0" aria-label={s.orders.back} title={s.orders.back} disabled={busy} onClick={() => onStatus(previous)}>
              <ArrowLeft className="size-4" />
            </Button>
          )}
          {next && (
            <Button variant="dark" size="md" className="flex-1" disabled={busy} onClick={() => onStatus(next)} data-testid="order-next">
              {s.orders.next[order.status]}
            </Button>
          )}
          <Button
            variant="outline-dark"
            size="md"
            className="w-12 px-0 text-terracotta-600"
            aria-label={s.orders.cancelOrder}
            title={s.orders.cancelOrder}
            disabled={busy}
            onClick={() => onStatus('cancelled', s.orders.confirmCancel)}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
    </article>
  );
}

export default function OrdersPage() {
  const s = useStaffT();
  const { t, locale, pick } = useI18n();
  const toast = useToast();
  const price = usePrice();
  const queryClient = useQueryClient();
  const { live } = useStaffContext();
  const [tab, setTab] = useState<'open' | 'today'>('open');
  const orders = useOrders(tab, live);
  const settings = useSettings();
  const site = useSite();
  const now = useNow();
  const { confirm, dialog } = useConfirm();

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: OrderStatus }) => api<StaffOrder>(`/api/staff/orders/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: staffKeys.orders }),
    onError: (err) => toast.show(errorMessage(t, err), 'error'),
  });

  const saveOrdering = useMutation({
    mutationFn: (ordering: OrderingSettings) => api<OrderingSettings>('/api/staff/settings/ordering', { method: 'PUT', body: ordering }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.settings });
      toast.show(s.saved, 'success');
    },
    onError: (err) => toast.show(errorMessage(t, err), 'error'),
  });

  const onStatus = (id: number) => async (status: OrderStatus, confirmMessage?: string) => {
    if (confirmMessage && !(await confirm(confirmMessage))) return;
    updateStatus.mutate({ id, status });
  };

  const ordering = settings.data?.ordering;
  const list = orders.data ?? [];
  const todayTotal = list.filter((o) => o.status !== 'cancelled').reduce((n, o) => n + o.totalCents, 0);

  return (
    <>
      <PageHeader title={s.orders.title}>
        {ordering && (
          <div className="min-w-72 rounded-2xl bg-white px-4 py-3 ring-1 ring-cream-200">
            <Switch
              label={`${s.orders.accepting} · ${ordering.enabled ? s.orders.acceptingOn : s.orders.acceptingOff}`}
              description={!ordering.enabled ? s.orders.pausedNotice : undefined}
              checked={ordering.enabled}
              disabled={saveOrdering.isPending}
              onChange={(enabled) => saveOrdering.mutate({ ...ordering, enabled })}
            />
          </div>
        )}
      </PageHeader>

      <div className="mb-6">
        <Segmented
          label={s.orders.title}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'open', label: s.orders.tabOpen },
            { value: 'today', label: s.orders.tabToday },
          ]}
        />
      </div>

      {orders.isPending ? (
        <div className="py-16 text-center text-taupe-500">
          <Spinner label={s.loading} />
        </div>
      ) : orders.isError ? (
        <EmptyState>{errorMessage(t, orders.error)}</EmptyState>
      ) : tab === 'open' ? (
        list.length === 0 ? (
          <EmptyState>{s.orders.empty}</EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {COLUMNS.map((col) => {
              const items = list.filter((o) => o.status === col);
              return (
                <section key={col} aria-labelledby={`col-${col}`} className="min-w-0">
                  <h2 id={`col-${col}`} className="mb-3 flex items-center gap-2 text-sm font-bold tracking-[0.14em] text-taupe-500 uppercase">
                    {s.orders.columns[col]}
                    <span className="rounded-full bg-ink-900 px-2 text-[11px] leading-5 text-cream-50">{items.length}</span>
                  </h2>
                  <div className="space-y-4">
                    {items.map((o) => (
                      <OrderCard key={o.id} order={o} now={now} onStatus={onStatus(o.id)} busy={updateStatus.isPending && updateStatus.variables?.id === o.id} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      ) : list.length === 0 ? (
        <EmptyState>{s.orders.emptyToday}</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-3xl bg-white ring-1 ring-cream-200">
          <p className="border-b border-cream-200 px-5 py-3 text-sm font-semibold text-taupe-600">
            {s.orders.summary(list.filter((o) => o.status !== 'cancelled').length, price(todayTotal))}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs tracking-wide text-taupe-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">{s.orders.time}</th>
                  <th className="px-5 py-3 font-semibold">{s.res.table}</th>
                  <th className="px-5 py-3 font-semibold">{s.orders.items}</th>
                  <th className="px-5 py-3 font-semibold">{s.orders.total}</th>
                  <th className="px-5 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {list.map((o) => (
                  <tr key={o.id}>
                    <td className="px-5 py-3 tabular">{site.data ? formatInstantTime(o.createdAt, site.data.timeZone, locale) : ''}</td>
                    <td className="px-5 py-3 font-semibold">{o.tableNumber}</td>
                    <td className="px-5 py-3 text-taupe-600">{o.lines.map((l) => `${l.quantity}× ${pick(l.name, l.nameEn)}`).join(', ')}</td>
                    <td className="px-5 py-3 tabular">{price(o.totalCents)}</td>
                    <td className="px-5 py-3">
                      <Badge tone={o.status === 'cancelled' ? 'red' : o.status === 'served' ? 'green' : 'gold'}>{s.orders.status[o.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {dialog}
    </>
  );
}
