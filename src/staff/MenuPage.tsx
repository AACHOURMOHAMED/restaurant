import type { StaffMenuCategory, StaffMenuItem } from '@shared/api-types';
import { DIETARY_LABELS, type DietaryLabel } from '@shared/constants';
import { parseAmountToCents } from '@shared/money';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DIETARY_ICONS, DishImage, iconForCategory } from '@/components/brand';
import { Button, cn, IconButton, Notice, Sheet, Spinner, TextArea, TextField } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useI18n } from '@/i18n';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { shrinkPhoto } from '@/lib/photo';
import { usePrice } from '@/lib/format';
import { staffKeys, useStaffMenu } from './api';
import { Badge, EmptyState, PageHeader, Select, Switch, useConfirm } from './kit';
import { useStaffContext } from './StaffApp';
import { useStaffT } from './strings';

// ─── Editing helpers ─────────────────────────────────────────────────────────

type GroupType = 'one_required' | 'one_optional' | 'many_optional';
type OptionDraft = { id?: number; name: string; nameEn: string; price: string; available: boolean };
type GroupDraft = { id?: number; name: string; nameEn: string; type: GroupType; options: OptionDraft[] };
type ItemDraft = {
  categoryId: number;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  price: string;
  dietary: DietaryLabel[];
  image: string | null;
  available: boolean;
  visible: boolean;
  isSpecial: boolean;
  groups: GroupDraft[];
};

const centsToText = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

function typeOf(min: number, max: number): GroupType {
  if (max === 1) return min >= 1 ? 'one_required' : 'one_optional';
  return 'many_optional';
}

function toDraft(item: StaffMenuItem | null, categoryId: number): ItemDraft {
  if (!item) {
    return { categoryId, name: '', nameEn: '', description: '', descriptionEn: '', price: '', dietary: [], image: null, available: true, visible: true, isSpecial: false, groups: [] };
  }
  return {
    categoryId: item.categoryId,
    name: item.name,
    nameEn: item.nameEn ?? '',
    description: item.description ?? '',
    descriptionEn: item.descriptionEn ?? '',
    price: centsToText(item.priceCents),
    dietary: item.dietary,
    image: item.image,
    available: item.available,
    visible: item.visible,
    isSpecial: item.isSpecial,
    groups: item.optionGroups.map((g) => ({
      id: g.id,
      name: g.name,
      nameEn: g.nameEn ?? '',
      type: typeOf(g.minSelect, g.maxSelect),
      options: g.options.map((o) => ({ id: o.id, name: o.name, nameEn: o.nameEn ?? '', price: centsToText(o.priceDeltaCents), available: o.available })),
    })),
  };
}

function toPayload(d: ItemDraft) {
  return {
    categoryId: d.categoryId,
    name: d.name,
    nameEn: d.nameEn || null,
    description: d.description || null,
    descriptionEn: d.descriptionEn || null,
    priceCents: parseAmountToCents(d.price) ?? -1,
    dietary: d.dietary,
    image: d.image,
    available: d.available,
    visible: d.visible,
    isSpecial: d.isSpecial,
    optionGroups: d.groups.map((g) => ({
      id: g.id,
      name: g.name,
      nameEn: g.nameEn || null,
      minSelect: g.type === 'one_required' ? 1 : 0,
      maxSelect: g.type === 'many_optional' ? Math.max(1, g.options.length) : 1,
      options: g.options.map((o) => ({ id: o.id, name: o.name, nameEn: o.nameEn || null, priceDeltaCents: parseAmountToCents(o.price || '0') ?? 0, available: o.available })),
    })),
  };
}

// ─── Item editor ─────────────────────────────────────────────────────────────

