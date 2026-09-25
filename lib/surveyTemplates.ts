import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

/** HomeSang standard checklists (per main service category) — used to re-seed. */
export const DEFAULT_SURVEY_TEMPLATES: Record<string, string[]> = {
  electrical: ['ກວດຕູ້ໄຟ / breaker', 'ກວດສາຍດິນ (ground)', 'ກວດຂະໜາດສາຍ / load', 'ກວດຈຸດຕິດຕັ້ງ / ເຕົ້າຮັບ', 'ກວດໄຟຮົ່ວ / ຄວາມປອດໄພ'],
  plumbing: ['ກວດແຮງດັນນ້ຳ', 'ກວດຈຸດຮົ່ວຊຶມ', 'ກວດທໍ່ / ຂໍ້ຕໍ່', 'ກວດປ້ຳ / ກັອກນ້ຳ', 'ກວດທາງລະບາຍນ້ຳ'],
  aircon: ['ກວດຂະໜາດ BTU ທຽບຫ້ອງ', 'ກວດຈຸດຕິດຕັ້ງ (ໃນ/ນອກ)', 'ກວດທໍ່ນ້ຳຢາ / ນ້ຳຖິ້ມ', 'ກວດໄຟ / breaker', 'ກວດໄລຍະທາງ / ການລະບາຍ'],
  carpenter: ['ກວດຂະໜາດ / ວັດແທກ', 'ກວດປະເພດໄມ້ / ວັດສະດຸ', 'ກວດໜ້າງານ / ການຕິດຕັ້ງ', 'ກວດອຸປະກອນ / ບານພັບ', 'ກວດ finishing / ສີ'],
  painter: ['ກວດສະພາບຜິວ / ກຳແພງ', 'ກວດພື້ນທີ່ (ຕ.ມ)', 'ກວດການກຽມຜິວ / ໂປ໊ະ', 'ກວດປະເພດສີ', 'ກວດຈຳນວນຮອບ ທາ'],
  cleaning: ['ກວດພື້ນທີ່ / ຂະໜາດ', 'ກວດປະເພດການທຳຄວາມສະອາດ', 'ກວດຈຸດສະເພາະ (ຄາບ/ເຊື້ອລາ)', 'ກວດອຸປະກອນ / ນ້ຳຢາ', 'ກວດການເຂົ້າເຖິງ / ນ້ຳ-ໄຟ'],
  construction: ['ກວດໜ້າງານ / ພື້ນທີ່', 'ກວດໂຄງສ້າງເດີມ', 'ກວດວັດສະດຸ ທີ່ຕ້ອງໃຊ້', 'ກວດການເຂົ້າເຖິງ / ຂົນສົ່ງ', 'ກວດໄລຍະເວລາ / ແຮງງານ'],
  garden: ['ກວດພື້ນທີ່ສວນ', 'ກວດສະພາບ ດິນ / ນ້ຳ', 'ກວດພືດ / ຕົ້ນໄມ້ ເດີມ', 'ກວດລະບົບ ນ້ຳ / ໄຟ', 'ກວດການບຳລຸງຮັກສາ'],
  moving: ['ກວດຈຳນວນ / ຂະໜາດ ເຄື່ອງ', 'ກວດເຄື່ອງ ແຕກຫັກງ່າຍ', 'ກວດການເຂົ້າເຖິງ (ຊັ້ນ/ລິບ)', 'ກວດໄລຍະທາງ / ເສັ້ນທາງ', 'ກວດການຫຸ້ມຫໍ່ / ລົດ'],
  cctv: ['ກວດຈຳນວນກ້ອງ', 'ກວດຈຸດຕິດຕັ້ງ / ມຸມ', 'ກວດໄຟ / ສາຍ network', 'ກວດບ່ອນເກັບ (DVR/NVR)', 'ກວດ internet / remote view'],
  other: ['ກວດສະພາບ ໜ້າງານ', 'ກວດສິ່ງທີ່ຕ້ອງເຮັດ', 'ກວດວັດສະດຸ / ອຸປະກອນ', 'ກວດການເຂົ້າເຖິງ', 'ກວດໄລຍະເວລາ'],
};

