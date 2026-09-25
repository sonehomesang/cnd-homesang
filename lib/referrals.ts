import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

export interface Referral {
  id: string;
  code: string;
  referrerId: string;
  refereeId: string;
  refereeName?: string;
  status: string; // joined
  createdAt: number;
}

/** Deterministic short referral code for a user. */
export function codeForUid(uid: string): string {
  return 'R' + uid.slice(0, 6).toUpperCase();
}

/** Resolve a referral/broker code → the owner's uid (or null). */
export async function resolveReferrer(code: string): Promise<string | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  try {
    const snap = await getDocs(query(collection(db, 'userCards'), where('referralCode', '==', clean), limit(1)));
    return snap.empty ? null : snap.docs[0].id;
  } catch {
    return null;
  }
}

function toMillis(v: any): number {
  return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;
}

/** Ensure the user's profile carries their referral code; returns it. */
export async function ensureMyCode(uid: string): Promise<string> {
  const code = codeForUid(uid);
  await setDoc(doc(db, 'users', uid), { referralCode: code }, { merge: true });
  return code;
}

export class ReferralError extends Error {}

/**
 * Apply a referrer's code to the current (referee) user. Creates a referral
 * record and stamps `referredBy` on the referee's profile. One-time.
 */
export async function applyReferral(code: string, refereeUid: string, refereeName?: string) {
  const clean = code.trim().toUpperCase();
  if (!clean) throw new ReferralError('ໃສ່ລະຫັດແນະນຳ');
  if (clean === codeForUid(refereeUid)) throw new ReferralError('ໃຊ້ລະຫັດຂອງຕົນເອງບໍ່ໄດ້');

  const snap = await getDocs(query(collection(db, 'userCards'), where('referralCode', '==', clean), limit(1)));
  if (snap.empty) throw new ReferralError('ບໍ່ພົບລະຫັດນີ້');
  const referrerId = snap.docs[0].id;
  if (referrerId === refereeUid) throw new ReferralError('ໃຊ້ລະຫັດຂອງຕົນເອງບໍ່ໄດ້');

  // deterministic id = one referral per (referrer, referee) pair → no duplicate
  // (the referral reward is derived per-doc, so dupes would inflate it).
  const refRef = doc(db, 'referrals', `${referrerId}_${refereeUid}`);
  if ((await getDoc(refRef)).exists()) return; // already applied
  await setDoc(refRef, {
    code: clean,
    referrerId,
    refereeId: refereeUid,
    ...(refereeName ? { refereeName } : {}),
    status: 'joined',
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'users', refereeUid), { referredBy: referrerId }, { merge: true });
}

/**
 * Web: consume a `?ref` code stashed at landing (Slice 4 → localStorage hs_ref)
 * and apply it for the newly-signed-up user. Best-effort — invalid/self/dup
 * codes are ignored, and the code is cleared either way so it applies once.
 */
export async function consumeStashedReferral(uid: string, name?: string): Promise<void> {
  if (typeof window === 'undefined') return;
  let code: string | null = null;
  try { code = window.localStorage?.getItem('hs_ref') ?? null; } catch { return; }
  if (!code) return;
  try {
    await applyReferral(code, uid, name);
  } catch {
    /* invalid / self / duplicate — ignore */
  } finally {
    try { window.localStorage?.removeItem('hs_ref'); } catch { /* ignore */ }
  }
}

/** All referrals (admin). */
export function watchAllReferrals(cb: (r: Referral[]) => void) {
  return onSnapshot(
    collection(db, 'referrals'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMillis((d.data() as any).createdAt) }) as Referral);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchAllReferrals:', e); cb([]); },
  );
}

export function watchMyReferrals(referrerId: string, cb: (r: Referral[]) => void) {
  const q = query(collection(db, 'referrals'), where('referrerId', '==', referrerId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMillis((d.data() as any).createdAt) }) as Referral);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchMyReferrals:', e); cb([]); },
  );
}

/** Referrals where the current user is the REFEREE (the invited new friend) —
 * used to derive their one-time welcome reward. Rules allow reading own. */
export function watchReferralsToMe(refereeUid: string, cb: (r: Referral[]) => void) {
  const q = query(collection(db, 'referrals'), where('refereeId', '==', refereeUid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMillis((d.data() as any).createdAt) }) as Referral);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchReferralsToMe:', e); cb([]); },
  );
}
