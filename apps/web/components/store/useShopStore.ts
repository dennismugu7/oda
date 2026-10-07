'use client';

// The cart and favourites of one shop in localStorage, shared by every component on the page
// (and other tabs). Reads are guarded: a private window or blocked storage just means an
// empty cart, never an error.
import { useCallback, useSyncExternalStore } from 'react';
import {
  addLine,
  cartKey,
  favouritesKey,
  parseIds,
  parseLines,
  setQty,
  type CartLine,
} from '@/lib/store/cart';

const EVENT = 'oda:store';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the change lives until the page reloads.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// useSyncExternalStore needs a stable snapshot: cache the parsed value per raw string.
const cache = new Map<string, { raw: string | null; value: unknown }>();
function snapshot<T>(key: string, parse: (raw: string | null) => T): T {
  const raw = read(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  const value = parse(raw);
  cache.set(key, { raw, value });
  return value;
}

const EMPTY: never[] = [];

const noSubscribe = () => () => {};

/**
 * False on the server and during hydration, true once the page runs in the browser. The cart
 * is only known on this device: render a placeholder until then, never "Your cart is empty".
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

export function useCart(shopId: string) {
  const key = cartKey(shopId);
  const lines = useSyncExternalStore(
    subscribe,
    () => snapshot(key, parseLines),
    () => EMPTY as CartLine[],
  );
  const add = useCallback(
    (line: CartLine) => write(key, addLine(snapshot(key, parseLines), line)),
    [key],
  );
  const changeQty = useCallback(
    (index: number, qty: number) => write(key, setQty(snapshot(key, parseLines), index, qty)),
    [key],
  );
  const replace = useCallback((next: CartLine[]) => write(key, next), [key]);
  const hydrated = useHydrated();
  return { lines, add, changeQty, replace, hydrated };
}

export function useFavourites(shopId: string) {
  const key = favouritesKey(shopId);
  const ids = useSyncExternalStore(
    subscribe,
    () => snapshot(key, parseIds),
    () => EMPTY as string[],
  );
  const toggle = useCallback(
    (id: string) => {
      const current = snapshot(key, parseIds);
      write(key, current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
    },
    [key],
  );
  return { ids, toggle };
}
