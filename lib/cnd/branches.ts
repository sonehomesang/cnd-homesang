import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG, stampMock } from '../mock';

/** CND branches / warehouses. Stock is tracked per branch (product.stockByBranch);
 *  the "active branch" (localStorage) is what POS + inventory operate on. */
export interface CndBranch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  order?: number;
  active: boolean;
  __mock?: boolean;
  createdAt: number;
}
function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndBranch {
  return { id, name: d.name ?? '', address: d.address, phone: d.phone, order: d.order, active: d.active !== false, __mock: !!d[MOCK_FLAG], createdAt: ms(d.createdAt) };
}

export function watchCndBranches(cb: (b: CndBranch[]) => void) {
  return onSnapshot(query(collection(db, 'cndBranches')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))),
    (e) => { console.error('watchCndBranches:', e); cb([]); });
}
export async function addCndBranch(b: { name: string; address?: string; phone?: string; order?: number }) {
  await addDoc(collection(db, 'cndBranches'), { name: b.name.trim(), address: b.address?.trim() || undefined, phone: b.phone?.trim() || undefined, order: b.order ?? 0, active: true, createdAt: serverTimestamp() });
}
export async function updateCndBranch(id: string, patch: Partial<Pick<CndBranch, 'name' | 'address' | 'phone' | 'order' | 'active'>>) { await updateDoc(doc(db, 'cndBranches', id), { ...patch } as any); }
export async function deleteCndBranch(id: string) { await deleteDoc(doc(db, 'cndBranches', id)); }

export async function seedCndBranches(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const rows = [
    { name: 'ສາຂາ ໃຫຍ່ (ສຳ ນັກງານ)', address: 'ວຽງຈັນ', order: 1 },
    { name: 'ສາຂາ ໂພນໂພສີ', address: 'ວຽງຈັນ', order: 2 },
  ];
  const b = writeBatch(db);
  for (const r of rows) b.set(doc(collection(db, 'cndBranches')), stampMock({ ...r, active: true, createdAt: serverTimestamp() }));
  await b.commit();
  return rows.length;
}
export async function clearCndBranches(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndBranches'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}

// ── active branch (localStorage) ──
const KEY = 'cnd_branch';
export function getActiveBranchId(): string | null {
  try { return (typeof window !== 'undefined' && window.localStorage?.getItem(KEY)) || null; } catch { return null; }
}
export function setActiveBranchId(id: string) { try { if (typeof window !== 'undefined') window.localStorage?.setItem(KEY, id); } catch { /* ignore */ } }
export function pickActiveBranch(branches: CndBranch[]): CndBranch | null {
  if (!branches.length) return null;
  const id = getActiveBranchId();
  return branches.find((b) => b.id === id && b.active) ?? branches.find((b) => b.active) ?? branches[0];
}
