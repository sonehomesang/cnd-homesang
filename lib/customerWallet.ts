import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';

/**
 * CUSTOMER spendable wallet — separate from the technician earnings wallet
 * (lib/wallet.ts). Balance = Σ verified top-ups − Σ spends. Top-ups are
 * customer-requested (admin verifies the slip) OR admin-credited directly.
 * Spends are created ONLY server-side (a Cloud Function transaction that checks
 * the balance), so the balance can never be forged or overdrawn.
 */
export type TopupStatus = 'pending' | 'verified' | 'rejected';

export interface WalletTopup {
  id: string;
  uid: string;
  amount: number;
  slipUrl?: string;
  status: TopupStatus;
  byAdmin?: boolean;   // admin credited directly (no slip)
  note?: string;
  createdAt: number;
  verifiedAt?: number;
}

export interface WalletSpend {
  id: string;
  uid: string;
  amount: number;
  reason: string;      // 'order' | 'surveyFee' | ...
  refId?: string;
  createdAt: number;
}

function ms(v: any): number {
  return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;
}

/** Balance a customer can spend right now. */
export function customerBalance(topups: WalletTopup[], spends: WalletSpend[]): number {
  const credit = topups.filter((t) => t.status === 'verified').reduce((s, t) => s + (t.amount || 0), 0);
  const debit = spends.reduce((s, t) => s + (t.amount || 0), 0);
  return credit - debit;
}

/** Pay `amount` from the wallet balance via the server (throws if the balance
 * is insufficient). Returns the new balance. The ONLY way a spend is recorded. */
export async function spendFromWallet(amount: number, reason: string, refId?: string): Promise<number> {
  const res: any = await httpsCallable(functions, 'spendWallet')({ amount: Math.round(amount), reason, refId });
  return res?.data?.balance ?? 0;
}

/** Customer requests a top-up — stays PENDING until an admin verifies the slip. */
export async function requestTopup(uid: string, amount: number, slipUrl?: string) {
  const amt = Math.round(amount);
  if (!(amt > 0)) throw new Error('ຈຳນວນ ບໍ່ ຖືກຕ້ອງ');
  await addDoc(collection(db, 'walletTopups'), {
    uid,
    amount: amt,
    status: 'pending' as TopupStatus,
    ...(slipUrl ? { slipUrl } : {}),
    createdAt: serverTimestamp(),
  });
}

/** Admin credits a customer's wallet directly (immediately verified). */
export async function adminCreditWallet(uid: string, amount: number, note?: string) {
  const amt = Math.round(amount);
  if (!(amt > 0)) throw new Error('ຈຳນວນ ບໍ່ ຖືກຕ້ອງ');
  await addDoc(collection(db, 'walletTopups'), {
    uid,
    amount: amt,
    status: 'verified' as TopupStatus,
    byAdmin: true,
    ...(note ? { note } : {}),
    createdAt: serverTimestamp(),
    verifiedAt: serverTimestamp(),
  });
}

/** Admin verifies / rejects a pending top-up request. */
export async function setTopupStatus(id: string, status: TopupStatus) {
  await updateDoc(doc(db, 'walletTopups', id), {
    status,
    ...(status === 'verified' ? { verifiedAt: serverTimestamp() } : {}),
  });
}

function mapTopup(id: string, d: any): WalletTopup {
  return {
    id, uid: d.uid, amount: d.amount || 0, slipUrl: d.slipUrl,
    status: d.status ?? 'pending', byAdmin: d.byAdmin, note: d.note,
    createdAt: ms(d.createdAt), verifiedAt: d.verifiedAt ? ms(d.verifiedAt) : undefined,
  };
}
function mapSpend(id: string, d: any): WalletSpend {
  return { id, uid: d.uid, amount: d.amount || 0, reason: d.reason ?? '', refId: d.refId, createdAt: ms(d.createdAt) };
}

export function watchMyTopups(uid: string, cb: (t: WalletTopup[]) => void) {
  return onSnapshot(
    query(collection(db, 'walletTopups'), where('uid', '==', uid)),
    (s) => cb(s.docs.map((d) => mapTopup(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchMyTopups:', e); cb([]); },
  );
}

export function watchMySpends(uid: string, cb: (t: WalletSpend[]) => void) {
  return onSnapshot(
    query(collection(db, 'walletSpends'), where('uid', '==', uid)),
    (s) => cb(s.docs.map((d) => mapSpend(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchMySpends:', e); cb([]); },
  );
}

/** Admin: pending top-up requests awaiting verification. */
export function watchPendingTopups(cb: (t: WalletTopup[]) => void) {
  return onSnapshot(
    query(collection(db, 'walletTopups'), where('status', '==', 'pending')),
    (s) => cb(s.docs.map((d) => mapTopup(d.id, d.data())).sort((a, b) => a.createdAt - b.createdAt)),
    (e) => { console.error('watchPendingTopups:', e); cb([]); },
  );
}
