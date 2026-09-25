import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { BnplInstallment, BnplMode } from './bnpl';
import type { CartItem } from './cart-context';
import type { LogisticsTier } from './logisticsProviders';
import { notify } from './notifications';
import { type AppliedFee } from './platformFees';
import type { Earning } from './wallet';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'delivering'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'ຮໍຢືນຢັນ',
  confirmed: 'ຢືນຢັນແລ້ວ',
  preparing: 'ກຳລັງແພັກ',
  delivering: 'ກຳລັງສົ່ງ',
  delivered: 'ສົ່ງແລ້ວ',
  completed: 'ສຳເລັດ',
  cancelled: 'ຍົກເລີກ',
};

export type PaymentMethod = 'bank_transfer' | 'cod' | 'wallet';
export type DeliveryMethod = 'delivery' | 'pickup';

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  variantLabel?: string;
  unitPrice: number;
  unit: string;
  quantity: number;
  total: number;
  imageUrl?: string;
}

/** BNPL schedule + state carried on an order (written/updated server-side). */
export interface BnplOrderInfo {
  mode: BnplMode;
  tenor: number;
  down: number;          // down payment paid at start
  feeTotal: number;      // service fee the buyer pays (0 when merchant-funded)
  financed: number;      // total spread across installments
  autopay: boolean;      // auto-debit each installment from the wallet on its due date
  status: 'active' | 'completed' | 'overdue' | 'cancelled';
  nextDueAt?: number;    // earliest unpaid installment due date
  installments: BnplInstallment[];
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  shopId: string;
  shopName?: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentVerified: boolean;
  /** B2B — bought on behalf of a company; on completion the server auto-raises
   *  an orgInvoice against this org (see onOrderWritten). */
  orgId?: string;
  orgInvoiced?: boolean;
  /** paid instantly from the customer's HomeSang wallet (server-verified). */
  paidByWallet?: boolean;
  // ── BNPL / installment (server-managed; see lib/bnpl + startBnpl function) ──
  isBnpl?: boolean;
  bnplOutstanding?: number;   // remaining unpaid across installments (for the credit-limit check)
  bnpl?: BnplOrderInfo;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: string;
  slipUrl?: string;
  subtotal: number;
  deliveryFee: number;
  vat: number;
  vatRate: number;
  grandTotal: number;
  createdAt: number;
  /** ປະທັບ ເວລາ ເມື່ອ ສະຖານະ ກາຍ ເປັນ ສົ່ງ/ສຳເລັດ — ໃຊ້ ນັບ ໜ້າປ່ອງ ຮ້ອງຮຽນ 7 ມື້. */
  deliveredAt?: number;
  // per-step timestamps for the tracking timeline
  paymentVerifiedAt?: number;
  confirmedAt?: number;
  deliveringAt?: number;
  completedAt?: number;
  /** ຄອມມິຊັ່ນ ທີ່ ຮ້ານ ຈ່າຍ ໃຫ້ HomeSang (ຄິດ ຕອນ ສັ່ງຊື້; back-office). */
  commission?: number;
  // ===== Slice 2: pluggable payment + logistics providers =====
  /** Chosen payment provider (paymentProviders doc). */
  paymentProviderId?: string;
  paymentProviderName?: string;
  /** Chosen logistics provider (logisticsProviders doc) + delivery layer. */
  logisticsProviderId?: string;
  logisticsProviderName?: string;
  /** Courier tracking number — entered by admin after booking. */
  trackingNumber?: string;
  /** Amount the courier collects on delivery (COD orders). */
  codAmount?: number;
  /** Linked HomeSang Express delivery task — lets rules authorize the assigned rider. */
  deliveryTaskId?: string;
  /** Drop-pin coordinates + measured distance (delivery pricing / navigation). */
  deliveryLat?: number;
  deliveryLng?: number;
  distanceKm?: number;
  // Y2 Slice C — broker (ນາຍໜ້າ) affiliate attribution
  brokerId?: string;
  brokerCode?: string;
  brokerCommission?: number;
  // member/account-group discount applied to this order (pre-tax price cut)
  memberDiscount?: number;
  memberGroup?: string;
  // discount/promo code applied to this order (pre-tax price cut)
  couponCode?: string;
  couponDiscount?: number;
  // Y3 Slice B — loyalty / store-credit redeemed on this order (1 point = 1 kip)
  pointsRedeemed?: number;
  pointsDiscount?: number; // kip taken off grandTotal (== pointsRedeemed)
  // Y3 Slice C — value-added platform fees (back-office revenue; NOT in grandTotal)
  platformFees?: AppliedFee[];
  platformFeeTotal?: number;
}

