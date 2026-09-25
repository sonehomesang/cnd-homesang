import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

// keep ALL functions in one region (matches the existing onNotificationCreated
// deployment + closest to Laos) — avoids orphaning functions across regions.
setGlobalOptions({ region: 'asia-southeast1' });

admin.initializeApp();

const dbf = () => admin.firestore();
const inc = (n: number) => admin.firestore.FieldValue.increment(n);

/**
 * When a notification doc is created, deliver a web push to the recipient's
 * registered FCM tokens. The in-app bell is driven separately by the doc
 * itself; this adds out-of-app delivery. Invalid tokens are pruned.
 */
export const onNotificationCreated = onDocumentCreated('notifications/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data() as Record<string, any>;
  const userId = data?.userId;
  if (!userId) return;

  const userRef = admin.firestore().doc(`users/${userId}`);
  const userSnap = await userRef.get();
  const tokens: string[] = (userSnap.get('fcmTokens') as string[]) || [];
  if (!tokens.length) return;

  const link = String(data.link || '/');
  const resp = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: String(data.title || 'HomeSang'),
      body: String(data.body || ''),
    },
    webpush: {
      fcmOptions: { link },
      notification: { icon: '/favicon.png' },
    },
    data: { link },
  });

  const invalid: string[] = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || '';
      if (
        code.includes('registration-token-not-registered') ||
        code.includes('invalid-registration-token') ||
        code.includes('invalid-argument')
      ) {
        invalid.push(tokens[i]);
      }
    }
  });
  if (invalid.length) {
    await userRef.update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalid) });
  }
});

/**
 * Server-authoritative aggregates (rating / soldCount / stock). These run with
 * the admin SDK (bypassing security rules), so the client is NOT trusted to
 * write these fields — the rules forbid client writes to them. Prevents rating
 * sabotage / fake best-sellers / fake stock.
 */

// average of the non-hidden ratings in a collection filtered by a field
async function avgRating(coll: string, field: string, id: string): Promise<{ rating: number; count: number }> {
  const snap = await dbf().collection(coll).where(field, '==', id).get();
  let sum = 0;
  let n = 0;
  snap.forEach((d) => {
    const r = d.data();
    if (r.hidden) return;
    if (typeof r.rating === 'number') { sum += r.rating; n += 1; }
  });
  return { rating: n ? Math.round((sum / n) * 10) / 10 : 0, count: n };
}

// technician/customer review → recompute the ratee's rating on users (+ techCard)
export const onReviewWritten = onDocumentWritten('reviews/{id}', async (event) => {
  const rateeId = event.data?.after?.data()?.rateeId ?? event.data?.before?.data()?.rateeId;
  if (!rateeId) return;
  const { rating, count } = await avgRating('reviews', 'rateeId', rateeId);
  await dbf().doc(`users/${rateeId}`).set({ rating, reviewCount: count }, { merge: true }).catch(() => {});
  const tc = dbf().doc(`techCards/${rateeId}`);
  const tcSnap = await tc.get();
  if (tcSnap.exists) await tc.update({ rating, reviewCount: count }).catch(() => {});
});

// product review → recompute the product's rating
export const onProductReviewWritten = onDocumentWritten('productReviews/{id}', async (event) => {
  const productId = event.data?.after?.data()?.productId ?? event.data?.before?.data()?.productId;
  if (!productId) return;
  const { rating, count } = await avgRating('productReviews', 'productId', productId);
  await dbf().doc(`products/${productId}`).set({ rating, reviewCount: count }, { merge: true }).catch(() => {});
});

