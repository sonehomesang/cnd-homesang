import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG, stampMock } from '../mock';

/** CND delivery zones — a fee + ETA per area; checkout picks one. */
export interface CndZone {
  id: string;
  name: string;
  fee: number;          // product delivery fee
  techFee?: number;     // ຄ່າ ເດີນທາງ ຊ່າງ (ninesang install) for this zone
  eta?: string;
  active: boolean;
  order: number;
  __mock?: boolean;
}
function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndZone {
  return { id, name: d.name ?? '', fee: Number(d.fee) || 0, techFee: typeof d.techFee === 'number' ? d.techFee : undefined, eta: d.eta, active: d.active !== false, order: d.order ?? 99, __mock: !!d[MOCK_FLAG] };
}
export function watchCndZones(cb: (z: CndZone[]) => void) {
  return onSnapshot(query(collection(db, 'cndZones')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => a.order - b.order)),
    (e) => { console.error('watchCndZones:', e); cb([]); });
}
export async function addCndZone(t: { name: string; fee: number; techFee?: number; eta?: string; order?: number }) {
  await addDoc(collection(db, 'cndZones'), { name: t.name.trim(), fee: Math.round(t.fee) || 0, techFee: t.techFee ? Math.round(t.techFee) : undefined, eta: t.eta?.trim() || undefined, order: t.order ?? 99, active: true, createdAt: serverTimestamp() });
}
export async function updateCndZone(id: string, patch: Partial<CndZone>) { await updateDoc(doc(db, 'cndZones', id), patch); }
export async function removeCndZone(id: string) { await deleteDoc(doc(db, 'cndZones', id)); }
export async function seedCndZones(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const rows = [
    { name: '🏬 ຮັບ ເອງ ໜ້າ ຮ້ານ', fee: 0, eta: 'ທັນທີ', order: 1 },
    { name: 'ໃນ ເມືອງ (ວຽງຈັນ)', fee: 30000, eta: '1–2 ຊົ່ວໂມງ', order: 2 },
    { name: 'ຊານ ເມືອງ', fee: 50000, eta: 'ພາຍ ໃນ ມື້', order: 3 },
    { name: 'ຕ່າງ ແຂວງ (ໃກ້)', fee: 80000, eta: '1–2 ມື້', order: 4 },
    { name: 'ຕ່າງ ແຂວງ (ໄກ)', fee: 120000, eta: '2–4 ມື້', order: 5 },
  ];
  const b = writeBatch(db);
  for (const r of rows) b.set(doc(collection(db, 'cndZones')), stampMock({ ...r, active: true, createdAt: serverTimestamp() }));
  await b.commit();
  return rows.length;
}
export async function clearCndZones(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndZones'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}