const VAT_RATE = 10;

function orderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  const rnd = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
  return `HS-${ts}${rnd}`;
}

function strip(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

function toMillis(v: any): number {
  return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;
}

export interface PlaceOrderInput {
  customerId: string;
  items: CartItem[];
  /** B2B — bill this purchase to a company (auto-invoice on completion). */
  orgId?: string;
  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: string;
  slipUrl?: string;
  // Slice 2 — chosen providers (optional; falls back to legacy behaviour)
  paymentProviderId?: string;
  paymentProviderName?: string;
  logisticsProviderId?: string;
  logisticsProviderName?: string;
  /** Delivery fee from the chosen logistics provider — overrides per-product fee. */
  deliveryFee?: number;
  /** Delivery tier of the chosen provider — 'own' spawns a HomeSang Express rider task. */
  logisticsTier?: LogisticsTier;
  /** Broker referral code from a shared ?ref link (affiliate attribution). */
  brokerCode?: string;
  /** Loyalty points the buyer redeems on this order (1 point = 1 kip off). */
  pointsRedeemed?: number;
  /** Member/group discount (kip, pre-tax) computed at checkout from buyer group + rules. */
  memberDiscount?: number;
  memberGroup?: string;
  /** Discount/promo code (kip, pre-tax) applied at checkout + the code used. */
  couponDiscount?: number;
  couponCode?: string;
  /** Buyer phone — snapshotted onto a rider delivery task so the rider can call. */
  customerPhone?: string;
  /** Drop-pin coordinates + measured trip distance (used to price the delivery). */
  deliveryLat?: number;
  deliveryLng?: number;
  distanceKm?: number;
}

/**
 * @param deliveryFeeOverride when a logistics provider is chosen, its resolved
 * fee replaces the per-product estimate (pickup is always 0).
 */
export function computeTotals(
  items: CartItem[],
  deliveryMethod: DeliveryMethod,
  deliveryFeeOverride?: number,
  pointsRedeemed = 0,
  memberDiscount = 0,
  couponDiscount = 0,
) {
  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  let deliveryFee: number;
  if (deliveryMethod === 'pickup') {
    deliveryFee = 0;
  } else if (deliveryFeeOverride != null) {
    deliveryFee = deliveryFeeOverride;
  } else {
    // legacy fallback (no logistics provider chosen). Only apply the flat 20k
    // default when NO product declares a fee — so a shop that sets deliveryFee:0
    // genuinely offers free delivery instead of being forced to 20,000.
    const anyConfigured = items.some((i) => typeof i.product.deliveryFee === 'number');
    deliveryFee = anyConfigured ? items.reduce((s, i) => s + (i.product.deliveryFee ?? 0) * i.qty, 0) : 20000;
  }
  // member/group discount reduces the taxable goods price (a genuine price cut)
  const memDisc = Math.min(Math.max(0, Math.round(memberDiscount)), subtotal);
  // coupon/promo-code discount stacks after the member cut, also pre-tax, and can
  // never pull the goods price below zero.
  const coupDisc = Math.min(Math.max(0, Math.round(couponDiscount)), subtotal - memDisc);
  const taxable = subtotal - memDisc - coupDisc;
  const vat = Math.round(((taxable + deliveryFee) * VAT_RATE) / 100);
  // loyalty store-credit: applied after tax, never more than the (post-member) goods
  const pointsDiscount = Math.min(Math.max(0, Math.floor(pointsRedeemed)), taxable);
  const grandTotal = taxable + deliveryFee + vat - pointsDiscount;
  return { subtotal, deliveryFee, vat, vatRate: VAT_RATE, memberDiscount: memDisc, couponDiscount: coupDisc, pointsDiscount, grandTotal };
}

export async function placeOrder(input: PlaceOrderInput): Promise<string> {
  if (input.items.length === 0) throw new Error('ກະຕ່າຫວ່າງເປົ່າ');

  // Stock guard — refuse to place an order for more than a tracked product has.
  // Reads FRESH stock (the cart copy can be stale) and sums per product across
  // lines. Untracked products (no numeric stock) are unlimited. This blocks the
  // common oversell case up front; the onOrderItemCreated Cloud Function floors
  // stock at 0 as the concurrency-safe backstop.
  const stockNeeded = new Map<string, number>();
  for (const i of input.items) stockNeeded.set(i.product.id, (stockNeeded.get(i.product.id) ?? 0) + i.qty);
  const stockSnaps = await Promise.all(
    [...stockNeeded.keys()].map((id) => getDoc(doc(db, 'products', id))),
  );
  for (const snap of stockSnaps) {
    const data = snap.data();
    const stock = data?.stock;
    const need = stockNeeded.get(snap.id) ?? 0;
    if (typeof stock === 'number' && stock < need) {
      const nm = data?.name ?? '';
      throw new Error(`ສິນຄ້າ "${nm}" ເຫຼືອ ${stock} ${data?.unit ?? ''} ບໍ່ພໍ ກັບ ${need} ທີ່ສັ່ງ`);
    }
  }

  const shopId = input.items[0].product.shopId;
  const shopName = input.items[0].product.shopName;
  const t = computeTotals(input.items, input.deliveryMethod, input.deliveryFee, input.pointsRedeemed, input.memberDiscount, input.couponDiscount);

  // Back-office economics — commission (shop→HomeSang), broker affiliate, and
  // Y3 platform fees — are computed SERVER-SIDE by the onOrderEconomics Cloud
  // Function, not here: the client is no longer trusted to write those amounts.
  // None of them touch the buyer's grandTotal (they're deducted from the shop's
  // settlement), so the buyer total is unaffected. We only persist the raw
  // inputs the function needs (brokerCode, logisticsTier) on the order below.

  const num = orderNumber();
  // Pre-generate the rider task id so it can be stored on the order AT CREATION
  // (order-create allows any owner fields), avoiding a post-create update that
  // the tightened customer order-update rule would reject.
  // BOTH rider-served layers spawn a task: 'own' (HomeSang Express) and 'rider'
  // (in-city same-day) — otherwise picking the option literally labelled "rider"
  // would silently never reach a rider.
  const riderServed = input.logisticsTier === 'own' || input.logisticsTier === 'rider';
  const taskRef = riderServed ? doc(collection(db, 'deliveryTasks')) : null;
  // Order + its line items are written in ONE atomic batch so the
  // onOrderEconomics / onOrderItemCreated triggers always see the items (they
  // fire only after the batch commits). A pre-generated ref lets us set the
  // order inside the batch.
  const orderRef = doc(collection(db, 'orders'));
  const batch = writeBatch(db);
  batch.set(
    orderRef,
    strip({
      orderNumber: num,
      deliveryTaskId: taskRef?.id,
      customerId: input.customerId,
      orgId: input.orgId || undefined,
      shopId,
      shopName,
      brokerCode: input.brokerCode || undefined,
      logisticsTier: input.logisticsTier,
      memberDiscount: t.memberDiscount > 0 ? t.memberDiscount : undefined,
      memberGroup: t.memberDiscount > 0 ? input.memberGroup : undefined,
      couponDiscount: t.couponDiscount > 0 ? t.couponDiscount : undefined,
      couponCode: t.couponDiscount > 0 ? input.couponCode : undefined,
      pointsRedeemed: t.pointsDiscount > 0 ? t.pointsDiscount : undefined,
      pointsDiscount: t.pointsDiscount > 0 ? t.pointsDiscount : undefined,
      status: 'pending' as OrderStatus,
      paymentMethod: input.paymentMethod,
      paymentVerified: false,
      paymentProviderId: input.paymentProviderId,
      paymentProviderName: input.paymentProviderName,
      logisticsProviderId: input.logisticsProviderId,
      logisticsProviderName: input.logisticsProviderName,
      codAmount: input.paymentMethod === 'cod' ? t.grandTotal : undefined,
      deliveryMethod: input.deliveryMethod,
      deliveryAddress: input.deliveryAddress,
      deliveryLat: input.deliveryLat,
      deliveryLng: input.deliveryLng,
      distanceKm: input.distanceKm,
      slipUrl: input.slipUrl,
      subtotal: t.subtotal,
      deliveryFee: t.deliveryFee,
      vat: t.vat,
      vatRate: t.vatRate,
      grandTotal: t.grandTotal,
      createdAt: serverTimestamp(),
    }),
  );

  for (const i of input.items) {
    batch.set(doc(collection(db, 'orderItems')), strip({
      orderId: orderRef.id,
      productId: i.product.id,
      productName: i.product.name,
      variantLabel: i.variantLabel,
      unitPrice: i.unitPrice,
      unit: i.product.unit,
      quantity: i.qty,
      total: i.qty * i.unitPrice,
      imageUrl: i.product.images?.[0],
    }));
    // soldCount + stock are adjusted SERVER-SIDE by the onOrderItemCreated
    // Cloud Function (client is not trusted to write those product fields).
  }
  await batch.commit();

  // Rider-served delivery (tier 'own' / 'rider'): spawn a task in the open queue.
  // Written inline (not via lib/riders) to keep the import one-directional.
  // Carries BOTH ends of the trip — the rider needs the pickup address + a phone
  // at each end, otherwise they literally cannot do the job.
  if (taskRef) {
    try {
      let pickupAddress: string | undefined;
      let shopPhone: string | undefined;
      let pickupLat: number | undefined;
      let pickupLng: number | undefined;
      try {
        const sd = (await getDoc(doc(db, 'shops', shopId))).data() as any;
        pickupAddress = sd?.address;
        shopPhone = sd?.phone;
        pickupLat = sd?.lat;
        pickupLng = sd?.lng;
      } catch { /* best-effort */ }
      await setDoc(taskRef, strip({
        orderId: orderRef.id,
        orderNumber: num,
        customerId: input.customerId,
        customerPhone: input.customerPhone,
        shopId,
        shopName,
        pickupAddress,
        shopPhone,
        pickupLat,
        pickupLng,
        dropoffAddress: input.deliveryAddress,
        dropoffLat: input.deliveryLat,
        dropoffLng: input.deliveryLng,
        distanceKm: input.distanceKm,
        fee: t.deliveryFee,
        codAmount: input.paymentMethod === 'cod' ? t.grandTotal : undefined,
        // non-COD orders start held: the task is created (so the order can link
        // it) but hidden from the rider queue until payment is verified.
        heldForPayment: input.paymentMethod !== 'cod' ? true : undefined,
        // 4-digit handover code the customer shows the rider on delivery
        handoverCode: String(Math.floor(1000 + Math.random() * 9000)),
        status: 'open',
        createdAt: serverTimestamp(),
      }));
    } catch (e) {
      console.error('createDeliveryTask:', e);
    }
  }
  return orderRef.id;
}

export function watchMyOrders(customerId: string, cb: (o: Order[]) => void) {
  const q = query(collection(db, 'orders'), where('customerId', '==', customerId));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMillis((d.data() as any).createdAt) }) as Order);
    list.sort((a, b) => b.createdAt - a.createdAt);
    cb(list);
  }, (e) => { console.error('watchMyOrders:', e); cb([]); });
}

