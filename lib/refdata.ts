import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

export type RefType = 'service' | 'product';

export interface Unit {
  id: string;
  type: RefType;
  nameLao: string;
  nameEn: string;
  order: number;
  active: boolean;
}

export interface Category {
  id: string;
  type: RefType;
  icon: string;
  nameLao: string;
  nameEn: string;
  order: number;
  active: boolean;
  subTypes?: { key: string; nameLao: string; nameEn?: string }[]; // sub-categories
}

// ===================== SEED DEFAULTS =====================

const SERVICE_UNITS = [
  ['ຊົ່ວໂມງ', 'hour'],
  ['ມື້', 'day'],
  ['ເໝົາ/ໂຄງການ', 'project'],
  ['ຈຸດ', 'point'],
  ['ຕr.m', 'm²'],
  ['ຄັ້ງ', 'time'],
];
const PRODUCT_UNITS = [
  ['ອັນ', 'piece'],
  ['ກ່ອງ', 'box'],
  ['ແມັດ', 'meter'],
  ['ກິໂລ', 'kg'],
  ['ຖົງ', 'bag'],
  ['ມ້ວນ', 'roll'],
  ['ຊຸດ', 'set'],
  ['ຄູ່', 'pair'],
  ['ແຜ່ນ', 'sheet'],
  ['ລິດ', 'litre'],
];

const SERVICE_CATEGORIES = [
  ['⚡', 'ໄຟຟ້າ', 'Electrical'],
  ['💧', 'ນໍ້າປະປາ', 'Plumbing'],
  ['❄️', 'ແອ/ເຄື່ອງເຢັນ', 'AC & Cooling'],
  ['🔨', 'ຊ່າງໄມ້', 'Carpenter'],
  ['🎨', 'ທາສີ', 'Painter'],
  ['✨', 'ທຳຄວາມສະອາດ', 'Cleaning'],
  ['🏗️', 'ກໍ່ສ້າງ', 'Construction'],
  ['🪟', 'ຕົກແຕ່ງ', 'Decoration'],
  ['🌿', 'ສວນ', 'Garden'],
  ['📹', 'CCTV', 'CCTV'],
  ['🚚', 'ຍ້າຍຂອງ', 'Moving'],
  ['🔧', 'ອື່ນໆ', 'Other'],
];
const PRODUCT_CATEGORIES = [
  ['🏗️', 'ກໍ່ສ້າງ', 'Construction'],
  ['🪟', 'ຕົກແຕ່ງ', 'Decoration'],
  ['⚡', 'ໄຟຟ້າ', 'Electrical'],
  ['💧', 'ນໍ້າປະປາ', 'Plumbing'],
  ['❄️', 'ແອ/ເຄື່ອງເຢັນ', 'AC & Cooling'],
  ['🔧', 'ເຄື່ອງມື', 'Tools'],
  ['🖌️', 'ສີ ແລະ ເຄືອບ', 'Paint & Coating'],
  ['🪵', 'ໄມ້ ແລະ ແຜ່ນ', 'Wood & Boards'],
  ['🚽', 'ສຸຂະພັນ', 'Sanitary'],
  ['🔩', 'ໂລຫະ ແລະ ນັອດ', 'Metal & Fasteners'],
];

export async function seedRefDataIfEmpty(): Promise<{ units: number; categories: number }> {
  let unitsAdded = 0;
  let catsAdded = 0;

  // seed PER TYPE (not all-or-nothing) so product defaults still appear even if
  // service ones were seeded first — otherwise the product pickers stay empty.
  const unitsSnap = await getDocs(collection(db, 'units'));
  const uHasService = unitsSnap.docs.some((d) => (d.data() as any).type === 'service');
  const uHasProduct = unitsSnap.docs.some((d) => (d.data() as any).type === 'product');
  if (!uHasService || !uHasProduct) {
    const batch = writeBatch(db);
    if (!uHasService) SERVICE_UNITS.forEach(([nameLao, nameEn], i) => {
      batch.set(doc(collection(db, 'units')), { type: 'service', nameLao, nameEn, order: i + 1, active: true }); unitsAdded++;
    });
    if (!uHasProduct) PRODUCT_UNITS.forEach(([nameLao, nameEn], i) => {
      batch.set(doc(collection(db, 'units')), { type: 'product', nameLao, nameEn, order: i + 1, active: true }); unitsAdded++;
    });
    if (unitsAdded) await batch.commit();
  }

  const catsSnap = await getDocs(collection(db, 'categories'));
  const cHasService = catsSnap.docs.some((d) => (d.data() as any).type === 'service');
  const cHasProduct = catsSnap.docs.some((d) => (d.data() as any).type === 'product');
  if (!cHasService || !cHasProduct) {
    const batch = writeBatch(db);
    if (!cHasService) SERVICE_CATEGORIES.forEach(([icon, nameLao, nameEn], i) => {
      batch.set(doc(collection(db, 'categories')), { type: 'service', icon, nameLao, nameEn, order: i + 1, active: true }); catsAdded++;
    });
    if (!cHasProduct) PRODUCT_CATEGORIES.forEach(([icon, nameLao, nameEn], i) => {
      batch.set(doc(collection(db, 'categories')), { type: 'product', icon, nameLao, nameEn, order: i + 1, active: true }); catsAdded++;
    });
    if (catsAdded) await batch.commit();
  }

  return { units: unitsAdded, categories: catsAdded };
}

// ===================== UNITS CRUD =====================

export function watchUnits(type: RefType, cb: (u: Unit[]) => void) {
  const q = query(collection(db, 'units'), where('type', '==', type));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Unit);
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    cb(list);
  }, (e) => { console.error('watchUnits:', e); cb([]); });
}

export async function addUnit(type: RefType, nameLao: string, nameEn: string) {
  await addDoc(collection(db, 'units'), { type, nameLao, nameEn, order: 999, active: true });
}
export async function updateUnit(id: string, patch: Partial<Unit>) {
  await updateDoc(doc(db, 'units', id), patch as any);
}
export async function deleteUnit(id: string) {
  await deleteDoc(doc(db, 'units', id));
}

// ===================== CATEGORIES CRUD =====================

export function watchCategories(type: RefType, cb: (c: Category[]) => void) {
  const q = query(collection(db, 'categories'), where('type', '==', type));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category);
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    cb(list);
  }, (e) => { console.error('watchCategories:', e); cb([]); });
}

export async function addCategory(type: RefType, icon: string, nameLao: string, nameEn: string): Promise<string> {
  const ref = await addDoc(collection(db, 'categories'), { type, icon, nameLao, nameEn, order: 999, active: true });
  return ref.id;
}
export async function updateCategory(id: string, patch: Partial<Category>) {
  await updateDoc(doc(db, 'categories', id), patch as any);
}
export async function deleteCategory(id: string) {
  await deleteDoc(doc(db, 'categories', id));
}
