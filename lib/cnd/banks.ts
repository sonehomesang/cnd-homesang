import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG, stampMock } from '../mock';

/**
 * CND payment banks — each has its own account + QR image + (future) PSP API
 * credentials. Checkout shows the bank list; the QR appears only when a bank is
 * picked. API fields are placeholders for a real gateway integration later.
 */
export interface CndBank {
  id: string;
  name: string;
  accountNo?: string;
  accountName?: string;
  qrUrl?: string;
  apiMerchantId?: string;
  apiKey?: string;
  apiEndpoint?: string;
  active: boolean;
  order: number;
  __mock?: boolean;
}
function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndBank {
  return {
    id, name: d.name ?? '', accountNo: d.accountNo, accountName: d.accountName, qrUrl: d.qrUrl,
    apiMerchantId: d.apiMerchantId, apiKey: d.apiKey, apiEndpoint: d.apiEndpoint,
    active: d.active !== false, order: d.order ?? 99, __mock: !!d[MOCK_FLAG],
  };
}
export function watchCndBanks(cb: (b: CndBank[]) => void) {
  return onSnapshot(query(collection(db, 'cndBanks')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => a.order - b.order)),
    (e) => { console.error('watchCndBanks:', e); cb([]); });
}
export async function addCndBank(t: Partial<CndBank>) {
  await addDoc(collection(db, 'cndBanks'), {
    name: (t.name || '').trim(), accountNo: t.accountNo?.trim() || undefined, accountName: t.accountName?.trim() || undefined,
    qrUrl: t.qrUrl || undefined, apiMerchantId: t.apiMerchantId?.trim() || undefined, apiKey: t.apiKey?.trim() || undefined, apiEndpoint: t.apiEndpoint?.trim() || undefined,
    order: t.order ?? 99, active: true, createdAt: serverTimestamp(),
  });
}
export async function updateCndBank(id: string, patch: Partial<CndBank>) { await updateDoc(doc(db, 'cndBanks', id), patch); }
export async function removeCndBank(id: string) { await deleteDoc(doc(db, 'cndBanks', id)); }
export async function seedCndBanks(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const rows = [
    { name: 'BCEL', accountNo: '010-1200-000-1234', accountName: 'CND HOME HARDWARE', order: 1 },
    { name: 'JDB', accountNo: '020-9900-112233', accountName: 'CND HOME HARDWARE', order: 2 },
  ];
  const b = writeBatch(db);
  for (const r of rows) b.set(doc(collection(db, 'cndBanks')), stampMock({ ...r, active: true, createdAt: serverTimestamp() }));
  await b.commit();
  return rows.length;
}
export async function clearCndBanks(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndBanks'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}
