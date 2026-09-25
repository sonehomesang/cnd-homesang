import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

// CND Cloud Functions — split from the shared HomeSang backend.
// Contains ONLY: Twilio phone-OTP (sign-up / reset / config check) and the CND
// order/coupon/stock/staff/booking triggers. All HomeSang-only functions and
// their helpers were removed in the CND split (Stage 2).
setGlobalOptions({ region: 'asia-southeast1' });

admin.initializeApp();

const dbf = () => admin.firestore();

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
