import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

/** Platform commission taken from each completed job's price. */
export const PLATFORM_FEE_RATE = 0.1;

export type WithdrawalStatus = 'pending' | 'completed' | 'rejected';

export interface Earning {
  jobId: string;
  title: string;
  gross: number; // job final price
  fee: number; // platform commission
  net: number; // credited to technician
  at: number; // completed timestamp
}

export interface Withdrawal {
  id: string;
  uid: string;
  amount: number;
  status: WithdrawalStatus;
  bankInfo?: string;
  createdAt: number;
}

function tsToMs(v: any): number {
  return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : Date.now();
}

/** Technician earnings, derived from their completed jobs. */
export function watchEarnings(techId: string, cb: (earnings: Earning[]) => void) {
  const q = query(collection(db, 'jobs'), where('assignedProviderId', '==', techId));
  return onSnapshot(
    q,
    (snap) => {
      const list: Earning[] = [];
      snap.docs.forEach((d) => {
        const j: any = d.data();
        if (j.status !== 'completed' || typeof j.finalPrice !== 'number') return;
        const gross = j.finalPrice;
        const fee = Math.round(gross * PLATFORM_FEE_RATE);
        list.push({
          jobId: d.id,
          title: j.title ?? 'ງານ',
          gross,
          fee,
          net: gross - fee,
          at: tsToMs(j.completedAt ?? j.createdAt),
        });
      });
      list.sort((a, b) => b.at - a.at);
      cb(list);
    },
    (e) => {
      console.error('watchEarnings:', e);
      cb([]);
    },
  );
}

export function watchWithdrawals(techId: string, cb: (w: Withdrawal[]) => void) {
  const q = query(collection(db, 'walletTransactions'), where('uid', '==', techId));
  return onSnapshot(
    q,
    (snap) => {
      const list: Withdrawal[] = [];
      snap.docs.forEach((d) => {
        const data: any = d.data();
        if (data.type !== 'withdrawal') return;
        list.push({
          id: d.id,
          uid: data.uid,
          amount: data.amount,
          status: data.status,
          bankInfo: data.bankInfo,
          createdAt: tsToMs(data.createdAt),
        });
      });
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => {
      console.error('watchWithdrawals:', e);
      cb([]);
    },
  );
}

/** A manual credit (e.g. dispute settlement payout) added to a technician's wallet. */
export interface Credit {
  id: string;
  amount: number;
  reason: string;
  jobId?: string;
  at: number;
}

/** Technician's manual credits (dispute payouts / adjustments). */
export function watchCredits(uid: string, cb: (c: Credit[]) => void) {
  // single-field query (no composite index); filter type client-side
  const q = query(collection(db, 'walletTransactions'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: Credit[] = [];
      snap.docs.forEach((d) => {
        const data: any = d.data();
        if (data.type !== 'adjustment') return;
        list.push({ id: d.id, amount: data.amount, reason: data.reason ?? 'ປັບຍອດ', jobId: data.jobId, at: tsToMs(data.createdAt) });
      });
      list.sort((a, b) => b.at - a.at);
      cb(list);
    },
    (e) => { console.error('watchCredits:', e); cb([]); },
  );
}

/** Credit a technician's wallet (admin-only via rules) — e.g. dispute payout. */
export async function creditTechnician(uid: string, amount: number, reason: string, jobId?: string) {
  await addDoc(collection(db, 'walletTransactions'), {
    uid,
    type: 'adjustment',
    amount,
    reason,
    ...(jobId ? { jobId } : {}),
    status: 'completed' as WithdrawalStatus,
    createdAt: serverTimestamp(),
  });
}

export interface WalletBalance {
  totalEarned: number;
  withdrawn: number; // completed withdrawals
  pending: number; // pending withdrawals
  available: number;
}

export function computeBalance(earnings: Earning[], withdrawals: Withdrawal[], credits: Credit[] = []): WalletBalance {
  const totalEarned = earnings.reduce((s, e) => s + e.net, 0) + credits.reduce((s, c) => s + c.amount, 0);
  const withdrawn = withdrawals
    .filter((w) => w.status === 'completed')
    .reduce((s, w) => s + w.amount, 0);
  const pending = withdrawals
    .filter((w) => w.status === 'pending')
    .reduce((s, w) => s + w.amount, 0);
  return { totalEarned, withdrawn, pending, available: totalEarned - withdrawn - pending };
}

// ===================== ADMIN =====================

/** All technician withdrawal requests (admin queue). */
export function watchAllWithdrawals(cb: (w: Withdrawal[]) => void) {
  const q = query(collection(db, 'walletTransactions'), where('type', '==', 'withdrawal'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => {
          const data: any = d.data();
          return { id: d.id, uid: data.uid, amount: data.amount, status: data.status, bankInfo: data.bankInfo, createdAt: tsToMs(data.createdAt) } as Withdrawal;
        })
        .sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => {
      console.error('watchAllWithdrawals:', e);
      cb([]);
    },
  );
}

/** Admin approves / rejects a withdrawal (audit-logged via records). */
export async function setWithdrawalStatus(id: string, status: WithdrawalStatus) {
  const { saveRecord } = await import('./records');
  await saveRecord('walletTransactions', id, { status });
}

export async function requestWithdrawal(uid: string, amount: number, bankInfo: string) {
  await addDoc(collection(db, 'walletTransactions'), {
    uid,
    type: 'withdrawal',
    amount,
    status: 'pending' as WithdrawalStatus,
    ...(bankInfo ? { bankInfo } : {}),
    createdAt: serverTimestamp(),
  });
}
