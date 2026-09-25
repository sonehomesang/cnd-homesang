/**
 * CND coupon + order security-rules PENTEST (Firestore emulator).
 *
 *   npm run test:rules:cnd
 *   (= npx firebase emulators:exec --only firestore --config firebase.rulestest.json
 *        --project homesang-cnd-test "node scripts/test-rules-cnd.mjs")
 *
 * Attacker models: GUEST (not signed in) · CUSTOMER (signed in, no role) ·
 * CASHIER (CND staff claim, pos only) · FINANCE (CND staff claim, finance) · ADMIN.
 *
 * Pins the 2026-09 CND coupon findings shut:
 *  - usage-count tampering (any signed-in account could +1 a coupon and exhaust it)
 *  - server-only field injection on order create (stockApplied / couponApplied /
 *    reviewDone / reviewFlags / payment confirmation) that skips server processing
 *  - negative or oversized discounts
 *  - the server-only coupon redemption log
 * Server-side logic (re-validation, atomic counting, price review) lives in the
 * onCndOrderCreated Cloud Function and is exercised by the live E2E test, not here.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'fs';

const PROJECT = 'homesang-cnd-test';
let pass = 0, fail = 0;
const check = async (name, p) => {
  try { await p; console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e?.message ?? e}`); fail++; }
};

const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
});

const ADMIN = 'admin1', CUSTOMER = 'cust1', OTHER = 'cust2', CASHIER = 'cashier1', FINANCE = 'finance1';

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', ADMIN), { roles: ['admin'] });
  await setDoc(doc(db, 'users', CUSTOMER), { roles: [] });
  await setDoc(doc(db, 'users', OTHER), { roles: [] });
  await setDoc(doc(db, 'cndCoupons', 'limit1'), { code: 'LIMIT1', type: 'amount', value: 50000, audience: 'public', usageLimit: 1, usedCount: 0, active: true, createdAt: 1 });
  await setDoc(doc(db, 'cndCoupons', 'used1'), { code: 'USED1', type: 'pct', value: 10, audience: 'public', usageLimit: 1, usedCount: 1, active: true, createdAt: 2 });
  await setDoc(doc(db, 'cndCoupons', 'finedit'), { code: 'FINEDIT', type: 'pct', value: 5, audience: 'public', usedCount: 0, active: true, createdAt: 3 });
  await setDoc(doc(db, 'cndCouponRedemptions', 'r1'), { couponId: 'limit1', code: 'LIMIT1', orderId: 'o-cust', phone: '02055551234', allowed: 50000 });
  await setDoc(doc(db, 'cndOrders', 'o-cust'), {
    channel: 'online', status: 'new', paymentStatus: 'pending', subtotal: 100000, total: 165000,
    items: [{ productId: 'p1', price: 100000, qty: 1 }], uid: CUSTOMER,
    reviewDone: true, reviewFlags: ['price'], reviewReasons: ['X: ລາຄາ ບໍ່ ກົງ'],
  });
  await setDoc(doc(db, 'cndOrders', 'o-other'), {
    channel: 'online', status: 'new', paymentStatus: 'pending', subtotal: 100000, total: 165000,
    items: [{ productId: 'p1', price: 100000, qty: 1 }], uid: OTHER,
  });
});

const guest = env.unauthenticatedContext().firestore();
const customer = env.authenticatedContext(CUSTOMER).firestore();
const cashier = env.authenticatedContext(CASHIER, { cnd: { role: 'cashier', pos: true } }).firestore();
const finance = env.authenticatedContext(FINANCE, { cnd: { role: 'manager', finance: true } }).firestore();
const admin = env.authenticatedContext(ADMIN).firestore();

const coupon = (db, id) => doc(db, 'cndCoupons', id);
const order = (db, id) => doc(db, 'cndOrders', id);
const newCoupon = (code) => ({ code, type: 'amount', value: 10000, audience: 'public', usedCount: 0, active: true, createdAt: Date.now() });
const goodOrder = (extra = {}) => ({
  channel: 'online', status: 'new', paymentStatus: 'pending', number: 'CND-00001',
  items: [{ productId: 'p1', name: 'X', unit: 'ໜ່ວຍ', price: 100000, qty: 1, install: false, feePct: 0, feeAmount: 0 }],
  subtotal: 100000, installFeeTotal: 0, deliveryFee: 50000, taxPct: 10, total: 165000, createdAt: Date.now(),
  ...extra,
});

console.log('\n── A. coupon usage-count tampering (FINDING #1/#2) ──');
await check('guest CAN read coupons (checkout preview — public by design)', assertSucceeds(getDoc(coupon(guest, 'limit1'))));
await check('guest CANNOT bump usedCount', assertFails(updateDoc(coupon(guest, 'limit1'), { usedCount: 1 })));
await check('customer CANNOT bump usedCount by +1 (old hole: exhaust a code without buying)', assertFails(updateDoc(coupon(customer, 'limit1'), { usedCount: 1 })));
await check('customer CANNOT reset a used coupon back to 0', assertFails(updateDoc(coupon(customer, 'used1'), { usedCount: 0 })));
await check('customer CANNOT raise the value', assertFails(updateDoc(coupon(customer, 'limit1'), { value: 99999999 })));
await check('customer CANNOT lift the usage limit', assertFails(updateDoc(coupon(customer, 'used1'), { usageLimit: 999 })));
await check('cashier (pos only) CANNOT edit a coupon', assertFails(updateDoc(coupon(cashier, 'limit1'), { active: false })));
await check('guest CANNOT create a coupon', assertFails(setDoc(coupon(guest, 'evil'), newCoupon('EVIL100'))));
await check('customer CANNOT create a coupon', assertFails(setDoc(coupon(customer, 'evil2'), newCoupon('EVIL200'))));
await check('customer CANNOT switch a coupon off', assertFails(updateDoc(coupon(customer, 'limit1'), { active: false })));
const { deleteDoc } = await import('firebase/firestore');
await check('customer CANNOT delete a coupon', assertFails(deleteDoc(coupon(customer, 'limit1'))));
await check('cashier (pos only) CANNOT delete a coupon', assertFails(deleteDoc(coupon(cashier, 'limit1'))));
await check('finance staff CAN edit a coupon', assertSucceeds(updateDoc(coupon(finance, 'finedit'), { active: false })));
await check('admin CAN create a coupon', assertSucceeds(setDoc(coupon(admin, 'ok1'), newCoupon('OKAY10'))));

console.log('\n── B. coupon redemption log (server-only) ──');
await check('guest CANNOT read redemptions (phones inside)', assertFails(getDoc(doc(guest, 'cndCouponRedemptions', 'r1'))));
await check('customer CANNOT read redemptions', assertFails(getDoc(doc(customer, 'cndCouponRedemptions', 'r1'))));
await check('customer CANNOT list redemptions', assertFails(getDocs(collection(customer, 'cndCouponRedemptions'))));
await check('cashier (pos only) CANNOT read redemptions', assertFails(getDoc(doc(cashier, 'cndCouponRedemptions', 'r1'))));
await check('finance staff CAN read redemptions', assertSucceeds(getDoc(doc(finance, 'cndCouponRedemptions', 'r1'))));
await check('admin CAN read redemptions', assertSucceeds(getDoc(doc(admin, 'cndCouponRedemptions', 'r1'))));
await check('customer CANNOT forge a redemption', assertFails(addDoc(collection(customer, 'cndCouponRedemptions'), { code: 'LIMIT1', orderId: 'x' })));
await check('even admin CANNOT write a redemption (function-only)', assertFails(addDoc(collection(admin, 'cndCouponRedemptions'), { code: 'LIMIT1', orderId: 'x' })));

console.log('\n── C. order create — server-only field injection (FINDING: skip server processing) ──');
await check('baseline: guest CAN place a well-formed online order', assertSucceeds(addDoc(collection(guest, 'cndOrders'), goodOrder())));
await check('baseline: guest CAN place an order with a coupon', assertSucceeds(addDoc(collection(guest, 'cndOrders'), goodOrder({ couponCode: 'LIMIT1', couponDiscount: 50000, discount: 50000, total: 110000 }))));
for (const [field, value] of [
  ['stockApplied', true], ['couponApplied', true], ['reviewDone', true], ['reviewFlags', []],
  ['reviewReasons', []], ['couponRedemptionId', 'r1'], ['couponAllowed', 999999], ['couponReject', ''],
  ['reviewedBy', 'me'], ['reviewedAt', 1], ['paidAt', 1], ['paidBy', 'me'], ['paidAmount', 165000],
  ['cashier', 'me'], ['shiftId', 's1'],
]) {
  await check(`guest CANNOT pre-set server-only "${field}"`, assertFails(addDoc(collection(guest, 'cndOrders'), goodOrder({ [field]: value }))));
}
await check('customer CANNOT pre-set couponApplied either', assertFails(addDoc(collection(customer, 'cndOrders'), goodOrder({ uid: CUSTOMER, couponApplied: true }))));

console.log('\n── D. order create — money-field sanity ──');
await check('guest CANNOT send a negative discount', assertFails(addDoc(collection(guest, 'cndOrders'), goodOrder({ discount: -50000 }))));
await check('guest CANNOT discount more than the subtotal', assertFails(addDoc(collection(guest, 'cndOrders'), goodOrder({ discount: 100001, total: 0 }))));
await check('guest CANNOT send a string discount', assertFails(addDoc(collection(guest, 'cndOrders'), goodOrder({ discount: '50000' }))));
await check('guest CANNOT send a negative couponDiscount', assertFails(addDoc(collection(guest, 'cndOrders'), goodOrder({ couponDiscount: -1 }))));
await check('guest CANNOT send a negative subtotal', assertFails(addDoc(collection(guest, 'cndOrders'), goodOrder({ subtotal: -1 }))));
await check('guest CANNOT omit the subtotal', assertFails(addDoc(collection(guest, 'cndOrders'), (() => { const o = goodOrder(); delete o.subtotal; return o; })())));
await check('guest CANNOT send a negative total', assertFails(addDoc(collection(guest, 'cndOrders'), goodOrder({ total: -1 }))));
await check('guest CANNOT create an already-paid order', assertFails(addDoc(collection(guest, 'cndOrders'), goodOrder({ paymentStatus: 'paid' }))));
await check('guest CANNOT create a completed order', assertFails(addDoc(collection(guest, 'cndOrders'), goodOrder({ status: 'done' }))));
await check('guest CANNOT create a POS sale', assertFails(addDoc(collection(guest, 'cndOrders'), goodOrder({ channel: 'pos' }))));
await check('customer CANNOT stamp someone else\'s uid', assertFails(addDoc(collection(customer, 'cndOrders'), goodOrder({ uid: OTHER }))));
await check('customer CAN place an order under their own uid', assertSucceeds(addDoc(collection(customer, 'cndOrders'), goodOrder({ uid: CUSTOMER }))));

console.log('\n── E. order update / read — clearing flags, rewriting money, snooping ──');
await check('owner CANNOT clear the server review flags', assertFails(updateDoc(order(customer, 'o-cust'), { reviewFlags: [] })));
await check('owner CANNOT rewrite the discount after placing', assertFails(updateDoc(order(customer, 'o-cust'), { discount: 100000, total: 0 })));
await check('owner CANNOT mark their own order paid', assertFails(updateDoc(order(customer, 'o-cust'), { paymentStatus: 'paid' })));
await check('owner CAN still post a chat ping (regression)', assertSucceeds(updateDoc(order(customer, 'o-cust'), { lastMessageAt: Date.now(), lastMessageFrom: 'customer' })));
await check('guest CANNOT update any order', assertFails(updateDoc(order(guest, 'o-cust'), { lastMessageAt: 1 })));
await check('guest CANNOT read an order', assertFails(getDoc(order(guest, 'o-cust'))));
await check('customer CANNOT read another customer\'s order', assertFails(getDoc(order(customer, 'o-other'))));
await check('customer CAN read their own order', assertSucceeds(getDoc(order(customer, 'o-cust'))));
await check('cashier CAN mark a flagged order reviewed', assertSucceeds(updateDoc(order(cashier, 'o-cust'), { reviewFlags: [], reviewedBy: 'cashier', reviewedAt: Date.now() })));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
