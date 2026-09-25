import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG, stampMock } from '../mock';
import { samePhone } from './staff';

/**
 * CND discount coupons — a code gives a % or fixed-ກີບ discount, with expiry, a
 * total usage limit (+ live usedCount), a max-discount cap, and a public/personal
 * audience (personal = only the assigned phone, single-use by default).
 *
 * SECURITY: everything here is a PREVIEW for the checkout UI. Redemption is
 * authoritative server-side — the onCndOrderCreated Cloud Function re-validates the
 * code with server time, counts the use atomically (guests included), logs it to
 * cndCouponRedemptions and flags the order for staff review if the claimed discount
 * isn't legitimate. Keep validateCoupon() in sync with that function.
 */
export type CndCouponType = 'pct' | 'amount';
export type CndCouponAudience = 'public' | 'personal';
export interface CndCoupon {
  id: string;
  code: string;
  type: CndCouponType;
  value: number;
  cap?: number;              // max discount (ກີບ) for a % coupon
  minSpend?: number;
  audience: CndCouponAudience;
  assignedToPhone?: string;  // personal coupons
  expiresAt?: number;
  usageLimit?: number;       // total redemptions allowed
  usedCount: number;
  active: boolean;
  createdAt: number;
  __mock?: boolean;
}

/** Codes are uppercase A–Z 0–9 - _, 3–20 chars: no spaces or look-alike junk. */
export const COUPON_CODE_RE = /^[A-Z0-9_-]{3,20}$/;
export const normalizeCouponCode = (s: string) => (s || '').trim().toUpperCase();

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndCoupon {
  return {
    id,
    code: normalizeCouponCode(d.code ?? ''),
    type: (d.type ?? 'pct') as CndCouponType,
    value: Number(d.value) || 0,
    cap: d.cap ? Number(d.cap) : undefined,
    minSpend: d.minSpend ? Number(d.minSpend) : undefined,
    audience: (d.audience === 'personal' ? 'personal' : 'public') as CndCouponAudience,
    assignedToPhone: d.assignedToPhone || undefined,
    expiresAt: d.expiresAt ? ms(d.expiresAt) : undefined,
    usageLimit: d.usageLimit ? Number(d.usageLimit) : undefined,
    usedCount: Number(d.usedCount) || 0,
    active: d.active !== false,
    createdAt: ms(d.createdAt),
    __mock: !!d[MOCK_FLAG],
  };
}
function strip<T extends object>(o: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v;
  return out;
}
export function watchCndCoupons(cb: (c: CndCoupon[]) => void) {
  return onSnapshot(query(collection(db, 'cndCoupons')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchCndCoupons:', e); cb([]); });
}
export interface CndCouponInput {
  code: string; type: CndCouponType; value: number; cap?: number; minSpend?: number;
  audience?: CndCouponAudience; assignedToPhone?: string; expiresAt?: number; usageLimit?: number;
}

/**
 * Parse an admin-typed expiry. Accepts 2026-12-31, 31/12/2026, 31-12-2026, 31.12.2026.
 * Blank = no expiry. Anything unreadable or impossible (31/02/2026) is ok:false, so a
 * typo can never silently become "never expires". Valid until 23:59:59.999 local time.
 */
export function parseCouponDate(s: string): { ok: boolean; ms?: number } {
  const t = (s || '').trim();
  if (!t) return { ok: true };
  let y = 0, m = 0, d = 0;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (dmy) { d = +dmy[1]; m = +dmy[2]; y = +dmy[3]; }
  else return { ok: false };
  const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return { ok: false };
  return { ok: true, ms: dt.getTime() };
}

/** Admin-side input rules. Returns a Lao error, or null when the coupon may be saved. */
export function checkCouponInput(t: CndCouponInput, existing: CndCoupon[]): string | null {
  const code = normalizeCouponCode(t.code);
  if (!COUPON_CODE_RE.test(code)) return 'ໂຄ້ດ ຕ້ອງ ມີ 3–20 ຕົວ: A–Z, 0–9, - ຫຼື _ (ບໍ່ ມີ ຍະຫວ່າງ)';
  if (existing.some((c) => c.code === code)) return `ມີ ໂຄ້ດ ${code} ຢູ່ ແລ້ວ — ໂຄ້ດ ຫ້າມ ຊ້ຳ`;
  if (!(t.value > 0)) return 'ຄ່າ ສ່ວນ ຫຼຸດ ຕ້ອງ ຫຼາຍ ກວ່າ 0';
  if (t.type === 'pct' && t.value > 100) return 'ສ່ວນ ຫຼຸດ % ຕ້ອງ ຢູ່ ລະຫວ່າງ 1–100';
  if (t.cap !== undefined && t.cap < 0) return 'ຫຼຸດ ສູງ ສຸດ ຕ້ອງ ບໍ່ ຕິດ ລົບ';
  if (t.minSpend !== undefined && t.minSpend < 0) return 'ຊື້ ຂັ້ນ ຕ່ຳ ຕ້ອງ ບໍ່ ຕິດ ລົບ';
  if ((t.audience ?? 'public') === 'personal' && (t.assignedToPhone || '').replace(/\D/g, '').length < 8) {
    return 'ລະຫັດ ສ່ວນ ຕົວ ຕ້ອງ ມີ ເບີ ໂທ ຢ່າງ ໜ້ອຍ 8 ຕົວ ເລກ';
  }
  if (t.usageLimit !== undefined && t.usageLimit < 1) return 'ຈຳ ກັດ ຄັ້ງ ໃຊ້ ຕ້ອງ ຢ່າງ ໜ້ອຍ 1';
  if (t.expiresAt !== undefined && t.expiresAt < Date.now()) return 'ວັນ ໝົດ ອາຍຸ ຜ່ານ ໄປ ແລ້ວ';
  return null;
}

export async function addCndCoupon(t: CndCouponInput) {
  const code = normalizeCouponCode(t.code);
  // re-check against the database, not just this screen's list (another device may have added it)
  const dup = await getDocs(query(collection(db, 'cndCoupons'), where('code', '==', code)));
  if (!dup.empty) throw new Error(`ມີ ໂຄ້ດ ${code} ຢູ່ ແລ້ວ — ໂຄ້ດ ຫ້າມ ຊ້ຳ`);
  const err = checkCouponInput({ ...t, code }, []);
  if (err) throw new Error(err);
  const audience: CndCouponAudience = t.audience === 'personal' ? 'personal' : 'public';
  const usageLimit = audience === 'personal' ? (t.usageLimit || 1) : (t.usageLimit || undefined);
  await addDoc(collection(db, 'cndCoupons'), strip({
    code, type: t.type, value: Math.round(t.value),
    cap: t.cap ? Math.round(t.cap) : undefined,
    minSpend: t.minSpend ? Math.round(t.minSpend) : undefined,
    audience,
    assignedToPhone: audience === 'personal' ? (t.assignedToPhone || '').trim() : undefined,
    expiresAt: t.expiresAt || undefined,
    usageLimit, usedCount: 0, active: true, createdAt: serverTimestamp(),
  }));
}
export async function updateCndCoupon(id: string, patch: Partial<CndCoupon>) { await updateDoc(doc(db, 'cndCoupons', id), patch as any); }
export async function removeCndCoupon(id: string) { await deleteDoc(doc(db, 'cndCoupons', id)); }
export async function seedCndCoupons(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const rows: CndCouponInput[] = [
    { code: 'HELLO10', type: 'pct', value: 10 },
    { code: 'SAVE50K', type: 'amount', value: 50000, minSpend: 500000 },
    { code: 'NEWYEAR', type: 'pct', value: 15, minSpend: 1000000 },
  ];
  const b = writeBatch(db);
  for (const r of rows) b.set(doc(collection(db, 'cndCoupons')), stampMock(strip({ ...r, audience: 'public', usedCount: 0, active: true, createdAt: serverTimestamp() })));
  await b.commit();
  return rows.length;
}
export async function clearCndCoupons(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndCoupons'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}

/**
 * Preview a code against a subtotal → discount amount (0 if invalid).
 * Mirrors the server check in functions/src/index.ts (onCndOrderCreated).
 */
export function validateCoupon(code: string, subtotal: number, coupons: CndCoupon[], opts?: { phone?: string; now?: number }): { ok: boolean; discount: number; reason?: string; coupon?: CndCoupon } {
  const now = opts?.now ?? Date.now();
  const wanted = normalizeCouponCode(code);
  // if a legacy duplicate exists, prefer an active one, oldest first (same pick as the server)
  const matches = coupons.filter((x) => x.code === wanted).sort((a, b) => Number(b.active) - Number(a.active) || a.createdAt - b.createdAt);
  const c = matches[0];
  if (!c) return { ok: false, discount: 0, reason: 'ບໍ່ ພົບ ໂຄ້ດ' };
  if (!c.active) return { ok: false, discount: 0, reason: 'ໂຄ້ດ ນີ້ ຖືກ ປິດ ຢູ່' };
  if (c.expiresAt && now > c.expiresAt) return { ok: false, discount: 0, reason: 'ໂຄ້ດ ນີ້ ໝົດ ອາຍຸ ແລ້ວ' };
  if (c.usageLimit && c.usedCount >= c.usageLimit) return { ok: false, discount: 0, reason: 'ໂຄ້ດ ນີ້ ໃຊ້ ຄົບ ຈຳ ນວນ ແລ້ວ' };
  if (c.audience === 'personal') {
    // compare by the Lao subscriber number (last 8 digits) — "020 5555 1234" == "02055551234" == "+8562055551234"
    if (!c.assignedToPhone || !samePhone(opts?.phone, c.assignedToPhone)) {
      return { ok: false, discount: 0, reason: 'ໂຄ້ດ ນີ້ ໃຊ້ ໄດ້ ສະ ເພາະ ຄົນ ທີ່ ຖືກ ມອບ' };
    }
  }
  if (c.minSpend && subtotal < c.minSpend) return { ok: false, discount: 0, reason: `ຕ້ອງ ຊື້ ຢ່າງ ໜ້ອຍ ${c.minSpend.toLocaleString('en-US')} ກີບ` };
  const pct = Math.min(100, Math.max(0, c.value));   // defend against a legacy >100% coupon
  let discount = c.type === 'pct' ? Math.round((subtotal * pct) / 100) : Math.min(c.value, subtotal);
  if (c.type === 'pct' && c.cap) discount = Math.min(discount, c.cap);
  discount = Math.max(0, Math.min(discount, subtotal));
  return { ok: true, discount, coupon: c };
}