/** Orders for a given shop — the seller order queue (Slice 5). */
export function watchShopOrders(shopId: string, cb: (o: Order[]) => void) {
  const q = query(collection(db, 'orders'), where('shopId', '==', shopId));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMillis((d.data() as any).createdAt) }) as Order);
    list.sort((a, b) => b.createdAt - a.createdAt);
    cb(list);
  }, (e) => { console.error('watchShopOrders:', e); cb([]); });
}

/** Broker affiliate earnings — derived from paid/completed orders attributed to a broker. */
export function watchBrokerEarnings(brokerId: string, cb: (e: Earning[]) => void) {
  const q = query(collection(db, 'orders'), where('brokerId', '==', brokerId));
  return onSnapshot(q, (snap) => {
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data(), createdAt: toMillis((d.data() as any).createdAt) }) as Order)
      .filter((o) => o.brokerCommission && o.status !== 'cancelled' && (o.paymentVerified || o.status === 'completed'))
      .map((o) => ({ jobId: `brk-${o.id}`, title: `🤝 ນາຍໜ້າ #${o.orderNumber}`, gross: o.brokerCommission ?? 0, fee: 0, net: o.brokerCommission ?? 0, at: o.createdAt }) as Earning);
    list.sort((a, b) => b.at - a.at);
    cb(list);
  }, (e) => { console.error('watchBrokerEarnings:', e); cb([]); });
}

