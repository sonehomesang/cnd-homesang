import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export type CostType = 'service' | 'survey' | 'materials' | 'labor' | 'risk' | 'tax' | 'other';

export const COST_TYPE_LABEL: Record<CostType, string> = {
  service: 'ຄ່າບໍລິການ',
  survey: 'ຄ່າສຳຫຼວດ',
  materials: 'ວັດສະດຸ',
  labor: 'ຄ່າແຮງ',
  risk: 'ຄວາມສ່ຽງ/ປອດໄພ',
  tax: 'ພາສີ',
  other: 'ອື່ນໆ',
};

export const COST_TYPES: CostType[] = ['materials', 'labor', 'service', 'survey', 'risk', 'tax', 'other'];

/** One line of a BOM template. */
export interface BomItem {
  name: string;
  costType: CostType;
  unit: string;
  qty: number; // kept for the quote builder to fill; not edited in the BOM
  unitPrice: number; // kept for the quote builder to fill; not edited in the BOM
  required?: boolean;
  /** ticked = included by default when pulled into a quotation (default true) */
  selected?: boolean;
  /** linked shop product — price/cost/commission pulled live at quote time */
  productId?: string;
  shopId?: string;
  shopName?: string;
}

/** A preset "bill of materials" bundle a technician can pull into a quotation. */
export interface BomTemplate {
  id: string;
  name: string;
  code?: string; // human-readable id for search/sort, e.g. PLUMB-001
  category?: string;
  items: BomItem[];
  active: boolean;
  createdAt?: number;
}

function mapTpl(id: string, data: any): BomTemplate {
  return {
    id,
    name: data?.name ?? '',
    code: data?.code ?? '',
    category: data?.category ?? '',
    items: Array.isArray(data?.items) ? data.items : [],
    active: data?.active !== false,
    createdAt: data?.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data?.createdAt,
  };
}

/** Approximate total of a template's lines. */
export function bomTotal(items: BomItem[]): number {
  return items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
}

export function watchBomTemplates(cb: (t: BomTemplate[]) => void) {
  return onSnapshot(
    collection(db, 'bomTemplates'),
    (snap) => {
      const t = snap.docs.map((d) => mapTpl(d.id, d.data()));
      t.sort((a, b) => a.name.localeCompare(b.name));
      cb(t);
    },
    (err) => {
      console.error('watchBomTemplates:', err);
      cb([]);
    },
  );
}

export async function createBomTemplate(name: string, category?: string, code?: string): Promise<string> {
  const ref = await addDoc(collection(db, 'bomTemplates'), {
    name: name || 'ແມ່ແບບໃໝ່',
    code: code || '',
    category: category || '',
    items: [],
    active: true,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateBomTemplate(
  id: string,
  patch: Partial<Pick<BomTemplate, 'name' | 'code' | 'category' | 'items' | 'active'>>,
) {
  await updateDoc(doc(db, 'bomTemplates', id), patch as any);
}

export async function deleteBomTemplate(id: string) {
  await deleteDoc(doc(db, 'bomTemplates', id));
}
