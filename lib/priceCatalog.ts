import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

export type PriceKind = 'material' | 'labor';

export const PRICE_KIND_LABEL: Record<PriceKind, string> = {
  material: 'ວັດສະດຸ',
  labor: 'ຄ່າແຮງ',
};

/**
 * A reference ("ລາຄາກາງ") price line — a material or a unit of labor.
 * A technician can pull these into a quotation. `category` scopes it to one
 * service category ('' = applies to all).
 */
export interface PriceItem {
  id: string;
  kind: PriceKind;
  name: string;
  unit: string;
  price: number;
  category?: string;
  active: boolean;
  createdAt?: number;
}

export type PriceItemInput = Omit<PriceItem, 'id' | 'createdAt'>;

/** HomeSang starter catalog — admin can seed these then edit/extend. */
export const DEFAULT_PRICE_ITEMS: PriceItemInput[] = [
  { kind: 'material', name: 'ສາຍໄຟ 2.5sq', unit: 'ແມັດ', price: 9000, category: 'electrical', active: true },
  { kind: 'material', name: 'ສາຍໄຟ 4sq', unit: 'ແມັດ', price: 12000, category: 'electrical', active: true },
  { kind: 'material', name: 'breaker 2P', unit: 'ອັນ', price: 180000, category: 'electrical', active: true },
  { kind: 'material', name: 'ທໍ່ PVC ½"', unit: 'ເສັ້ນ', price: 25000, category: 'plumbing', active: true },
  { kind: 'material', name: 'ກັອກນ້ຳ', unit: 'ອັນ', price: 65000, category: 'plumbing', active: true },
  { kind: 'material', name: 'ສີນ້ຳ (ຖັງ 18L)', unit: 'ຖັງ', price: 450000, category: 'painter', active: true },
  { kind: 'material', name: 'ປູນຊີມັງ', unit: 'ຖົງ', price: 65000, category: 'construction', active: true },
  { kind: 'labor', name: 'ຄ່າແຮງ ໄຟຟ້າ', unit: 'ຊົ່ວໂມງ', price: 50000, category: 'electrical', active: true },
  { kind: 'labor', name: 'ຄ່າແຮງ ປະປາ', unit: 'ຊົ່ວໂມງ', price: 50000, category: 'plumbing', active: true },
  { kind: 'labor', name: 'ຄ່າແຮງ ທາສີ', unit: 'ຕ.ມ', price: 25000, category: 'painter', active: true },
  { kind: 'labor', name: 'ຄ່າແຮງ ຊ່າງທົ່ວໄປ', unit: 'ມື້', price: 200000, category: '', active: true },
];

function mapItem(id: string, data: any): PriceItem {
  const out: any = { id };
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = v instanceof Timestamp ? v.toMillis() : v;
  }
  out.active = data?.active !== false;
  return out as PriceItem;
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

export function watchPriceItems(cb: (items: PriceItem[]) => void) {
  return onSnapshot(
    collection(db, 'priceCatalog'),
    (snap) => {
      const items = snap.docs.map((d) => mapItem(d.id, d.data()));
      items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind < b.kind ? 1 : -1));
      cb(items);
    },
    (err) => {
      console.error('watchPriceItems:', err);
      cb([]);
    },
  );
}

export async function addPriceItem(input: PriceItemInput) {
  await addDoc(collection(db, 'priceCatalog'), strip({ ...input, createdAt: serverTimestamp() }));
}

export async function updatePriceItem(id: string, patch: Partial<PriceItemInput>) {
  await updateDoc(doc(db, 'priceCatalog', id), strip(patch as Record<string, unknown>) as any);
}

export async function deletePriceItem(id: string) {
  await deleteDoc(doc(db, 'priceCatalog', id));
}

/** Bulk-insert the HomeSang starter catalog (admin "seed defaults"). */
export async function seedDefaultPriceItems() {
  const batch = writeBatch(db);
  DEFAULT_PRICE_ITEMS.forEach((it) => {
    const ref = doc(collection(db, 'priceCatalog'));
    batch.set(ref, { ...it, createdAt: serverTimestamp() });
  });
  await batch.commit();
}