export async function getOrderWithItems(id: string): Promise<{ order: Order; items: OrderItem[] } | null> {
  const snap = await getDoc(doc(db, 'orders', id));
  if (!snap.exists()) return null;
  const od = snap.data() as any;
  const ms = (v: any) => (v ? toMillis(v) : undefined);
  const order = {
    id: snap.id, ...od,
    createdAt: toMillis(od.createdAt),
    deliveredAt: ms(od.deliveredAt),
    paymentVerifiedAt: ms(od.paymentVerifiedAt),
    confirmedAt: ms(od.confirmedAt),
    deliveringAt: ms(od.deliveringAt),
    completedAt: ms(od.completedAt),
  } as Order;
  const itemsSnap = await getDocs(query(collection(db, 'orderItems'), where('orderId', '==', id)));
  const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as OrderItem);
  return { order, items };
}

// ===== Admin =====
export function watchAllOrders(cb: (o: Order[]) => void) {
  return onSnapshot(collection(db, 'orders'), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMillis((d.data() as any).createdAt) }) as Order);
    list.sort((a, b) => b.createdAt - a.createdAt);
    cb(list);
  }, (e) => { console.error('watchAllOrders:', e); cb([]); });
}

/**
 * Cancel the rider delivery task linked to an order, so a cancelled/refunded
 * order never leaves a live task sitting in a rider's queue. Best-effort: rules
 * allow the customer, the selling shop and admin to do this.
 */
