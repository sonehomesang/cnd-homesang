import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG, stampMock } from '../mock';

/** CND suppliers — vendors CND buys stock from (used by purchase orders). */
export interface CndSupplier {
  id: string;
  name: string;
  phone?: string;
  contact?: string;   // contact person
  address?: string;
  active: boolean;
  createdAt: number;
  __mock?: boolean;
}
function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndSupplier {
  return { id, name: d.name ?? '', phone: d.phone, contact: d.contact, address: d.address, active: d.active !== false, createdAt: ms(d.createdAt), __mock: !!d[MOCK_FLAG] };
}
export function watchCndSuppliers(cb: (s: CndSupplier[]) => void) {
  return onSnapshot(query(collection(db, 'cndSuppliers')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name))),
    (e) => { console.error('watchCndSuppliers:', e); cb([]); });
}
export async function addCndSupplier(t: { name: string; phone?: string; contact?: string; address?: string }) {
  await addDoc(collection(db, 'cndSuppliers'), { name: t.name.trim(), phone: t.phone?.trim() || undefined, contact: t.contact?.trim() || undefined, address: t.address?.trim() || undefined, active: true, createdAt: serverTimestamp() });
}
export async function updateCndSupplier(id: string, patch: Partial<CndSupplier>) { await updateDoc(doc(db, 'cndSuppliers', id), patch); }
export async function removeCndSupplier(id: string) { await deleteDoc(doc(db, 'cndSuppliers', id)); }
export async function seedCndSuppliers(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const rows = [
    { name: 'SCG ຜູ້ ຈຳໜ່າຍ ວັດສະດຸ', phone: '021 555 100', contact: 'ທ້າວ ວົງ' },
    { name: 'ບໍລິສັດ ໄຟຟ້າ ວຽງຈັນ', phone: '021 555 200', contact: 'ນາງ ພອນ' },
    { name: 'HomePro ຂາຍ ສົ່ງ', phone: '021 555 300', contact: 'ທ້າວ ສຸກ' },
    { name: 'MITSUBISHI ຕົວແທນ ລາວ', phone: '021 555 400', contact: 'ນາງ ດາ' },
  ];
  const b = writeBatch(db);
  for (const r of rows) b.set(doc(collection(db, 'cndSuppliers')), stampMock({ ...r, active: true, createdAt: serverTimestamp() }));
  await b.commit();
  return rows.length;
}
export async function clearCndSuppliers(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndSuppliers'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}
