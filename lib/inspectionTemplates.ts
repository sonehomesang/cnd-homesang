import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

/** HomeSang completion-inspection standard, one per service category.
 * Holds the handover checklist + the default warranty + an optional manual. */
/** One technical parameter of the HomeSang standard for a category. */
export interface StdParam {
  key: string; // e.g. "ແຮງດັນ ໄຟ"
  unit?: string; // e.g. "V"
  standard?: string; // e.g. "220-240", "≥2.5", "<5", "—"
}

export interface InspectionTemplate {
  category: string; // = document id
  name: string;
  items: string[]; // checklist labels the technician ticks at handover
  params?: StdParam[]; // standard technical parameters (tech records actual values)
  warrantyMonths: number;
  warrantyTerms: string;
  manualUrl?: string;
  active: boolean;
  updatedAt?: number;
}

/** Compare an actual reading against a standard spec → within-standard?
 * Returns undefined when nothing to check / no value entered. */
export function paramOk(standard: string | undefined, actual: string | undefined): boolean | undefined {
  const s = (standard ?? '').trim();
  const a = (actual ?? '').trim();
  if (!a) return undefined;
  if (!s || s === '—' || s === '-') return true;
  const num = parseFloat(a.replace(/[^0-9.\-]/g, ''));
  if (Number.isNaN(num)) return a === s;
  const range = s.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  if (range) return num >= parseFloat(range[1]) && num <= parseFloat(range[2]);
  const geq = s.match(/(?:≥|>=|>)\s*(-?\d+(?:\.\d+)?)/);
  if (geq) return num >= parseFloat(geq[1]);
  const leq = s.match(/(?:≤|<=|<)\s*(-?\d+(?:\.\d+)?)/);
  if (leq) return num <= parseFloat(leq[1]);
  const eq = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(eq) ? true : num === eq;
}

const TERMS_GENERIC = 'ຄອບຄຸມ ຄ່າແຮງ ຕິດຕັ້ງ + ອຸປະກອນ ທີ່ ຊ່າງ ຈັດ. ບໍ່ ຄອບຄຸມ ຄວາມ ເສຍຫາຍ ຈາກ ການ ໃຊ້ ຜິດ ຫຼື ໄພ ທຳມະຊາດ.';

