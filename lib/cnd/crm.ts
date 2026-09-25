import type { CndOrder } from './orders';
import { tierFor, TIERS, type CndTier } from './loyalty';

/**
 * CND customers — derived from online orders (grouped by phone/name). No separate
 * collection: the order history IS the registry. Loyalty points = 1 per 10,000 ກີບ,
 * tier ranked by lifetime spend ([[loyalty]]).
 */
export interface CndCustomer {
  key: string;
  name: string;
  phone?: string;
  orders: CndOrder[];
  orderCount: number;
  totalSpent: number;
  lastAt: number;
  installCount: number;
  points: number;
  tier: CndTier;
}
export function deriveCustomers(orders: CndOrder[]): CndCustomer[] {
  const map = new Map<string, CndCustomer>();
  for (const o of orders) {
    if (o.channel === 'pos' || o.status === 'cancelled') continue;  // POS = anonymous walk-in
    const key = (o.phone || o.customerName || '').trim();
    if (!key) continue;
    let c = map.get(key);
    if (!c) { c = { key, name: o.customerName || key, phone: o.phone, orders: [], orderCount: 0, totalSpent: 0, lastAt: 0, installCount: 0, points: 0, tier: TIERS[0] }; map.set(key, c); }
    c.orders.push(o);
    c.orderCount++;
    c.totalSpent += o.total;
    c.lastAt = Math.max(c.lastAt, o.createdAt);
    if (o.install) c.installCount++;
    if (!c.phone && o.phone) c.phone = o.phone;
    if ((!c.name || c.name === key) && o.customerName) c.name = o.customerName;
  }
  for (const c of map.values()) { c.points = Math.floor(c.totalSpent / 10000); c.tier = tierFor(c.totalSpent).tier; c.orders.sort((a, b) => b.createdAt - a.createdAt); }
  return [...map.values()].sort((a, b) => b.totalSpent - a.totalSpent);
}
