import { useEffect, useState } from 'react';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import { type AppSettings, watchAppSettings } from './appSettings';
import { type Order, watchMyOrders } from './orders';

/**
 * Commit points to a redemption BEFORE the order is written.
 *
 * The displayed balance is derived from the buyer's own orders, so two checkouts
 * fired close together would each see the full balance and redeem it twice.
 * This bumps a single running total inside a transaction, and the security rules
 * refuse any value above the server-written loyaltyLedger — so simultaneous
 * checkouts contend on one document and the loser fails instead of double-spending.
 *
 * Throws when the points are no longer available. The client may only ever
 * INCREASE this total (a client-side decrease would let the same points be spent
 * again); points reserved for an order that then fails to be created are given
 * back by the server, which reconciles this total against the orders that
 * actually exist on the next order write.
 */
export async function reservePoints(uid: string, points: number): Promise<void> {
  if (!(points > 0)) return;
  const ref = doc(db, 'loyaltySpend', uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const spent = Number(snap.data()?.spent) || 0;
    const next = spent + points;
    if (snap.exists()) tx.update(ref, { spent: next, updatedAt: Date.now() });
    else tx.set(ref, { uid, spent: next, updatedAt: Date.now() });
  });
}

/**
 * Y3 Slice B — loyalty / store-credit, 100% DERIVED from the customer's orders
 * (no ledger collection, mirroring the derived wallet). 1 point = 1 kip.
 *   • earned  = Σ floor((subtotal − pointsRedeemed) × earnPct%) over the buyer's
 *               DELIVERED/COMPLETED, non-cancelled orders (cashback on goods paid
 *               in cash — never on the points-paid portion, so no points-on-points).
 *   • redeemed = Σ order.pointsRedeemed over non-cancelled orders (redemption is
 *               stamped on the order at checkout — cancelling an order returns
 *               its points automatically because the sum drops it).
 *   • balance  = earned − redeemed.
 * earnPct = 0 turns the whole feature off (card hidden, no checkout toggle).
 */
export interface LoyaltyEntry {
  key: string;
  type: 'earn' | 'redeem';
  orderNumber: string;
  points: number;
  at: number;
  base?: number; // the amount the earn % was applied to
}
export interface LoyaltySummary {
  earned: number;
  redeemed: number;
  balance: number;
  entries: LoyaltyEntry[];
}

/** Points a goods amount earns at the given rate (floored). */
export function earnPointsFor(goodsBase: number, earnPct: number): number {
  if (!(earnPct > 0) || !(goodsBase > 0)) return 0;
  return Math.floor((goodsBase * earnPct) / 100);
}

export function computeLoyalty(orders: Order[], earnPct: number): LoyaltySummary {
  let earned = 0;
  let redeemed = 0;
  const entries: LoyaltyEntry[] = [];
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    if (o.status === 'delivered' || o.status === 'completed') {
      const base = Math.max(0, (o.subtotal ?? 0) - (o.pointsRedeemed ?? 0));
      const pts = earnPointsFor(base, earnPct);
      if (pts > 0) {
        earned += pts;
        entries.push({ key: `e-${o.id}`, type: 'earn', orderNumber: o.orderNumber, points: pts, at: o.createdAt, base });
      }
    }
    if (o.pointsRedeemed && o.pointsRedeemed > 0) {
      redeemed += o.pointsRedeemed;
      entries.push({ key: `r-${o.id}`, type: 'redeem', orderNumber: o.orderNumber, points: o.pointsRedeemed, at: o.createdAt });
    }
  }
  entries.sort((a, b) => b.at - a.at);
  return { earned, redeemed, balance: Math.max(0, earned - redeemed), entries };
}

/** Max points spendable on an order — capped by balance AND maxRedeemPct of the goods subtotal. */
export function maxRedeemable(subtotal: number, balance: number, maxRedeemPct: number): number {
  const pct = maxRedeemPct > 0 ? maxRedeemPct : 0;
  const cap = Math.floor((subtotal * pct) / 100);
  return Math.max(0, Math.min(balance, cap));
}

/** Live loyalty state for a user (derived from their orders + admin settings). */
export function useLoyalty(uid: string | undefined): {
  summary: LoyaltySummary;
  earnPct: number;
  maxRedeemPct: number;
  enabled: boolean;
} {
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => watchAppSettings(setSettings), []);
  useEffect(() => {
    if (!uid) { setOrders([]); return; }
    return watchMyOrders(uid, setOrders);
  }, [uid]);
  const earnPct = settings?.loyaltyEarnPct ?? 0;
  const maxRedeemPct = settings?.loyaltyMaxRedeemPct ?? 0;
  return { summary: computeLoyalty(orders, earnPct), earnPct, maxRedeemPct, enabled: earnPct > 0 };
}