function ItemEditor({
  open,
  item,
  categories,
  defaultCategoryId,
  onClose,
}: {
  open: boolean;
  item: StaffMenuItem | null;
  categories: StaffMenuCategory[];
  defaultCategoryId: number;
  onClose: () => void;
}) {
  const s = useStaffT();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = useState<ItemDraft>(() => toDraft(item, defaultCategoryId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(item, defaultCategoryId));
      setErrors({});
    }
  }, [open, item, defaultCategoryId]);

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: staffKeys.menu });
    void queryClient.invalidateQueries({ queryKey: ['menu'] });
    toast.show(message, 'success');
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      item ? api(`/api/staff/menu/items/${item.id}`, { method: 'PUT', body: toPayload(draft) }) : api('/api/staff/menu/items', { body: toPayload(draft) }),
    onSuccess: () => done(item ? s.saved : s.menu.item.created),
    onError: (err) => {
      const f = fieldErrors(t, err);
      setErrors(f);
      toast.show(Object.keys(f).length ? t.fields.invalid! : errorMessage(t, err), 'error');
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/staff/menu/items/${item!.id}`, { method: 'DELETE' }),
    onSuccess: () => done(s.saved),
    onError: (err) => toast.show(errorMessage(t, err), 'error'),
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      const photo = await shrinkPhoto(file);
      form.append('file', photo, photo === file ? file.name : 'photo.jpg');
      const res = await api<{ image: string }>('/api/staff/uploads/menu-image', { formData: form });
      setDraft((d) => ({ ...d, image: res.image }));
      // The first photo ever stored tells the site where photos are served from.
      void queryClient.invalidateQueries({ queryKey: ['site'] });
    } catch (err) {
      toast.show(errorMessage(t, err), 'error');
    } finally {
      setUploading(false);
    }
  };

  const set = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setGroup = (gi: number, patch: Partial<GroupDraft>) => set('groups', draft.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const setOption = (gi: number, oi: number, patch: Partial<OptionDraft>) =>
    setGroup(gi, { options: draft.groups[gi]!.options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!draft.name.trim()) local.name = t.fields.name_required!;
    if (parseAmountToCents(draft.price) == null || parseAmountToCents(draft.price)! < 0) local.priceCents = t.fields.invalid_price!;
    if (Object.keys(local).length) return setErrors(local);
    save.mutate();
  };

  const categoryName = categories.find((c) => c.id === draft.categoryId)?.name;
  return (
    <>
      <Sheet open={open} onClose={onClose} title={item ? s.menu.item.editTitle : s.menu.item.newTitle} size="lg" closeLabel={s.close}>
        <form onSubmit={submit} noValidate className="space-y-6 px-5 pb-6 sm:px-7">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="size-28 shrink-0 overflow-hidden rounded-2xl bg-ink-800">
              {uploading ? (
                <div className="flex h-full items-center justify-center text-cream-100">
                  <Spinner />
                </div>
              ) : (
                <DishImage image={draft.image} alt="" icon={iconForCategory(categoryName)} sizes="112px" />
              )}
            </div>
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = '';
                }}
              />
              <Button variant="outline-dark" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
                <ImagePlus className="size-4" aria-hidden />
                {draft.image ? s.menu.item.replace : s.menu.item.upload}
              </Button>
              {draft.image && (
                <Button variant="ghost" size="sm" className="text-terracotta-600" onClick={() => set('image', null)}>
                  {s.menu.item.removePhoto}
                </Button>
              )}
              <p className="text-xs text-taupe-500">{uploading ? s.menu.item.uploading : s.menu.item.photoHint}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={s.menu.item.name} value={draft.name} onChange={(e) => set('name', e.target.value)} error={errors.name} maxLength={80} />
            <TextField label={s.menu.item.nameEn} optional={s.optional} value={draft.nameEn} onChange={(e) => set('nameEn', e.target.value)} maxLength={80} />
            <TextArea label={s.menu.item.description} optional={s.optional} value={draft.description} onChange={(e) => set('description', e.target.value)} rows={2} maxLength={400} />
            <TextArea label={s.menu.item.descriptionEn} optional={s.optional} value={draft.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} rows={2} maxLength={400} />
            <TextField label={s.menu.item.price} inputMode="decimal" value={draft.price} onChange={(e) => set('price', e.target.value)} error={errors.priceCents} placeholder="120" />
            <Select label={s.menu.item.category} value={draft.categoryId} onChange={(e) => set('categoryId', Number(e.target.value))}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <fieldset>
            <legend className="text-[13px] font-semibold text-ink-800">{s.menu.item.dietary}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DIETARY_LABELS.map((label) => {
                const Icon = DIETARY_ICONS[label];
                const on = draft.dietary.includes(label);
                return (
                  <label key={label} className={cn('inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm ring-1', on ? 'bg-ink-900 text-cream-50 ring-ink-900' : 'bg-white ring-cream-300')}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={on}
                      onChange={() => set('dietary', on ? draft.dietary.filter((d) => d !== label) : [...draft.dietary, label])}
                    />
                    <Icon className="size-4" aria-hidden />
                    {t.dietary[label]}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Option groups */}
          <fieldset className="space-y-4">
            <legend className="text-[13px] font-semibold text-ink-800">{s.menu.item.options}</legend>
            {draft.groups.map((g, gi) => (
              <div key={gi} className="space-y-3 rounded-2xl bg-cream-100 p-4 ring-1 ring-cream-200">
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField label={s.menu.item.groupName} value={g.name} onChange={(e) => setGroup(gi, { name: e.target.value })} className="h-10" />
                  <TextField label={s.menu.item.groupNameEn} optional={s.optional} value={g.nameEn} onChange={(e) => setGroup(gi, { nameEn: e.target.value })} className="h-10" />
                  <Select label={s.menu.item.groupType} value={g.type} onChange={(e) => setGroup(gi, { type: e.target.value as GroupType })} className="h-10">
                    {(Object.keys(s.menu.item.types) as GroupType[]).map((k) => (
                      <option key={k} value={k}>
                        {s.menu.item.types[k]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  {g.options.map((o, oi) => (
                    <div key={oi} className="grid grid-cols-[1fr_1fr_6rem_auto_auto] items-end gap-2">
                      <TextField label={s.menu.item.optionName} value={o.name} onChange={(e) => setOption(gi, oi, { name: e.target.value })} className="h-10" />
                      <TextField label={s.menu.item.optionNameEn} value={o.nameEn} onChange={(e) => setOption(gi, oi, { nameEn: e.target.value })} className="h-10" />
                      <TextField label={s.menu.item.optionPrice} inputMode="decimal" value={o.price} placeholder="0" onChange={(e) => setOption(gi, oi, { price: e.target.value })} className="h-10" />
                      <label className="flex h-10 items-center gap-1.5 text-xs font-semibold" title={s.menu.available}>
                        <input type="checkbox" className="size-4 accent-ink-900" checked={o.available} onChange={(e) => setOption(gi, oi, { available: e.target.checked })} />
                        <span className="sr-only">{s.menu.available}</span>
                      </label>
                      <IconButton label={s.delete} className="size-10 hover:bg-terracotta-400/10" onClick={() => setGroup(gi, { options: g.options.filter((_, i) => i !== oi) })}>
                        <X className="size-4" />
                      </IconButton>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setGroup(gi, { options: [...g.options, { name: '', nameEn: '', price: '', available: true }] })}>
                    <Plus className="size-4" aria-hidden />
                    {s.menu.item.addOption}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-terracotta-600" onClick={() => set('groups', draft.groups.filter((_, i) => i !== gi))}>
                    {s.menu.item.removeGroup}
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline-dark"
              size="sm"
              onClick={() => set('groups', [...draft.groups, { name: '', nameEn: '', type: 'one_required', options: [{ name: '', nameEn: '', price: '', available: true }] }])}
            >
              <Plus className="size-4" aria-hidden />
              {s.menu.item.addGroup}
            </Button>
          </fieldset>

          <fieldset className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-cream-200">
            <legend className="sr-only">{s.menu.item.flags}</legend>
            <Switch label={s.menu.available} checked={draft.available} onChange={(v) => set('available', v)} />
            <Switch label={s.menu.visible} checked={draft.visible} onChange={(v) => set('visible', v)} />
            <Switch label={s.menu.special} checked={draft.isSpecial} onChange={(v) => set('isSpecial', v)} />
          </fieldset>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="dark" size="lg" className="flex-1" loading={save.isPending}>
              {s.save}
            </Button>
            {item && (
              <Button
                variant="ghost"
                size="lg"
                className="text-terracotta-600"
                loading={remove.isPending}
                onClick={async () => {
                  if (await confirm(s.menu.confirmDeleteItem(item.name))) remove.mutate();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                {s.delete}
              </Button>
            )}
          </div>
        </form>
      </Sheet>
      {dialog}
    </>
  );
}

// ─── Category editor ─────────────────────────────────────────────────────────

function CategoryEditor({ category, onClose }: { category: StaffMenuCategory | 'new' | null; onClose: () => void }) {
  const s = useStaffT();
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', nameEn: '', description: '', descriptionEn: '', visible: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (category === 'new') setForm({ name: '', nameEn: '', description: '', descriptionEn: '', visible: true });
    else if (category) setForm({ name: category.name, nameEn: category.nameEn ?? '', description: category.description ?? '', descriptionEn: category.descriptionEn ?? '', visible: category.visible });
    setErrors({});
  }, [category]);

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, nameEn: form.nameEn || null, description: form.description || null, descriptionEn: form.descriptionEn || null };
      return category === 'new' ? api('/api/staff/menu/categories', { body }) : api(`/api/staff/menu/categories/${(category as StaffMenuCategory).id}`, { method: 'PUT', body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: staffKeys.menu });
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.show(s.saved, 'success');
      onClose();
    },
    onError: (err) => setErrors(fieldErrors(t, err)),
  });

  return (
    <Sheet open={!!category} onClose={onClose} title={category === 'new' ? s.menu.category.newTitle : s.menu.category.editTitle} closeLabel={s.close}>
      <form
        className="space-y-4 px-5 pb-6 sm:px-7"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextField label={s.menu.category.name} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors.name} autoFocus />
        <TextField label={s.menu.category.nameEn} optional={s.optional} value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} />
        <TextArea label={s.menu.category.description} optional={s.optional} rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <TextArea label={s.menu.category.descriptionEn} optional={s.optional} rows={2} value={form.descriptionEn} onChange={(e) => setForm((f) => ({ ...f, descriptionEn: e.target.value }))} />
        <Switch label={s.menu.category.visible} checked={form.visible} onChange={(visible) => setForm((f) => ({ ...f, visible }))} />
        <Button type="submit" variant="dark" className="w-full" loading={save.isPending}>
          {s.save}
        </Button>
      </form>
    </Sheet>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MenuPage() {
  const s = useStaffT();
  const { t } = useI18n();
  const price = usePrice();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useStaffContext();
  const menu = useStaffMenu();
  const { confirm, dialog } = useConfirm();
  const [editingItem, setEditingItem] = useState<{ item: StaffMenuItem | null; categoryId: number } | null>(null);
  const [editingCategory, setEditingCategory] = useState<StaffMenuCategory | 'new' | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: staffKeys.menu });
    void queryClient.invalidateQueries({ queryKey: ['menu'] });
  };
  const onError = (err: unknown) => toast.show(errorMessage(t, err), 'error');

  const patchItem = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) => api(`/api/staff/menu/items/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: refresh,
    onError,
  });
  const reorder = useMutation({
    mutationFn: ({ kind, ids }: { kind: 'items' | 'categories'; ids: number[] }) => api(`/api/staff/menu/${kind}/order`, { method: 'PUT', body: { ids } }),
    onSuccess: refresh,
    onError,
  });
  const updateCategory = useMutation({
    mutationFn: (c: StaffMenuCategory) =>
      api(`/api/staff/menu/categories/${c.id}`, {
        method: 'PUT',
        body: { name: c.name, nameEn: c.nameEn, description: c.description, descriptionEn: c.descriptionEn, visible: !c.visible },
      }),
    onSuccess: refresh,
    onError,
  });
  const deleteCategory = useMutation({ mutationFn: (id: number) => api(`/api/staff/menu/categories/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError });
  const removeDemo = useMutation({ mutationFn: () => api('/api/staff/menu/demo/remove', { method: 'POST' }), onSuccess: refresh, onError });
  const loadDemo = useMutation({ mutationFn: () => api('/api/staff/menu/demo/load', { method: 'POST' }), onSuccess: refresh, onError });

  const move = <T extends { id: number }>(list: T[], index: number, delta: number) => {
    const ids = list.map((x) => x.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    return ids;
  };

  const categories = menu.data?.categories ?? [];
  return (
    <>
      <PageHeader title={s.menu.title}>
        {isAdmin && (
          <>
            <Button variant="outline-dark" onClick={() => setEditingCategory('new')}>
              <Plus className="size-4" aria-hidden />
              {s.menu.addCategory}
            </Button>
            {categories.length > 0 && (
              <Button variant="dark" onClick={() => setEditingItem({ item: null, categoryId: categories[0]!.id })}>
                <Plus className="size-4" aria-hidden />
                {s.menu.addItem}
              </Button>
            )}
          </>
        )}
      </PageHeader>

      {menu.data?.demo && (
        <Notice tone="warn" className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{s.menu.demoNotice}</span>
            {isAdmin && (
              <Button
                variant="danger"
                size="sm"
                className="shrink-0"
                loading={removeDemo.isPending}
                onClick={async () => {
                  if (await confirm(s.menu.confirmRemoveDemo)) removeDemo.mutate();
                }}
              >
                {s.menu.removeDemo}
              </Button>
            )}
          </div>
        </Notice>
      )}

      {menu.isPending ? (
        <div className="py-16 text-center text-taupe-500">
          <Spinner label={s.loading} />
        </div>
      ) : categories.length === 0 ? (
        <EmptyState>
          {s.menu.empty}
          {isAdmin && (
            <span className="mt-5 flex flex-col items-center gap-2">
              <Button variant="outline-dark" size="sm" loading={loadDemo.isPending} onClick={() => loadDemo.mutate()}>
                {s.menu.loadDemo}
              </Button>
              <span className="max-w-sm text-xs text-taupe-500">{s.menu.loadDemoHint}</span>
            </span>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {categories.map((c, ci) => (
            <section key={c.id} className={cn('rounded-3xl bg-white p-4 shadow-soft ring-1 ring-cream-200 md:p-6', !c.visible && 'opacity-70')} data-testid="staff-category">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 pb-3">
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-3xl font-medium">{c.name}</h2>
                  {c.nameEn && <span className="text-sm text-taupe-500">{c.nameEn}</span>}
                  {!c.visible && <Badge>{s.menu.hidden}</Badge>}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <IconButton label={s.menu.moveUp} disabled={ci === 0} onClick={() => reorder.mutate({ kind: 'categories', ids: move(categories, ci, -1) })} className="size-9 hover:bg-cream-100">
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton label={s.menu.moveDown} disabled={ci === categories.length - 1} onClick={() => reorder.mutate({ kind: 'categories', ids: move(categories, ci, 1) })} className="size-9 hover:bg-cream-100">
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton label={c.visible ? s.menu.hidden : s.menu.visible} onClick={() => updateCategory.mutate(c)} className="size-9 hover:bg-cream-100">
                      {c.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </IconButton>
                    <IconButton label={s.edit} onClick={() => setEditingCategory(c)} className="size-9 hover:bg-cream-100">
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton
                      label={s.delete}
                      onClick={async () => {
                        if (await confirm(s.menu.confirmDeleteCategory(c.name))) deleteCategory.mutate(c.id);
                      }}
                      className="size-9 text-terracotta-600 hover:bg-terracotta-400/10"
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                    <Button variant="outline-dark" size="sm" className="ml-2" onClick={() => setEditingItem({ item: null, categoryId: c.id })}>
                      <Plus className="size-4" aria-hidden />
                      {s.menu.addItem}
                    </Button>
                  </div>
                )}
              </div>
              {c.items.length === 0 ? (
                <p className="py-6 text-center text-sm text-taupe-500">{s.menu.emptyCategory}</p>
              ) : (
                <ul className="divide-y divide-cream-200">
                  {c.items.map((item, ii) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="staff-menu-item">
                      <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-ink-800">
                        <DishImage image={item.image} alt="" icon={iconForCategory(c.name)} sizes="56px" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn('font-semibold', !item.visible && 'text-taupe-500 line-through')}>
                          {item.name}
                          {item.isSpecial && <Star className="ml-1.5 inline size-3.5 fill-gold-500 text-gold-500" aria-label={s.menu.special} />}
                        </p>
                        <p className="text-sm text-taupe-600 tabular">
                          {price(item.priceCents)}
                          {item.optionGroups.length > 0 && ` · ${item.optionGroups.map((g) => g.name).join(', ')}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-40">
                          <Switch
                            size="sm"
                            label={item.available ? s.menu.available : s.menu.soldOut}
                            checked={item.available}
                            onChange={(available) => patchItem.mutate({ id: item.id, patch: { available } })}
                          />
                        </div>
                        {isAdmin && (
                          <>
                            <IconButton
                              label={s.menu.special}
                              aria-pressed={item.isSpecial}
                              onClick={() => patchItem.mutate({ id: item.id, patch: { isSpecial: !item.isSpecial } })}
                              className={cn('size-9', item.isSpecial ? 'text-gold-600' : 'text-taupe-400 hover:bg-cream-100')}
                            >
                              <Star className={cn('size-4', item.isSpecial && 'fill-current')} />
                            </IconButton>
                            <IconButton label={s.menu.moveUp} disabled={ii === 0} onClick={() => reorder.mutate({ kind: 'items', ids: move(c.items, ii, -1) })} className="size-9 hover:bg-cream-100">
                              <ArrowUp className="size-4" />
                            </IconButton>
                            <IconButton
                              label={s.menu.moveDown}
                              disabled={ii === c.items.length - 1}
                              onClick={() => reorder.mutate({ kind: 'items', ids: move(c.items, ii, 1) })}
                              className="size-9 hover:bg-cream-100"
                            >
                              <ArrowDown className="size-4" />
                            </IconButton>
                            <Button variant="outline-dark" size="sm" onClick={() => setEditingItem({ item, categoryId: c.id })}>
                              <Pencil className="size-4" aria-hidden />
                              {s.edit}
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <ItemEditor
        open={!!editingItem}
        item={editingItem?.item ?? null}
        categories={categories}
        defaultCategoryId={editingItem?.categoryId ?? categories[0]?.id ?? 0}
        onClose={() => setEditingItem(null)}
      />
      <CategoryEditor category={editingCategory} onClose={() => setEditingCategory(null)} />
      {dialog}
    </>
  );
}
