import { TABLE_SESSION_TTL_MS } from '@shared/constants';
import { createStore, uuid } from './storage';

// ─── Table the guest is sitting at ──────────────────────────────────────────

export type TableSession = { code: string; number: string; confirmed: boolean; at: number };

export const tableStore = createStore<TableSession | null>('bb-table', null, (raw) => {
  const r = raw as Partial<TableSession> | null;
  if (!r || typeof r.code !== 'string' || typeof r.number !== 'string' || typeof r.at !== 'number') return null;
  return { code: r.code, number: r.number, confirmed: r.confirmed === true, at: r.at };
});

/** The current table, or null once the session is older than a few hours. */
export function useTable(): TableSession | null {
  const session = tableStore.use();
  if (!session || Date.now() - session.at > TABLE_SESSION_TTL_MS) return null;
  return session;
}

export const setTable = (table: { code: string; number: string }, confirmed: boolean) =>
  tableStore.set({ ...table, confirmed, at: Date.now() });
export const confirmTable = () => tableStore.set((s) => (s ? { ...s, confirmed: true, at: Date.now() } : s));
export const clearTable = () => tableStore.set(null);

// ─── Cart ───────────────────────────────────────────────────────────────────

export type CartLine = { id: string; menuItemId: number; quantity: number; optionIds: number[]; note: string };
export type Cart = {
  lines: CartLine[];
  note: string;
  /** Idempotency key reused if the same cart is re-sent (e.g. after a network error). */
  submission: { key: string; fingerprint: string } | null;
};

const EMPTY_CART: Cart = { lines: [], note: '', submission: null };

export const cartStore = createStore<Cart>('bb-cart', EMPTY_CART, (raw) => {
  const r = raw as Partial<Cart> | null;
  if (!r || !Array.isArray(r.lines)) return null;
  return {
    lines: r.lines.filter(
      (l): l is CartLine =>
        !!l && typeof l.menuItemId === 'number' && typeof l.quantity === 'number' && Array.isArray(l.optionIds),
    ),
    note: typeof r.note === 'string' ? r.note : '',
    submission: r.submission ?? null,
  };
});

const sameOptions = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export const cart = {
  add(menuItemId: number, optionIds: number[], quantity: number, note: string) {
    cartStore.set((c) => {
      const existing = c.lines.find(
        (l) => l.menuItemId === menuItemId && sameOptions(l.optionIds, optionIds) && l.note === note,
      );
      const lines = existing
        ? c.lines.map((l) => (l === existing ? { ...l, quantity: Math.min(20, l.quantity + quantity) } : l))
        : [...c.lines, { id: uuid(), menuItemId, optionIds, quantity, note }];
      return { ...c, lines };
    });
  },
  setQuantity(id: string, quantity: number) {
    cartStore.set((c) => ({
      ...c,
      lines: quantity <= 0 ? c.lines.filter((l) => l.id !== id) : c.lines.map((l) => (l.id === id ? { ...l, quantity: Math.min(20, quantity) } : l)),
    }));
  },
  setLineNote(id: string, note: string) {
    cartStore.set((c) => ({ ...c, lines: c.lines.map((l) => (l.id === id ? { ...l, note } : l)) }));
  },
  remove(id: string) {
    cartStore.set((c) => ({ ...c, lines: c.lines.filter((l) => l.id !== id) }));
  },
  setNote(note: string) {
    cartStore.set((c) => ({ ...c, note }));
  },
  /** Same key for the same cart content, new key as soon as anything changes. */
  submissionKey(fingerprint: string): string {
    const current = cartStore.get().submission;
    if (current && current.fingerprint === fingerprint) return current.key;
    const key = uuid();
    cartStore.set((c) => ({ ...c, submission: { key, fingerprint } }));
    return key;
  },
  clear() {
    cartStore.set(EMPTY_CART);
  },
};

// ─── Things the guest created on this device ────────────────────────────────

export type MyOrder = { token: string; reference: string; tableNumber: string; createdAt: string };
export const myOrdersStore = createStore<MyOrder[]>('bb-orders', [], (raw) =>
  Array.isArray(raw) ? (raw as MyOrder[]).filter((o) => Date.now() - new Date(o.createdAt).getTime() < 12 * 3_600_000) : null,
);

export type MyReservation = { token: string; reference: string; date: string; time: string; partySize: number };
export const myReservationsStore = createStore<MyReservation[]>('bb-reservations', [], (raw) =>
  Array.isArray(raw) ? (raw as MyReservation[]) : null,
);
