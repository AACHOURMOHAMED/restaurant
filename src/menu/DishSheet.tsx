import type { MenuItemPublic } from '@shared/api-types';
import { formatPriceDelta } from '@shared/money';
import { defaultSelection, priceSelection } from '@shared/pricing';
import { restaurant } from '@content/restaurant';
import { Check, Minus, Plus, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DietaryBadges, DishImage, type PlaceholderIcon } from '@/components/brand';
import { Button, cn, Sheet, TextArea } from '@/components/ui';
import { useI18n } from '@/i18n';
import { usePrice } from '@/lib/format';
import { LIMITS } from '@shared/constants';

type Props = {
  item: MenuItemPublic | null;
  icon: PlaceholderIcon;
  mode: 'browse' | 'order';
  onClose: () => void;
  onAdd?: (item: MenuItemPublic, optionIds: number[], quantity: number, note: string) => void;
};

export function DishSheet({ item, icon, mode, onClose, onAdd }: Props) {
  const { t, pick, lang } = useI18n();
  const price = usePrice();
  const [optionIds, setOptionIds] = useState<number[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (item) {
      setOptionIds(defaultSelection(item));
      setQuantity(1);
      setNote('');
      setShowErrors(false);
    }
  }, [item]);

  const priced = useMemo(() => (item ? priceSelection(item, optionIds) : null), [item, optionIds]);
  if (!item) return null;

  const name = pick(item.name, item.nameEn);
  const description = pick(item.description ?? '', item.descriptionEn);
  const canOrder = mode === 'order' && item.available;
  const unit = priced?.ok ? priced.unitPriceCents : item.priceCents;
  const invalidGroup = priced && !priced.ok && (priced.error.code === 'group_min' || priced.error.code === 'group_max') ? priced.error.groupId : null;

  const toggle = (groupId: number, optionId: number, single: boolean) => {
    const group = item.optionGroups.find((g) => g.id === groupId)!;
    const inGroup = new Set(group.options.map((o) => o.id));
    setOptionIds((current) => {
      if (single) return [...current.filter((id) => !inGroup.has(id)), optionId];
      if (current.includes(optionId)) return current.filter((id) => id !== optionId);
      const selectedInGroup = current.filter((id) => inGroup.has(id)).length;
      if (selectedInGroup >= group.maxSelect) return current;
      return [...current, optionId];
    });
  };

  const submit = () => {
    if (!priced?.ok) {
      setShowErrors(true);
      return;
    }
    onAdd?.(item, priced.optionIds, quantity, note.trim());
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={name}
      hideTitle
      size="lg"
      closeLabel={t.menu.close}
      footer={
        canOrder ? (
          <div className="flex items-center gap-3 pb-1">
            <div className="flex items-center rounded-full ring-1 ring-cream-300" role="group" aria-label={t.order.quantity}>
              <button
                type="button"
                className="flex size-12 items-center justify-center rounded-full disabled:opacity-30"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label={t.order.decrease}
              >
                <Minus className="size-4" />
              </button>
              <span className="w-8 text-center text-lg font-semibold tabular" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                className="flex size-12 items-center justify-center rounded-full disabled:opacity-30"
                onClick={() => setQuantity((q) => Math.min(LIMITS.orderQuantityMax, q + 1))}
                disabled={quantity >= LIMITS.orderQuantityMax}
                aria-label={t.order.increase}
              >
                <Plus className="size-4" />
              </button>
            </div>
            <Button variant="dark" size="lg" className="flex-1 px-4" onClick={submit}>
              {t.order.addToOrder(price(unit * quantity))}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink-900">
        <DishImage image={item.image} base={item.imageBase} alt={name} icon={icon} sizes="(min-width: 640px) 672px, 100vw" priority showLabel />
      </div>
      <div className="px-5 pt-6 pb-6 sm:px-7">
        <div className="flex flex-wrap items-center gap-2">
          {item.isSpecial && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gold-400/20 px-2.5 py-1 text-[11px] font-bold tracking-[0.12em] text-gold-700 uppercase">
              <Star className="size-3 fill-current" aria-hidden />
              {t.menu.special}
            </span>
          )}
          {!item.available && (
            <span className="rounded-full bg-ink-900 px-2.5 py-1 text-[11px] font-bold tracking-[0.12em] text-cream-50 uppercase">
              {t.menu.soldOut}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-start justify-between gap-4">
          <h2 className="font-display text-[2rem] leading-[1.05] font-medium">{name}</h2>
          <p className="shrink-0 pt-1.5 text-lg font-semibold tabular">{price(item.priceCents)}</p>
        </div>
        {description && <p className="mt-3 leading-relaxed text-ink-600">{description}</p>}
        <DietaryBadges labels={item.dietary} className="mt-4" />

        {item.optionGroups.length > 0 && (
          <div className="mt-7 space-y-6">
            {item.optionGroups.map((group) => {
              const single = group.maxSelect === 1;
              const groupName = pick(group.name, group.nameEn);
              const hint =
                group.minSelect > 0 ? t.menu.required : t.menu.optional;
              return (
                <fieldset key={group.id} className="space-y-2.5">
                  <legend className="flex w-full items-baseline justify-between gap-3">
                    <span className="text-[15px] font-semibold">{groupName}</span>
                    <span
                      className={cn(
                        'text-[11px] font-bold tracking-[0.12em] uppercase',
                        showErrors && invalidGroup === group.id ? 'text-terracotta-600' : 'text-taupe-500',
                      )}
                    >
                      {hint} · {single ? t.menu.chooseOne : t.menu.chooseUpTo(group.maxSelect)}
                    </span>
                  </legend>
                  {mode === 'browse' ? (
                    <p className="text-sm text-ink-600">
                      {group.options.map((o) => pick(o.name, o.nameEn) + (o.priceDeltaCents ? ` (${formatPriceDelta(o.priceDeltaCents, lang, restaurant.currency.symbol)})` : '')).join(' · ')}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {group.options.map((o) => {
                        const checked = optionIds.includes(o.id);
                        return (
                          <label
                            key={o.id}
                            className={cn(
                              'relative flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-4 py-2.5 ring-1 transition-colors',
                              checked ? 'bg-gold-200/50 ring-gold-500' : 'bg-white/70 ring-cream-300 hover:ring-taupe-300',
                              !o.available && 'cursor-not-allowed opacity-45',
                            )}
                          >
                            <input
                              type={single ? 'radio' : 'checkbox'}
                              name={`group-${group.id}`}
                              className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none rounded-2xl opacity-0 disabled:cursor-not-allowed"
                              checked={checked}
                              disabled={!o.available || !canOrder}
                              onChange={() => toggle(group.id, o.id, single)}
                            />
                            <span
                              aria-hidden
                              className={cn(
                                'flex size-5 shrink-0 items-center justify-center ring-1 peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500',
                                single ? 'rounded-full' : 'rounded-md',
                                checked ? 'bg-ink-900 text-cream-50 ring-ink-900' : 'ring-taupe-300',
                              )}
                            >
                              {checked && <Check className="size-3.5" strokeWidth={3} />}
                            </span>
                            <span className="flex-1 text-[15px]">{pick(o.name, o.nameEn)}</span>
                            {o.priceDeltaCents !== 0 && (
                              <span className="text-sm text-taupe-600 tabular">
                                {formatPriceDelta(o.priceDeltaCents, lang, restaurant.currency.symbol)}
                              </span>
                            )}
                            {!o.available && <span className="text-xs font-semibold">{t.menu.soldOut}</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {showErrors && invalidGroup === group.id && (
                    <p className="text-sm font-medium text-terracotta-600" role="alert">
                      {t.order.selectRequired}
                    </p>
                  )}
                </fieldset>
              );
            })}
          </div>
        )}

        {canOrder && (
          <TextArea
            wrapperClassName="mt-7"
            label={t.order.note}
            optional={t.reserve.optional}
            placeholder={t.order.notePlaceholder}
            maxLength={LIMITS.orderItemNoteMax}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        )}
        <p className="mt-6 text-[13px] text-taupe-500">{t.menu.allergens}</p>
      </div>
    </Sheet>
  );
}
