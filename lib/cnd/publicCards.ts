import {
  collection, doc, getDoc, getDocs, onSnapshot, query, Timestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { deriveCustomers } from './crm';

/**
 * Public projections — the storefront (guest) can't read cndOrders (admin-only),
 * so the admin publishes SAFE, non-PII slices: featured/visible install reviews
 * (first-name only) + per-phone loyalty tier. Rebuilt from orders by the admin
 * (on moderation / seed / manual "publish"), so no Cloud Function is needed.
 */
export interface CndReviewCard { id: string; rating: number; review?: string; reply?: string; techName?: string; customerFirst?: string; featured?: boolean; at: number; beforePhoto?: string; afterPhoto?: string; work?: string; }
export interface CndCustomerCard { phone: string; tierKey: string; tierName: string; tierIcon: string; tierColor: string; discountPct: number; points: number; }

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
const digits = (s?: string) => (s || '').replace(/\D/g, '');
const firstName = (s?: string) => (s || '').trim().split(/\s+/).slice(0, 2).join(' ');

// cndCustomerCards are publicly readable (a guest looks up their own tier at checkout),
// so the doc id must NOT be the raw phone — that would let anyone enumerate every
// customer's number. Key by a salted hash instead: you can only read a card if you
// already know the phone. Obfuscation, not secrecy — two 32-bit mixes ≈ 64-bit space.
const SALT = 'cnd-tier-v1';
export function hashPhone(phone?: string): string {
  const s = SALT + ':' + digits(phone);
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return 'c' + h1.toString(36) + h2.toString(36);
}

export function watchCndReviewCards(cb: (r: CndReviewCard[]) => void) {
  return onSnapshot(query(collection(db, 'cndReviewCards')),
    (s) => cb(s.docs.map((d) => { const x = d.data() as any; return { id: d.id, rating: Number(x.rating) || 0, review: x.review, reply: x.reply, techName: x.techName, customerFirst: x.customerFirst, featured: !!x.featured, at: ms(x.at), beforePhoto: x.beforePhoto, afterPhoto: x.afterPhoto, work: x.work }; })
      .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.at - a.at)),
    (e) => { console.error('watchCndReviewCards:', e); cb([]); });
}

/** Look up a customer's public tier card by the phone they enter (digits match). */
export async function getCndCustomerCard(phone: string): Promise<CndCustomerCard | null> {
  const id = digits(phone);
  if (id.length < 6) return null;
  try {
    const d = await getDoc(doc(db, 'cndCustomerCards', hashPhone(id)));
    if (!d.exists()) return null;
    const x = d.data() as any;
    return { phone: id, tierKey: x.tierKey, tierName: x.tierName, tierIcon: x.tierIcon, tierColor: x.tierColor, discountPct: Number(x.discountPct) || 0, points: Number(x.points) || 0 };
  } catch { return null; }
}

/** Rebuild both public projections from the admin-readable orders. */
export async function rebuildCndPublicCards(): Promise<{ reviews: number; customers: number }> {
  const snap = await getDocs(query(collection(db, 'cndOrders')));
  const orders = snap.docs.map((d) => { const x = d.data() as any; return { id: d.id, channel: x.channel, status: x.status ?? 'new', phone: x.phone, customerName: x.customerName, total: Number(x.total) || 0, createdAt: ms(x.createdAt), install: x.install, items: Array.isArray(x.items) ? x.items : [] }; });
  const reviewOrders = orders.filter((o) => o.install && typeof o.install.rating === 'number' && !o.install.reviewHidden && (o.install.review || o.install.reviewFeatured || o.install.afterPhoto));
  const customers = deriveCustomers(orders as any);

  const [oldR, oldC] = await Promise.all([getDocs(query(collection(db, 'cndReviewCards'))), getDocs(query(collection(db, 'cndCustomerCards')))]);
  const batch = writeBatch(db);
  oldR.forEach((d) => batch.delete(d.ref));
  oldC.forEach((d) => batch.delete(d.ref));
  for (const o of reviewOrders) {
    const it = o.install;
    const work = (o.items.find((i: any) => i && i.install && i.name)?.name) || undefined;
    batch.set(doc(collection(db, 'cndReviewCards')), {
      rating: it.rating, review: it.review ?? null, reply: it.reviewReply ?? null, techName: it.techName ?? null,
      customerFirst: firstName(o.customerName), featured: !!it.reviewFeatured, at: o.createdAt,
      beforePhoto: it.beforePhoto ?? null, afterPhoto: it.afterPhoto ?? null, work: work ?? null,
    });
  }
  let cust = 0;
  for (const c of customers) { if (digits(c.phone).length < 6) continue; batch.set(doc(db, 'cndCustomerCards', hashPhone(c.phone)), { tierKey: c.tier.key, tierName: c.tier.name, tierIcon: c.tier.icon, tierColor: c.tier.color, discountPct: c.tier.discountPct, points: c.points }); cust++; }
  await batch.commit();
  return { reviews: reviewOrders.length, customers: cust };
}

export async function clearCndPublicCards(): Promise<number> {
  const [r, c] = await Promise.all([getDocs(query(collection(db, 'cndReviewCards'))), getDocs(query(collection(db, 'cndCustomerCards')))]);
  const batch = writeBatch(db);
  r.forEach((d) => batch.delete(d.ref));
  c.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return r.size + c.size;
}
