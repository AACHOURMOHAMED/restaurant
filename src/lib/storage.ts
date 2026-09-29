import { useSyncExternalStore } from 'react';

/** localStorage that never throws (private mode, blocked storage, SSR). */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable — keep working in memory */
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
  getJSON<T>(key: string): T | null {
    const raw = storage.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJSON(key: string, value: unknown): void {
    storage.set(key, JSON.stringify(value));
  },
};

export type Store<T> = {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  use(): T;
};

/** A tiny persisted store (localStorage + cross-tab sync) for React. */
export function createStore<T>(key: string, initial: T, revive: (raw: unknown) => T | null = (r) => r as T): Store<T> {
  const load = () => {
    const raw = storage.getJSON<unknown>(key);
    return raw == null ? initial : (revive(raw) ?? initial);
  };
  let state: T = load();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  window.addEventListener('storage', (e) => {
    if (e.key === key) {
      state = load();
      emit();
    }
  });

  const store: Store<T> = {
    get: () => state,
    set(next) {
      state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
      if (state == null) storage.remove(key);
      else storage.setJSON(key, state);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    use: () => useSyncExternalStore(store.subscribe, store.get, store.get),
  };
  return store;
}

/** RFC 4122 v4 id; works on plain http (LAN testing) where crypto.randomUUID is missing. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