/** One filled-in checklist line stored on a bid. */
export interface SurveyCheck {
  label: string;
  checked: boolean;
  note?: string;
}

/** A reusable on-site survey checklist (one per service sub-category). */
export interface SurveyTemplate {
  id: string;
  name: string;
  mainCategory: string; // main service category value
  mainCategoryLao?: string;
  subKey?: string; // service sub-category key
  subName?: string;
  items: string[];
  enabled: boolean;
  version: number;
  usageCount?: number;
  rating?: number; // avg 1..5
  ratingCount?: number;
  createdByName?: string;
  createdAt: number;
  updatedByName?: string;
  updatedAt?: number;
}

function toMs(v: any): number {
  return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;
}
function strip(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}
function mapTpl(id: string, d: any): SurveyTemplate {
  return {
    id,
    name: d.name ?? '',
    mainCategory: d.mainCategory ?? '',
    mainCategoryLao: d.mainCategoryLao,
    subKey: d.subKey,
    subName: d.subName,
    items: Array.isArray(d.items) ? d.items : [],
    enabled: d.enabled !== false,
    version: typeof d.version === 'number' ? d.version : 1,
    usageCount: d.usageCount ?? 0,
    rating: d.rating,
    ratingCount: d.ratingCount ?? 0,
    createdByName: d.createdByName,
    createdAt: toMs(d.createdAt),
    updatedByName: d.updatedByName,
    updatedAt: d.updatedAt ? toMs(d.updatedAt) : undefined,
  };
}

