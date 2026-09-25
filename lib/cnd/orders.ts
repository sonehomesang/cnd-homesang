import {
  addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { MOCK_FLAG } from '../mock';
import type { CndCartItem } from './cart';

export interface CndOrderItem { productId: string; name: string; unit: string; price: number; qty: number; install: boolean; feePct: number; feeAmount: number; }
export type CndInstallStage = 'scheduled' | 'done';
export interface CndInstall {
  feeTotal: number;
  techId?: string;
  techName?: string;
  linkedToInvoice: boolean;
  reason?: string;             // ເຫດຜົນ ລູກຄ້າ ເລືອກ ໃຊ້ ຊ່າງ CND
  stage?: CndInstallStage;     // scheduled → done
  scheduledAt?: number;        // ນັດ ໝາຍ ຕິດຕັ້ງ
  completedAt?: number;        // ຕິດຕັ້ງ ແລ້ວ ເມື່ອ
  onTime?: boolean;            // ທັນ ຕາມ ນັດ ບໍ
  ratingBefore?: number;       // ຄວາມ ຄາດ ຫວັງ ກ່ອນ ໃຊ້ (1..5)
  rating?: number;             // ຄວາມ ພໍໃຈ ຫຼັງ ໃຊ້ (1..5)
  review?: string;             // ຄຳ ຄິດ ເຫັນ ຫຼັງ ໃຊ້
  beforeNote?: string;         // ສະພາບ/ຄວາມ ຕ້ອງການ ກ່ອນ
  afterNote?: string;          // ຜົນ ງານ ຫຼັງ ຕິດຕັ້ງ
  beforePhoto?: string;        // ninesang: before photo (gallery)
  afterPhoto?: string;         // ninesang: after photo (gallery)
  reviewHidden?: boolean;      // moderation: ເຊື່ອງ ຈາກ ການ ສະແດງ
  reviewFeatured?: boolean;    // moderation: ຕັ້ງ ເປັນ ຣີວິວ ເດັ່ນ
  reviewReply?: string;        // ຄຳ ຕອບ ຂອງ ຮ້ານ
  warrantyDays?: number;       // ninesang: warranty length snapshot (max of installed items)
  handoverAt?: number;         // ໃບ ຮັບ ງານ — customer sign-off time
  warrantyUntil?: number;      // handoverAt + warrantyDays
  slot?: string;               // ninesang booking: chosen time-slot label
  priority?: 'urgent';         // ninesang urgent call-out
  problemType?: string;        // ninesang urgent: what's wrong (ໄຟຟ້າ/ນ້ຳ/ແອ…)
  trade?: string;              // trade needed (booking/urgent auto-match)
}
export type CndOrderStatus = 'new' | 'confirmed' | 'delivering' | 'done' | 'cancelled';

export type CndChannel = 'online' | 'pos' | 'booking' | 'urgent';
export type CndPayMethod = 'cash' | 'qr' | 'cod';
export type CndPayStatus = 'pending' | 'paid';
export interface CndOrder {
  id: string;
  number: string;
  items: CndOrderItem[];
  subtotal: number;
  installFeeTotal: number;
  installTravelFee?: number;   // ninesang: tech travel fee for the delivery zone
  deliveryFee: number;
  deliveryZone?: string;
  discount?: number;
  couponCode?: string;
  couponDiscount?: number;       // the coupon's share of `discount` (the rest is the loyalty tier)
  couponApplied?: boolean;       // server: redemption processed (counted, or rejected)
  couponReject?: string;         // server: why the claimed coupon wasn't honoured
  reviewFlags?: string[];        // server: anomalies staff must check before confirming
  reviewReasons?: string[];
  reviewedBy?: string;
  reviewedAt?: number;
  surveyFee?: number;             // ninesang survey fee (ຄ່າ ສຳຫຼວດ) if applied
  surveyFeeMode?: 'off' | 'agree' | 'prepay';
  urgentFee?: number;             // ninesang urgent call-out fee (ຄ່າ ດ່ວນ)
  taxPct?: number;           // VAT rate SNAPSHOT at sale time (never recomputed from config)
  taxAmount?: number;        // VAT amount snapshot
  total: number;
  install?: CndInstall;      // present when any line requested install
  declineReason?: string;    // ເຫດຜົນ ບໍ່ ໃຊ້ ຊ່າງ CND (ເມື່ອ ບໍ່ ມີ install)
  customerName?: string;
  phone?: string;
  address?: string;               // contact address
  deliveryAddress?: string;       // ship-to (may differ from contact)
  note?: string;                  // customer message / order note
  channel?: CndChannel;      // 'pos' = sold at the counter
  paymentMethod?: CndPayMethod;
  paymentStatus?: CndPayStatus;   // online QR/COD: pending until the shop confirms
  paymentBank?: string;           // bank the customer chose for QR transfer
  paymentSlipUrl?: string;        // transfer-slip proof (customer attaches)
  paidBy?: string;                // admin who confirmed the payment
  paidAt?: number;
  paidAmount?: number;       // cash tendered (POS)
  change?: number;
  cashier?: string;
  shiftId?: string;          // POS session this sale belongs to
  status: CndOrderStatus;
  uid?: string;                   // ninesang P4: the customer's auth uid (order-tracking + chat)
  createdAt: number;
  __mock?: boolean;
}

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndOrder {
  return {
    id, number: d.number ?? '', items: Array.isArray(d.items) ? d.items : [], subtotal: Number(d.subtotal) || 0,
    installFeeTotal: Number(d.installFeeTotal) || 0, installTravelFee: d.installTravelFee ? Number(d.installTravelFee) : undefined, deliveryFee: Number(d.deliveryFee) || 0, deliveryZone: d.deliveryZone, discount: d.discount ? Number(d.discount) : undefined, couponCode: d.couponCode, couponDiscount: d.couponDiscount ? Number(d.couponDiscount) : undefined, couponApplied: !!d.couponApplied, couponReject: d.couponReject, reviewFlags: Array.isArray(d.reviewFlags) ? d.reviewFlags : undefined, reviewReasons: Array.isArray(d.reviewReasons) ? d.reviewReasons : undefined, reviewedBy: d.reviewedBy, reviewedAt: d.reviewedAt ? ms(d.reviewedAt) : undefined,
    surveyFee: d.surveyFee ? Number(d.surveyFee) : undefined, surveyFeeMode: d.surveyFeeMode, urgentFee: d.urgentFee ? Number(d.urgentFee) : undefined,
    taxPct: d.taxPct != null ? Number(d.taxPct) : undefined, taxAmount: d.taxAmount ? Number(d.taxAmount) : undefined, total: Number(d.total) || 0,
    install: d.install, declineReason: d.declineReason, customerName: d.customerName, phone: d.phone, address: d.address, deliveryAddress: d.deliveryAddress, note: d.note,
    channel: d.channel, paymentMethod: d.paymentMethod, paymentStatus: d.paymentStatus, paymentBank: d.paymentBank, paymentSlipUrl: d.paymentSlipUrl, paidBy: d.paidBy, paidAt: ms(d.paidAt), paidAmount: d.paidAmount, change: d.change, cashier: d.cashier, shiftId: d.shiftId,
    status: (d.status ?? 'new') as CndOrderStatus, uid: d.uid, createdAt: ms(d.createdAt), __mock: !!d[MOCK_FLAG],
  };
}
function num(): string { return `CND-${(Date.now() % 100000).toString().padStart(5, '0')}`; }

export function watchCndOrders(cb: (o: CndOrder[]) => void) {
  return onSnapshot(query(collection(db, 'cndOrders')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchCndOrders:', e); cb([]); });
}

export async function createCndOrder(input: {
  items: CndCartItem[]; deliveryFee: number; installTravelFee?: number; surveyFee?: number; surveyFeeMode?: 'off' | 'agree' | 'prepay'; deliveryZone?: string; discount?: number; couponCode?: string; couponDiscount?: number; couponId?: string; taxPct?: number; paymentMethod?: 'cod' | 'qr'; paymentBank?: string; paymentSlipUrl?: string; customerName?: string; phone?: string; address?: string; deliveryAddress?: string; note?: string;
  techId?: string; techName?: string; linkedToInvoice: boolean;
  scheduledAt?: number; slot?: string; trade?: string;   // ninesang: customer-picked install time (unified scheduling)
}): Promise<string> {
  const items: CndOrderItem[] = input.items.map((i) => ({
    productId: i.productId, name: i.name, unit: i.unit, price: i.price, qty: i.qty,
    install: i.install, feePct: i.feePct, feeAmount: i.install ? Math.round((i.price * i.qty * i.feePct) / 100) : 0,
  }));
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const installFeeTotal = items.reduce((s, i) => s + i.feeAmount, 0);
  const hasInstall = items.some((i) => i.install);
  const warrantyDays = hasInstall ? Math.max(0, ...input.items.filter((i) => i.install).map((i) => i.warrantyDays || 0)) : 0;
  const travelFee = hasInstall ? Math.max(0, Math.round(input.installTravelFee || 0)) : 0;
  // survey fee: only charged upfront in 'prepay' mode
  const surveyFee = hasInstall && input.surveyFeeMode === 'prepay' ? Math.max(0, Math.round(input.surveyFee || 0)) : 0;
  const discount = Math.min(Math.max(0, Math.round(input.discount || 0)), subtotal);
  const couponDiscount = Math.min(Math.max(0, Math.round(input.couponDiscount || 0)), discount);
  const pre = subtotal + installFeeTotal + travelFee + surveyFee + input.deliveryFee - discount;   // pre-VAT
  const taxPct = Math.max(0, Number(input.taxPct) || 0);
  const taxAmount = Math.round((pre * taxPct) / 100);
  const total = pre + taxAmount;
  const payload: any = {
    number: num(), items, subtotal, installFeeTotal, installTravelFee: travelFee || undefined, surveyFee: surveyFee || undefined, surveyFeeMode: (hasInstall && input.surveyFeeMode && input.surveyFeeMode !== 'off') ? input.surveyFeeMode : undefined, deliveryFee: input.deliveryFee, deliveryZone: input.deliveryZone || undefined, discount: discount || undefined, couponCode: input.couponCode || undefined, couponDiscount: couponDiscount || undefined, couponId: input.couponId || undefined,
    taxPct, taxAmount: taxAmount || undefined, total,
    paymentMethod: input.paymentMethod || 'cod', paymentStatus: 'pending', paymentBank: input.paymentBank || undefined, paymentSlipUrl: input.paymentSlipUrl || undefined,
    customerName: input.customerName || undefined, phone: input.phone || undefined, address: input.address || undefined,
    deliveryAddress: input.deliveryAddress || undefined, note: input.note || undefined,
    channel: 'online', status: 'new', createdAt: serverTimestamp(),
  };
  // ninesang P4: link the order to the signed-in customer so they can track + chat.
  const uid = auth.currentUser?.uid;
  if (uid) payload.uid = uid;
  if (hasInstall) payload.install = {
    feeTotal: installFeeTotal, linkedToInvoice: input.linkedToInvoice,
    ...(warrantyDays ? { warrantyDays } : {}),
    ...(input.techId ? { techId: input.techId, techName: input.techName } : {}),
    ...(input.scheduledAt ? { scheduledAt: input.scheduledAt, stage: 'scheduled' } : {}),
    ...(input.slot ? { slot: input.slot } : {}),
    ...(input.trade ? { trade: input.trade } : {}),
  };
  const ref = await addDoc(collection(db, 'cndOrders'), payload);
  return ref.id;
}

// ── ninesang: BOOK a tech slot in advance (no product) ───────────────────────
export async function createCndBooking(input: {
  service: { productId?: string; name: string; unit?: string; price?: number };
  trade?: string; slot: string; scheduledAt: number; warrantyDays?: number;
  customerName?: string; phone?: string; address?: string; note?: string;
  paymentMethod?: 'cod' | 'qr'; paymentBank?: string; paymentSlipUrl?: string;
}): Promise<string> {
  const price = Math.max(0, Math.round(input.service.price || 0));
  const items: CndOrderItem[] = [{ productId: input.service.productId || 'svc', name: input.service.name, unit: input.service.unit || 'ຄັ້ງ', price, qty: 1, install: true, feePct: 0, feeAmount: 0 }];
  const payload: any = {
    number: num(), items, subtotal: price, installFeeTotal: 0, deliveryFee: 0, taxPct: 0, total: price,
    paymentMethod: input.paymentMethod || 'cod', paymentStatus: 'pending',
    paymentBank: input.paymentBank || undefined, paymentSlipUrl: input.paymentSlipUrl || undefined,
    customerName: input.customerName || undefined, phone: input.phone || undefined, address: input.address || undefined, note: input.note || undefined,
    channel: 'booking', status: 'new', createdAt: serverTimestamp(),
    install: {
      feeTotal: 0, linkedToInvoice: false, stage: 'scheduled', scheduledAt: input.scheduledAt,
      slot: input.slot, ...(input.trade ? { trade: input.trade } : {}),
      ...(input.warrantyDays ? { warrantyDays: input.warrantyDays } : {}),
    },
  };
  const uid = auth.currentUser?.uid; if (uid) payload.uid = uid;
  const ref = await addDoc(collection(db, 'cndOrders'), payload);
  return ref.id;
}

// ── ninesang: URGENT call-out (nearest available tech ASAP) ──────────────────
export async function createCndUrgent(input: {
  problemType: string; trade?: string; description?: string; photo?: string;
  urgentFee: number; customerName?: string; phone?: string; address?: string;
  paymentMethod?: 'cod' | 'qr';
}): Promise<string> {
  const fee = Math.max(0, Math.round(input.urgentFee || 0));
  const items: CndOrderItem[] = [{ productId: 'urgent', name: `🚨 ຊ່າງ ດ່ວນ · ${input.problemType}`, unit: 'ຄັ້ງ', price: fee, qty: 1, install: true, feePct: 0, feeAmount: 0 }];
  const payload: any = {
    number: num(), items, subtotal: fee, installFeeTotal: 0, deliveryFee: 0, urgentFee: fee || undefined, taxPct: 0, total: fee,
    paymentMethod: input.paymentMethod || 'cod', paymentStatus: 'pending',
    customerName: input.customerName || undefined, phone: input.phone || undefined, address: input.address || undefined, note: input.description || undefined,
    channel: 'urgent', status: 'new', createdAt: serverTimestamp(),
    install: {
      feeTotal: 0, linkedToInvoice: false, stage: 'scheduled', priority: 'urgent',
      problemType: input.problemType, ...(input.trade ? { trade: input.trade } : {}),
      ...(input.photo ? { beforePhoto: input.photo } : {}),
    },
  };
  const uid = auth.currentUser?.uid; if (uid) payload.uid = uid;
  const ref = await addDoc(collection(db, 'cndOrders'), payload);
  return ref.id;
}

export async function setCndOrderStatus(id: string, status: CndOrderStatus) { await updateDoc(doc(db, 'cndOrders', id), { status }); }
export async function setCndOrderPaid(id: string, paid: boolean, by?: string) {
  await updateDoc(doc(db, 'cndOrders', id), { paymentStatus: paid ? 'paid' : 'pending', paidBy: paid ? (by || undefined) : undefined, paidAt: paid ? serverTimestamp() : undefined });
}

/** Watch a single order (for the detail screen). */
export function watchCndOrder(id: string, cb: (o: CndOrder | null) => void) {
  return onSnapshot(doc(db, 'cndOrders', id),
    (s) => cb(s.exists() ? map(s.id, s.data()) : null),
    (e) => { console.error('watchCndOrder:', e); cb(null); });
}

/** ninesang P4 — the signed-in customer's own orders (order-tracking + chat). */
export function watchMyCndOrders(uid: string, cb: (o: CndOrder[]) => void) {
  return onSnapshot(query(collection(db, 'cndOrders'), where('uid', '==', uid)),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchMyCndOrders:', e); cb([]); });
}

// ── Order chat (ninesang P4) — customer ↔ shop/tech, one thread per order ─────
export type CndMsgFrom = 'customer' | 'shop';
export interface CndMessage { id: string; from: CndMsgFrom; text: string; senderName?: string; at: number; }
export function watchCndMessages(orderId: string, cb: (m: CndMessage[]) => void) {
  return onSnapshot(query(collection(db, 'cndOrders', orderId, 'messages'), orderBy('at', 'asc')),
    (s) => cb(s.docs.map((d) => { const x = d.data() as any; return { id: d.id, from: x.from === 'shop' ? 'shop' : 'customer', text: String(x.text || ''), senderName: x.senderName, at: ms(x.at) }; })),
    (e) => { console.error('watchCndMessages:', e); cb([]); });
}
export async function sendCndMessage(orderId: string, from: CndMsgFrom, text: string, senderName?: string) {
  const body = text.trim();
  if (!body) return;
  await addDoc(collection(db, 'cndOrders', orderId, 'messages'), {
    from, text: body.slice(0, 2000), senderName: senderName || undefined, at: serverTimestamp(),
  });
  // bump the parent so the admin list can surface "new message" (best-effort)
  updateDoc(doc(db, 'cndOrders', orderId), { lastMessageAt: serverTimestamp(), lastMessageFrom: from }).catch(() => {});
}
/** Patch install sub-fields (scheduled/done, on-time, feedback…) via dot-notation. */
export async function updateCndInstall(id: string, patch: Partial<CndInstall>) {
  const upd: any = {};
  for (const [k, v] of Object.entries(patch)) upd[`install.${k}`] = v;
  if (Object.keys(upd).length) await updateDoc(doc(db, 'cndOrders', id), upd);
}
/** Set the "why no CND technician" reason on an order without install. */
export async function setCndDeclineReason(id: string, reason: string) {
  await updateDoc(doc(db, 'cndOrders', id), { declineReason: reason });
}

// ── POS (counter sale) ───────────────────────────────────────────────────────
export interface CndPosLine { productId: string; name: string; unit: string; price: number; qty: number; }
export interface CndPosResult { id: string; number: string; subtotal: number; discount: number; taxAmount: number; total: number; change: number; }
export async function createCndPosSale(input: {
  items: CndPosLine[]; discount: number; taxPct?: number; paymentMethod: CndPayMethod; paidAmount: number; cashier?: string; shiftId?: string;
}): Promise<CndPosResult> {
  const items: CndOrderItem[] = input.items.map((i) => ({ productId: i.productId, name: i.name, unit: i.unit, price: i.price, qty: i.qty, install: false, feePct: 0, feeAmount: 0 }));
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = Math.min(Math.max(0, Math.round(input.discount || 0)), subtotal);
  const pre = subtotal - discount;
  const taxPct = Math.max(0, Number(input.taxPct) || 0);
  const taxAmount = Math.round((pre * taxPct) / 100);
  const total = pre + taxAmount;
  const change = input.paymentMethod === 'cash' ? Math.max(0, Math.round(input.paidAmount || 0) - total) : 0;
  const number = num();
  const ref = await addDoc(collection(db, 'cndOrders'), {
    number, items, subtotal, installFeeTotal: 0, deliveryFee: 0, discount: discount || undefined, taxPct, taxAmount: taxAmount || undefined, total,
    channel: 'pos', paymentMethod: input.paymentMethod,
    paidAmount: input.paymentMethod === 'cash' ? Math.round(input.paidAmount || 0) : undefined, change: change || undefined,
    cashier: input.cashier || undefined, shiftId: input.shiftId || undefined, status: 'done', createdAt: serverTimestamp(),
  });
  return { id: ref.id, number, subtotal, discount, taxAmount, total, change };
}

/** Staff confirm they checked a server-flagged order: clears the ⚠️, keeps the reasons for audit. */
export async function markCndOrderReviewed(id: string, by?: string) {
  await updateDoc(doc(db, 'cndOrders', id), { reviewFlags: [], reviewedBy: by || '', reviewedAt: Date.now() });
}
