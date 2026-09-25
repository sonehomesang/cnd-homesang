import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG, stampMock } from '../mock';

/** CND operating expenses — manual ledger (rent/utilities/salary/misc) for P&L. */
export interface CndExpense { id: string; category: string; amount: number; note?: string; at: number; __mock?: boolean; }
export const EXPENSE_CATS = ['ຄ່າ ເຊົ່າ', 'ໄຟຟ້າ/ນ້ຳ', 'ເງິນ ເດືອນ', 'ຂົນ ສົ່ງ', 'ໂຄສະນາ', 'ອື່ນໆ'];
function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndExpense { return { id, category: d.category ?? 'ອື່ນໆ', amount: Number(d.amount) || 0, note: d.note, at: ms(d.at), __mock: !!d[MOCK_FLAG] }; }

export function watchCndExpenses(cb: (e: CndExpense[]) => void) {
  return onSnapshot(query(collection(db, 'cndExpenses')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.at - a.at)),
    (e) => { console.error('watchCndExpenses:', e); cb([]); });
}
export async function addCndExpense(t: { category: string; amount: number; note?: string }) {
  await addDoc(collection(db, 'cndExpenses'), { category: t.category, amount: Math.round(t.amount), note: t.note?.trim() || undefined, at: serverTimestamp() });
}
export async function removeCndExpense(id: string) { await deleteDoc(doc(db, 'cndExpenses', id)); }
export async function seedCndExpenses(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const now = Date.now();
  const rows = [
    { category: 'ຄ່າ ເຊົ່າ', amount: 3000000, note: 'ຄ່າ ເຊົ່າ ຮ້ານ ເດືອນ ນີ້' },
    { category: 'ໄຟຟ້າ/ນ້ຳ', amount: 850000 },
    { category: 'ເງິນ ເດືອນ', amount: 6000000, note: 'ພະນັກງານ 3 ຄົນ' },
    { category: 'ໂຄສະນາ', amount: 500000, note: 'Facebook ads' },
  ];
  const b = writeBatch(db);
  rows.forEach((r, i) => b.set(doc(collection(db, 'cndExpenses')), stampMock({ ...r, at: now - i * 2 * 86400000 })));
  await b.commit();
  return rows.length;
}
export async function clearCndExpenses(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndExpenses'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}
