import {
  addDoc, collection, deleteDoc, doc, getDocs, increment, onSnapshot, query,
  serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_FLAG, stampMock } from './mock';

/**
 * HomeSang discount codes. A code gives a % or fixed-ກີບ discount at checkout.
 * Mirrors the CND coupon system (lib/cnd/coupons.ts) but adds expiry, usage
 * limit + usage log, a max-discount cap, and public/personal audience.
 *
 *  - audience 'public'   → anyone may use it, bounded by usageLimit (total)
 *  - audience 'personal' → only the assigned customer's phone may use it
 *    (usageLimit defaults to 1 so it is single-use)
 *
 * Each successful use writes a couponRedemptions record (who / when / order /
 * discount) and bumps usedCount, so the admin can see exactly who used a code.
 */
export type CouponType = 'pct' | 'amount';
export type CouponAudience = 'public' | 'personal';

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  /** max discount in ກີບ for a % coupon (0/undefined = no cap) */
  cap?: number;
  minSpend?: number;
  audience: CouponAudience;
  /** personal coupons: only this phone may redeem */
  assignedToPhone?: string;
  startsAt?: number;
  expiresAt?: number;
  /** total redemptions allowed (0/undefined = unlimited) */
  usageLimit?: number;
  usedCount: number;
  active: boolean;
  createdBy?: string;
  createdByName?: string;
  createdAt: number;
  __mock?: boolean;
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  couponCode: string;
  userId: string;
  userPhone?: string;
  orderId: string;
  discount: number;
  ts: number;
}

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }

function mapCoupon(id: string, d: any): Coupon {
  return {
    id,
    code: (d.code ?? '').toUpperCase(),
    type: (d.type ?? 'pct') as CouponType,
    value: Number(d.value) || 0,
    cap: d.cap ? Number(d.cap) : undefined,
    minSpend: d.minSpend ? Number(d.minSpend) : undefined,
    audience: (d.audience === 'personal' ? 'personal' : 'public') as CouponAudience,
    assignedToPhone: d.assignedToPhone || undefined,
    startsAt: d.startsAt ? ms(d.startsAt) : undefined,
    expiresAt: d.expiresAt ? ms(d.expiresAt) : undefined,
    usageLimit: d.usageLimit ? Number(d.usageLimit) : undefined,
    usedCount: Number(d.usedCount) || 0,
    active: d.active !== false,
    createdBy: d.createdBy || undefined,
    createdByName: d.createdByName || undefined,
    createdAt: ms(d.createdAt),
    __mock: !!d[MOCK_FLAG],
  };
}

