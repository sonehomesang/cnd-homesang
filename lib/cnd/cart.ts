import { useSyncExternalStore } from 'react';

/**
 * CND cart — a tiny standalone store (NOT the HomeSang cart). Kept in a
 * globalThis singleton + localStorage and read via useSyncExternalStore so it
 * survives Metro's web-export module duplication. Each line carries whether the
 * customer wants a technician to install it (+% fee).
 */
export interface CndCartItem {
  productId: string;
  name: string;
  unit: string;
  price: number;
  qty: number;
  installable: boolean;
  install: boolean;   // customer wants install for this line
  feePct: number;     // resolved install-fee % for this product
  warrantyDays?: number;  // ninesang: service warranty length snapshot
}

const KEY = 'cnd_cart_v1';
type S = { items: CndCartItem[]; ls: Set<() => void> };
const g = globalThis as any;
function load(): CndCartItem[] {
  try { if (typeof window !== 'undefined') { const r = window.localStorage?.getItem(KEY); if (r) return JSON.parse(r); } } catch { /* ignore */ }
  return [];
}
const store: S = g.__cndCart ?? (g.__cndCart = { items: load(), ls: new Set() });
function commit(next: CndCartItem[]) {
  store.items = next;
  try { if (typeof window !== 'undefined') window.localStorage?.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  store.ls.forEach((l) => l());
}

export function cndCartAdd(it: CndCartItem) {
  const ex = store.items.find((x) => x.productId === it.productId);
  if (ex) commit(store.items.map((x) => x.productId === it.productId ? { ...x, qty: x.qty + it.qty, install: it.install || x.install } : x));
  else commit([...store.items, it]);
}
export function cndCartSetQty(id: string, qty: number) {
  if (qty <= 0) return cndCartRemove(id);
  commit(store.items.map((x) => x.productId === id ? { ...x, qty } : x));
}
export function cndCartToggleInstall(id: string) {
  commit(store.items.map((x) => x.productId === id ? { ...x, install: x.installable && !x.install } : x));
}
export function cndCartRemove(id: string) { commit(store.items.filter((x) => x.productId !== id)); }
export function cndCartClear() { commit([]); }

export function useCndCart(): CndCartItem[] {
  return useSyncExternalStore(
    (cb) => { store.ls.add(cb); return () => store.ls.delete(cb); },
    () => store.items,
    () => store.items,
  );
}

/** Totals: goods subtotal + install-fee total (only lines with install on). */
export function cndCartTotals(items: CndCartItem[]) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const installFeeTotal = items.reduce((s, i) => s + (i.install ? Math.round((i.price * i.qty * i.feePct) / 100) : 0), 0);
  const installCount = items.filter((i) => i.install).length;
  return { subtotal, installFeeTotal, installCount };
}