async function cancelLinkedTask(orderId: string) {
  try {
    const snap = await getDoc(doc(db, 'orders', orderId));
    const taskId = (snap.data() as any)?.deliveryTaskId;
    if (!taskId) return;
    const t = await getDoc(doc(db, 'deliveryTasks', taskId));
    const td = t.data() as any;
    const st = td?.status;
    if (!t.exists() || st === 'delivered' || st === 'cancelled') return;
    await updateDoc(doc(db, 'deliveryTasks', taskId), { status: 'cancelled' });
    // a rider already carrying this task (accepted/picked_up) — possibly holding
    // COD cash or en route — must be told it was cancelled, not left guessing.
    if ((st === 'accepted' || st === 'picked_up') && td?.assignedRiderId) {
      notify(td.assignedRiderId, {
        type: 'delivery_cancelled',
        title: '❌ ງານສົ່ງຖືກຍົກເລີກ',
        body: td.orderNumber ? `ອໍເດີ #${td.orderNumber} ຖືກຍົກເລີກ — ບໍ່ຕ້ອງສົ່ງຕໍ່` : 'ອໍເດີຖືກຍົກເລີກ — ບໍ່ຕ້ອງສົ່ງຕໍ່',
        link: '/rider',
      });
    }
  } catch (e) {
    console.error('cancelLinkedTask:', e);
  }
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  // on cancel, the onOrderCancelled Cloud Function restores stock + soldCount.
  const patch: Record<string, unknown> = { status };
  if (status === 'confirmed') patch.confirmedAt = serverTimestamp();
  if (status === 'delivering') patch.deliveringAt = serverTimestamp();
  if (status === 'delivered' || status === 'completed') patch.deliveredAt = serverTimestamp();
  if (status === 'completed') patch.completedAt = serverTimestamp();
  await updateDoc(doc(db, 'orders', id), patch);
  // A completed order shouldn't leave a delivery task lingering in the rider
  // queue (it was fulfilled some other way). cancelLinkedTask no-ops on an
  // already-delivered task, so a rider-driven completion is untouched; only a
  // still-open/in-flight task for a manually-completed order is cancelled.
  if (status === 'completed') await cancelLinkedTask(id);
  if (status === 'cancelled') await cancelLinkedTask(id);
}

