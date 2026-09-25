/**
 * Security-rules tests for the CORE collections (orders, jobs, bids, products,
 * users, reviews, notifications, walletTransactions, referrals).
 *
 *   npm run test:rules:core
 *
 * Every seeded document contains ONLY the fields the app actually writes — that
 * is the point. Firestore rules THROW when a rule reads a field that is absent,
 * and an evaluation error denies the whole rule, so a rule that looks correct can
 * still lock out legitimate users on realistic data.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import fs from 'fs';

let pass = 0, fail = 0;
const check = async (name, p) => {
  try { await p; console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${String(e?.message ?? e).split('\n')[0]}`); fail++; }
};

const env = await initializeTestEnvironment({
  projectId: 'homesang-core-test',
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
});

const ADMIN = 'admin1', CS = 'cs1', CUST = 'cust1', TECH = 'tech1', SELLER = 'seller1', OTHER = 'other1', VICTIM = 'victim1';

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  // user docs exactly as createUserProfile writes them — NOTE: no isSuperAdmin
  await setDoc(doc(db, 'users', CUST), { uid: CUST, phone: '2001', name: 'C', roles: ['customer'] });
  await setDoc(doc(db, 'users', TECH), { uid: TECH, phone: '2002', name: 'T', roles: ['technician'] });
  await setDoc(doc(db, 'users', SELLER), { uid: SELLER, phone: '2003', name: 'S', roles: ['shop'], shopId: 'shop1' });
  await setDoc(doc(db, 'users', OTHER), { uid: OTHER, phone: '2004', name: 'O', roles: ['customer'] });
  // an admin the way the app marks one (roles only — still no isSuperAdmin field)
  await setDoc(doc(db, 'users', ADMIN), { uid: ADMIN, phone: '2000', name: 'A', roles: ['admin'] });
  // cs_admin is an admin TIER but NOT super admin — it must not be able to
  // change privilege fields (the legacy 'admin' role deliberately counts as super)
  await setDoc(doc(db, 'users', CS), { uid: CS, phone: '2005', name: 'CS', roles: ['cs_admin'] });
  await setDoc(doc(db, 'users', VICTIM), { uid: VICTIM, phone: '2006', name: 'V', roles: ['customer'] });

  await setDoc(doc(db, 'shops', 'shop1'), { ownerId: SELLER, name: 'Shop' });
  // an OPEN job — no assignedProviderId yet (that is the realistic shape)
  await setDoc(doc(db, 'jobs', 'job1'), { customerId: CUST, title: 'J', status: 'open', bidCount: 0 });
  // a plain order — no deliveryTaskId (only Express/rider orders get one)
  await setDoc(doc(db, 'orders', 'ord1'), {
    customerId: CUST, shopId: 'shop1', status: 'pending', paymentVerified: false,
    subtotal: 100000, grandTotal: 120000,
  });
  await setDoc(doc(db, 'products', 'prod1'), { shopId: 'shop1', name: 'P', price: 1000, approved: true, active: true });
  await setDoc(doc(db, 'bids', 'bid1'), { jobId: 'job1', technicianId: TECH, price: 500 });
  await setDoc(doc(db, 'claims', 'claim1'), { orderId: 'ord1', customerId: CUST, type: 'refund', status: 'open', createdAt: 1 });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
const admin = as(ADMIN), cs = as(CS), cust = as(CUST), tech = as(TECH), seller = as(SELLER), other = as(OTHER);

// ---- jobs: the open-job (no assignedProviderId) trap ----
await check('customer CAN edit own job', assertSucceeds(updateDoc(doc(cust, 'jobs', 'job1'), { title: 'J2' })));
await check('admin CAN edit an OPEN job (no assignedProviderId field)',
  assertSucceeds(updateDoc(doc(admin, 'jobs', 'job1'), { status: 'assigned' })));
await check('bidder CAN bump bidCount on an OPEN job',
  assertSucceeds(updateDoc(doc(tech, 'jobs', 'job1'), { bidCount: 1 })));
await check('stranger CANNOT rewrite a job',
  assertFails(updateDoc(doc(other, 'jobs', 'job1'), { title: 'hacked' })));

// ---- bids ----
await check('job owner CAN accept a bid', assertSucceeds(updateDoc(doc(cust, 'bids', 'bid1'), { status: 'accepted' })));
await check('bidding tech CAN edit own bid', assertSucceeds(updateDoc(doc(tech, 'bids', 'bid1'), { price: 600 })));
await check('stranger CANNOT edit a bid', assertFails(updateDoc(doc(other, 'bids', 'bid1'), { price: 1 })));

// ---- orders (no deliveryTaskId on the doc) ----
await check('customer CAN cancel own order', assertSucceeds(updateDoc(doc(cust, 'orders', 'ord1'), { status: 'cancelled' })));
await check('customer CANNOT self-verify payment', assertFails(updateDoc(doc(cust, 'orders', 'ord1'), { paymentVerified: true })));
await check('customer CANNOT change totals', assertFails(updateDoc(doc(cust, 'orders', 'ord1'), { grandTotal: 1 })));
await check('selling shop CAN verify payment', assertSucceeds(updateDoc(doc(seller, 'orders', 'ord1'), { paymentVerified: true })));
await check('selling shop CANNOT change totals', assertFails(updateDoc(doc(seller, 'orders', 'ord1'), { grandTotal: 1 })));
await check('stranger CANNOT touch an order (no deliveryTaskId present)',
  assertFails(updateDoc(doc(other, 'orders', 'ord1'), { status: 'completed' })));
await check('admin CAN update an order', assertSucceeds(updateDoc(doc(admin, 'orders', 'ord1'), { status: 'confirmed' })));

// order create + loyalty cap
await check('customer CAN place an order', assertSucceeds(setDoc(doc(cust, 'orders', 'ordNew'), {
  customerId: CUST, shopId: 'shop1', status: 'pending', subtotal: 50000, grandTotal: 55000,
})));
await check('CANNOT redeem more points than the subtotal', assertFails(setDoc(doc(cust, 'orders', 'ordBad'), {
  customerId: CUST, shopId: 'shop1', status: 'pending', subtotal: 50000, grandTotal: 0, pointsRedeemed: 999999,
})));
await check('CANNOT place an order as someone else', assertFails(setDoc(doc(other, 'orders', 'ordEvil'), {
  customerId: CUST, shopId: 'shop1', status: 'pending', subtotal: 1000, grandTotal: 1000,
})));

// ---- products: server-owned aggregates ----
await check('owning shop CAN edit its product', assertSucceeds(updateDoc(doc(seller, 'products', 'prod1'), { price: 2000 })));
await check('stranger CANNOT edit a product', assertFails(updateDoc(doc(other, 'products', 'prod1'), { price: 1 })));
await check('stranger CANNOT fake a product rating', assertFails(updateDoc(doc(other, 'products', 'prod1'), { rating: 5 })));

// ---- users: privilege escalation ----
await check('user CAN edit own profile', assertSucceeds(updateDoc(doc(cust, 'users', CUST), { firstName: 'X' })));
await check('user CANNOT grant themselves admin', assertFails(updateDoc(doc(cust, 'users', CUST), { isSuperAdmin: true })));
await check('user CANNOT change own roles', assertFails(updateDoc(doc(cust, 'users', CUST), { roles: ['admin'] })));
await check('user CANNOT fake own rating', assertFails(updateDoc(doc(cust, 'users', CUST), { rating: 5 })));
await check('user CANNOT link themselves to a shop', assertFails(updateDoc(doc(cust, 'users', CUST), { shopId: 'shop1' })));
// target a separate victim so this never mutates CUST (which later tests rely on)
await check('cs_admin CANNOT change another users roles', assertFails(updateDoc(doc(cs, 'users', VICTIM), { roles: ['admin'] })));
await check('cs_admin CANNOT grant super admin', assertFails(updateDoc(doc(cs, 'users', VICTIM), { isSuperAdmin: true })));
await check('cs_admin CAN edit a non-privilege field', assertSucceeds(updateDoc(doc(cs, 'users', VICTIM), { bio: 'ok' })));
await check('super admin CAN change roles (legacy admin role)', assertSucceeds(updateDoc(doc(admin, 'users', VICTIM), { roles: ['technician'] })));

// ---- wallet: self-crediting ----
await check('user CAN request a withdrawal', assertSucceeds(addDoc(collection(cust, 'walletTransactions'), {
  uid: CUST, type: 'withdrawal', amount: 50000,
})));
await check('user CANNOT credit their own balance', assertFails(addDoc(collection(cust, 'walletTransactions'), {
  uid: CUST, type: 'adjustment', amount: 9999999,
})));
await check('user CANNOT withdraw for someone else', assertFails(addDoc(collection(cust, 'walletTransactions'), {
  uid: TECH, type: 'withdrawal', amount: 50000,
})));

// ---- referrals: self-referral ----
await check('CANNOT refer yourself', assertFails(addDoc(collection(cust, 'referrals'), {
  referrerId: CUST, refereeId: CUST,
})));
await check('CAN be referred by someone else', assertSucceeds(addDoc(collection(cust, 'referrals'), {
  referrerId: TECH, refereeId: CUST,
})));

// ---- notifications: phishing guard ----
await check('CAN notify with an internal link', assertSucceeds(addDoc(collection(cust, 'notifications'), {
  userId: TECH, title: 'hi', link: '/orders/1',
})));
await check('CANNOT notify with an external link', assertFails(addDoc(collection(cust, 'notifications'), {
  userId: TECH, title: 'hi', link: 'https://evil.example/steal',
})));
await check('CANNOT notify with a protocol-relative link', assertFails(addDoc(collection(cust, 'notifications'), {
  userId: TECH, title: 'hi', link: '//evil.example',
})));
await check('CANNOT read someone else\'s notifications', assertFails(getDoc(doc(other, 'notifications', 'x'))));

// ---- reviews ----
await check('CAN write a review as yourself', assertSucceeds(addDoc(collection(cust, 'reviews'), {
  jobId: 'job1', raterId: CUST, rateeId: TECH, role: 'technician', rating: 5,
})));
await check('CANNOT write a review as someone else', assertFails(addDoc(collection(cust, 'reviews'), {
  jobId: 'job1', raterId: OTHER, rateeId: TECH, role: 'technician', rating: 1,
})));

// ---- claims: the order-page listener query must be rule-compatible ----
// BUG check: watchClaimsForOrder queries where('orderId','==') only. The read
// rule requires customerId==uid, so a customer's orderId-only query is DENIED.
// A query that ALSO filters customerId is allowed.
await check('customer orderId-ONLY claims query is DENIED (current watchClaimsForOrder)',
  assertFails(getDocs(query(collection(cust, 'claims'), where('orderId', '==', 'ord1')))));
await check('customer orderId+customerId claims query is ALLOWED (the fix)',
  assertSucceeds(getDocs(query(collection(cust, 'claims'), where('orderId', '==', 'ord1'), where('customerId', '==', CUST)))));
await check('admin CAN query all claims by orderId', 
  assertSucceeds(getDocs(query(collection(admin, 'claims'), where('orderId', '==', 'ord1')))));
await check('customer CAN query their own claims by customerId (watchMyClaims)',
  assertSucceeds(getDocs(query(collection(cust, 'claims'), where('customerId', '==', CUST)))));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