// order placed → bump soldCount + decrement stock (tracked products) per line item
export const onOrderItemCreated = onDocumentCreated('orderItems/{id}', async (event) => {
  const it = event.data?.data();
  const productId = it?.productId;
  const qty = Number(it?.quantity) || 0;
  if (!productId || !qty) return;
  const pRef = dbf().doc(`products/${productId}`);
  // Transaction so concurrent orders serialize, and floor stock at 0 so a race
  // (or a stale client that slipped past the placeOrder pre-check) can never
  // drive stock negative. soldCount still increments freely.
  await dbf().runTransaction(async (tx) => {
    const p = await tx.get(pRef);
    if (!p.exists) return;
    const upd: Record<string, any> = { soldCount: inc(qty) };
    const cur = p.get('stock');
    if (typeof cur === 'number') upd.stock = Math.max(0, cur - qty);
    tx.set(pRef, upd, { merge: true });
  }).catch(() => {});

  // Verified-purchase index: record that this buyer bought this product so they
  // may leave ONE productReview (rules gate on purchases/{productId}_{buyer}).
  // Excludes the selling shop's owner buying their own product — that keeps them
  // from "verified"-reviewing their own listing.
  try {
    const orderId = it?.orderId;
    if (orderId) {
      const [ordSnap, pSnap] = await Promise.all([dbf().doc(`orders/${orderId}`).get(), pRef.get()]);
      const buyerId = ordSnap.get('customerId');
      const shopId = pSnap.get('shopId');
      const ownerId = shopId ? (await dbf().doc(`shops/${shopId}`).get()).get('ownerId') : undefined;
      if (buyerId && buyerId !== ownerId) {
        await dbf().doc(`purchases/${productId}_${buyerId}`).set(
          { productId, buyerId, at: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
    }
  } catch { /* best-effort — a missing index just blocks that one review */ }
});

// ===== server-authoritative back-office economics (commission/broker/fees) =====
// The client no longer computes these (it can't be trusted to). None of them
// touch the buyer's grandTotal — they're deducted from the shop's settlement.
const DEFAULT_COMMISSION_PCT = 5;
const ANY_COMMISSION = ['', 'all', 'ທັງໝົດ', 'ທັງ ໝົດ'];
const isAnyVal = (v: any) => v == null || ANY_COMMISSION.includes(String(v));

function resolveCommissionPct(
  product: { category?: string; commissionPct?: number | null },
  rules: any[] | undefined,
  customerType: string | undefined,
  defaultPct: number,
): number {
  if (product.commissionPct != null) return product.commissionPct;
  if (rules && rules.length) {
    let best: any = null;
    let bestScore = -1;
    for (const r of rules) {
      const catOk = isAnyVal(r.category) || r.category === product.category;
      const custOk = isAnyVal(r.customer) || r.customer === customerType;
      if (!catOk || !custOk) continue;
      const score = (isAnyVal(r.category) ? 0 : 2) + (isAnyVal(r.customer) ? 0 : 1);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (best) return best.pct;
  }
  return defaultPct;
}

const DEFAULT_PLATFORM_FEES = [
  { key: 'escrow', label: 'ຄ່າ Escrow / ຮັບປະກັນ', kind: 'pct', value: 1.5, appliesTo: 'bank', enabled: false },
  { key: 'fulfillment', label: 'ຄ່າ Fulfillment', kind: 'pct', value: 2, appliesTo: 'express', enabled: false },
  { key: 'cod', label: 'ຄ່າ ຈັດການ COD', kind: 'flat', value: 5000, appliesTo: 'cod', enabled: false },
  { key: 'service', label: 'ຄ່າ ບໍລິການ ທົ່ວໄປ', kind: 'pct', value: 0, appliesTo: 'all', enabled: false },
];

function feeApplies(c: any, paymentMethod: string, logisticsTier: string | undefined): boolean {
  switch (c.appliesTo) {
    case 'all': return true;
    case 'express': return logisticsTier === 'own';
    case 'cod': return paymentMethod === 'cod';
    case 'bank': return paymentMethod === 'bank_transfer';
    default: return false;
  }
}

export const onOrderEconomics = onDocumentCreated('orders/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const order = snap.data();
  const orderId = event.params.id;
  const shopId = order.shopId;
  if (!shopId) return;
  const subtotal = Number(order.subtotal) || 0;
  const paymentMethod = order.paymentMethod;
  const logisticsTier = order.logisticsTier;
  const customerId = order.customerId;
  const brokerCode = order.brokerCode;

  try {
    const [pricingSnap, shopSnap, appSnap, feesSnap] = await Promise.all([
      dbf().doc('settings/pricing').get(),
      dbf().doc(`shops/${shopId}`).get(),
      dbf().doc('settings/app').get(),
      dbf().doc('settings/platformFees').get(),
    ]);
    const pricing = pricingSnap.data() || {};
    const shop = shopSnap.data() || {};
    const rules = Array.isArray(shop.commissionRules) ? shop.commissionRules : undefined;
    const defaultPct = typeof pricing.defaultCommissionPct === 'number' ? pricing.defaultCommissionPct : DEFAULT_COMMISSION_PCT;

    // 1) commission — per line item (read each product for category + commissionPct)
    let commission = 0;
    if (pricing.commissionEnabled === true) {
      const items = await dbf().collection('orderItems').where('orderId', '==', orderId).get();
      for (const d of items.docs) {
        const it = d.data();
        const retail = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
        if (retail <= 0) continue;
        let product: any = {};
        if (it.productId) {
          const p = await dbf().doc(`products/${it.productId}`).get();
          product = { category: p.get('category'), commissionPct: p.get('commissionPct') };
        }
        commission += Math.round((retail * resolveCommissionPct(product, rules, undefined, defaultPct)) / 100);
      }
    }

    // 2) broker affiliate — resolve the ref code server-side; never the buyer or shop owner
    let brokerId: string | undefined;
    let brokerCommission = 0;
    if (brokerCode) {
      const pct = Number(appSnap.get('brokerCommissionPct')) || 0;
      const clean = String(brokerCode).trim().toUpperCase();
      if (pct > 0 && clean) {
        const b = await dbf().collection('userCards').where('referralCode', '==', clean).limit(1).get();
        const bid = b.empty ? undefined : b.docs[0].id;
        if (bid && bid !== customerId && bid !== shop.ownerId) {
          brokerId = bid;
          brokerCommission = Math.round((subtotal * pct) / 100);
        }
      }
    }

    // 3) platform fees
    const rawComps = feesSnap.get('components');
    const comps = Array.isArray(rawComps) && rawComps.length ? rawComps : DEFAULT_PLATFORM_FEES;
    const platformFees: { key: string; label: string; amount: number }[] = [];
    for (const c of comps) {
      if (!c.enabled || !feeApplies(c, paymentMethod, logisticsTier)) continue;
      const amount = c.kind === 'pct' ? Math.round((subtotal * c.value) / 100) : Math.round(c.value);
      if (amount > 0) platformFees.push({ key: c.key, label: c.label, amount });
    }
    // BNPL service fee (customer-funded) is platform revenue — surface it in the
    // same platform-fees list so the back-office income totals pick it up. (0 when
    // merchant-funded, since feeTotal is then 0.)
    if (order.isBnpl && Number(order.bnpl?.feeTotal) > 0) {
      platformFees.push({ key: 'bnplFee', label: 'ຄ່າ ບໍລິການ ຜ່ອນ', amount: Math.round(Number(order.bnpl.feeTotal)) });
    }
    const platformFeeTotal = platformFees.reduce((s, f) => s + f.amount, 0);

    // stamp only fields that have a value (mirrors the old client strip() behaviour)
    const upd: Record<string, any> = {};
    if (commission > 0) upd.commission = commission;
    if (brokerId) { upd.brokerId = brokerId; upd.brokerCommission = brokerCommission; }
    if (platformFeeTotal > 0) { upd.platformFees = platformFees; upd.platformFeeTotal = platformFeeTotal; }
    if (Object.keys(upd).length) await snap.ref.set(upd, { merge: true });
  } catch (e) {
    console.error('onOrderEconomics', e);
  }
});

// ===== customer wallet: spend from balance (server-authoritative) =====
// The ONLY way a walletSpends doc is created (rules deny client writes). Sums
// verified top-ups minus prior spends, checks the balance covers the amount,
// then records the spend. Single writer keeps the balance from being forged or
// overdrawn (concurrency race is negligible — one customer paying twice at once).
export const spendWallet = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ຕ້ອງ ເຂົ້າ ລະບົບ');
  let amount = Math.round(Number(req.data?.amount) || 0);
  const reason = String(req.data?.reason || 'spend').slice(0, 40);
  const refId = req.data?.refId ? String(req.data.refId).slice(0, 128) : undefined;

  // Payments against a document (an order, or a job's survey fee) are SERVER-
  // authoritative: the server reads the amount owed from that doc (never trusts
  // the client's amount), confirms the caller owns it, refuses if it's already
  // settled, and guards against a double-debit on retry (refId idempotency).
  // That makes "pay from wallet" self-verifying — the customer can't mark their
  // own order/fee paid, underpay it, or pay it twice.
  let order: FirebaseFirestore.DocumentSnapshot | undefined;
  let job: FirebaseFirestore.DocumentSnapshot | undefined;
  if (reason === 'order' && refId) {
    order = await dbf().doc(`orders/${refId}`).get();
    if (!order.exists) throw new HttpsError('not-found', 'ບໍ່ ພົບ ອໍເດີ');
    if (order.get('customerId') !== uid) throw new HttpsError('permission-denied', 'ບໍ່ ແມ່ນ ອໍເດີ ຂອງ ທ່ານ');
    if (order.get('paymentVerified') === true) throw new HttpsError('failed-precondition', 'ອໍເດີ ນີ້ ຈ່າຍ ແລ້ວ');
    if (order.get('status') === 'cancelled') throw new HttpsError('failed-precondition', 'ອໍເດີ ນີ້ ຖືກ ຍົກເລີກ');
    amount = Math.round(Number(order.get('grandTotal')) || 0);
  } else if (reason === 'surveyFee' && refId) {
    job = await dbf().doc(`jobs/${refId}`).get();
    if (!job.exists) throw new HttpsError('not-found', 'ບໍ່ ພົບ ງານ');
    if (job.get('customerId') !== uid) throw new HttpsError('permission-denied', 'ບໍ່ ແມ່ນ ງານ ຂອງ ທ່ານ');
    if (job.get('surveyFeePaid') === true) throw new HttpsError('failed-precondition', 'ຄ່າ ສຳຫຼວດ ຈ່າຍ ແລ້ວ');
    amount = Math.round(Number(job.get('surveyFee')) || 0);
  }
  if ((order || job) && refId) {
    // idempotency — a retry after a partial success must not debit twice
    const dup = await dbf().collection('walletSpends').where('refId', '==', refId).limit(5).get();
    if (dup.docs.some((d) => d.get('uid') === uid)) throw new HttpsError('failed-precondition', 'ຈ່າຍ ແລ້ວ');
  }
  if (!(amount > 0)) throw new HttpsError('invalid-argument', 'ຈຳນວນ ບໍ່ ຖືກຕ້ອງ');

  const [topups, spends] = await Promise.all([
    dbf().collection('walletTopups').where('uid', '==', uid).where('status', '==', 'verified').get(),
    dbf().collection('walletSpends').where('uid', '==', uid).get(),
  ]);
  const credit = topups.docs.reduce((s, d) => s + (Number(d.get('amount')) || 0), 0);
  const debit = spends.docs.reduce((s, d) => s + (Number(d.get('amount')) || 0), 0);
  const balance = credit - debit;
  if (balance < amount) throw new HttpsError('failed-precondition', `ຍອດ ບໍ່ ພຽງພໍ (ເຫຼືອ ${balance.toLocaleString('en-US')} ກີບ)`);

  await dbf().collection('walletSpends').add({
    uid, amount, reason,
    ...(refId ? { refId } : {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Mark the order paid + release its held delivery task — the same effect an
  // admin's manual slip-verification has, but done here under server authority.
  if (order) {
    await order.ref.update({
      paymentVerified: true,
      status: 'confirmed',
      paidByWallet: true,
      paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const taskId = order.get('deliveryTaskId');
    if (taskId) {
      try {
        const t = await dbf().doc(`deliveryTasks/${taskId}`).get();
        if (t.exists && t.get('heldForPayment') === true) {
          await t.ref.update({ heldForPayment: false });
        }
      } catch (e) { console.error('spendWallet release task', e); }
    }
  }
  // Mark the job's survey fee collected (server-trusted). Settlement — refund on
  // completion, forfeit to the tech on customer-cancel — is handled later by the
  // onJobWritten trigger, keyed off this flag.
  if (job) {
    await job.ref.update({
      surveyFeePaid: true,
      surveyFeePaidAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return { ok: true, balance: balance - amount };
});

// ─────────────────────────────────────────────────────────────────────────────
// BNPL — start an installment purchase. SERVER-AUTHORITATIVE: it reads the
// product's own price + the admin BNPL config (never trusts client amounts),
// runs the eligibility gate itself, prices out the schedule, takes the down
// payment from the wallet, and creates the order + line item + down-payment
// spend in one batch. The client only supplies the choice (product/tenor/mode).
// ─────────────────────────────────────────────────────────────────────────────
const BNPL_FALLBACK = {
  enabled: false, modes: ['layaway', 'bnpl'], defaultMode: 'bnpl',
  plans: [{ tenor: 3, feePct: 0 }, { tenor: 6, feePct: 3 }, { tenor: 12, feePct: 6 }],
  downPct: 20, feePayer: 'customer', creditLimitKip: 10_000_000,
  minOrderKip: 300_000, maxOrderKip: 20_000_000, minAccountAgeDays: 30,
  minCompletedOrders: 1, graceDays: 3, lateFeePct: 2, freezeAfterDays: 14,
};
const DAY_MS = 86_400_000;
const tsMillis = (v: any): number => (v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : 0));

export const startBnpl = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ຕ້ອງ ເຂົ້າ ລະບົບ');
  const d: any = req.data || {};
  const productId = String(d.productId || '');
  const qty = Math.max(1, Math.floor(Number(d.qty) || 1));
  const tenor = Math.max(1, Math.floor(Number(d.tenor) || 0));
  const mode = d.mode === 'layaway' ? 'layaway' : 'bnpl';
  const autopay = !!d.autopay;
  const variantLabel = d.variantLabel ? String(d.variantLabel).slice(0, 80) : undefined;
  const deliveryMethod = d.deliveryMethod === 'pickup' ? 'pickup' : 'delivery';
  const deliveryAddress = d.deliveryAddress ? String(d.deliveryAddress).slice(0, 300) : undefined;
  const customerPhone = d.customerPhone ? String(d.customerPhone).slice(0, 40) : undefined;
  const requestId = d.requestId ? String(d.requestId).slice(0, 64) : undefined;
  if (!productId) throw new HttpsError('invalid-argument', 'ບໍ່ ມີ ສິນຄ້າ');

  // Idempotency — a double-submit / retry carrying the same requestId returns the
  // order that was already created instead of making a second one (+ a second
  // down-payment debit). Single-field query on bnplRequestId is auto-indexed.
  if (requestId) {
    const dup = await dbf().collection('orders').where('bnplRequestId', '==', requestId).limit(1).get();
    const hit = dup.docs.find((x) => x.get('customerId') === uid);
    if (hit) return { ok: true, orderId: hit.id, down: Number(hit.get('bnpl')?.down) || 0, duplicate: true };
  }

  const settings = (await dbf().doc('settings/app').get()).data() || {};
  const cfg: any = { ...BNPL_FALLBACK, ...(settings.bnpl || {}) };
  if (!cfg.enabled) throw new HttpsError('failed-precondition', 'ຜ່ອນ ສິນຄ້າ ຍັງ ບໍ່ ເປີດ ໃຫ້ ບໍລິການ');
  if (!Array.isArray(cfg.modes) || !cfg.modes.includes(mode)) throw new HttpsError('failed-precondition', 'ໂໝດ ຜ່ອນ ນີ້ ບໍ່ ເປີດ');
  const plan = (cfg.plans || []).find((p: any) => Math.floor(p.tenor) === tenor && p.enabled !== false);
  if (!plan) throw new HttpsError('invalid-argument', 'ບໍ່ ພົບ ແผน ງວດ ນີ້');

  const psnap = await dbf().doc(`products/${productId}`).get();
  if (!psnap.exists) throw new HttpsError('not-found', 'ບໍ່ ພົບ ສິນຄ້າ');
  const prod: any = psnap.data();
  // Price from the product's EFFECTIVE price — honours an active flash-sale so a
  // customer isn't overcharged for buying on installments. (Mirrors saleInfo in
  // lib/shop.) Variant deltas are still not priced into BNPL v1 — the amount
  // stays server-authoritative and never below the effective price.
  const listPrice = Math.round(Number(prod.price) || 0);
  const salePrice = Math.round(Number(prod.salePrice) || 0);
  const saleEndsAt = tsMillis(prod.saleEndsAt) || (typeof prod.saleEndsAt === 'number' ? prod.saleEndsAt : 0);
  const onSale = salePrice > 0 && salePrice < listPrice && saleEndsAt > Date.now();
  const unitPrice = onSale ? salePrice : listPrice;
  const orderAmount = unitPrice * qty;
  if (!(orderAmount > 0)) throw new HttpsError('failed-precondition', 'ລາຄາ ສິນຄ້າ ບໍ່ ຖືກຕ້ອງ');
  if (typeof prod.stock === 'number' && prod.stock < qty) {
    throw new HttpsError('failed-precondition', `ສິນຄ້າ ເຫຼືອ ${prod.stock} ບໍ່ ພໍ ກັບ ${qty}`);
  }

  // ── eligibility (authoritative) ──
  const user = (await dbf().doc(`users/${uid}`).get()).data() || {};
  const accountCreatedAt = tsMillis(user.createdAt);
  const myOrders = await dbf().collection('orders').where('customerId', '==', uid).get();
  let completedOrders = 0, outstanding = 0, hasOverdue = false;
  myOrders.forEach((o) => {
    const od: any = o.data();
    if (od.status === 'completed' || od.status === 'delivered') completedOrders++;
    if (od.isBnpl && od.bnpl?.status === 'active') outstanding += Number(od.bnplOutstanding) || 0;
    if (od.isBnpl && od.bnpl?.status === 'overdue') hasOverdue = true;
  });
  const now = Date.now();
  const reasons: string[] = [];
  if (orderAmount < cfg.minOrderKip) reasons.push(`ຍอด ຕ້ອງ ≥ ${Number(cfg.minOrderKip).toLocaleString('en-US')}`);
  if (orderAmount > cfg.maxOrderKip) reasons.push(`ຍอด ຕ້ອງ ≤ ${Number(cfg.maxOrderKip).toLocaleString('en-US')}`);
  if (accountCreatedAt && (now - accountCreatedAt) / DAY_MS < cfg.minAccountAgeDays) reasons.push(`ບັນຊີ ຕ້ອງ ອາຍຸ ≥ ${cfg.minAccountAgeDays} ວັນ`);
  if (mode === 'bnpl' && completedOrders < cfg.minCompletedOrders) reasons.push(`ຕ້ອງ ຊື້ ສຳເລັດ ≥ ${cfg.minCompletedOrders} ຄັ້ງ`);
  if (hasOverdue) reasons.push('ມີ ງວດ ຄ້າง ຊຳລະ ຢູ່');
  if (outstanding + orderAmount > cfg.creditLimitKip) reasons.push('ເກີນ ວົງເງິນ ຜ່ອນ');
  if (reasons.length) throw new HttpsError('failed-precondition', 'ຜ່ອນ ບໍ່ ໄດ້: ' + reasons.join(' · '));

  // ── price out the schedule ──
  const down = mode === 'bnpl' ? Math.round((orderAmount * Number(cfg.downPct)) / 100) : 0;
  const feeTotal = cfg.feePayer === 'customer' ? Math.round((orderAmount * Number(plan.feePct)) / 100) : 0;
  const financed = Math.max(0, orderAmount - down) + feeTotal;
  const baseAmt = Math.floor(financed / tenor);
  const installments = Array.from({ length: tenor }, (_, i) => ({
    seq: i + 1,
    dueAt: now + (i + 1) * 30 * DAY_MS,
    amount: i === tenor - 1 ? financed - baseAmt * (tenor - 1) : baseAmt,
    status: 'upcoming' as const,
  }));

  // ── take the down payment from the wallet (server-checked balance) ──
  if (down > 0) {
    const [topups, spends] = await Promise.all([
      dbf().collection('walletTopups').where('uid', '==', uid).where('status', '==', 'verified').get(),
      dbf().collection('walletSpends').where('uid', '==', uid).get(),
    ]);
    const bal = topups.docs.reduce((s, x) => s + (Number(x.get('amount')) || 0), 0)
      - spends.docs.reduce((s, x) => s + (Number(x.get('amount')) || 0), 0);
    if (bal < down) throw new HttpsError('failed-precondition', `ຍอด ກະເປົາ ບໍ່ ພຽງພໍ ສຳລັບ ດາວน์ (ເຫຼືອ ${bal.toLocaleString('en-US')} ກີບ)`);
  }

  // ── create order + line item + down-payment spend in one batch ──
  const sv = admin.firestore.FieldValue.serverTimestamp();
  const orderRef = dbf().collection('orders').doc();
  const num = 'BN' + now.toString(36).toUpperCase();
  const batch = dbf().batch();
  batch.set(orderRef, {
    orderNumber: num,
    customerId: uid,
    customerPhone: customerPhone ?? null,
    shopId: prod.shopId ?? null,
    shopName: prod.shopName ?? null,
    status: mode === 'bnpl' ? 'confirmed' : 'pending', // ship-first vs layaway
    paymentMethod: 'wallet',
    paymentVerified: false,               // not fully paid; installments remain
    isBnpl: true,
    ...(requestId ? { bnplRequestId: requestId } : {}),
    bnpl: { mode, tenor, down, feeTotal, financed, autopay, status: 'active', nextDueAt: installments[0].dueAt, installments },
    bnplOutstanding: financed,
    deliveryMethod,
    deliveryAddress: deliveryAddress ?? null,
    subtotal: orderAmount,
    deliveryFee: 0,
    vat: 0,
    vatRate: 0,
    grandTotal: orderAmount + feeTotal,
    ...(mode === 'bnpl' ? { confirmedAt: sv } : {}),
    createdAt: sv,
  });
  // line item — the onOrderItemCreated trigger floors stock + soldCount
  batch.set(dbf().collection('orderItems').doc(), {
    orderId: orderRef.id,
    productId,
    productName: prod.name ?? '',
    variantLabel: variantLabel ?? null,
    unitPrice,
    unit: prod.unit ?? '',
    quantity: qty,
    total: orderAmount,
    imageUrl: prod.images?.[0] ?? null,
  });
  if (down > 0) {
    batch.set(dbf().collection('walletSpends').doc(), {
      uid, amount: down, reason: 'bnplDown', refId: orderRef.id, createdAt: sv,
    });
  }
  await batch.commit();
  return { ok: true, orderId: orderRef.id, down };
});

// ─────────────────────────────────────────────────────────────────────────────
// BNPL — pay one installment, or pay off the whole remaining balance early, from
// the wallet. SERVER-AUTHORITATIVE: reads the order's own schedule, verifies the
// caller owns it, only debits real unpaid installments (incl. any accrued late
// fee), then recomputes outstanding / status / nextDueAt. On full settlement it
// marks the order paid (and releases a layaway order to ship).
// ─────────────────────────────────────────────────────────────────────────────
export const payInstallment = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ຕ້ອງ ເຂົ້າ ລະບົບ');
  const d: any = req.data || {};
  const orderId = String(d.orderId || '');
  const payoff = !!d.payoff;
  const seq = payoff ? 0 : Math.floor(Number(d.seq) || 0);
  if (!orderId) throw new HttpsError('invalid-argument', 'ບໍ່ ມີ ອໍເດີ');

  const oref = dbf().doc(`orders/${orderId}`);
  const osnap = await oref.get();
  if (!osnap.exists) throw new HttpsError('not-found', 'ບໍ່ ພົບ ອໍເດີ');
  const o: any = osnap.data();
  if (o.customerId !== uid) throw new HttpsError('permission-denied', 'ບໍ່ ແມ່ນ ອໍເດີ ຂອງ ທ່ານ');
  if (!o.isBnpl || !o.bnpl) throw new HttpsError('failed-precondition', 'ບໍ່ ແມ່ນ ອໍເດີ ຜ່ອນ');
  const bnpl = o.bnpl;
  if (bnpl.status === 'completed') throw new HttpsError('failed-precondition', 'ຜ່ອນ ຄົບ ແລ້ວ');
  if (bnpl.status === 'cancelled') throw new HttpsError('failed-precondition', 'ອໍເດີ ຖືກ ຍົກເລີກ');

  const installments = (bnpl.installments || []).map((x: any) => ({ ...x }));
  let toPay: any[];
  if (payoff) {
    toPay = installments.filter((x: any) => x.status !== 'paid');
  } else {
    const inst = installments.find((x: any) => x.seq === seq);
    if (!inst) throw new HttpsError('invalid-argument', 'ບໍ່ ພົບ ງວດ ນີ້');
    if (inst.status === 'paid') throw new HttpsError('failed-precondition', 'ງວດ ນີ້ ຈ່າຍ ແລ້ວ');
    toPay = [inst];
  }
  if (!toPay.length) throw new HttpsError('failed-precondition', 'ບໍ່ ມີ ງວດ ທີ່ ຕ້ອງ ຈ່າຍ');

  let amount = toPay.reduce((s, x) => s + (Number(x.amount) || 0) + (Number(x.lateFee) || 0), 0);
  // early payoff waives the service-fee portion of the still-unpaid installments
  let discount = 0;
  if (payoff && Number(bnpl.feeTotal) > 0 && Number(bnpl.tenor) > 0) {
    discount = Math.round((Number(bnpl.feeTotal) * toPay.length) / Number(bnpl.tenor));
    amount = Math.max(0, amount - discount);
  }

  // wallet balance (server-checked)
  if (amount > 0) {
    const [topups, spends] = await Promise.all([
      dbf().collection('walletTopups').where('uid', '==', uid).where('status', '==', 'verified').get(),
      dbf().collection('walletSpends').where('uid', '==', uid).get(),
    ]);
    const bal = topups.docs.reduce((s, x) => s + (Number(x.get('amount')) || 0), 0)
      - spends.docs.reduce((s, x) => s + (Number(x.get('amount')) || 0), 0);
    if (bal < amount) throw new HttpsError('failed-precondition', `ຍอด ບໍ່ ພຽງພໍ (ເຫຼືອ ${bal.toLocaleString('en-US')} ກີບ)`);
  }

  const sv = admin.firestore.FieldValue.serverTimestamp();
  const now = Date.now();
  const settings = (await dbf().doc('settings/app').get()).data() || {};
  const graceMs = (Number(settings.bnpl?.graceDays) || 0) * DAY_MS;

  // Atomic mark + debit: re-read the order INSIDE a transaction and re-verify the
  // installments are still unpaid before marking them + writing the spend, so two
  // concurrent calls (double-tap / network retry) can never charge the same
  // installment twice. (Balance was pre-checked above; an overdraw race remains
  // the accepted single-writer risk — but the double-CHARGE, the real money
  // hazard, is eliminated here because the paid flags are set transactionally.)
  const result = await dbf().runTransaction(async (tx) => {
    const fresh = await tx.get(oref);
    const fo: any = fresh.data();
    if (!fo?.isBnpl || !fo.bnpl) throw new HttpsError('failed-precondition', 'ບໍ່ ແມ່ນ ອໍເດີ ຜ່ອນ');
    if (fo.bnpl.status === 'completed') throw new HttpsError('failed-precondition', 'ຜ່ອນ ຄົບ ແລ້ວ');
    if (fo.bnpl.status === 'cancelled') throw new HttpsError('failed-precondition', 'ອໍເດີ ຖືກ ຍົກເລີກ');
    const insts = (fo.bnpl.installments || []).map((x: any) => ({ ...x }));
    let pay: any[];
    if (payoff) {
      pay = insts.filter((x: any) => x.status !== 'paid');
    } else {
      const inst = insts.find((x: any) => x.seq === seq);
      if (!inst) throw new HttpsError('invalid-argument', 'ບໍ່ ພົບ ງວດ ນີ້');
      if (inst.status === 'paid') throw new HttpsError('failed-precondition', 'ງວດ ນີ້ ຈ່າຍ ແລ້ວ');
      pay = [inst];
    }
    if (!pay.length) throw new HttpsError('failed-precondition', 'ບໍ່ ມີ ງວດ ທີ່ ຕ້ອງ ຈ່າຍ');
    let amt = pay.reduce((s, x) => s + (Number(x.amount) || 0) + (Number(x.lateFee) || 0), 0);
    let disc = 0;
    if (payoff && Number(fo.bnpl.feeTotal) > 0 && Number(fo.bnpl.tenor) > 0) {
      disc = Math.round((Number(fo.bnpl.feeTotal) * pay.length) / Number(fo.bnpl.tenor));
      amt = Math.max(0, amt - disc);
    }
    let sId: string | undefined;
    if (amt > 0) {
      const spendRef = dbf().collection('walletSpends').doc();
      tx.set(spendRef, { uid, amount: amt, reason: payoff ? 'bnplPayoff' : 'bnplInstallment', refId: orderId, createdAt: sv });
      sId = spendRef.id;
    }
    const paidSeqs = new Set(pay.map((x) => x.seq));
    const next = insts.map((x: any) => (paidSeqs.has(x.seq) ? { ...x, status: 'paid', paidAt: now, ...(sId ? { spendId: sId } : {}) } : x));
    const stillUnpaid = next.filter((x: any) => x.status !== 'paid');
    const outstanding = stillUnpaid.reduce((s: number, x: any) => s + (Number(x.amount) || 0) + (Number(x.lateFee) || 0), 0);
    const completed = stillUnpaid.length === 0;
    const anyOverdue = stillUnpaid.some((x: any) => now > x.dueAt + graceMs);
    const patch: Record<string, any> = {
      'bnpl.installments': next,
      'bnpl.status': completed ? 'completed' : anyOverdue ? 'overdue' : 'active',
      'bnpl.nextDueAt': stillUnpaid.length ? Math.min(...stillUnpaid.map((x: any) => x.dueAt)) : null,
      bnplOutstanding: outstanding,
    };
    if (completed) {
      patch.paymentVerified = true;
      patch.paymentVerifiedAt = sv;
      if (fo.status === 'pending') { patch.status = 'confirmed'; patch.confirmedAt = sv; }
    }
    tx.update(oref, patch);
    return { paid: amt, discount: disc, outstanding, status: patch['bnpl.status'] as string, completed };
  });
  return { ok: true, ...result };
});

// ─────────────────────────────────────────────────────────────────────────────
// BNPL — daily automation. Once a day it: (1) accrues a late fee on any unpaid
// installment past its grace period; (2) for autopay orders, debits due
// installments from the wallet while the balance allows; (3) recomputes each
// order's status/outstanding; (4) nudges the customer (reminder before due, on
// due, and when overdue) without spamming — each installment carries a
// remindStage so a given nudge fires once.
// ─────────────────────────────────────────────────────────────────────────────
async function bnplNotify(uid: string, title: string, body: string, orderId: string) {
  await dbf().collection('notifications').add({
    userId: uid, type: 'bnpl', title, body, link: `/orders/${orderId}`,
    read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }).catch(() => { /* best-effort */ });
}

export const bnplDailySweep = onSchedule(
  { schedule: 'every day 09:00', timeZone: 'Asia/Vientiane' },
  async () => {
    const settings = (await dbf().doc('settings/app').get()).data() || {};
    const cfg: any = { ...BNPL_FALLBACK, ...(settings.bnpl || {}) };
    const graceMs = (Number(cfg.graceDays) || 0) * DAY_MS;
    const lateFeePct = Number(cfg.lateFeePct) || 0;
    const now = Date.now();
    const sv = admin.firestore.FieldValue.serverTimestamp();

    const snap = await dbf().collection('orders').where('isBnpl', '==', true).get();
    for (const docSnap of snap.docs) {
      const o: any = docSnap.data();
      const bnpl = o.bnpl;
      if (!bnpl || bnpl.status === 'completed' || bnpl.status === 'cancelled') continue;
      const installments = (bnpl.installments || []).map((x: any) => ({ ...x }));
      let changed = false;

      // (1) accrue late fees once, per installment
      for (const inst of installments) {
        if (inst.status !== 'paid' && now > inst.dueAt + graceMs && !inst.lateFee && lateFeePct > 0) {
          inst.lateFee = Math.round((Number(inst.amount) * lateFeePct) / 100);
          changed = true;
        }
      }

      // (2) autopay due installments while the wallet covers them
      if (bnpl.autopay) {
        const [topups, spends] = await Promise.all([
          dbf().collection('walletTopups').where('uid', '==', o.customerId).where('status', '==', 'verified').get(),
          dbf().collection('walletSpends').where('uid', '==', o.customerId).get(),
        ]);
        let balance = topups.docs.reduce((s, x) => s + (Number(x.get('amount')) || 0), 0)
          - spends.docs.reduce((s, x) => s + (Number(x.get('amount')) || 0), 0);
        const due = installments.filter((x: any) => x.status !== 'paid' && now >= x.dueAt).sort((a: any, b: any) => a.dueAt - b.dueAt);
        for (const inst of due) {
          const amt = Number(inst.amount) + (Number(inst.lateFee) || 0);
          if (balance >= amt && amt > 0) {
            await dbf().collection('walletSpends').add({ uid: o.customerId, amount: amt, reason: 'bnplAutopay', refId: docSnap.id, createdAt: sv });
            inst.status = 'paid'; inst.paidAt = now; balance -= amt; changed = true;
          } else break;
        }
      }

      // (3) nudge — the earliest still-unpaid installment, once per stage
      const unpaidSorted = installments.filter((x: any) => x.status !== 'paid').sort((a: any, b: any) => a.dueAt - b.dueAt);
      const head = unpaidSorted[0];
      if (head) {
        const stage = Number(head.remindStage) || 0;
        const daysToDue = (head.dueAt - now) / DAY_MS;
        if (now > head.dueAt + graceMs && stage < 3) {
          head.remindStage = 3; changed = true;
          await bnplNotify(o.customerId, '⚠️ ງວດ ຜ່ອນ ຄ້າง ຊຳລະ', `ງວດ ${head.seq} ຄ້າง ຊຳລະ — ກະລຸນາ ຈ່າຍ ເພື່ອ ຫຼີກ ຄ່າ ປັບ ເພີ່ມ`, docSnap.id);
        } else if (now >= head.dueAt && stage < 2) {
          head.remindStage = 2; changed = true;
          await bnplNotify(o.customerId, '📅 ຮອດ ກຳນົດ ຊຳລະ ງວດ ຜ່ອນ', `ງວດ ${head.seq} ຮອດ ກຳນົດ ມື້ນີ້ · ${(Number(head.amount) + (Number(head.lateFee) || 0)).toLocaleString('en-US')} ກີບ`, docSnap.id);
        } else if (daysToDue > 0 && daysToDue <= 3 && stage < 1) {
          head.remindStage = 1; changed = true;
          await bnplNotify(o.customerId, '🔔 ໃກ້ ຄົບ ກຳນົດ ງວດ ຜ່ອນ', `ງວດ ${head.seq} ຄົບ ກຳນົດ ໃນ ${Math.ceil(daysToDue)} ວັນ`, docSnap.id);
        }
      }

      // (4) recompute + persist
      if (changed) {
        const unpaid = installments.filter((x: any) => x.status !== 'paid');
        const outstanding = unpaid.reduce((s: number, x: any) => s + (Number(x.amount) || 0) + (Number(x.lateFee) || 0), 0);
        const completed = unpaid.length === 0;
        const anyOverdue = unpaid.some((x: any) => now > x.dueAt + graceMs);
        const patch: Record<string, any> = {
          'bnpl.installments': installments,
          'bnpl.status': completed ? 'completed' : anyOverdue ? 'overdue' : 'active',
          'bnpl.nextDueAt': unpaid.length ? Math.min(...unpaid.map((x: any) => x.dueAt)) : null,
          bnplOutstanding: outstanding,
        };
        if (completed) {
          patch.paymentVerified = true;
          patch.paymentVerifiedAt = sv;
          if (o.status === 'pending') { patch.status = 'confirmed'; patch.confirmedAt = sv; }
          await bnplNotify(o.customerId, '✅ ຜ່ອນ ຄົບ ແລ້ວ', 'ຂໍ ຂອບໃຈ — ທ່ານ ຊຳລະ ຄ່າ ຜ່ອນ ຄົບ ຖ້ວນ ແລ້ວ', docSnap.id);
        }
        await docSnap.ref.update(patch);
      }
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Recurring maintenance (B2B) — daily sweep over maintenancePlans. On the due
// date it either auto-posts an open job (autoPost) or nudges the owner to post
// one, then rolls nextDueAt forward by the interval. A 7-days-before reminder
// fires once per cycle (remindedFor guard). Builds on the Asset Registry.
// ─────────────────────────────────────────────────────────────────────────────
export const maintenanceDailySweep = onSchedule(
  { schedule: 'every day 08:00', timeZone: 'Asia/Vientiane' },
  async () => {
    const now = Date.now();
    const sv = admin.firestore.FieldValue.serverTimestamp();
    const MONTH = 30 * DAY_MS;
    const snap = await dbf().collection('maintenancePlans').where('active', '==', true).limit(500).get();
    for (const docSnap of snap.docs) {
      const p: any = docSnap.data();
      const nextDueAt = tsMillis(p.nextDueAt) || (typeof p.nextDueAt === 'number' ? p.nextDueAt : 0);
      if (!nextDueAt || !p.ownerId) continue;
      const interval = Math.max(1, Number(p.intervalMonths) || 3);
      const title = String(p.title || 'ສ້อม ບຳรุง ประจำ');
      try {
        if (now >= nextDueAt) {
          if (p.autoPost === true) {
            const jobRef = dbf().collection('jobs').doc();
            await jobRef.set({
              customerId: p.ownerId,
              category: p.category || 'other',
              title,
              description: `ສ້อม ບຳรุง ประจำ (ທຸກ ${interval} ເດືອນ)${p.note ? ' — ' + p.note : ''}`,
              status: 'open', bidCount: 0,
              ...(p.siteId ? { siteId: p.siteId } : {}),
              ...(p.assetId ? { assetId: p.assetId } : {}),
              maintenancePlanId: docSnap.id,
              closeAt: now + 7 * DAY_MS, createdAt: sv,
            });
            await dbf().collection('notifications').add({ userId: p.ownerId, type: 'maintenance', title: '🔁 ໂພສ ງານ ບຳรุง ໃຫ້ ແລ້ວ', body: `${title} — ຮອດ ຮอบ, ໂພສ ຫາ ຊ່າງ ໃຫ້ ອັດຕะโนมัต`, link: `/jobs/${jobRef.id}`, read: false, createdAt: sv });
          } else {
            await dbf().collection('notifications').add({ userId: p.ownerId, type: 'maintenance', title: '🔔 ຮອດ ຮอบ ບຳรุง', body: `${title} — ຮອດ ກຳນົດ ແລ້ວ, ໂພສ ຫາ ຊ່າງ ໄດ້ ເລີຍ`, link: '/maintenance', read: false, createdAt: sv });
          }
          // roll forward from the due date (not "now") so the cycle doesn't drift
          let next = nextDueAt;
          while (next <= now) next += interval * MONTH;
          await docSnap.ref.update({ nextDueAt: next, remindedFor: admin.firestore.FieldValue.delete() });
        } else if (now >= nextDueAt - 7 * DAY_MS && p.remindedFor !== nextDueAt) {
          await dbf().collection('notifications').add({ userId: p.ownerId, type: 'maintenance', title: '🔔 ໃກ້ ຮອດ ຮอบ ບຳรุง', body: `${title} — ຄົບ ກຳນົດ ໃນ 7 ວັນ`, link: '/maintenance', read: false, createdAt: sv });
          await docSnap.ref.update({ remindedFor: nextDueAt });
        }
      } catch (e) { console.error('maintenance sweep', e); }
    }
  },
);

// B2B — a team member joins a company by its invite code (server-side so a
// non-member can add ONLY their own uid without needing to read the org first).
export const joinOrg = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ຕ້ອງ ເຂົ້າ ລະບົບ');
  const code = String(req.data?.code || '').trim().toUpperCase();
  if (code.length < 4) throw new HttpsError('invalid-argument', 'ລະຫັດ ບໍ່ ຖືກຕ້ອງ');
  const snap = await dbf().collection('orgs').where('inviteCode', '==', code).limit(1).get();
  if (snap.empty) throw new HttpsError('not-found', 'ບໍ່ ພົບ ບໍລິສัท ຕາມ ລະຫັດ ນີ້');
  const org = snap.docs[0];
  await org.ref.update({ memberUids: admin.firestore.FieldValue.arrayUnion(uid) });
  return { ok: true, orgName: org.get('name') || '' };
});

// order freshly cancelled → restore soldCount + stock for its items
export const onOrderCancelled = onDocumentUpdated('orders/{id}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (before.status === 'cancelled' || after.status !== 'cancelled') return;
  const items = await dbf().collection('orderItems').where('orderId', '==', event.params.id).get();
  await Promise.all(items.docs.map(async (d) => {
    const it = d.data();
    if (it.restored) return; // already given back
    const productId = it.productId;
    const qty = Number(it.quantity) || 0;
    if (!productId || !qty) return;
    const pRef = dbf().doc(`products/${productId}`);
    const p = await pRef.get();
    if (p.exists) {
      const upd: Record<string, any> = { soldCount: inc(-qty) };
      if (typeof p.get('stock') === 'number') upd.stock = inc(qty);
      await pRef.set(upd, { merge: true }).catch(() => {});
    }
    // stamp the line so deleting the order later can't restore it a second time
    await d.ref.set({ restored: true }, { merge: true }).catch(() => {});
  }));
});

// ─────────────────────────────────────────────────────────────────────────────
// RIDER JOB ALERTS — fan a "new delivery job" notification out to every
// approved + active rider, SERVER-SIDE. Previously the ordering customer listed
// the whole `riders` collection client-side to do this, which forced `riders`
// to be world-readable and leaked every rider's phone / licence / plate. Now
// the customer writes nothing about riders; this trigger (admin SDK) reads them
// and writes one notification each, and the `riders` read rule is locked to
// owner + admin. onNotificationCreated then delivers the push.
// ─────────────────────────────────────────────────────────────────────────────
const RIDER_PLATFORM_FEE_RATE = 0.1; // mirrors PLATFORM_FEE_RATE in lib/wallet.ts

async function alertRidersOfTask(task: Record<string, any>): Promise<void> {
  const fee = Number(task.fee) || 0;
  const net = Math.round(fee * (1 - RIDER_PLATFORM_FEE_RATE));
  const drop = task.dropoffAddress ? String(task.dropoffAddress) : '';
  const riders = await dbf().collection('riders').get();
  const targets = riders.docs.filter((d) => {
    const r = d.data();
    return r.approved === true && r.active !== false;
  });
  await Promise.all(targets.map((d) =>
    dbf().collection('notifications').add({
      userId: d.id,
      type: 'delivery_new',
      title: `🛵 ມີງານສົ່ງໃໝ່ ${net.toLocaleString()} ₭`,
      body: drop ? `ສົ່ງໄປ: ${drop}` : 'ເປີດ ຄິວ ຈັດສົ່ງ ເພື່ອ ຮັບ ງານ',
      link: '/rider',
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => { /* best-effort — one bad alert must not break the order */ })
  ));
}

// A new task lands in the OPEN queue (COD orders are open immediately) → alert
// riders now. Payment-held tasks (non-COD) wait for release, below.
export const onDeliveryTaskCreated = onDocumentCreated('deliveryTasks/{id}', async (event) => {
  const t = event.data?.data();
  if (!t) return;
  if (t.status !== 'open' || t.heldForPayment === true) return;
  await alertRidersOfTask(t);
});

// A payment-held task is released into the queue (heldForPayment true→false and
// still open) → alert riders then, since they couldn't see it at creation.
export const onDeliveryTaskReleased = onDocumentUpdated('deliveryTasks/{id}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (before.heldForPayment === true && after.heldForPayment !== true && after.status === 'open') {
    await alertRidersOfTask(after);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// JOB CONTACTS — the invoice / handover screens need the COUNTERPARTY's name +
// phone, but `users` is no longer readable cross-user. This callable returns
// both parties' name+phone ONLY to a genuine party of the job (its customer or
// assigned technician), reading the private users docs with the admin SDK.
// Nothing is written to a client-readable doc, so phones never leak via
// jobs/bids/cards.
// ─────────────────────────────────────────────────────────────────────────────
export const getJobContacts = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'sign-in required');
  const jobId = String(req.data?.jobId || '');
  if (!jobId) throw new HttpsError('invalid-argument', 'jobId required');
  const jobSnap = await dbf().doc(`jobs/${jobId}`).get();
  if (!jobSnap.exists) throw new HttpsError('not-found', 'job not found');
  const job = jobSnap.data() as Record<string, any>;
  const customerId: string | undefined = job.customerId;
  const techId: string | undefined = job.assignedProviderId;
  if (uid !== customerId && uid !== techId) {
    throw new HttpsError('permission-denied', 'not a party to this job');
  }
  const nameOf = (u: any) => u?.name || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || '';
  const load = async (id?: string) => {
    if (!id) return null;
    const s = await dbf().doc(`users/${id}`).get();
    if (!s.exists) return null;
    const u = s.data() as any;
    return { name: nameOf(u), phone: u.phone || null };
  };
  const [customer, tech] = await Promise.all([load(customerId), load(techId)]);
  return { customer, tech };
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC JOB CARDS — privacy projection of the job feed.
// `jobs` is now readable only when signed in, because a job doc carries the
// poster's name, full address and EXACT coordinates (and users sometimes type a
// phone into the description) — all of which a logged-out visitor could harvest
// in bulk from the world-readable collection. The Explore tab + map browse this
// world-readable projection instead, which keeps only showcase-safe fields:
// coarse area (district/province), coordinates rounded to ~1 km, and free text
// with phone-like runs scrubbed. Written ONLY here, so it can't be tampered with.
// ─────────────────────────────────────────────────────────────────────────────
function coarseArea(address?: string): string {
  const parts = String(address || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(1).join(' · ');
  const one = parts[0] || '';
  return /ເມືອງ|ນະຄອນຫຼວງ|ແຂວງ/.test(one) ? one : '';
}
function scrubPhones(s?: string): string {
  return String(s || '').replace(/\+?\d[\d\s-]{6,}\d/g, '…'); // mask any typed phone run
}
const round2 = (n: any): number | undefined => (typeof n === 'number' ? Math.round(n * 100) / 100 : undefined);

// Build the safe card, OMITTING absent fields (matching the original job shape —
// clients guard with `!== undefined`, so a stored `null` would slip past the
// guard and crash e.g. budget.toLocaleString()).
function buildJobCard(id: string, a: any): Record<string, any> {
  const c: Record<string, any> = {
    jobId: id,
    title: scrubPhones(a.title || ''),
    category: a.category || '',
    status: a.status || 'open',
    bidCount: a.bidCount ?? 0,
    surveyRequested: a.surveyRequested ?? false,
    urgent: a.urgent === true,
    photos: Array.isArray(a.photos) ? a.photos : [],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (a.customerId) c.customerId = a.customerId;           // opaque uid — for "exclude my own"
  const desc = scrubPhones(a.description); if (desc) c.description = desc;
  if (typeof a.budget === 'number') c.budget = a.budget;
  const area = scrubPhones(coarseArea(a.address)); if (area) c.area = area; // district/province, phones masked
  const la = round2(a.lat); if (la !== undefined) c.lat = la; // ~1 km, never the exact pin
  const ln = round2(a.lng); if (ln !== undefined) c.lng = ln;
  if (a.closeAt != null) c.closeAt = a.closeAt;
  if (a.createdAt != null) c.createdAt = a.createdAt;
  return c;
}

export const onJobWritten = onDocumentWritten('jobs/{id}', async (event) => {
  const id = event.params.id;
  const after = event.data?.after?.data();
  if (!after) { await dbf().doc(`jobCards/${id}`).delete().catch(() => {}); return; }
  // full replace (no merge) so a field removed on the job also leaves the card
  await dbf().doc(`jobCards/${id}`).set(buildJobCard(id, after)).catch(() => {});

  // ── Urgent job → instant-alert technicians ─────────────────────────────────
  // Fires once, when a job BECOMES urgent + open (fresh post, or flipped urgent).
  // The urgent fee (customer-paid) is the throttle against over-broadcasting.
  try {
    const before = event.data?.before?.data();
    const becameUrgent = after.urgent === true && after.status === 'open'
      && !(before && before.urgent === true && before.status === 'open');
    if (becameUrgent) {
      // technicians = users whose account groups include 'technician' (capped)
      const techs = await dbf().collection('users').where('userGroups', 'array-contains', 'technician').limit(80).get();
      const title = '🚨 ງານ ດ່ວນ ໃໝ່';
      const area = coarseArea(after.address) || '';
      const body = `${scrubPhones(after.title || 'ງານ ດ່ວນ')}${area ? ` · ${area}` : ''} — ຮັບ ດ່ວນ ໄດ້ ເລີຍ`;
      const batch = dbf().batch();
      let n = 0;
      techs.docs.forEach((t) => {
        if (t.id === after.customerId) return; // don't ping the poster
        batch.set(dbf().collection('notifications').doc(), {
          userId: t.id, type: 'job_urgent', title, body, link: `/jobs/${id}`,
          read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        n++;
      });
      if (n > 0) await batch.commit();
    }
  } catch (e) { console.error('urgent notify', e); }

  // ── Refundable survey-fee settlement (prepay) ──────────────────────────────
  // A job that COLLECTED a prepaid survey fee settles ONCE when it reaches a
  // terminal state: completed → refund the customer's wallet (they proceeded);
  // customer-cancelled with a tech already assigned → forfeit to that tech (paid
  // for the trip); any other end (tech/admin cancel, or no tech yet) → refund
  // the customer. Writing surveyFeeSettled below re-fires this trigger, but the
  // `!settled` + status-changed guards make the second pass a no-op.
  try {
    const before = event.data?.before?.data();
    const fee = Math.round(Number(after.surveyFee) || 0);
    const paid = after.surveyFeePaid === true && fee > 0;
    const settled = !!after.surveyFeeSettled;
    const terminal = after.status === 'completed' || after.status === 'cancelled';
    const justEnded = terminal && before?.status !== after.status;
    if (paid && !settled && justEnded) {
      const forfeit = after.status === 'cancelled'
        && after.cancelledBy === 'customer'
        && !!after.assignedProviderId;
      if (forfeit) {
        await dbf().collection('walletTransactions').add({
          uid: after.assignedProviderId, type: 'adjustment', amount: fee,
          reason: 'ຄ່າ ສຳຫຼວດ ໜ້າ ງານ (ລູກຄ້າ ຍົກເລີກ)', jobId: id,
          status: 'completed', createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await event.data!.after!.ref.update({ surveyFeeSettled: 'forfeited' });
      } else {
        await dbf().collection('walletTopups').add({
          uid: after.customerId, amount: fee, status: 'verified', byAdmin: true,
          note: after.status === 'completed' ? 'ຄືນ ຄ່າ ສຳຫຼວດ (ດຳເນີນ ງານ)' : 'ຄືນ ຄ່າ ສຳຫຼວດ (ຍົກເລີກ)',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await event.data!.after!.ref.update({ surveyFeeSettled: 'refunded' });
      }
    }
  } catch (e) { console.error('survey-fee settle', e); }

  // ── Auto-invoice a company job on completion (B2B phase 4) ─────────────────
  // When a job on a company building (its site carries orgId) reaches
  // 'completed', raise an orgInvoice once so the facility manager is billed
  // automatically on the company's default terms. Guarded by the job's
  // orgInvoiced flag (writing it re-fires this trigger → second pass is a no-op).
  try {
    const before = event.data?.before?.data();
    const justCompleted = after.status === 'completed' && before?.status !== 'completed';
    const amount = Math.round(Number(after.finalPrice) || 0);
    if (justCompleted && after.siteId && amount > 0 && after.orgInvoiced !== true) {
      const siteSnap = await dbf().doc(`sites/${after.siteId}`).get();
      const site = siteSnap.data();
      const orgId = site?.orgId;
      if (orgId) {
        const orgSnap = await dbf().doc(`orgs/${orgId}`).get();
        const terms = orgSnap.data()?.defaultTerms || 'net30';
        const days = terms === 'prepay' ? 0 : terms === 'net15' ? 15 : terms === 'net60' ? 60 : 30;
        const now = Date.now();
        await dbf().collection('orgInvoices').add({
          orgId,
          number: `INV-${id.slice(0, 6).toUpperCase()}`,
          title: after.title || 'ວຽก ສຳ ເລັດ',
          amount,
          category: after.category || null,
          siteId: after.siteId,
          siteName: site?.name || null,
          terms,
          status: 'sent',
          issuedAt: now,
          dueAt: now + days * 86400000,
          sourceType: 'job',
          sourceId: id,
          createdBy: 'system',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await event.data!.after!.ref.update({ orgInvoiced: true });
        // notify the company owner + the job customer
        try {
          const ownerId = orgSnap.data()?.ownerId;
          const notify = [ownerId, after.customerId].filter((u, i, a) => u && a.indexOf(u) === i);
          const batch = dbf().batch();
          notify.forEach((uid: string) => batch.set(dbf().collection('notifications').doc(), {
            userId: uid, type: 'org_invoice', title: '🧾 ໃບ ບິນ ໃໝ່ (ບໍລິສัท)',
            body: `${scrubPhones(after.title || 'ວຽก ສຳ ເລັດ')} — ${amount.toLocaleString()} ກີບ`,
            link: '/billing', read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
          }));
          await batch.commit();
        } catch (e) { console.error('org invoice notify', e); }
      }
    }
  } catch (e) { console.error('org auto-invoice', e); }
});

// ── B2B: auto-invoice a company ORDER on completion ──────────────────────────
// An order tagged with orgId (bought "in the name of the company" at checkout)
// raises an orgInvoice once when it is delivered/completed — but ONLY if the
// buyer actually belongs to that company (guards against billing a stranger's
// org). Guarded by the order's orgInvoiced flag.
export const onOrderWritten = onDocumentWritten('orders/{id}', async (event) => {
  const id = event.params.id;
  const after = event.data?.after?.data();
  if (!after) return;
  try {
    const before = event.data?.before?.data();
    const doneNow = (after.status === 'delivered' || after.status === 'completed')
      && before?.status !== 'delivered' && before?.status !== 'completed';
    const amount = Math.round(Number(after.grandTotal) || 0);
    if (doneNow && after.orgId && amount > 0 && after.orgInvoiced !== true) {
      const orgSnap = await dbf().doc(`orgs/${after.orgId}`).get();
      const org = orgSnap.data();
      const members: string[] = Array.isArray(org?.memberUids) ? org!.memberUids : [];
      if (org && members.includes(after.customerId)) {
        const terms = org.defaultTerms || 'net30';
        const days = terms === 'prepay' ? 0 : terms === 'net15' ? 15 : terms === 'net60' ? 60 : 30;
        const now = Date.now();
        await dbf().collection('orgInvoices').add({
          orgId: after.orgId,
          number: `INV-${String(after.orderNumber || id).slice(-6).toUpperCase()}`,
          title: `ສັ່ງ ຊື້ ສິນຄ້າ${after.orderNumber ? ' #' + after.orderNumber : ''}`,
          amount, category: 'ສິນຄ້າ', terms, status: 'sent',
          issuedAt: now, dueAt: now + days * DAY_MS,
          sourceType: 'order', sourceId: id, createdBy: 'system',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await event.data!.after!.ref.update({ orgInvoiced: true });
        try {
          const notify = [org.ownerId, after.customerId].filter((u: string, i: number, a: string[]) => u && a.indexOf(u) === i);
          const batch = dbf().batch();
          notify.forEach((u: string) => batch.set(dbf().collection('notifications').doc(), {
            userId: u, type: 'org_invoice', title: '🧾 ໃບ ບິນ ໃໝ່ (ບໍລິສัท)',
            body: `${after.orderNumber ? '#' + after.orderNumber + ' ' : ''}— ${amount.toLocaleString()} ກີບ`,
            link: '/billing', read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
          }));
          await batch.commit();
        } catch (e) { console.error('order invoice notify', e); }
      }
    }
  } catch (e) { console.error('order auto-invoice', e); }
});

// ── MK Plan: auto-metrics (server-side; marketing users can't read orders) ───
// Computes top-line numbers a marketing-role user cannot read directly (GMV,
// completed orders/jobs, users) via the admin SDK and writes them to
// mkMetrics/auto. Runs daily + on-demand (refreshMkAutoMetrics callable).
async function computeMkAuto() {
  const db = dbf();
  const now = Date.now();
  const monthAgo = admin.firestore.Timestamp.fromMillis(now - 30 * DAY_MS);
  const cnt = (p: Promise<any>) => p.then((s) => s.data().count).catch(() => 0);
  const [users, jobsDone, ordersDone] = await Promise.all([
    cnt(db.collection('users').count().get()),
    cnt(db.collection('jobs').where('status', '==', 'completed').count().get()),
    cnt(db.collection('orders').where('status', 'in', ['delivered', 'completed']).count().get()),
  ]);
  // 30-day GMV — query by createdAt only (single-field, no composite index),
  // filter status in code, cap the read.
  let gmv30dKip = 0, orders30d = 0;
  try {
    const snap = await db.collection('orders').where('createdAt', '>=', monthAgo).limit(5000).get();
    snap.forEach((d) => { const o = d.data(); if (o.status === 'delivered' || o.status === 'completed') { gmv30dKip += Number(o.grandTotal) || 0; orders30d++; } });
  } catch (e) { console.error('mkAuto gmv', e); }
  return { users, jobsDone, ordersDone, gmv30dKip, orders30d, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
}

export const mkAutoMetricsDailySweep = onSchedule(
  { schedule: 'every day 06:00', timeZone: 'Asia/Vientiane' },
  async () => { try { await dbf().doc('mkMetrics/auto').set(await computeMkAuto(), { merge: true }); } catch (e) { console.error('mkAutoMetrics sweep', e); } },
);

export const refreshMkAutoMetrics = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ຕ້ອງ ເຂົ້າ ສູ່ ລະບົບ');
  const u: any = (await dbf().doc(`users/${uid}`).get()).data() || {};
  const g: string[] = Array.isArray(u.userGroups) ? u.userGroups : [];
  const r: string[] = Array.isArray(u.roles) ? u.roles : [];
  const ok = u.isSuperAdmin || g.includes('marketing') || g.includes('admin') || r.includes('marketing') || r.includes('admin');
  if (!ok) throw new HttpsError('permission-denied', 'ບໍ່ ມີ ສິດ');
  const data = await computeMkAuto();
  await dbf().doc('mkMetrics/auto').set(data, { merge: true });
  return { ok: true };
});

// ── MK Plan: scheduled-post reminders ────────────────────────────────────────
// Each morning, notify the marketing team about content in 'scheduled' status
// that is due within 48h (or already overdue). Guarded per-post by `reminded`.
export const mkPostReminderSweep = onSchedule(
  { schedule: 'every day 07:00', timeZone: 'Asia/Vientiane' },
  async () => {
    try {
      const now = Date.now();
      const soon = now + 2 * DAY_MS;
      // equality-only query (no composite index); window + reminded filtered in code
      const snap = await dbf().collection('mkContent').where('status', '==', 'scheduled').limit(200).get();
      const due = snap.docs.filter((d) => { const c = d.data(); return !c.reminded && Number(c.date || 0) <= soon; });
      if (due.length === 0) return;
      // marketing team = users whose RBAC roles include 'marketing' (isMarketing
      // in firestore.rules reads the same `roles` field, not userGroups)
      const mk = await dbf().collection('users').where('roles', 'array-contains', 'marketing').limit(50).get();
      const batch = dbf().batch();
      for (const d of due) {
        const c = d.data();
        const overdue = Number(c.date || 0) < now;
        mk.docs.forEach((u) => batch.set(dbf().collection('notifications').doc(), {
          userId: u.id, type: 'mk_post_due',
          title: overdue ? '📣 ໂພສ ຮອດ ຄິວ ແລ້ວ' : '📣 ໂພສ ໃກ້ ຮອດ ຄິວ',
          body: scrubPhones(String(c.title || 'ໂພສ')), link: '/mk',
          read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }));
        batch.update(d.ref, { reminded: true });
      }
      await batch.commit();
    } catch (e) { console.error('mk post reminder', e); }
  },
);

/** One-time projection of the existing jobs (the trigger only fires on future
 *  writes). Super-admin only. */
export const backfillJobCards = onCall(async (req) => {
  await assertSuperAdmin(req);
  const snap = await dbf().collection('jobs').get();
  let n = 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = dbf().batch();
    for (const d of snap.docs.slice(i, i + 400)) {
      batch.set(dbf().doc(`jobCards/${d.id}`), buildJobCard(d.id, d.data()));
      n++;
    }
    await batch.commit();
  }
  return { ok: true, count: n };
});

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS — created server-side.
// A notification becomes a real push (onNotificationCreated fans it out to the
// recipient's FCM tokens), so letting clients write the collection directly meant
// any signed-in user could script one addDoc per uid and put an official-looking
// HomeSang push on every phone. Clients now go through this callable: the doc is
// written with the admin SDK, always stamped with the true sender, and rate
// limited per sender so a mass-spoof run is cut off after a few dozen.
// ─────────────────────────────────────────────────────────────────────────────
const NOTIF_PER_HOUR = 120; // generous: real flows notify a handful per action

export const sendNotification = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ຕ້ອງ ເຂົ້າ ສູ່ ລະບົບ ກ່ອນ');

  const userId = String(req.data?.userId || '').trim();
  const title = String(req.data?.title || '').trim();
  const body = String(req.data?.body || '').trim();
  const link = String(req.data?.link || '').trim();
  const type = String(req.data?.type || 'workflow').trim();

  if (!userId || !title) throw new HttpsError('invalid-argument', 'ຂໍ້ມູນ ບໍ່ ຄົບ');
  if (title.length > 200 || body.length > 1000) throw new HttpsError('invalid-argument', 'ຂໍ້ຄວາມ ຍາວ ເກີນ');
  // internal app routes only — never an external URL (phishing)
  if (link && !/^\/[^/]/.test(link)) throw new HttpsError('invalid-argument', 'ລິ້ງ ຕ້ອງ ເປັນ ເສັ້ນທາງ ພາຍໃນ ແອັບ');

  // per-sender hourly cap (admins exempt)
  const me = (await dbf().doc(`users/${uid}`).get()).data() || {};
  if (me.isSuperAdmin !== true && !(me.roles || []).includes('admin')) {
    const bucket = Math.floor(Date.now() / 3_600_000);
    const rateRef = dbf().doc(`notifRate/${uid}`);
    const allowed = await dbf().runTransaction(async (tx) => {
      const s = await tx.get(rateRef);
      const d = s.data() || {};
      const count = d.bucket === bucket ? Number(d.count) || 0 : 0;
      if (count >= NOTIF_PER_HOUR) return false;
      tx.set(rateRef, { bucket, count: count + 1, updatedAt: Date.now() }, { merge: true });
      return true;
    });
    if (!allowed) throw new HttpsError('resource-exhausted', 'ສົ່ງ ແຈ້ງເຕືອນ ຫຼາຍ ເກີນ — ລອງ ໃໝ່ ພາຍຫຼັງ');
  }

  const payload: Record<string, any> = {
    userId,
    fromUid: uid,
    type,
    title,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (body) payload.body = body;
  if (link) payload.link = link;
  await dbf().collection('notifications').add(payload);
  return { ok: true };
});

// ─────────────────────────────────────────────────────────────────────────────
// LOYALTY POINTS — server-held ledger.
// The spendable balance used to be derived on the client from the buyer's own
// orders, and Firestore rules cannot aggregate across documents, so two
// checkouts sent close together could each redeem the whole balance. Now:
//   loyaltyLedger/{uid}.earned  — written ONLY here (client cannot inflate it)
//   loyaltySpend/{uid}.spent    — client increments inside a transaction; the
//                                 rules refuse any value above ledger.earned
// so concurrent redemptions contend on one document and the second one fails
// instead of double-spending.
// ─────────────────────────────────────────────────────────────────────────────
async function recomputeLoyaltyLedger(customerId: string): Promise<void> {
  const settings = (await dbf().doc('settings/app').get()).data() || {};
  const earnPct = Number(settings.loyaltyEarnPct) || 0;
  const mine = await dbf().collection('orders').where('customerId', '==', customerId).get();
  let earned = 0;
  let redeemed = 0;
  mine.forEach((d) => {
    const r: any = d.data();
    if (r.status === 'cancelled') return; // a cancelled order returns its points
    if (r.status === 'delivered' || r.status === 'completed') {
      const base = Math.max(0, (Number(r.subtotal) || 0) - (Number(r.pointsRedeemed) || 0));
      if (earnPct > 0 && base > 0) earned += Math.floor((base * earnPct) / 100);
    }
    redeemed += Number(r.pointsRedeemed) || 0;
  });
  await dbf().doc(`loyaltyLedger/${customerId}`).set(
    { uid: customerId, earned, redeemed, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  ).catch(() => {});
  // Reconcile the client-incremented reservation total against the orders that
  // actually exist: this is what gives back points reserved for a checkout that
  // failed, and what returns points when an order is cancelled. Clients may only
  // ever increase `spent`, so this is the sole way it comes back down.
  await dbf().doc(`loyaltySpend/${customerId}`).set(
    { uid: customerId, spent: redeemed, updatedAt: Date.now() },
    { merge: true },
  ).catch(() => {});
}

/** Keep the ledger in step whenever an order appears / changes status / is removed. */
export const onOrderLoyaltyLedger = onDocumentWritten('orders/{id}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const customerId = (after?.customerId ?? before?.customerId) as string | undefined;
  if (!customerId) return;
  // only recompute when something that affects earning changed
  if (before && after && before.status === after.status && before.subtotal === after.subtotal) return;
  await recomputeLoyaltyLedger(customerId);
});

// order line DELETED (admin 🗑️ / sample purge) → give the stock + soldCount back.
// deleteOrder removes the order and its items outright, which never triggers
// onOrderCancelled, so without this the product stayed permanently short by the
// ordered quantity with no order left to reconcile against. Lines already
// restored by a cancellation carry `restored` and are skipped, so an order that
// is cancelled first and deleted afterwards is only ever given back once.
export const onOrderItemDeleted = onDocumentDeleted('orderItems/{id}', async (event) => {
  const it = event.data?.data();
  if (!it || it.restored) return;
  const productId = it.productId;
  const qty = Number(it.quantity) || 0;
  if (!productId || !qty) return;
  const pRef = dbf().doc(`products/${productId}`);
  const p = await pRef.get();
  if (!p.exists) return;
  const upd: Record<string, any> = { soldCount: inc(-qty) };
  if (typeof p.get('stock') === 'number') upd.stock = inc(qty);
  await pRef.set(upd, { merge: true }).catch(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// Twilio phone-OTP (Verify) — verifies a phone at SIGN-UP without reCAPTCHA.
// Credentials are configured by a super-admin in the back-office and stored in
// `secureConfig/otp` (super-admin read/write only — never client-public). These
// functions read that config with the admin SDK (bypasses rules). Account
// creation happens HERE, only after the code is approved, so the OTP genuinely
// gates sign-up; the client then signs in with the returned custom token. Phone
// accounts keep the email/password model (synthetic {digits}@homesang.local) so
// existing password sign-in still works.
// ─────────────────────────────────────────────────────────────────────────────
function phoneToEmail(phone: string): string {
  return `${String(phone).replace(/\D/g, '')}@homesang.local`;
}
function toE164(phone: string): string {
  const d = String(phone).replace(/[^\d+]/g, '');
  return d.startsWith('+') ? d : '+' + d.replace(/^0+/, '');
}
async function twilioConfig(): Promise<{ accountSid: string; authToken: string; messagingSid: string }> {
  const snap = await dbf().doc('secureConfig/otp').get();
  const c = snap.data() || {};
  const accountSid = String(c.twilioAccountSid || '').trim();
  const authToken = String(c.twilioAuthToken || '').trim();
  const messagingSid = String(c.twilioMessagingSid || '').trim();
  if (!accountSid || !authToken || !messagingSid) {
    throw new HttpsError('failed-precondition', 'Twilio ຍັງ ບໍ່ ໄດ້ ຕັ້ງຄ່າ ຄົບ (ຫຼັງບ້ານ → ຕັ້ງຄ່າ OTP)');
  }
  if (!accountSid.startsWith('AC')) {
    throw new HttpsError('failed-precondition', 'Account SID ຕ້ອງ ຂຶ້ນຕົ້ນ ດ້ວຍ AC (ໃສ່ ຄ່າ ຜິດ ຊ່ອງ?)');
  }
  if (!messagingSid.startsWith('MG')) {
    throw new HttpsError('failed-precondition', 'Messaging Service SID ຕ້ອງ ຂຶ້ນຕົ້ນ ດ້ວຍ MG (ຈາກ Messaging → Services)');
  }
  return { accountSid, authToken, messagingSid };
}

// ── self-managed OTP over Twilio Programmable SMS (fully custom Lao message) ──
// We generate the code, store only its hash (secureConfig-style otpCodes doc,
// admin-SDK only), and SMS it via the Messaging Service. This replaces Twilio
// Verify so the message body can be 100% Lao.
const DEFAULT_OTP_TEMPLATE = 'HomeSang: ລະຫັດ ຢືນຢັນ ຂອງ ທ່ານ ແມ່ນ {code} — ໃຊ້ ໄດ້ 5 ນາທີ, ຫ້າມ ບອກ ຜູ້ ອື່ນ.';
function genCode(): string { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }
function hashCode(phone: string, code: string): string {
  return crypto.createHash('sha256').update(`${canonKey(phone)}:${code}`).digest('hex');
}
async function sendSms(to: string, body: string): Promise<void> {
  const { accountSid, authToken, messagingSid } = await twilioConfig();
  const twilio = require('twilio');
  try { await twilio(accountSid, authToken).messages.create({ to, messagingServiceSid: messagingSid, body }); }
  catch (e: any) { throw twilioHttpsError(e); }
}
/** Generate + store (hashed) a code and SMS it in Lao. Rate-limited to 1 / 30s. */
async function issueOtp(phone: string): Promise<void> {
  const ref = dbf().doc(`otpCodes/${canonKey(phone)}`);
  const now = Date.now();
  const existing = await ref.get();
  if (existing.exists && now - Number(existing.data()?.createdAt || 0) < 30000) {
    throw new HttpsError('resource-exhausted', 'ຫາ ກໍ ສົ່ງ ໄປ — ລໍ 30 ວິນາທີ ກ່ອນ ຂໍ ໃໝ່');
  }
  const code = genCode();
  await ref.set({ hash: hashCode(phone, code), expiresAt: now + 5 * 60 * 1000, attempts: 0, createdAt: now });
  // admin-editable Lao message template ({code} = where the 6 digits go). If the
  // admin's text omits {code}, append it so a code is always sent.
  const cfg = (await dbf().doc('secureConfig/otp').get()).data() || {};
  const tmpl = String(cfg.otpMessageTemplate || '').trim() || DEFAULT_OTP_TEMPLATE;
  const body = tmpl.includes('{code}') ? tmpl.replace(/\{code\}/g, code) : `${tmpl} ${code}`;
  await sendSms(phone, body);
}
/** Verify a code: checks hash, expiry, and attempt count; consumes on success. */
async function checkOtp(phone: string, code: string): Promise<boolean> {
  const ref = dbf().doc(`otpCodes/${canonKey(phone)}`);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const d = snap.data() as any;
  if (Date.now() > Number(d.expiresAt || 0)) { await ref.delete().catch(() => {}); return false; }
  if (Number(d.attempts || 0) >= 5) { await ref.delete().catch(() => {}); return false; }
  if (d.hash !== hashCode(phone, code)) { await ref.update({ attempts: Number(d.attempts || 0) + 1 }).catch(() => {}); return false; }
  await ref.delete().catch(() => {}); // consume on success
  return true;
}

// Canonical Lao-mobile digit key (mirrors the client normalizeLaoPhone): every
// stored format — 55597299 / 02055597299 / 2055597299 / +8562055597299 — maps to
// the same "8562055597299", so duplicate detection is format-independent.
function canonKey(raw?: string | null): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('856')) return d;
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 8) d = '20' + d;
  return '856' + d;
}

/** Any Firebase Auth user for this phone — matched by E.164 phoneNumber first
 *  (covers legacy phone-auth accounts whose email isn't the canonical synthetic),
 *  then by the synthetic email, then by the phone stored in the Firestore users
 *  profile (covers EMAIL-signup accounts that list a phone but have no Auth
 *  phoneNumber). Lets password reset by phone work for email accounts too. */
async function findAuthPhoneUser(e164: string) {
  const byPhone = await admin.auth().getUserByPhoneNumber(e164).catch(() => null);
  if (byPhone) return byPhone;
  const byEmail = await admin.auth().getUserByEmail(phoneToEmail(e164)).catch(() => null);
  if (byEmail) return byEmail;
  const key = canonKey(e164);
  const snap = await dbf().collection('users').get();
  for (const d of snap.docs) {
    if (canonKey((d.data() as any).phone) === key) {
      const u = await admin.auth().getUser(d.id).catch(() => null); // users doc id = Auth uid
      if (u) return u;
    }
  }
  return null;
}

/** True if the phone already belongs to ANY account — Auth (phone/email) OR a
 *  legacy Firestore users doc stored in any format. The users collection is
 *  small, so the scan is cheap and catches non-canonical legacy records that a
 *  getUserByEmail lookup alone would miss. */
async function phoneRegistered(e164: string): Promise<boolean> {
  if (await findAuthPhoneUser(e164)) return true;
  const key = canonKey(e164);
  const snap = await dbf().collection('users').get();
  return snap.docs.some((d) => canonKey((d.data() as any).phone) === key);
}

/** Map a Twilio REST error to a clear HttpsError (so the client shows a useful
 *  message instead of a generic 500). */
function twilioHttpsError(e: any): HttpsError {
  const code = e?.code;
  const status = e?.status;
  if (code === 20003 || status === 401) return new HttpsError('failed-precondition', 'Twilio auth ບໍ່ ຖືກ — ກວດ Account SID / Auth Token (ຫຼັງບ້ານ → ຕັ້ງຄ່າ OTP)');
  if (code === 20404) return new HttpsError('failed-precondition', 'Messaging Service SID ບໍ່ ຖືກ — ໃສ່ ຄ່າ ທີ່ ຂຶ້ນຕົ້ນ ດ້ວຍ MG…');
  if (code === 21211 || code === 21614 || code === 21604) return new HttpsError('invalid-argument', 'ເບີ ໂທ ບໍ່ ຖືກ ຮູບແບບ ສຳລັບ Twilio');
  if (code === 21408 || code === 21610 || code === 21612 || code === 63033) return new HttpsError('failed-precondition', 'Twilio ບໍ່ ອະນຸຍາດ ສົ່ງ ໄປ ປະເທດ ນີ້ (Geo Permissions) ຫຼື Messaging Service ບໍ່ ມີ sender/ເບີ ສົ່ງ');
  return new HttpsError('internal', 'ສົ່ງ SMS ບໍ່ ສຳເລັດ (Twilio ' + (code || status || '?') + '): ' + (e?.message || 'unknown'));
}

/** Send an OTP SMS for sign-up. Rejects if the phone already has an account. */
export const sendOtp = onCall(async (req) => {
  const phone = toE164(req.data?.phone || '');
  if (!/^\+\d{8,15}$/.test(phone)) throw new HttpsError('invalid-argument', 'ເບີ ໂທ ບໍ່ ຖືກຕ້ອງ');
  if (await phoneRegistered(phone)) throw new HttpsError('already-exists', 'ເບີ ນີ້ ມີ ບັນຊີ ແລ້ວ — ກະລຸນາ ເຂົ້າ ສູ່ ລະບົບ');
  await issueOtp(phone);
  return { ok: true };
});

/** Verify the OTP; on success create the account (server-side) + return a custom
 *  token so the client signs in immediately. */
export const verifyOtp = onCall(async (req) => {
  const phone = toE164(req.data?.phone || '');
  const code = String(req.data?.code || '').trim();
  const password = String(req.data?.password || '');
  if (!/^\+\d{8,15}$/.test(phone) || !/^\d{4,8}$/.test(code) || password.length < 6) {
    throw new HttpsError('invalid-argument', 'ຂໍ້ມູນ ບໍ່ ຄົບ ຫຼື ບໍ່ ຖືກຕ້ອງ');
  }
  if (await phoneRegistered(phone)) throw new HttpsError('already-exists', 'ເບີ ນີ້ ມີ ບັນຊີ ແລ້ວ'); // check before consuming the code
  if (!(await checkOtp(phone, code))) throw new HttpsError('permission-denied', 'ລະຫັດ OTP ບໍ່ ຖືກ ຫຼື ໝົດ ອາຍຸ');
  const email = phoneToEmail(phone);
  const user = await admin.auth().createUser({ email, password, phoneNumber: phone });
  await admin.auth().setCustomUserClaims(user.uid, { phone_verified: true });
  // client signs in with email+password — avoids createCustomToken (which needs
  // the signBlob IAM permission the default Functions service account lacks).
  return { uid: user.uid, email };
});

// ─────────────────────────────────────────────────────────────────────────────
// Twilio phone-OTP for PASSWORD RESET — mirror of sign-up, but for an account
// that ALREADY exists: send an OTP to a registered phone, then (on approval) set
// a new password via the admin SDK and return a custom token so the client signs
// in immediately. No reCAPTCHA. Used by the "forgot password" screen.
// ─────────────────────────────────────────────────────────────────────────────

/** Send an OTP SMS to reset the password of an EXISTING phone account. */
export const sendResetOtp = onCall(async (req) => {
  const phone = toE164(req.data?.phone || '');
  if (!/^\+\d{8,15}$/.test(phone)) throw new HttpsError('invalid-argument', 'ເບີ ໂທ ບໍ່ ຖືກຕ້ອງ');
  const user = await findAuthPhoneUser(phone);
  if (!user) throw new HttpsError('not-found', 'ບໍ່ ພົບ ບັນຊີ ຂອງ ເບີ ນີ້ — ກະລຸນາ ສະໝັກ ໃໝ່');
  await issueOtp(phone);
  return { ok: true };
});

/** Verify the OTP + set a new password on the existing account; returns a custom token. */
export const resetPassword = onCall(async (req) => {
  const phone = toE164(req.data?.phone || '');
  const code = String(req.data?.code || '').trim();
  const password = String(req.data?.password || '');
  if (!/^\+\d{8,15}$/.test(phone) || !/^\d{4,8}$/.test(code) || password.length < 6) {
    throw new HttpsError('invalid-argument', 'ຂໍ້ມູນ ບໍ່ ຄົບ ຫຼື ບໍ່ ຖືກຕ້ອງ');
  }
  const user = await findAuthPhoneUser(phone);
  if (!user) throw new HttpsError('not-found', 'ບໍ່ ພົບ ບັນຊີ');
  if (!(await checkOtp(phone, code))) throw new HttpsError('permission-denied', 'ລະຫັດ OTP ບໍ່ ຖືກ ຫຼື ໝົດ ອາຍຸ');
  const updates: Record<string, any> = { password };
  if (!user.email) updates.email = phoneToEmail(phone);   // pure-phone legacy → add synthetic email so password login works
  if (!user.phoneNumber) updates.phoneNumber = phone;
  await admin.auth().updateUser(user.uid, updates);
  await admin.auth().setCustomUserClaims(user.uid, { phone_verified: true });
  await dbf().doc(`users/${user.uid}`).set({ phone }, { merge: true }).catch(() => {}); // heal legacy phone format
  // client signs in with email+password (no createCustomToken → no signBlob IAM need)
  const signInEmail = updates.email || user.email || phoneToEmail(phone);
  return { uid: user.uid, email: signInEmail };
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin diagnostic — check the Twilio config WITHOUT sending an SMS. Reports
// which field is wrong and does a live services().fetch() to validate the creds
// (auth + Verify SID) against Twilio. Super-admin only; never returns the secret
// values (masked).
// ─────────────────────────────────────────────────────────────────────────────
function mask(s: string): string {
  if (!s) return '(ຫວ່າງ)';
  if (s.length <= 8) return s.slice(0, 2) + '…';
  return s.slice(0, 4) + '…' + s.slice(-4);
}
async function assertSuperAdmin(req: any) {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ຕ້ອງ ເຂົ້າ ສູ່ ລະບົບ ກ່ອນ');
  const u = (await dbf().doc(`users/${uid}`).get()).data() || {};
  const isRoot = String(u.phone || '').replace(/\D/g, '').endsWith('59682000');
  if (u.isSuperAdmin !== true && !isRoot) throw new HttpsError('permission-denied', 'ສະເພາະ super-admin');
}

export const checkOtpConfig = onCall(async (req) => {
  await assertSuperAdmin(req);
  const c = (await dbf().doc('secureConfig/otp').get()).data() || {};
  const accountSid = String(c.twilioAccountSid || '').trim();
  const authToken = String(c.twilioAuthToken || '').trim();
  const messagingSid = String(c.twilioMessagingSid || '').trim();

  const accountOk = accountSid.startsWith('AC');
  const messagingOk = messagingSid.startsWith('MG');
  const report: any = {
    accountSid: { set: !!accountSid, ok: accountOk, value: mask(accountSid) },
    authToken: { set: !!authToken, len: authToken.length },
    messagingSid: { set: !!messagingSid, ok: messagingOk, value: mask(messagingSid) },
    connection: { ok: false, message: '' },
  };

  if (!accountSid || !authToken || !messagingSid) {
    report.connection.message = 'ຄ່າ ຍັງ ບໍ່ ຄົບ — ຕ້ອງ ໃສ່ ໃຫ້ ຄົບ 3 ຊ່ອງ';
  } else if (!accountOk) {
    report.connection.message = 'Account SID ຕ້ອງ ຂຶ້ນຕົ້ນ ດ້ວຍ AC (ທ່ານ ໃສ່ ຄ່າ ຜິດ ຊ່ອງ?)';
  } else if (!messagingOk) {
    report.connection.message = 'Messaging Service SID ຕ້ອງ ຂຶ້ນຕົ້ນ ດ້ວຍ MG';
  } else {
    try {
      const twilio = require('twilio');
      const svc = await twilio(accountSid, authToken).messaging.v1.services(messagingSid).fetch();
      report.connection = { ok: true, message: '✅ ເຊື່ອມຕໍ່ ສຳເລັດ — service: ' + (svc.friendlyName || messagingSid) };
    } catch (e: any) {
      const code = e?.code || e?.status || '?';
      if (e?.code === 20003 || e?.status === 401) report.connection.message = 'Auth Token ບໍ່ ກົງ ກັບ Account SID (Twilio 20003)';
      else if (e?.code === 20404) report.connection.message = 'ບໍ່ ພົບ Messaging Service SID ນີ້ ໃນ ບັນຊີ (Twilio 20404) — ກວດ MG… ຫຼື ບັນຊີ';
      else report.connection.message = 'Twilio ' + code + ': ' + (e?.message || 'unknown');
    }
  }
  return report;
});

// ===== CND: server-authoritative coupon redemption + order review ==============
// The storefront only PREVIEWS a coupon (lib/cnd/coupons.ts validateCoupon — keep
// the two in sync). Guests create orders straight from the browser, so it can't be
// trusted to count a use or to send an honest discount/price/total. For every
// non-POS, non-mock order we:
//   1. re-validate the coupon with SERVER time and count the use atomically in a
//      transaction (guests included; the limit can't be overshot by concurrent
//      orders) + log it to cndCouponRedemptions;
//   2. re-derive what the order should cost from the catalogue + store config and
//      FLAG mismatches (reviewFlags) for staff to check before confirming. A created
//      order can't be rejected from a trigger, so anomalies are flagged, not deleted.
const cndDigits = (s?: string) => String(s || '').replace(/\D/g, '');
// Lao subscriber number = last 8 digits (same rule as lib/cnd/staff.ts samePhone)
const cndSamePhone = (a?: string, b?: string) => {
  const x = cndDigits(a).slice(-8);
  const y = cndDigits(b).slice(-8);
  return x.length >= 6 && x === y;
};
const cndMs = (v: any): number => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : 0);
// same salted hash as lib/cnd/publicCards.ts hashPhone — loyalty tier cards are keyed by it
function cndHashPhone(phone?: string): string {
  const s = 'cnd-tier-v1:' + cndDigits(phone);
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return 'c' + h1.toString(36) + h2.toString(36);
}
// storefront defaults (lib/cnd/config.ts DEF) for fields cndConfig/main doesn't set
const CND_CONFIG_DEFAULTS: Record<string, any> = { deliveryFee: 50000, taxPct: 10, surveyFeeMode: 'off', surveyFee: 0 };

type CndCouponCheck = { ok: boolean; allowed: number; reason?: string };

async function redeemCndCoupon(orderRef: admin.firestore.DocumentReference, order: any): Promise<CndCouponCheck> {
  const code = String(order.couponCode || '').trim().toUpperCase();
  if (!code) return { ok: true, allowed: 0 };
  return dbf().runTransaction(async (tx) => {
    const fresh = await tx.get(orderRef);
    const od: any = fresh.data() || {};
    if (od.couponApplied) return { ok: !od.couponReject, allowed: Number(od.couponAllowed) || 0, reason: od.couponReject };
    const qs = await tx.get(dbf().collection('cndCoupons').where('code', '==', code).limit(10));
    // a legacy duplicate code: prefer an active one, oldest first (same pick as the client)
    const cdoc = qs.docs.slice().sort((a, b) =>
      Number(b.get('active') !== false) - Number(a.get('active') !== false) || cndMs(a.get('createdAt')) - cndMs(b.get('createdAt')))[0];
    const subtotal = Math.max(0, Number(od.subtotal) || 0);
    let reason: string | undefined;
    let allowed = 0;
    if (!cdoc) {
      reason = 'ບໍ່ ພົບ ໂຄ້ດ';
    } else {
      const c: any = cdoc.data();
      const exp = cndMs(c.expiresAt);
      const limit = Number(c.usageLimit) || 0;
      if (c.active === false) reason = 'ໂຄ້ດ ຖືກ ປິດ ຢູ່';
      else if (exp && Date.now() > exp) reason = 'ໂຄ້ດ ໝົດ ອາຍຸ';
      else if (limit && (Number(c.usedCount) || 0) >= limit) reason = 'ໂຄ້ດ ໃຊ້ ຄົບ ຈຳ ນວນ ແລ້ວ';
      else if (c.audience === 'personal' && !cndSamePhone(od.phone, c.assignedToPhone)) reason = 'ໂຄ້ດ ສ່ວນ ຕົວ — ເບີ ບໍ່ ກົງ';
      else if (Number(c.minSpend) && subtotal < Number(c.minSpend)) reason = 'ຍອດ ຊື້ ບໍ່ ຮອດ ຂັ້ນ ຕ່ຳ';
      else {
        const value = Number(c.value) || 0;
        if (c.type === 'pct') {
          allowed = Math.round((subtotal * Math.min(100, Math.max(0, value))) / 100);
          if (Number(c.cap)) allowed = Math.min(allowed, Number(c.cap));
        } else {
          allowed = Math.min(value, subtotal);
        }
        allowed = Math.max(0, Math.min(allowed, subtotal));
      }
    }
    const patch: Record<string, any> = { couponApplied: true, couponAllowed: allowed };
    if (reason || !cdoc) {
      patch.couponReject = reason;
    } else {
      tx.update(cdoc.ref, { usedCount: admin.firestore.FieldValue.increment(1) });
      const rRef = dbf().collection('cndCouponRedemptions').doc();
      tx.set(rRef, {
        couponId: cdoc.id, code, orderId: orderRef.id, orderNumber: od.number || '',
        phone: od.phone || null, uid: od.uid || null, channel: od.channel || null,
        claimed: Number(od.couponDiscount ?? od.discount) || 0, allowed,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
      patch.couponRedemptionId = rRef.id;
    }
    tx.set(orderRef, patch, { merge: true });
    return { ok: !reason, allowed, reason };
  });
}

async function reviewCndOrder(order: any, coupon: CndCouponCheck): Promise<{ flags: string[]; reasons: string[] }> {
  const flags = new Set<string>();
  const reasons: string[] = [];
  const add = (flag: string, why: string) => { flags.add(flag); reasons.push(why); };
  const n = (v: any) => Math.round(Number(v) || 0);
  const fmt = (v: number) => v.toLocaleString('en-US');
  const items: any[] = Array.isArray(order.items) ? order.items : [];

  if (order.couponCode && !coupon.ok) add('coupon', `ຄູປອງ ${order.couponCode}: ${coupon.reason || 'ບໍ່ ຖືກ ຕ້ອງ'}`);

  if (order.channel === 'online') {
    // 1) every line price must match the catalogue, and line math must add up
    const refs = items.filter((it) => it?.productId).map((it) => dbf().doc(`cndProducts/${it.productId}`));
    const snaps = refs.length ? await dbf().getAll(...refs) : [];
    const priceById = new Map<string, number>(snaps.filter((s) => s.exists).map((s) => [s.id, Number(s.get('price')) || 0] as [string, number]));
    let subtotal = 0;
    let feeTotal = 0;
    for (const it of items) {
      const qty = Number(it?.qty) || 0;
      const price = Number(it?.price) || 0;
      const name = it?.name || it?.productId || '?';
      if (!(qty > 0) || price < 0) add('items', `${name}: ຈຳ ນວນ/ລາຄາ ບໍ່ ຖືກ`);
      const real = priceById.get(it?.productId);
      if (real === undefined) add('items', `ບໍ່ ພົບ ສິນຄ້າ ໃນ ຄັງ: ${name}`);
      else if (real !== price) add('price', `${name}: ລາຄາ ໃນ ບິນ ${fmt(price)} ≠ ລາຄາ ຈິງ ${fmt(real)}`);
      subtotal += price * qty;
      const pct = Number(it?.feePct) || 0;
      if (pct < 0 || pct > 100) add('install', `${name}: % ຄ່າ ຕິດຕັ້ງ ບໍ່ ຖືກ (${pct})`);
      const fee = it?.install ? Math.round((price * qty * pct) / 100) : 0;
      if (n(it?.feeAmount) !== fee) add('install', `${name}: ຄ່າ ຕິດຕັ້ງ ບໍ່ ກົງ ການ ຄິດໄລ່`);
      feeTotal += fee;
    }
    if (n(order.subtotal) !== n(subtotal)) add('total', `ລວມ ສິນຄ້າ ${fmt(n(order.subtotal))} ≠ ${fmt(n(subtotal))}`);
    if (n(order.installFeeTotal) !== n(feeTotal)) add('install', `ລວມ ຄ່າ ຕິດຕັ້ງ ${fmt(n(order.installFeeTotal))} ≠ ${fmt(n(feeTotal))}`);

    // 2) delivery / tech-travel / survey fees + tax rate vs store config and zone
    const cfgSnap = await dbf().doc('cndConfig/main').get();
    const cfg: Record<string, any> = { ...CND_CONFIG_DEFAULTS, ...(cfgSnap.exists ? cfgSnap.data() : {}) };
    let zone: any = null;
    if (order.deliveryZone) {
      const zs = await dbf().collection('cndZones').where('name', '==', order.deliveryZone).limit(1).get();
      zone = zs.docs[0]?.data() || null;
      if (!zone) add('fees', `ບໍ່ ພົບ ເຂດ ສົ່ງ: ${order.deliveryZone}`);
    }
    const hasInstall = items.some((it) => it?.install);
    const expDelivery = zone ? n(zone.fee) : n(cfg.deliveryFee);
    if (n(order.deliveryFee) !== expDelivery) add('fees', `ຄ່າ ສົ່ງ ${fmt(n(order.deliveryFee))} ≠ ${fmt(expDelivery)}`);
    const expTravel = hasInstall && zone ? n(zone.techFee) : 0;
    if (n(order.installTravelFee) !== expTravel) add('fees', `ຄ່າ ເດີນທາງ ຊ່າງ ${fmt(n(order.installTravelFee))} ≠ ${fmt(expTravel)}`);
    const expSurvey = hasInstall && cfg.surveyFeeMode === 'prepay' ? n(cfg.surveyFee) : 0;
    if (n(order.surveyFee) !== expSurvey) add('fees', `ຄ່າ ສຳຫຼວດ ${fmt(n(order.surveyFee))} ≠ ${fmt(expSurvey)}`);
    const expTaxPct = Math.max(0, Number(cfg.taxPct) || 0);
    if ((Number(order.taxPct) || 0) !== expTaxPct) add('tax', `ອັດຕາ ພາສີ ${Number(order.taxPct) || 0}% ≠ ${expTaxPct}%`);

    // 3) discount ceiling = the honoured coupon + the customer's loyalty tier
    let tierPct = 0;
    if (cndDigits(order.phone).length >= 6) {
      const card = await dbf().doc(`cndCustomerCards/${cndHashPhone(order.phone)}`).get();
      tierPct = card.exists ? Math.max(0, Number(card.get('discountPct')) || 0) : 0;
    }
    const maxDiscount = Math.min(n(subtotal), (coupon.ok ? coupon.allowed : 0) + Math.round((n(subtotal) * tierPct) / 100));
    if (n(order.discount) > maxDiscount + 1) add('discount', `ສ່ວນ ຫຼຸດ ${fmt(n(order.discount))} ເກີນ ທີ່ ອະນຸຍາດ ${fmt(maxDiscount)}`);

    // 4) the total must follow from its own parts (same formula as createCndOrder)
    const pre = n(order.subtotal) + n(order.installFeeTotal) + n(order.installTravelFee) + n(order.surveyFee) + n(order.deliveryFee) - n(order.discount);
    const expTotal = pre + Math.round((pre * (Number(order.taxPct) || 0)) / 100);
    if (Math.abs(n(order.total) - expTotal) > 1) add('total', `ຍອດ ລວມ ${fmt(n(order.total))} ≠ ${fmt(expTotal)}`);
  }
  return { flags: Array.from(flags), reasons: reasons.slice(0, 12) };
}

// ===== CND: decrement stock for ONLINE orders (guests can't write cndProducts) =
// POS sales already decrement client-side (admin cashier); seeded __mock orders
// are skipped (the seeder attributes their stock). Floors at 0 in a transaction.
export const onCndOrderCreated = onDocumentCreated('cndOrders/{id}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const order = snap.data();
  if (!order) return;
  if (order.channel === 'pos') return;   // counter sale already decremented
  if (order.__mock) return;              // demo data — stock attributed by seeder

  // coupon redemption + price review (own idempotency: couponApplied / reviewDone).
  // Guests can't pre-set these fields — firestore.rules rejects them on create.
  if (!order.reviewDone) {
    try {
      const coupon = await redeemCndCoupon(snap.ref, order);
      const { flags, reasons } = await reviewCndOrder(order, coupon);
      await snap.ref.set({ reviewDone: true, ...(flags.length ? { reviewFlags: flags, reviewReasons: reasons } : {}) }, { merge: true });
    } catch (e) {
      console.error('onCndOrderCreated review:', e);
    }
  }

  if (order.stockApplied) return;        // idempotency guard on retries
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  if (!items.length) return;

  // attribute the online sale to a default (warehouse) branch, if any
  let branchId: string | undefined;
  try {
    const bs = await dbf().collection('cndBranches').where('active', '==', true).limit(1).get();
    branchId = bs.docs[0]?.id;
  } catch { /* no branches → decrement total only */ }

  for (const it of items) {
    const productId = it?.productId;
    const qty = Math.abs(Number(it?.qty) || 0);
    if (!productId || qty <= 0) continue;
    const pRef = dbf().doc(`cndProducts/${productId}`);
    await dbf().runTransaction(async (tx) => {
      const p = await tx.get(pRef);
      if (!p.exists) return;
      const upd: Record<string, any> = {};
      const cur = p.get('stock');
      if (typeof cur === 'number') upd.stock = Math.max(0, cur - qty);
      if (branchId) {
        const sbb = (p.get('stockByBranch') as Record<string, any>) || {};
        const b = Number(sbb[branchId]) || 0;
        upd.stockByBranch = { [branchId]: Math.max(0, b - qty) };  // merge deep-merges the map
      }
      if (Object.keys(upd).length) tx.set(pRef, upd, { merge: true });
    }).catch(() => {});
    await dbf().collection('cndStockMoves').add({
      productId, productName: it?.name || '', type: 'sale', qty: -qty,
      branchId: branchId || null, note: ('ອອນລາຍ ' + (order.number || '')).trim(),
      at: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
  }
  await snap.ref.set({ stockApplied: true }, { merge: true }).catch(() => {});
});

// ===== CND: grant a staff member their role's write-claim (per-staff RBAC) =====
// Self-service: a signed-in user calls this; if their phone matches an ACTIVE
// cndStaff record, we stamp a custom claim (token.cnd) with capability flags the
// Firestore rules check. Owner (isAnyAdmin) doesn't need it. Clears the claim if
// they're no longer active staff.
export const claimCndStaff = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'login required');
  const last8 = (s: any) => String(s || '').replace(/\D/g, '').slice(-8);
  const u = await dbf().doc(`users/${uid}`).get();
  const phone = last8(u.get('phone'));
  let claim: any = null;
  if (phone.length >= 6) {
    const staffSnap = await dbf().collection('cndStaff').where('active', '==', true).get();
    const st = staffSnap.docs.find((d) => last8(d.get('phone')) === phone);
    if (st) {
      const roleKey = st.get('roleKey') || 'cashier';
      const roleDoc = await dbf().doc(`cndRoles/${roleKey}`).get();
      const sections: string[] = Array.isArray(roleDoc.get('sections')) ? roleDoc.get('sections') : [];
      claim = {
        role: roleKey,
        pos: !!roleDoc.get('canPos'),
        refund: !!roleDoc.get('canRefund'),
        staff: !!roleDoc.get('canManageStaff'),
        catalog: sections.includes('products'),
        finance: sections.includes('finance'),
      };
    }
  }
  const existing = (await admin.auth().getUser(uid)).customClaims || {};
  await admin.auth().setCustomUserClaims(uid, { ...existing, cnd: claim });  // cnd:null clears it
  return { role: claim ? claim.role : null };
});

// ===== CND: link a customer's GUEST orders to their account (ninesang P4) ======
// After a customer signs in (OTP), attach every prior online order that carries
// their phone but no uid — so "my orders" + chat show orders placed before login.
// SECURE: the phone comes from the caller's own auth record (set at OTP account
// creation, phone-verified), NOT from client input, so a user can only claim
// orders bearing THEIR verified number. Match by last-8 digits (same rule as
// claimCndStaff — format-independent; the Lao subscriber IS the last 8 digits).
export const claimCndOrders = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'login required');
  const last8 = (s: any) => String(s || '').replace(/\D/g, '').slice(-8);
  const authUser = await admin.auth().getUser(uid);
  let key = last8(authUser.phoneNumber);
  if (key.length < 8) key = last8((await dbf().doc(`users/${uid}`).get()).get('phone'));
  if (key.length < 8) return { linked: 0 };
  // bounded scan of recent orders (single-field orderBy → no composite index).
  const snap = await dbf().collection('cndOrders').orderBy('createdAt', 'desc').limit(600).get();
  const ids: string[] = [];
  snap.forEach((d) => {
    const x = d.data();
    if (!x.uid && x.channel !== 'pos' && last8(x.phone) === key) ids.push(d.id);
  });
  for (let i = 0; i < ids.length; i += 400) {
    const b = dbf().batch();
    ids.slice(i, i + 400).forEach((id) => b.update(dbf().collection('cndOrders').doc(id), { uid }));
    await b.commit();
  }
  return { linked: ids.length };
});

// ===== CND booking availability (ninesang) — count bookings per slot for a day,
// so the customer's booking screen can show ວ່າງ/ເຕັມ WITHOUT reading cndOrders
// (admin-only). Returns raw counts + active-tech count for the trade; the client
// decides open/full from the configured capacity mode. No auth required (read-only
// aggregate, no PII).
export const cndBookingSlots = onCall(async (req) => {
  const dayStart = Number(req.data?.dayStart) || 0;
  const trade = String(req.data?.trade || '').trim();
  if (!dayStart) throw new HttpsError('invalid-argument', 'ຕ້ອງ ລະບຸ ວັນ');
  const dayEnd = dayStart + 24 * 3600 * 1000;
  const asMs = (v: any) => (typeof v === 'number' ? v : (v && typeof v.toMillis === 'function' ? v.toMillis() : 0));
  // Count EVERY scheduled install on that day (booking + buy-and-install), so all
  // modes share one availability picture — a slot fills whoever booked it.
  const snap = await dbf().collection('cndOrders').get();
  const bySlot: Record<string, number> = {};
  snap.forEach((d) => {
    const o = d.data(); const inst = o.install; if (!inst || !inst.slot) return;
    if (o.status === 'cancelled') return;
    const at = asMs(inst.scheduledAt);
    if (at < dayStart || at >= dayEnd) return;
    if (trade && inst.trade && inst.trade !== trade) return;
    const s = String(inst.slot); bySlot[s] = (bySlot[s] || 0) + 1;
  });
  const tSnap = await dbf().collection('cndTechs').get();
  let techCount = 0;
  tSnap.forEach((d) => { const t = d.data(); if (t.active === false) return; if (trade && t.trade && t.trade !== trade) return; techCount++; });
  return { bySlot, techCount };
});