export function watchAllCoupons(cb: (c: Coupon[]) => void) {
  return onSnapshot(query(collection(db, 'coupons')),
    (s) => cb(s.docs.map((d) => mapCoupon(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchAllCoupons:', e); cb([]); });
}

export interface CouponInput {
  code: string;
  type: CouponType;
  value: number;
  cap?: number;
  minSpend?: number;
  audience: CouponAudience;
  assignedToPhone?: string;
  startsAt?: number;
  expiresAt?: number;
  usageLimit?: number;
  createdBy?: string;
  createdByName?: string;
}

/** drop undefined keys so Firestore never stores an explicit undefined */
function strip<T extends object>(o: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v;
  return out;
}

export async function createCoupon(t: CouponInput): Promise<string> {
  const usageLimit = t.audience === 'personal' ? (t.usageLimit || 1) : (t.usageLimit || undefined);
  const ref = await addDoc(collection(db, 'coupons'), strip({
    code: t.code.trim().toUpperCase(),
    type: t.type,
    value: Math.round(t.value),
    cap: t.cap ? Math.round(t.cap) : undefined,
    minSpend: t.minSpend ? Math.round(t.minSpend) : undefined,
    audience: t.audience,
    assignedToPhone: t.audience === 'personal' ? (t.assignedToPhone || '').trim() : undefined,
    startsAt: t.startsAt || undefined,
    expiresAt: t.expiresAt || undefined,
    usageLimit,
    usedCount: 0,
    active: true,
    createdBy: t.createdBy,
    createdByName: t.createdByName,
    createdAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function updateCoupon(id: string, patch: Partial<Coupon>) {
  await updateDoc(doc(db, 'coupons', id), patch as any);
}
export async function deleteCoupon(id: string) { await deleteDoc(doc(db, 'coupons', id)); }

export async function seedCouponsIfEmpty(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'coupons')));
  if (!snap.empty) return 0;
  const now = Date.now();
  const in30 = now + 30 * 864e5;
  const rows: CouponInput[] = [
    { code: 'WELCOME10', type: 'pct', value: 10, minSpend: 200000, audience: 'public', expiresAt: in30, usageLimit: 100 },
    { code: 'SAVE50K', type: 'amount', value: 50000, minSpend: 500000, audience: 'public', expiresAt: in30 },
    { code: 'HOMESANG15', type: 'pct', value: 15, cap: 100000, audience: 'public', expiresAt: in30, usageLimit: 50 },
  ];
  const b = writeBatch(db);
  for (const r of rows) {
    const usageLimit = r.audience === 'personal' ? (r.usageLimit || 1) : (r.usageLimit || undefined);
    b.set(doc(collection(db, 'coupons')), stampMock(strip({
      code: r.code, type: r.type, value: r.value, cap: r.cap, minSpend: r.minSpend,
      audience: r.audience, expiresAt: r.expiresAt, usageLimit, usedCount: 0, active: true,
      createdAt: serverTimestamp(),
    })));
  }
  await b.commit();
  return rows.length;
}

export async function clearMockCoupons(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'coupons'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}

export interface ValidateCtx { subtotal: number; phone?: string; now?: number; }

/** Validate a code against a subtotal (+ optional buyer phone) → discount amount. */
export function validateCoupon(code: string, coupons: Coupon[], ctx: ValidateCtx): { ok: boolean; discount: number; reason?: string; coupon?: Coupon } {
  const now = ctx.now ?? Date.now();
  const wanted = code.trim().toUpperCase();
  const c = coupons.find((x) => x.code === wanted);
  if (!c) return { ok: false, discount: 0, reason: 'ບໍ່ ພົບ ລະຫັດ ນີ້' };
  if (!c.active) return { ok: false, discount: 0, reason: 'ລະຫັດ ນີ້ ຖືກ ປິດ ຢູ່' };
  if (c.startsAt && now < c.startsAt) return { ok: false, discount: 0, reason: 'ລະຫັດ ນີ້ ຍັງ ບໍ່ ທັນ ເລີ່ມ ໃຊ້' };
  if (c.expiresAt && now > c.expiresAt) return { ok: false, discount: 0, reason: 'ລະຫັດ ນີ້ ໝົດ ອາຍຸ ແລ້ວ' };
  if (c.usageLimit && c.usedCount >= c.usageLimit) return { ok: false, discount: 0, reason: 'ລະຫັດ ນີ້ ໃຊ້ ຄົບ ຈຳ ນວນ ແລ້ວ' };
  if (c.audience === 'personal') {
    const p = (ctx.phone || '').trim();
    if (!p || !c.assignedToPhone || p !== c.assignedToPhone.trim()) return { ok: false, discount: 0, reason: 'ລະຫັດ ນີ້ ໃຊ້ ໄດ້ ສະ ເພາະ ຄົນ ທີ່ ຖືກ ມອບ' };
  }
  if (c.minSpend && ctx.subtotal < c.minSpend) return { ok: false, discount: 0, reason: `ຕ້ອງ ຊື້ ຢ່າງ ໜ້ອຍ ${c.minSpend.toLocaleString('en-US')} ກີບ` };
  let discount = c.type === 'pct' ? Math.round((ctx.subtotal * c.value) / 100) : Math.min(c.value, ctx.subtotal);
  if (c.type === 'pct' && c.cap) discount = Math.min(discount, c.cap);
  discount = Math.min(discount, ctx.subtotal);
  return { ok: true, discount, coupon: c };
}

/** Record a successful redemption: log who/when/order + bump usedCount. Best-effort. */
export async function redeemCoupon(coupon: Coupon, r: { userId: string; userPhone?: string; orderId: string; discount: number }) {
  try {
    await addDoc(collection(db, 'couponRedemptions'), strip({
      couponId: coupon.id,
      couponCode: coupon.code,
      userId: r.userId,
      userPhone: r.userPhone,
      orderId: r.orderId,
      discount: Math.round(r.discount),
      ts: serverTimestamp(),
    }));
    await updateDoc(doc(db, 'coupons', coupon.id), { usedCount: increment(1) });
  } catch (e) { console.error('redeemCoupon:', e); }
}

export function watchCouponRedemptions(cb: (r: CouponRedemption[]) => void, couponCode?: string) {
  const q = couponCode
    ? query(collection(db, 'couponRedemptions'), where('couponCode', '==', couponCode.toUpperCase()))
    : query(collection(db, 'couponRedemptions'));
  return onSnapshot(q,
    (s) => cb(s.docs.map((d) => {
      const x = d.data() as any;
      return { id: d.id, couponId: x.couponId, couponCode: x.couponCode, userId: x.userId, userPhone: x.userPhone, orderId: x.orderId, discount: Number(x.discount) || 0, ts: ms(x.ts) } as CouponRedemption;
    }).sort((a, b) => b.ts - a.ts)),
    (e) => { console.error('watchCouponRedemptions:', e); cb([]); });
}