// ── admin list ──────────────────────────────────────────
export function watchAllSurveyTemplates(cb: (t: SurveyTemplate[]) => void) {
  return onSnapshot(
    collection(db, 'surveyTemplates'),
    (snap) => {
      const list = snap.docs.map((d) => mapTpl(d.id, d.data())).filter((t) => t.name.trim() !== '');
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchAllSurveyTemplates:', e); cb([]); },
  );
}

export interface CreateSurveyInput {
  name: string;
  mainCategory: string;
  mainCategoryLao?: string;
  subKey?: string;
  subName?: string;
  items?: string[];
}

export async function createSurveyTemplate(input: CreateSurveyInput, byName?: string): Promise<string> {
  const ref = await addDoc(
    collection(db, 'surveyTemplates'),
    strip({
      ...input,
      items: (input.items ?? []).filter((s) => s.trim() !== ''),
      enabled: true,
      version: 1,
      usageCount: 0,
      ratingCount: 0,
      createdByName: byName,
      createdAt: serverTimestamp(),
    }),
  );
  return ref.id;
}

/** Save an edit → bumps the version + updatedAt/By. */
export async function updateSurveyTemplate(id: string, patch: { name?: string; items?: string[] }, byName?: string) {
  await updateDoc(
    doc(db, 'surveyTemplates', id),
    strip({
      name: patch.name,
      items: patch.items?.filter((s) => s.trim() !== ''),
      version: increment(1),
      updatedByName: byName,
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function setSurveyEnabled(id: string, enabled: boolean) {
  await updateDoc(doc(db, 'surveyTemplates', id), { enabled });
}

export async function deleteSurveyTemplate(id: string) {
  await deleteDoc(doc(db, 'surveyTemplates', id));
}

/** +1 usage — called when a template is pulled into a quotation. Best-effort. */
export async function incrementSurveyUsage(id: string) {
  try { await updateDoc(doc(db, 'surveyTemplates', id), { usageCount: increment(1), updatedAt: serverTimestamp() }); }
  catch (e) { console.error('incrementSurveyUsage:', e); }
}

/** Technician rates a template 1..5 after using it. */
export async function rateSurveyTemplate(id: string, stars: number) {
  const s = Math.max(1, Math.min(5, Math.round(stars)));
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'surveyTemplates', id);
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const d = snap.data() as any;
      const count = typeof d.ratingCount === 'number' ? d.ratingCount : 0;
      const avg = typeof d.rating === 'number' ? d.rating : 0;
      const newCount = count + 1;
      const newAvg = Math.round(((avg * count + s) / newCount) * 10) / 10;
      tx.update(ref, { rating: newAvg, ratingCount: newCount, updatedAt: serverTimestamp() });
    });
  } catch (e) { console.error('rateSurveyTemplate:', e); }
}

/**
 * One-time recovery (super): (1) upgrade legacy `surveyTemplates` docs (old
 * shape `{enabled, items}` keyed by category/sub-key) into the new model so
 * they show in the list, and (2) re-seed the HomeSang standard checklists for
 * any main category that has no template yet.
 */
export async function recoverSurveyData(byName?: string): Promise<{ migrated: number; seeded: number }> {
  // build category maps (main slug + sub key → names)
  const catsSnap = await getDocs(query(collection(db, 'categories'), where('type', '==', 'service')));
  const mainBySlug = new Map<string, { nameLao: string }>();
  const subByKey = new Map<string, { parentSlug: string; parentNameLao: string; subName: string }>();
  catsSnap.docs.forEach((d) => {
    const c: any = d.data();
    const slug = String(c.nameEn || '').toLowerCase();
    if (slug) mainBySlug.set(slug, { nameLao: c.nameLao });
    (c.subTypes ?? []).forEach((s: any) => subByKey.set(s.key, { parentSlug: slug, parentNameLao: c.nameLao, subName: s.nameLao }));
  });

  const snap = await getDocs(collection(db, 'surveyTemplates'));
  const haveMain = new Set<string>();
  snap.docs.forEach((d) => { const x: any = d.data(); if (x.name && x.mainCategory) haveMain.add(x.mainCategory); });

  // 1) migrate legacy docs
  let migrated = 0;
  for (const d of snap.docs) {
    const x: any = d.data();
    if (x.name) continue; // already new-model
    if (!Array.isArray(x.items) || x.items.length === 0) continue;
    const id = d.id;
    let mainCategory = '', mainLao = '', subKey: string | undefined, subName: string | undefined, name = id;
    if (subByKey.has(id)) { const s = subByKey.get(id)!; mainCategory = s.parentSlug; mainLao = s.parentNameLao; subKey = id; subName = s.subName; name = s.subName; }
    else if (mainBySlug.has(id)) { mainCategory = id; mainLao = mainBySlug.get(id)!.nameLao; name = mainBySlug.get(id)!.nameLao; }
    await setDoc(doc(db, 'surveyTemplates', id), strip({
      name, mainCategory, mainCategoryLao: mainLao, subKey, subName,
      enabled: x.enabled !== false, version: 1, usageCount: x.usageCount ?? 0, ratingCount: 0,
      createdByName: byName || 'ນຳເຂົ້າ', createdAt: serverTimestamp(),
    }), { merge: true });
    migrated++;
    if (mainCategory) haveMain.add(mainCategory);
  }

  // 2) seed standard defaults for mains with no template
  let seeded = 0;
  for (const [slug, items] of Object.entries(DEFAULT_SURVEY_TEMPLATES)) {
    if (haveMain.has(slug)) continue;
    const main = mainBySlug.get(slug);
    await addDoc(collection(db, 'surveyTemplates'), strip({
      name: `${main?.nameLao ?? slug} (ມາດຕະຖານ)`, mainCategory: slug, mainCategoryLao: main?.nameLao,
      items, enabled: true, version: 1, usageCount: 0, ratingCount: 0,
      createdByName: 'ມາດຕະຖານ HomeSang', createdAt: serverTimestamp(),
    }));
    seeded++; haveMain.add(slug);
  }
  return { migrated, seeded };
}

/** Enabled templates for a main service category (technician quote flow). */
export function watchSurveyTemplatesForCategory(mainCategory: string, cb: (t: SurveyTemplate[]) => void) {
  const q = query(collection(db, 'surveyTemplates'), where('mainCategory', '==', mainCategory));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapTpl(d.id, d.data())).filter((t) => t.enabled && t.name.trim() !== '');
      list.sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0));
      cb(list);
    },
    (e) => { console.error('watchSurveyTemplatesForCategory:', e); cb([]); },
  );
}
