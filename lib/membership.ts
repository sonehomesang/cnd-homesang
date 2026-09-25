import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  doc,
} from 'firebase/firestore';
import { db } from './firebase';

export interface Plan {
  id: string;
  name: string;
  nameLao: string;
  price: number; // LAK; 0 = free trial
  durationDays: number;
  features: string[];
  order?: number;
  active: boolean;
}

export type SubStatus = 'trial' | 'pending' | 'active' | 'expired';

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  status: SubStatus;
  startAt: number;
  endAt?: number;
  createdAt: number;
}

function toMillis(v: any): number {
  return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;
}

export function watchPlans(cb: (p: Plan[]) => void) {
  return onSnapshot(
    collection(db, 'membershipPlans'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Plan).filter((p) => p.active !== false);
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      cb(list);
    },
    (e) => { console.error('watchPlans:', e); cb([]); },
  );
}

/** All plans incl. inactive (admin). */
export function watchAllPlans(cb: (p: Plan[]) => void) {
  return onSnapshot(
    collection(db, 'membershipPlans'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Plan);
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      cb(list);
    },
    (e) => { console.error('watchAllPlans:', e); cb([]); },
  );
}

/** All subscriptions (admin). */
export function watchAllSubscriptions(cb: (s: Subscription[]) => void) {
  return onSnapshot(
    collection(db, 'subscriptions'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMillis((d.data() as any).createdAt), startAt: toMillis((d.data() as any).startAt), endAt: (d.data() as any).endAt ? toMillis((d.data() as any).endAt) : undefined }) as Subscription);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchAllSubscriptions:', e); cb([]); },
  );
}

export async function setSubscriptionStatus(id: string, status: SubStatus) {
  const { saveRecord } = await import('./records');
  await saveRecord('subscriptions', id, { status });
}

export function watchMySubscription(userId: string, cb: (s: Subscription | null) => void) {
  const q = query(collection(db, 'subscriptions'), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMillis((d.data() as any).createdAt), startAt: toMillis((d.data() as any).startAt), endAt: (d.data() as any).endAt ? toMillis((d.data() as any).endAt) : undefined }) as Subscription);
      list.sort((a, b) => b.createdAt - a.createdAt);
      // latest non-expired, else latest
      const active = list.find((s) => s.status === 'active' || s.status === 'trial' || s.status === 'pending');
      cb(active ?? list[0] ?? null);
    },
    (e) => { console.error('watchMySubscription:', e); cb(null); },
  );
}

export async function subscribe(userId: string, plan: Plan): Promise<void> {
  const now = Date.now();
  const isTrial = plan.price === 0;
  await addDoc(collection(db, 'subscriptions'), {
    userId,
    planId: plan.id,
    planName: plan.nameLao,
    status: (isTrial ? 'trial' : 'pending') as SubStatus,
    startAt: now,
    endAt: now + plan.durationDays * 86400000,
    createdAt: serverTimestamp(),
  });
}

const SEED: Omit<Plan, 'id'>[] = [
  { name: 'Trial', nameLao: 'ທົດລອງ 30 ມື້', price: 0, durationDays: 30, order: 1, active: true,
    features: ['ໃຊ້ຄົບທຸກ feature 30 ມື້', 'ໂພສງານ ບໍ່ຈຳກັດ', 'ບໍ່ມີຄ່າໃຊ້ຈ່າຍ'] },
  { name: 'Monthly', nameLao: 'ລາຍເດືອນ', price: 50000, durationDays: 30, order: 2, active: true,
    features: ['ໂພສງານ/ສິນຄ້າ ບໍ່ຈຳກັດ', 'ປ້າຍ ເດັ່ນ', 'ສະຫນັບສະຫນູນ ດ່ວນ'] },
  { name: 'Annual', nameLao: 'ລາຍປີ', price: 500000, durationDays: 365, order: 3, active: true,
    features: ['ປະຢັດ 2 ເດືອນ', 'ທຸກຢ່າງຂອງລາຍເດືອນ', 'badge ສະມາຊິກ'] },
];

export async function seedPlansIfEmpty(): Promise<number> {
  const snap = await getDocs(collection(db, 'membershipPlans'));
  if (!snap.empty) return 0;
  const batch = writeBatch(db);
  SEED.forEach((p) => batch.set(doc(collection(db, 'membershipPlans')), p));
  await batch.commit();
  return SEED.length;
}
