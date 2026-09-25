import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG, stampMock } from '../mock';

/**
 * CND's OWN registered technician pool. CND arranges the installer from this
 * list (not the HomeSang marketplace — that integration is a future option).
 */
export interface CndTech {
  id: string;
  name: string;
  trade: string;      // ໄຟຟ້າ · ປະປາ · ແອຣ໌ · ทั่วไป …
  phone?: string;
  area?: string;
  company?: string;    // ສັງກັດ / ບໍລິສັດ ຕົ້ນ ສັງກັດ (in-house = CND)
  supervisor?: string; // ຫົວໜ້າ / ຜູ້ ຄຸມ ງານ
  verified?: boolean;      // official CND-ໂຮມຊ່າງ certified stamp
  photo?: string;          // profile photo url
  certifications?: string; // ໃບ ຢັ້ງຢືນ / ທັກສະ ພິເສດ (free text)
  jobsDone?: number;       // denormalized from orders (public-readable; used at checkout)
  ratingAvg?: number;      // denormalized average rating
  active: boolean;
  __mock?: boolean;
  createdAt: number;
}
function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndTech {
  return { id, name: d.name ?? '', trade: d.trade ?? '', phone: d.phone, area: d.area, company: d.company, supervisor: d.supervisor, verified: !!d.verified, photo: d.photo, certifications: d.certifications, jobsDone: typeof d.jobsDone === 'number' ? d.jobsDone : undefined, ratingAvg: typeof d.ratingAvg === 'number' ? d.ratingAvg : undefined, active: d.active !== false, __mock: !!d[MOCK_FLAG], createdAt: ms(d.createdAt) };
}
export async function updateCndTech(id: string, patch: Partial<Pick<CndTech, 'name' | 'trade' | 'phone' | 'area' | 'company' | 'supervisor' | 'verified' | 'photo' | 'certifications' | 'jobsDone' | 'ratingAvg' | 'active'>>) {
  await updateDoc(doc(db, 'cndTechs', id), { ...patch } as any);
}
export function watchCndTechs(cb: (t: CndTech[]) => void) {
  return onSnapshot(query(collection(db, 'cndTechs')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name))),
    (e) => { console.error('watchCndTechs:', e); cb([]); });
}
export async function addCndTech(t: { name: string; trade: string; phone?: string; area?: string; company?: string; supervisor?: string }) {
  await addDoc(collection(db, 'cndTechs'), { name: t.name.trim(), trade: t.trade, phone: t.phone?.trim() || undefined, area: t.area?.trim() || undefined, company: t.company?.trim() || undefined, supervisor: t.supervisor?.trim() || undefined, active: true, createdAt: serverTimestamp() });
}
export async function setCndTechActive(id: string, active: boolean) { await updateDoc(doc(db, 'cndTechs', id), { active }); }
export async function removeCndTech(id: string) { await deleteDoc(doc(db, 'cndTechs', id)); }

export async function seedCndTechs(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const rows = [
    { name: 'ທ້າວ ບຸນມີ (ຊ່າງໄຟ)', trade: 'ໄຟຟ້າ', phone: '020 5555 1111', area: 'ວຽງຈັນ' },
    { name: 'ທ້າວ ສົມພອນ (ແອຣ໌)', trade: 'ແອຣ໌', phone: '020 5555 2222', area: 'ວຽງຈັນ' },
    { name: 'ທ້າວ ຄຳ (ปะปา)', trade: 'ປະປາ', phone: '020 5555 3333', area: 'ວຽງຈັນ' },
    { name: 'ທ້າວ ໄຊ (ທົ່ວ ໄປ)', trade: 'ທົ່ວ ໄປ', phone: '020 5555 4444', area: 'ວຽງຈັນ' },
    { name: 'ທ້າວ ວັນ (ຊ່າງ ແອຣ໌)', trade: 'ແອຣ໌', phone: '020 5555 5555', area: 'ວຽງຈັນ · ໄຊເສດຖາ' },
    { name: 'ທ້າວ ພອນ (ໄຟຟ້າ)', trade: 'ໄຟຟ້າ', phone: '020 5555 6666', area: 'ວຽງຈັນ · ຈັນທະບູລີ' },
    { name: 'ທ້າວ ໂຕ້ (ปูกระเบื้อง)', trade: 'ກໍ່ສ້າງ', phone: '020 5555 7777', area: 'ວຽງຈັນ' },
    { name: 'ນາງ ດາ (ທາສີ)', trade: 'ທາສີ', phone: '020 5555 8888', area: 'ວຽງຈັນ · ສີສັດຕະນາກ' },
  ];
  // org affiliation — who each tech belongs to + their foreman (round-robin)
  const ORGS = [
    { company: 'CND ຊ່າງ ໃນ ເຄືອ', supervisor: 'ທ້າວ ສຸກ (ຫົວໜ້າ ຊ່າງ)' },
    { company: 'ຫ້ອງການ ຊ່າງ ວຽງຈັນ (partner)', supervisor: 'ທ້າວ ໄມ (ຜູ້ ຄຸມ ງານ)' },
    { company: 'ບໍລິສັດ ຕິດຕັ້ງ V.I.P (partner)', supervisor: 'ນາງ ອຳ (ຫົວໜ້າ ທີມ)' },
  ];
  const b = writeBatch(db);
  rows.forEach((r, i) => b.set(doc(collection(db, 'cndTechs')), stampMock({ ...r, ...ORGS[i % ORGS.length], active: true, createdAt: serverTimestamp() })));
  await b.commit();
  return rows.length;
}
/**
 * Ninesang P4 — recompute each tech's denormalized jobsDone/ratingAvg straight
 * from cndOrders and write them to the public cndTechs docs. Auto skill-tier
 * (computeTechTier) reads those, so the badge/tier update everywhere after this.
 * Self-contained (reads both collections) so it can run inside the storefront
 * "publish" pass as well as from the admin button.
 */
export async function rebuildCndTechStats(): Promise<number> {
  const [oSnap, tSnap] = await Promise.all([
    getDocs(query(collection(db, 'cndOrders'))),
    getDocs(query(collection(db, 'cndTechs'))),
  ]);
  const agg = new Map<string, { done: number; rated: number; sum: number }>();
  oSnap.forEach((d) => {
    const inst = (d.data() as any).install;
    const tid = inst?.techId;
    if (!inst || !tid) return;
    const a = agg.get(tid) ?? { done: 0, rated: 0, sum: 0 };
    if (inst.stage === 'done') a.done++;
    if (typeof inst.rating === 'number') { a.rated++; a.sum += inst.rating; }
    agg.set(tid, a);
  });
  const batch = writeBatch(db);
  tSnap.forEach((d) => {
    const a = agg.get(d.id) ?? { done: 0, rated: 0, sum: 0 };
    batch.update(d.ref, { jobsDone: a.done, ratingAvg: a.rated ? Math.round((a.sum / a.rated) * 10) / 10 : 0 });
  });
  await batch.commit();
  return tSnap.size;
}

export async function clearCndTechs(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndTechs'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}
