import type { OrderCreated } from '@shared/api-types';
import { LIMITS } from '@shared/constants';
import { defaultSelection } from '@shared/pricing';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight, Minus, Plus, Receipt, ShoppingBag, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { restaurant } from '@content/restaurant';
import { Button, ButtonLink, cn, Notice, Sheet, Spinner, TextArea } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useI18n } from '@/i18n';
import { api, ApiError, errorMessage } from '@/lib/api';
import { usePrice } from '@/lib/format';
import { useMenu, useSite } from '@/lib/queries';
import { cart, cartStore, clearTable, myOrdersStore, setTable, useTable } from '@/lib/stores';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { indexMenu } from '@/menu/filters';
import { MenuBrowser } from '@/menu/MenuBrowser';
import { priceCart } from './cart';
import { TableConfirmBanner, TableNumberForm } from './table';

export default function OrderPage() {
  const { t, pick, lang } = useI18n();
  useDocumentTitle(t.order.title);
  const navigate = useNavigate();
  const toast = useToast();
  const price = usePrice();
  const site = useSite();
  const menu = useMenu();
  const table = useTable();
  const cartState = cartStore.use();
  const myOrders = myOrdersStore.use();
  const [cartOpen, setCartOpen] = useState(false);
  const [bump, setBump] = useState(0);
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const index = useMemo(() => indexMenu(menu.data?.categories), [menu.data]);
  const priced = useMemo(() => priceCart(cartState, index, flagged), [cartState, index, flagged]);
  const orderingEnabled = site.data?.ordering.enabled ?? false;

  const addToCart = (itemId: number, name: string, optionIds: number[], quantity: number, note: string) => {
    cart.add(itemId, optionIds, quantity, note);
    setBump((b) => b + 1);
    setError(null);
    toast.show(`${t.order.added} — ${quantity} × ${name}`, 'success');
  };

  const submit = useMutation({
    mutationFn: ({ payload, key }: { payload: unknown; key: string }) =>
      api<OrderCreated>('/api/public/orders', { body: payload, idempotencyKey: key }),
    onSuccess: (order) => {
      myOrdersStore.set((all) => [
        { token: order.statusToken, reference: order.reference, tableNumber: order.tableNumber, createdAt: order.createdAt },
        ...all.filter((o) => o.reference !== order.reference),
      ]);
      cart.clear();
      setFlagged(new Set());
      setCartOpen(false);
      navigate(`/order/${order.statusToken}`, { state: { justSent: true } });
    },
    onError: async (err) => {
      if (!(err instanceof ApiError)) return setError(t.errors.generic!);
      switch (err.code) {
        case 'ITEM_UNAVAILABLE': {
          const ids = (err.details?.menuItemIds as number[] | undefined) ?? [];
          setFlagged((prev) => new Set([...prev, ...ids]));
          void menu.refetch();
          return setError(t.order.unavailableItems);
        }
        case 'PRICE_CHANGED':
          await menu.refetch();
          return setError(t.order.pricesChanged);
        case 'OPTIONS_INVALID': {
          const id = err.details?.menuItemId as number | undefined;
          if (id) setFlagged((prev) => new Set([...prev, id]));
          void menu.refetch();
          return setError(t.order.optionsChanged);
        }
        case 'TABLE_NOT_FOUND':
        case 'TABLE_INACTIVE':
          clearTable();
          return setError(errorMessage(t, err));
        case 'ORDERING_CLOSED':
        case 'ORDERING_DISABLED':
          void site.refetch();
          return setError(errorMessage(t, err));
        default:
          return setError(errorMessage(t, err));
      }
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const send = () => {
    // Guard against double taps before React re-renders the disabled button.
    if (inFlight.current || submit.isPending) return;
    setError(null);
    if (!table) return setError(t.order.needTable);
    if (!table.confirmed) return setError(t.order.confirmTableFirst(table.number));
    if (priced.hasProblems) return setError(t.order.unavailableItems);
    if (priced.count === 0) return;
    const payload = {
      tableCode: table.code,
      items: cartState.lines.map((l) => ({
        menuItemId: l.menuItemId,
        quantity: l.quantity,
        optionIds: l.optionIds,
        note: l.note || undefined,
      })),
      note: cartState.note || undefined,
      expectedTotalCents: priced.totalCents,
      lang,
    };
    inFlight.current = true;
    submit.mutate({ payload, key: cart.submissionKey(JSON.stringify(payload)) });
  };

  const categories = menu.data?.categories ?? [];
  return (
    <div className="container-x">
      <div className="space-y-3">
        {table && !table.confirmed && <TableConfirmBanner table={table} onChange={() => navigate('/table', { state: { enter: true } })} />}
        {!table && (
          <div className="flex flex-col gap-3 rounded-3xl bg-white/85 p-4 ring-1 ring-cream-200 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-700">{t.order.browseOnly}</p>
            <ButtonLink to="/table" variant="dark" size="sm" className="shrink-0">
              {t.order.identify}
            </ButtonLink>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-end justify-between gap-4">
        <h1 className="font-display text-[2.6rem] leading-none font-medium">{t.order.title}</h1>
        {myOrders.length > 0 && (
          <Link to={`/order/${myOrders[0]!.token}`} className="inline-flex items-center gap-1.5 pb-1 text-sm font-semibold text-ink-700">
            <Receipt className="size-4" aria-hidden />
            {t.order.myOrders}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>

      <div className="mt-4">
        {/* Wait for both the menu and the site settings so the notices don't push the menu down once painted. */}
        {menu.isPending || site.isPending ? (
          <div className="flex justify-center py-20 text-taupe-500">
            <Spinner label={t.menu.loading} />
          </div>
        ) : menu.isError ? (
          <Notice tone="error">
            {t.menu.error}{' '}
            <button type="button" className="font-semibold underline" onClick={() => void menu.refetch()}>
              {t.menu.retry}
            </button>
          </Notice>
        ) : (
          <>
            {site.data && (!orderingEnabled || site.data.demoMenu) && (
              <div className="mb-6 space-y-3">
                {!orderingEnabled && <Notice tone="warn">{t.order.orderingDisabled}</Notice>}
                {site.data.demoMenu && <Notice tone="warn">{t.preview.demoMenu}</Notice>}
              </div>
            )}
            {categories.length === 0 ? (
              <p className="py-16 text-center text-taupe-600">{t.menu.empty}</p>
            ) : (
              <MenuBrowser
                categories={categories}
                mode={orderingEnabled ? 'order' : 'browse'}
                headingLevel={2}
                onAdd={(item, optionIds, qty, note) => addToCart(item.id, pick(item.name, item.nameEn), optionIds, qty, note)}
                onQuickAdd={(item) => addToCart(item.id, pick(item.name, item.nameEn), defaultSelection(item), 1, '')}
              />
            )}
          </>
        )}
      </div>

      {priced.count > 0 && (
        <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex h-16 w-full items-center gap-3 rounded-full bg-ink-950 pr-6 pl-2 text-cream-50 shadow-lift ring-1 ring-gold-400/30 active:scale-[0.99]"
            data-testid="cart-bar"
          >
            <span key={bump} className="flex size-12 animate-bump items-center justify-center rounded-full bg-gold-400 font-bold text-ink-950 tabular">
              {priced.count}
            </span>
            <span className="flex-1 text-left font-semibold">{t.order.viewCart}</span>
            <span className="font-semibold tabular">{price(priced.totalCents)}</span>
          </button>
        </div>
      )}

      <Sheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title={t.order.cart}
        size="lg"
        closeLabel={t.common.close}
        footer={
          <div className="space-y-3 pb-1">
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-taupe-600">{t.order.total}</span>
              <span className="font-display text-3xl font-semibold tabular" data-testid="cart-total">
                {price(priced.totalCents)}
              </span>
            </div>
            <Button
              variant="dark"
              size="lg"
              className="w-full"
              onClick={send}
              loading={submit.isPending}
              disabled={!orderingEnabled || priced.count === 0 || !table || !table.confirmed}
              data-testid="send-order"
            >
              {submit.isPending ? t.order.sending : t.order.send}
            </Button>
          </div>
        }
      >
        <div className="space-y-6 px-5 pb-6 sm:px-7">
          {!table ? (
            <div className="rounded-3xl bg-gold-200/50 p-5 ring-1 ring-gold-400/40">
              <p className="mb-4 font-semibold">{t.order.needTable}</p>
              <TableNumberForm onResolved={(resolved) => setTable(resolved, true)} hint={t.table.enterHint} />
              <Link to="/table" state={{ autoScan: true }} className="mt-3 block text-center text-sm font-semibold underline underline-offset-4">
                {t.table.scan}
              </Link>
            </div>
          ) : !table.confirmed ? (
            <TableConfirmBanner table={table} onChange={() => navigate('/table', { state: { enter: true } })} />
          ) : null}

          {priced.lines.length === 0 ? (
            <p className="py-6 text-center text-taupe-600">{t.order.emptyCart}</p>
          ) : (
            <>
              <p className="text-sm text-taupe-600">{t.order.review}</p>
              <ul className="divide-y divide-cream-200">
                {priced.lines.map(({ line, item, unitCents, totalCents, problem }) => {
                  const name = item ? pick(item.name, item.nameEn) : '—';
                  const options = item
                    ? item.optionGroups.flatMap((g) => g.options).filter((o) => line.optionIds.includes(o.id)).map((o) => pick(o.name, o.nameEn))
                    : [];
                  return (
                    <li key={line.id} className={cn('py-4', problem && 'rounded-2xl bg-terracotta-400/8 px-3')} data-testid="cart-line">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display text-xl leading-tight font-semibold">{name}</p>
                          {options.length > 0 && <p className="mt-0.5 text-sm text-taupe-600">{options.join(' · ')}</p>}
                          {problem && (
                            <p className="mt-1 text-sm font-semibold text-terracotta-600">
                              {problem === 'unavailable' ? t.order.unavailableBadge : t.order.optionsChanged}
                            </p>
                          )}
                        </div>
                        <p className="shrink-0 font-semibold tabular">{problem ? '—' : price(totalCents)}</p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center rounded-full ring-1 ring-cream-300" role="group" aria-label={`${t.order.quantity} — ${name}`}>
                          <button
                            type="button"
                            className="flex size-10 items-center justify-center rounded-full"
                            onClick={() => cart.setQuantity(line.id, line.quantity - 1)}
                            aria-label={line.quantity === 1 ? `${t.order.remove} ${name}` : t.order.decrease}
                          >
                            {line.quantity === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                          </button>
                          <span className="w-7 text-center font-semibold tabular" aria-live="polite">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            className="flex size-10 items-center justify-center rounded-full disabled:opacity-30"
                            onClick={() => cart.setQuantity(line.id, line.quantity + 1)}
                            disabled={line.quantity >= LIMITS.orderQuantityMax || !!problem}
                            aria-label={t.order.increase}
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>
                        <span className="text-sm text-taupe-500 tabular">
                          {!problem && `${line.quantity} × ${price(unitCents)}`}
                        </span>
                        <button type="button" onClick={() => cart.remove(line.id)} className="text-sm font-semibold text-terracotta-600">
                          {t.order.remove}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={line.note}
                        onChange={(e) => cart.setLineNote(line.id, e.target.value)}
                        maxLength={LIMITS.orderItemNoteMax}
                        placeholder={t.order.notePlaceholder}
                        aria-label={`${t.order.note} — ${name}`}
                        className="mt-3 h-11 w-full rounded-xl bg-white/80 px-3 text-sm ring-1 ring-cream-300 outline-none placeholder:text-taupe-400 focus:ring-2 focus:ring-gold-500"
                      />
                    </li>
                  );
                })}
              </ul>
              <TextArea
                label={t.order.orderNote}
                optional={t.reserve.optional}
                value={cartState.note}
                onChange={(e) => cart.setNote(e.target.value)}
                maxLength={LIMITS.orderNoteMax}
                placeholder={t.order.orderNotePlaceholder}
                rows={2}
              />
              <p className="flex items-start gap-2 text-[13px] text-taupe-500">
                <ShoppingBag className="mt-0.5 size-4 shrink-0" aria-hidden />
                {pick(restaurant.paymentNote.fr, restaurant.paymentNote.en)}
              </p>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}
