import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG, stampMock } from '../mock';

/** CND storefront promo banners — admin-managed (replaces hardcoded slides). */
export interface CndBanner {
  id: string;
  title: string;
  sub: string;
  kicker: string;
  icon: string;
  c1: string;
  c2: string;
  hint?: string;   // category-name substring the "buy" CTA jumps to
  order: number;
  active: boolean;
  __mock?: boolean;
}
export const DEFAULT_BANNERS: Omit<CndBanner, 'id' | '__mock'>[] = [
  { title: 'ຫຼຸດ ສູງສຸດ 20%', sub: 'ວັດສະດຸ ກໍ່ສ້າງ ທຸກ ຊະນິດ', kicker: 'ໂປຣ ເດືອນ ນີ້', icon: '🏗️', c1: '#E8551E', c2: '#C4400F', hint: 'ກໍ່ສ້າງ', order: 1, active: true },
  { title: 'ຊື້ + ຕິດຕັ້ງ ຈົບ ບ່ອນ ດຽວ', sub: 'ຊ່າງ CND ໄປ ຕິດຕັ້ງ ເຖິງ ບ້ານ', kicker: 'ບໍລິການ ຄົບ ວົງຈອນ', icon: '🔧', c1: '#2B3A4A', c2: '#3D5063', hint: 'ບໍລິການ', order: 2, active: true },
  { title: 'ແອຣ໌ Inverter ລາຄາ ພິເສດ', sub: 'ພ້ອມ ຄ່າ ຕິດຕັ້ງ ພິເສດ', kicker: 'ຮັບ ໜ້າ ຮ້ອນ', icon: '❄️', c1: '#0E7490', c2: '#0891B2', hint: 'ແອ', order: 3, active: true },
  { title: 'ສົ່ງ ໄວ ທົ່ວ ວຽງຈັນ', sub: 'ສັ່ງ ມື້ ນີ້ ຮັບ ໄວ ທັນ ໃຈ', kicker: 'ບໍລິການ ຈັດ ສົ່ງ', icon: '🚚', c1: '#166534', c2: '#16A34A', order: 4, active: true },
];
function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndBanner {
  return { id, title: d.title ?? '', sub: d.sub ?? '', kicker: d.kicker ?? '', icon: d.icon ?? '🏷️', c1: d.c1 ?? '#E8551E', c2: d.c2 ?? '#C4400F', hint: d.hint, order: d.order ?? 99, active: d.active !== false, __mock: !!d[MOCK_FLAG] };
}
export function watchCndBanners(cb: (b: CndBanner[]) => void) {
  return onSnapshot(query(collection(db, 'cndBanners')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => a.order - b.order)),
    (e) => { console.error('watchCndBanners:', e); cb([]); });
}
export async function addCndBanner(t: Partial<CndBanner>) {
  await addDoc(collection(db, 'cndBanners'), { title: t.title ?? '', sub: t.sub ?? '', kicker: t.kicker ?? '', icon: t.icon ?? '🏷️', c1: t.c1 ?? '#E8551E', c2: t.c2 ?? '#C4400F', hint: t.hint || undefined, order: t.order ?? 99, active: true, createdAt: serverTimestamp() });
}
export async function updateCndBanner(id: string, patch: Partial<CndBanner>) { await updateDoc(doc(db, 'cndBanners', id), patch); }
export async function removeCndBanner(id: string) { await deleteDoc(doc(db, 'cndBanners', id)); }
export async function seedCndBanners(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const b = writeBatch(db);
  for (const r of DEFAULT_BANNERS) b.set(doc(collection(db, 'cndBanners')), stampMock({ ...r }));
  await b.commit();
  return DEFAULT_BANNERS.length;
}
export async function clearCndBanners(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndBanners'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}
