/**
 * Security-rules tests for deliveryTasks (run against the Firestore emulator).
 *
 *   npx firebase emulators:exec --only firestore "node scripts/test-rules.mjs"
 *
 * The critical case is FEE INFLATION: a rider could previously write `fee` on
 * their own task and mint unlimited wallet balance. These tests pin that shut
 * along with the other delivery-task invariants.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'fs';

const PROJECT = 'homesang-rules-test';
let pass = 0, fail = 0;
const check = async (name, p) => {
  try { await p; console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e?.message ?? e}`); fail++; }
};

const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
});

const BUYER = 'buyer1', RIDER = 'rider1', RIDER2 = 'rider2', OUTSIDER = 'nobody1';
const TASK = 'task1';

// seed: an approved+active rider, an unapproved rider, and one OPEN task
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'riders', RIDER), { name: 'R1', approved: true, active: true });
  await setDoc(doc(db, 'riders', RIDER2), { name: 'R2', approved: false, active: true });
  await setDoc(doc(db, 'users', BUYER), { roles: [] });
  await setDoc(doc(db, 'users', RIDER), { roles: [] });
  await setDoc(doc(db, 'deliveryTasks', TASK), {
    orderId: 'o1', customerId: BUYER, shopId: 's1',
    fee: 25000, codAmount: 66000, status: 'open',
  });
});

const asRider = env.authenticatedContext(RIDER).firestore();
const asRider2 = env.authenticatedContext(RIDER2).firestore();
const asBuyer = env.authenticatedContext(BUYER).firestore();
const asOutsider = env.authenticatedContext(OUTSIDER).firestore();
const t = (db) => doc(db, 'deliveryTasks', TASK);

// ---- reads ----
await check('approved rider can read the OPEN queue', assertSucceeds(getDoc(t(asRider))));
await check('buyer can read their own task', assertSucceeds(getDoc(t(asBuyer))));
await check('unrelated signed-in user CANNOT read a task', assertFails(getDoc(t(asOutsider))));

// ---- claiming ----
await check('unapproved rider CANNOT claim', assertFails(updateDoc(t(asRider2), {
  status: 'accepted', assignedRiderId: RIDER2, assignedRiderName: 'R2',
})));
await check('rider CANNOT claim while also inflating fee', assertFails(updateDoc(t(asRider), {
  status: 'accepted', assignedRiderId: RIDER, assignedRiderName: 'R1', fee: 50000000,
})));
await check('rider CANNOT claim as someone else', assertFails(updateDoc(t(asRider), {
  status: 'accepted', assignedRiderId: RIDER2, assignedRiderName: 'R2',
})));
await check('approved rider CAN claim an open task', assertSucceeds(updateDoc(t(asRider), {
  status: 'accepted', assignedRiderId: RIDER, assignedRiderName: 'R1', riderPlate: 'AB 1234',
})));

// ---- the money hole ----
await check('assigned rider CANNOT inflate fee', assertFails(updateDoc(t(asRider), { fee: 50000000 })));
await check('assigned rider CANNOT change codAmount', assertFails(updateDoc(t(asRider), { codAmount: 1 })));
await check('assigned rider CANNOT self-confirm COD remittance', assertFails(updateDoc(t(asRider), { codRemitted: true })));
await check('assigned rider CANNOT repoint orderId', assertFails(updateDoc(t(asRider), { orderId: 'other' })));

// ---- status transitions ----
await check('CANNOT skip pickup (accepted → delivered)', assertFails(updateDoc(t(asRider), { status: 'delivered' })));
await check('CAN advance accepted → picked_up', assertSucceeds(updateDoc(t(asRider), { status: 'picked_up' })));
await check('CAN share live location', assertSucceeds(updateDoc(t(asRider), { riderLat: 17.9, riderLng: 102.6 })));
await check('rider CANNOT under-report COD (erasing their debt)',
  assertFails(updateDoc(t(asRider), { codCollected: 0 })));
await check('CAN advance picked_up → delivered with proof', assertSucceeds(updateDoc(t(asRider), {
  status: 'delivered', recipientName: 'Somchai', handoverOk: true,
})));
await check('CANNOT re-open a delivered task', assertFails(updateDoc(t(asRider), { status: 'open' })));

// ---- other riders / buyer ----
await check('other rider CANNOT touch an assigned task', assertFails(updateDoc(t(asRider2), { status: 'open' })));
await check('buyer CAN tip', assertSucceeds(updateDoc(t(asBuyer), { tip: 10000 })));
await check('buyer CANNOT tip negative', assertFails(updateDoc(t(asBuyer), { tip: -5000 })));
await check('buyer CANNOT change the fee', assertFails(updateDoc(t(asBuyer), { fee: 999999 })));
// negative buyer tests need a task that is NOT already in the target state,
// otherwise the write is a no-op (empty diff) and proves nothing.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'deliveryTasks', 'task2'), {
    orderId: 'o2', customerId: BUYER, shopId: 's1', fee: 25000, codAmount: 50000,
    status: 'picked_up', assignedRiderId: RIDER, assignedRiderName: 'R1',
  });
});
const t2 = (db) => doc(db, 'deliveryTasks', 'task2');
await check('buyer CANNOT mark delivered', assertFails(updateDoc(t2(asBuyer), { status: 'delivered' })));
await check('buyer CANNOT self-confirm their own tip', assertFails(updateDoc(t2(asBuyer), { tipConfirmed: true })));
await check('buyer CANNOT clear the rider assignment', assertFails(updateDoc(t2(asBuyer), { assignedRiderId: 'x' })));
await check('buyer CAN cancel their own delivery', assertSucceeds(updateDoc(t2(asBuyer), { status: 'cancelled' })));

// ---- payment-held tasks (non-COD orders wait for slip verification) ----
const SHOP = 'shopOwner1';
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', SHOP), { roles: [] });
  await setDoc(doc(db, 'shops', 'shopA'), { ownerId: SHOP });
  await setDoc(doc(db, 'deliveryTasks', 'held1'), {
    orderId: 'o3', customerId: BUYER, shopId: 'shopA',
    fee: 25000, status: 'open', heldForPayment: true,
  });
});
const asShop = env.authenticatedContext(SHOP).firestore();
const held = (db) => doc(db, 'deliveryTasks', 'held1');
await check('approved rider CANNOT claim a payment-held task', assertFails(updateDoc(held(asRider), {
  status: 'accepted', assignedRiderId: RIDER, assignedRiderName: 'R1',
})));
await check('rider CANNOT self-release the payment hold', assertFails(updateDoc(held(asRider), { heldForPayment: false })));
await check('selling shop CAN release the payment hold', assertSucceeds(updateDoc(held(asShop), { heldForPayment: false })));
await check('rider CAN claim once released', assertSucceeds(updateDoc(held(asRider), {
  status: 'accepted', assignedRiderId: RIDER, assignedRiderName: 'R1',
})));

// ---- REGRESSION: a real user doc has NO isSuperAdmin field (createUserProfile
// never writes one). Any rule that evaluates isAdmin() FIRST must still fall
// through to the owner branch instead of erroring out.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'orders', 'ord1'), {
    customerId: BUYER, shopId: 's1', status: 'pending', paymentVerified: false,
  });
});
await check('buyer WITHOUT isSuperAdmin field can cancel their own order',
  assertSucceeds(updateDoc(doc(asBuyer, 'orders', 'ord1'), { status: 'cancelled' })));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
