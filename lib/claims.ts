import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Order } from './orders';

export type ClaimType = 'return' | 'defective' | 'wrong_item' | 'other';
export type ClaimStatus = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'resolved';

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  return: 'ສົ່ງຄືນ',
  defective: 'ສິນຄ້າເສຍ',
  wrong_item: 'ສົ່ງຜິດ',
  other: 'ສອບຖາມ / ອື່ນໆ',
};

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: 'ຮໍກວດ',
  reviewing: 'ກຳລັງກວດ',
  approved: 'ອະນຸມັດ',
  rejected: 'ປະຕິເສດ',
  resolved: 'ແກ້ໄຂແລ້ວ',
};

export interface Claim {
  id: string;
  orderId: string;
  orderNumber?: string;
  customerId: string;
  shopId?: string;
  type: ClaimType;
  reason: string;
  photos?: string[];
  status: ClaimStatus;
  refundAmount?: number;
  adminNote?: string;
  createdAt: number;
  /** Set when this refund record originated from a job dispute (not a shop order). */
  jobId?: string;
  disputeId?: string;
}

/** ໜ້າປ່ອງເວລາ ຮ້ອງຮຽນ ສິນຄ້າ = 7 ມື້ ຫຼັງ ສົ່ງ. */
export const CLAIM_WINDOW_DAYS = 7;

function strip(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}
function toMillis(v: any): number {
  return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;
}
function mapClaim(id: string, data: any): Claim {
  return { id, ...data, createdAt: toMillis(data.createdAt) } as Claim;
}

export interface CreateClaimInput {
  orderId: string;
  orderNumber?: string;
  customerId: string;
  shopId?: string;
  type: ClaimType;
  reason: string;
  photos?: string[];
  status?: ClaimStatus;
  refundAmount?: number;
  adminNote?: string;
  jobId?: string;
  disputeId?: string;
}

/**
 * ກວດ ເງື່ອນໄຂ ການຮ້ອງຮຽນ ສິນຄ້າ — ຮ້ອງ ໄດ້ ທັນທີ ຕອນ ມີ ບັນຫາ/ຂໍ້ສົງໄສ:
 * - ຮ້ອງ ໄດ້ ທຸກ ສະຖານະ (ຮວມ pending) ຍົກເວັ້ນ ຍົກເລີກ
 * - ບໍ່ມີ ຄຳຮ້ອງ ທີ່ ຍັງ active (ບໍ່ຖືກ ປະຕິເສດ) ຢູ່ກ່ອນ — 1 ຄຳຮ້ອງ / ອໍເດີ
 * - ໜ້າປ່ອງ 7 ມື້ ໃຊ້ ເປັນ ກຳນົດ ສຸດ ທ້າຍ ສະເພາະ ຫຼັງ ຮັບ ສິນຄ້າ ແລ້ວ ເທົ່ານັ້ນ
 */
export function canClaimOrder(order: Order, existing: Claim[], now = Date.now()): { ok: boolean; reason?: string } {
  if (order.status === 'cancelled') {
    // a cancelled order the customer already PAID for still needs a refund route
    const paid = order.paymentVerified || !!order.slipUrl;
    if (!paid) return { ok: false, reason: 'ອໍເດີ ນີ້ ຖືກ ຍົກເລີກ ແລ້ວ' };
  }
  if (existing.some((c) => c.status !== 'rejected')) {
    return { ok: false, reason: 'ມີ ຄຳຮ້ອງ ຢູ່ ກ່ອນແລ້ວ ສຳລັບ ອໍເດີ ນີ້' };
  }
  const delivered = typeof order.deliveredAt === 'number' ? order.deliveredAt : 0;
  if (delivered > 0 && now - delivered > CLAIM_WINDOW_DAYS * 86400000) {
    return { ok: false, reason: `ໝົດ ກຳນົດ ຮ້ອງຮຽນ ແລ້ວ (ພາຍໃນ ${CLAIM_WINDOW_DAYS} ມື້ ຫຼັງ ຮັບ ສິນຄ້າ)` };
  }
  return { ok: true };
}

/** ຮູບ ບັງຄັບ ສະເພາະ ປະເພດ ຂໍຄືນເງິນ; ສອບຖາມ/ອື່ນໆ ບໍ່ ບັງຄັບ. */
export function claimPhotoRequired(type: ClaimType): boolean {
  return type !== 'other';
}

export async function createClaim(input: CreateClaimInput): Promise<string> {
  const ref = await addDoc(
    collection(db, 'claims'),
    strip({ ...input, status: input.status ?? ('pending' as ClaimStatus), createdAt: serverTimestamp() }),
  );
  return ref.id;
}

/**
 * Claims on one order, scoped to the viewing customer. MUST filter by
 * customerId too: the claims read rule requires `customerId == uid`, and
 * Firestore denies a list query whose constraints can't guarantee that — so an
 * orderId-only query is rejected for the customer (proven in test:rules:core),
 * which silently emptied the claim list on the buyer's own order page and let
 * escrow auto-release ignore an open claim.
 */
export function watchClaimsForOrder(orderId: string, customerId: string, cb: (c: Claim[]) => void) {
  const q = query(
    collection(db, 'claims'),
    where('orderId', '==', orderId),
    where('customerId', '==', customerId),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => mapClaim(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchClaimsForOrder:', e); cb([]); },
  );
}

export function watchMyClaims(customerId: string, cb: (c: Claim[]) => void) {
  const q = query(collection(db, 'claims'), where('customerId', '==', customerId));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => mapClaim(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchMyClaims:', e); cb([]); },
  );
}

/** Seed a few sample claims for admin testing (no-op if any exist). */
export async function seedClaimsIfEmpty(): Promise<number> {
  const snap = await getDocs(collection(db, 'claims'));
  if (snap.size > 0) return 0;
  const now = Date.now();
  const samples = [
    { orderId: 'sample-ord-1', orderNumber: 'HS-SAMP1', customerId: 'mock-cust-1', shopId: 'sample-shop', type: 'defective', reason: 'ສິນຄ້າ ມາ ຊຳລຸດ (ໄມ້ອັດ ແຕກ)', status: 'pending', refundAmount: 165000, createdAt: now - 3600000 },
    { orderId: 'sample-ord-2', orderNumber: 'HS-SAMP2', customerId: 'mock-cust-2', shopId: 'sample-shop', type: 'wrong_item', reason: 'ສົ່ງ ຜິດ ລາຍການ (ສັ່ງ ສີຂາວ ໄດ້ ສີຄຣີມ)', status: 'reviewing', refundAmount: 80000, createdAt: now - 7200000 },
    { orderId: 'sample-ord-3', orderNumber: 'HS-SAMP3', customerId: 'mock-cust-3', shopId: 'sample-shop', type: 'return', reason: 'ຢາກ ສົ່ງຄືນ — ບໍ່ ໄດ້ ໃຊ້', status: 'resolved', refundAmount: 120000, adminNote: 'ຄືນເງິນ ແລ້ວ', createdAt: now - 86400000 },
  ];
  for (const s of samples) await addDoc(collection(db, 'claims'), s);
  return samples.length;
}

export function watchAllClaims(cb: (c: Claim[]) => void) {
  return onSnapshot(
    collection(db, 'claims'),
    (snap) => cb(snap.docs.map((d) => mapClaim(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchAllClaims:', e); cb([]); },
  );
}

export async function resolveClaim(
  id: string,
  patch: { status: ClaimStatus; refundAmount?: number; adminNote?: string },
) {
  await updateDoc(doc(db, 'claims', id), strip(patch as Record<string, unknown>));
}