/** Delete an order and its line items (super admin / Go-Live cleanup). */
export async function deleteOrder(id: string) {
  const itemsSnap = await getDocs(query(collection(db, 'orderItems'), where('orderId', '==', id)));
  const batch = writeBatch(db);
  itemsSnap.docs.forEach((d) => batch.delete(doc(db, 'orderItems', d.id)));
  batch.delete(doc(db, 'orders', id));
  await batch.commit();
}

export async function verifyOrderPayment(id: string, approved: boolean) {
  // reject → onOrderCancelled Cloud Function restores stock + soldCount.
  await updateDoc(doc(db, 'orders', id), {
    paymentVerified: approved,
    status: approved ? 'confirmed' : 'cancelled',
    ...(approved ? { paymentVerifiedAt: serverTimestamp(), confirmedAt: serverTimestamp() } : {}),
  });
  if (approved) await releaseHeldTask(id);
  else await cancelLinkedTask(id);
}

/**
 * Once a non-COD order's payment is verified, release its delivery task into the
 * rider queue (clears the heldForPayment flag). No-ops if there is no task or it
 * was never held. Runs as the admin OR the selling shop — rules allow both to
 * flip only this one field on their own order's task.
 */
async function releaseHeldTask(orderId: string) {
  try {
    const snap = await getDoc(doc(db, 'orders', orderId));
    const taskId = (snap.data() as any)?.deliveryTaskId;
    if (!taskId) return;
    const t = await getDoc(doc(db, 'deliveryTasks', taskId));
    if (t.exists() && (t.data() as any)?.heldForPayment === true) {
      await updateDoc(doc(db, 'deliveryTasks', taskId), { heldForPayment: false });
    }
  } catch (e) {
    console.error('releaseHeldTask:', e);
  }
}

/** Admin records the courier tracking number (+ optional provider) after booking. */
export async function setOrderTracking(id: string, trackingNumber: string, providerName?: string) {
  const patch: Record<string, unknown> = { trackingNumber: trackingNumber.trim() };
  if (providerName) patch.logisticsProviderName = providerName;
  await updateDoc(doc(db, 'orders', id), patch);
}

/**
 * escrow-lite: the CUSTOMER confirms they received the goods → order completes
 * (reuses the job "confirm receipt → release" 2-step). HomeSang never holds the
 * funds itself; this just recognises the sale / releases the commission.
 * Firestore rules allow the owning customer to update their own order.
 */
export async function confirmReceipt(id: string) {
  await updateDoc(doc(db, 'orders', id), {
    status: 'completed' as OrderStatus,
    deliveredAt: serverTimestamp(),
    completedAt: serverTimestamp(),
  });
}

// ===== Bank accounts =====
export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  active: boolean;
}

export function watchBankAccounts(cb: (b: BankAccount[]) => void) {
  return onSnapshot(collection(db, 'bankAccounts'), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BankAccount).filter((b) => b.active !== false));
  }, (e) => { console.error('watchBankAccounts:', e); cb([]); });
}

export async function seedBankAccountIfEmpty() {
  const snap = await getDocs(collection(db, 'bankAccounts'));
  if (!snap.empty) return;
  await addDoc(collection(db, 'bankAccounts'), {
    bankName: 'BCEL',
    accountName: 'HomeSang Co.',
    accountNumber: '040-12-00-1234567-001',
    order: 1,
    active: true,
  });
}