/** Seed defaults (per category). Owner refines later in the admin panel. */
export const DEFAULT_INSPECTION_TEMPLATES: Record<string, Omit<InspectionTemplate, 'category' | 'active'>> = {
  electrical: { name: 'ໃບກວດງານ ໄຟຟ້າ', warrantyMonths: 12, warrantyTerms: TERMS_GENERIC,
    items: ['ວັດ ແຮງດັນ ໄຟ (V) ຢູ່ ໃນ ເກນ', 'ທົດສອບ ເບຣກເກີ ຕັດ-ຕໍ່', 'ກວດ ໄຟ ຮົ່ວ (ELCB/ground)', 'ຈັດ ສາຍ ຮຽບຮ້ອຍ + ປ້າຍ ກຳກັບ', 'ທົດສອບ ທຸກ ຈຸດ ໃຊ້ ງານ ໄດ້'],
    params: [{ key: 'ແຮງດັນ ໄຟ', unit: 'V', standard: '220-240' }, { key: 'ຂະໜາດ ສາຍ ເມນ', unit: 'mm²', standard: '≥2.5' }, { key: 'ຂະໜາດ ເບຣກເກີ', unit: 'A', standard: '16-32' }, { key: 'ຄ່າ ສາຍດິນ (ground)', unit: 'Ω', standard: '<5' }, { key: 'ຈຳນວນ ວົງຈອນ', unit: 'ຈຸດ', standard: '—' }] },
  plumbing: { name: 'ໃບກວດງານ ປະປາ', warrantyMonths: 12, warrantyTerms: TERMS_GENERIC,
    items: ['ທົດສອບ ແຮງດັນ / ບໍ່ ຮົ່ວ ຊຶມ', 'ກວດ ຂໍ້ຕໍ່ + ວາລວ', 'ທົດສອບ ລະບາຍ ນ້ຳ ໄຫຼ ດີ', 'ກວດ ຄວາມ ສະອາດ ໜ້າງານ', 'ທົດສອບ ໃຊ້ ງານ ຈິງ'],
    params: [{ key: 'ແຮງດັນ ນ້ຳ', unit: 'bar', standard: '1-3' }, { key: 'ຂະໜາດ ທໍ່ ເມນ', unit: 'mm', standard: '—' }, { key: 'ອັດຕາ ໄຫຼ', unit: 'L/min', standard: '—' }] },
  aircon: { name: 'ໃບກວດງານ ແອ', warrantyMonths: 6, warrantyTerms: TERMS_GENERIC,
    items: ['ວັດ ອຸນຫະພູມ ລົມ ອອກ', 'ກວດ ນ້ຳ ຢາ / ບໍ່ ຮົ່ວ', 'ທົດສອບ ນ້ຳ ຖິ້ມ / ບໍ່ ຢົດ', 'ກວດ ສຽງ / ການ ສັ່ນ', 'ທົດສອບ remote + ໂໝດ'],
    params: [{ key: 'ຂະໜາດ', unit: 'BTU', standard: '—' }, { key: 'ອຸນຫະພູມ ລົມ ອອກ', unit: '°C', standard: '≤15' }, { key: 'ແຮງດັນ ນ້ຳຢາ', unit: 'psi', standard: '—' }] },
  cctv: { name: 'ໃບກວດງານ CCTV', warrantyMonths: 12, warrantyTerms: TERMS_GENERIC,
    items: ['ກວດ ທຸກ ກ້ອງ ເຫັນ ພາບ', 'ກວດ ມຸມ / ຈຸດ ຕິດຕັ້ງ', 'ທົດສອບ ບັນທຶກ (DVR/NVR)', 'ທົດສອບ ເບິ່ງ remote', 'ຈັດ ສາຍ + ໄຟ ຮຽບຮ້ອຍ'],
    params: [{ key: 'ຈຳນວນ ກ້ອງ', unit: 'ຕົວ', standard: '—' }, { key: 'ຄວາມ ລະອຽດ', unit: 'MP', standard: '≥2' }, { key: 'ພື້ນທີ່ ເກັບ', unit: 'ມື້', standard: '≥7' }] },
  carpenter: { name: 'ໃບກວດງານ ຊ່າງໄມ້', warrantyMonths: 6, warrantyTerms: TERMS_GENERIC,
    items: ['ກວດ ຂະໜາດ / ວັດ ແທກ', 'ກວດ ຄວາມ ແໜ້ນ / ໂຄງສ້າງ', 'ກວດ ບານພັບ / ອຸປະກອນ', 'ກວດ finishing / ສີ', 'ກວດ ຄວາມ ສະອາດ ໜ້າງານ'] },
  painter: { name: 'ໃບກວດງານ ທາສີ', warrantyMonths: 6, warrantyTerms: TERMS_GENERIC,
    items: ['ກວດ ຜິວ ສະໝ່ຳສະເໝີ', 'ກວດ ຈຳນວນ ຮອບ ທາ', 'ກວດ ຂອບ / ມຸມ ຄົມ', 'ກວດ ບໍ່ ເປື້ອນ ພື້ນ/ເຄື່ອງ', 'ກວດ ຄວາມ ສະອາດ ໜ້າງານ'] },
  construction: { name: 'ໃບກວດງານ ກໍ່ສ້າງ', warrantyMonths: 12, warrantyTerms: TERMS_GENERIC,
    items: ['ກວດ ໂຄງສ້າງ ຕາມ ແບບ', 'ກວດ ວັດສະດຸ ຖືກ ຕ້ອງ', 'ກວດ ຄວາມ ໄດ້ ລະດັບ / ດິ່ງ', 'ກວດ finishing', 'ກວດ ຄວາມ ສະອາດ ໜ້າງານ'] },
  cleaning: { name: 'ໃບກວດງານ ທຳຄວາມສະອາດ', warrantyMonths: 0, warrantyTerms: 'ບໍ່ ມີ ຮັບປະກັນ ໄລຍະ ຍາວ (ບໍລິການ ຄັ້ງດຽວ).',
    items: ['ກວດ ພື້ນທີ່ ຄົບ ຕາມ ຕົກລົງ', 'ກວດ ຈຸດ ສະເພາະ (ຄາບ/ເຊື້ອລາ)', 'ກວດ ບໍ່ ເສຍຫາຍ ເຄື່ອງ', 'ກວດ ຄວາມ ຮຽບຮ້ອຍ ລວມ'] },
  other: { name: 'ໃບກວດງານ (ທົ່ວໄປ)', warrantyMonths: 3, warrantyTerms: TERMS_GENERIC,
    items: ['ກວດ ວຽກ ຄົບ ຕາມ ຕົກລົງ', 'ທົດສອບ ໃຊ້ ງານ ໄດ້', 'ກວດ ຄວາມ ຮຽບຮ້ອຍ', 'ກວດ ຄວາມ ສະອາດ ໜ້າງານ'] },
};

function mapT(id: string, data: any): InspectionTemplate {
  return {
    category: id,
    name: data?.name ?? '',
    items: Array.isArray(data?.items) ? data.items : [],
    params: Array.isArray(data?.params) ? data.params : [],
    warrantyMonths: Number(data?.warrantyMonths) || 0,
    warrantyTerms: data?.warrantyTerms ?? '',
    manualUrl: data?.manualUrl || undefined,
    active: data?.active !== false,
    updatedAt: data?.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data?.updatedAt,
  };
}

export function watchInspectionTemplates(cb: (t: InspectionTemplate[]) => void) {
  return onSnapshot(
    collection(db, 'inspectionTemplates'),
    (snap) => cb(snap.docs.map((d) => mapT(d.id, d.data())).sort((a, b) => a.category.localeCompare(b.category))),
    (err) => { console.error('watchInspectionTemplates:', err); cb([]); },
  );
}

/** One-shot lookup for the handover screen. */
export async function fetchInspectionTemplate(category: string): Promise<InspectionTemplate | null> {
  const snap = await getDoc(doc(db, 'inspectionTemplates', category));
  return snap.exists() ? mapT(snap.id, snap.data()) : null;
}

export async function saveInspectionTemplate(category: string, patch: Partial<InspectionTemplate>) {
  await setDoc(
    doc(db, 'inspectionTemplates', category),
    { ...patch, category, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Seed defaults; also backfill standard params into templates seeded before
 * parameters existed (idempotent). */
export async function seedInspectionTemplates(): Promise<number> {
  let n = 0;
  for (const [cat, def] of Object.entries(DEFAULT_INSPECTION_TEMPLATES)) {
    const snap = await getDoc(doc(db, 'inspectionTemplates', cat));
    if (!snap.exists()) {
      await setDoc(doc(db, 'inspectionTemplates', cat), { ...def, category: cat, active: true, updatedAt: serverTimestamp() });
      n++;
    } else if (!Array.isArray(snap.data()?.params) && def.params?.length) {
      await setDoc(doc(db, 'inspectionTemplates', cat), { params: def.params, updatedAt: serverTimestamp() }, { merge: true });
      n++;
    }
  }
  return n;
}
