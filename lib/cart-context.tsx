import { createContext, ReactNode, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Product } from './shop';

// "just added to cart" signal — kept on a globalThis singleton (NOT React
// context) so it survives Metro's web-export module duplication: addItem() may
// run in one module copy while the toast reads another. Both share globalThis.
type ToastSig = { name: string; at: number } | null;
const _g = globalThis as any;
const _toast: { last: ToastSig; ls: Set<() => void> } = _g.__hsCartToast ?? (_g.__hsCartToast = { last: null, ls: new Set() });
export function fireCartToast(name: string) { _toast.last = { name, at: Date.now() }; _toast.ls.forEach((l) => l()); }
export function useCartToastSignal(): ToastSig {
  return useSyncExternalStore((cb) => { _toast.ls.add(cb); return () => _toast.ls.delete(cb); }, () => _toast.last, () => _toast.last);
}

// persist the cart across reloads (web) — it was in-memory only before, so a
// refresh silently emptied it.
const CART_KEY = 'hs_cart';
function loadCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage?.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface CartItem {
  product: Product;
  qty: number;
  /** unique line id = product.id (+ variant label when variants chosen) */
  variantKey: string;
  variantLabel?: string;
  /** effective unit price including variant deltas */
  unitPrice: number;
}

export interface AddOptions {
  qty?: number;
  variantLabel?: string;
  unitPrice?: number;
}

interface CartState {
  items: CartItem[];
  count: number;
  subtotal: number;
  /** shopId of the FIRST cart item, or null when empty (legacy helper) */
  cartShopId: string | null;
  /** distinct shopIds currently in the cart (multi-shop) */
  shopIds: string[];
  /** last item just added — drives the "✓ added to cart" toast (null = none) */
  justAdded: { name: string; at: number } | null;
  addItem: (product: Product, opts?: AddOptions) => void;
  setQty: (variantKey: string, qty: number) => void;
  removeItem: (variantKey: string) => void;
  clear: () => void;
  /** remove every item belonging to one shop (after its order is placed) */
  clearShop: (shopId: string) => void;
}

const CartContext = createContext<CartState>({
  items: [],
  count: 0,
  subtotal: 0,
  cartShopId: null,
  shopIds: [],
  justAdded: null,
  addItem: () => {},
  setQty: () => {},
  removeItem: () => {},
  clear: () => {},
  clearShop: () => {},
});

export function useCart() {
  return useContext(CartContext);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart);
  const [justAdded, setJustAdded] = useState<{ name: string; at: number } | null>(null);

  // persist on every change (web only; native is a no-op)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage?.setItem(CART_KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items]);

  const addItem = (product: Product, opts: AddOptions = {}) => {
    const qty = opts.qty ?? 1;
    const variantKey = product.id + (opts.variantLabel ? `|${opts.variantLabel}` : '');
    const unitPrice = opts.unitPrice ?? product.price;
    setItems((prev) => {
      // multi-shop cart: items from different shops coexist and are checked out
      // per shop (each shop → its own order). No destructive replace.
      const found = prev.find((i) => i.variantKey === variantKey);
      if (found) {
        return prev.map((i) =>
          i.variantKey === variantKey ? { ...i, qty: i.qty + qty } : i,
        );
      }
      return [...prev, { product, qty, variantKey, variantLabel: opts.variantLabel, unitPrice }];
    });
    setJustAdded({ name: product.name, at: Date.now() });
    fireCartToast(product.name);   // module-dup-safe signal for the app-wide toast
  };

  const setQty = (variantKey: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.variantKey !== variantKey)
        : prev.map((i) => (i.variantKey === variantKey ? { ...i, qty } : i)),
    );
  };

  const removeItem = (variantKey: string) => {
    setItems((prev) => prev.filter((i) => i.variantKey !== variantKey));
  };

  const clear = () => setItems([]);
  const clearShop = (shopId: string) => setItems((prev) => prev.filter((i) => i.product.shopId !== shopId));

  const { count, subtotal } = useMemo(() => {
    let c = 0;
    let s = 0;
    for (const i of items) {
      c += i.qty;
      s += i.qty * i.unitPrice;
    }
    return { count: c, subtotal: s };
  }, [items]);

  const cartShopId = items[0]?.product.shopId ?? null;
  const shopIds = useMemo(() => [...new Set(items.map((i) => i.product.shopId))], [items]);

  return (
    <CartContext.Provider
      value={{ items, count, subtotal, cartShopId, shopIds, justAdded, addItem, setQty, removeItem, clear, clearShop }}>
      {children}
    </CartContext.Provider>
  );
}
