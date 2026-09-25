import {
  addDoc, collection, deleteDoc, deleteField, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG } from '../mock';

/**
 * CND selling units (ໜ່ວຍ ຂາຍ) — ໜ່ວຍ / ກ່ອງ / ກະສອບ / ຄັ້ງ …
 *
 * The unit is stored on each product as a plain STRING and copied onto every
 * cart line, order item, PO line and return line, so this collection is the
 * admin-managed *vocabulary*, not a foreign key: renaming a unit here does not
 * rewrite past documents (deliberate — a printed bill must keep the wording it
 * was issued with). `active: false` retires a unit from the picker without
 * touching the products that already use it.
 */
export interface CndUnit {
  id: string;
  name: string;       // Lao — what shows in the picker and on bills
  nameEn?: string;
  /** service-style unit (ຄັ້ງ / ຈຸດ / ຊົ່ວໂມງ) rather than a goods unit */
  service?: boolean;
  order?: number;
  active: boolean;
  __mock?: boolean;
  createdAt: number;
}

/** The list that was hardcoded in ProductEditor before this panel existed —
 *  also what "ໃສ່ ຫົວໜ່ວຍ ມາດຕະຖານ" seeds, so nothing regresses on an empty DB. */
export const DEFAULT_CND_UNITS: { name: string; service?: boolean }[] = [
  { name: 'ໜ່ວຍ' }, { name: 'ຊຸດ' }, { name: 'ກ່ອງ' }, { name: 'ກະສອບ' },
  { name: 'ເສັ້ນ' }, { name: 'ມ້ວນ' }, { name: 'ຖັງ' }, { name: 'ກ້ອນ' },
  // house convention: ມ = linear metre, ມ2 = ຕາລາງແມັດ, ມ3 = ແມັດກ້ອນ
  { name: 'ແມັດ' }, { name: 'ມ2' }, { name: 'ມ3' }, { name: 'ຄູ່' },
  { name: 'ຄັ້ງ', service: true }, { name: 'ຈຸດ', service: true },
];

/**
 * Old spellings that mean one of the standard units, offered as a one-tap
 * clean-up. Keys are matched with normalizeUnitName().
 */
export const UNIT_ALIASES: Record<string, string> = {
  'ຕ.ມ.': 'ມ2', 'ຕ.ມ': 'ມ2', 'ຕລ.ມ.': 'ມ2', 'ຕລ.ມ': 'ມ2', 'ຕາລາງແມັດ': 'ມ2', 'm2': 'ມ2',
  'ຄິວ': 'ມ3', 'ແມັດກ້ອນ': 'ມ3', 'ມ.ກ້ອນ': 'ມ3', 'm3': 'ມ3',
};

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndUnit {
  return {
    id, name: d.name ?? '', nameEn: d.nameEn, service: !!d.service,
    order: d.order, active: d.active !== false, __mock: !!d[MOCK_FLAG], createdAt: ms(d.createdAt),
  };
}

export function watchCndUnits(cb: (u: CndUnit[]) => void) {
  return onSnapshot(query(collection(db, 'cndUnits')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name))),
    (e) => { console.error('watchCndUnits:', e); cb([]); });
}

export async function addCndUnit(u: { name: string; nameEn?: string; service?: boolean; order?: number }) {
  if (!u.name.trim()) throw new Error('ຕ້ອງ ໃສ່ ຊື່ ຫົວໜ່ວຍ');
  await addDoc(collection(db, 'cndUnits'), {
    name: u.name.trim(),
    nameEn: u.nameEn?.trim() || undefined,
    service: !!u.service,
    order: u.order ?? 0,
    active: true,
    createdAt: serverTimestamp(),
  });
}
export async function updateCndUnit(id: string, patch: Partial<Pick<CndUnit, 'name' | 'nameEn' | 'service' | 'order' | 'active'>>) {
  await updateDoc(doc(db, 'cndUnits', id), { ...patch } as any);
}
export async function deleteCndUnit(id: string) { await deleteDoc(doc(db, 'cndUnits', id)); }

/**
 * Canonical form used for the "no duplicates" rule: trimmed, inner whitespace
 * collapsed, case-folded (only affects the Latin names like "box"). Lao has no
 * case, so this mostly catches stray spaces — "ກ່ອງ " vs "ກ່ອງ".
 */
export const normalizeUnitName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Is this name already taken? (ignores the unit being edited, if given) */
export function unitExists(units: CndUnit[], name: string, exceptId?: string): boolean {
  const n = normalizeUnitName(name);
  return units.some((u) => u.id !== exceptId && normalizeUnitName(u.name) === n);
}

/**
 * Create every given unit that is not already registered. Returns how many were
 * added. Used both by "add the standard set" and by "adopt the units my
 * products already use" — neither may ever create a duplicate.
 */
export async function getCndUnitsOnce(): Promise<CndUnit[]> {
  const snap = await getDocs(query(collection(db, 'cndUnits')));
  return snap.docs.map((d) => map(d.id, d.data()));
}

export async function addMissingUnits(
  wanted: { name: string; service?: boolean }[],
): Promise<number> {
  // read the CURRENT registry rather than a caller-held snapshot: a loop that
  // adds several units must see what the previous iteration just created, or it
  // re-creates the same name (this is exactly how a duplicate ມ2 appeared).
  const existing = await getCndUnitsOnce();
  const seen = new Set(existing.map((u) => normalizeUnitName(u.name)));
  const add: { name: string; service?: boolean }[] = [];
  for (const w of wanted) {
    const name = w.name.trim();
    const n = normalizeUnitName(name);
    if (!n || seen.has(n)) continue;
    seen.add(n);                       // also de-dupes within `wanted` itself
    add.push({ name, service: w.service });
  }
  if (!add.length) return 0;
  const b = writeBatch(db);
  add.forEach((r, i) => {
    // NOT stampMock(): these come from the store's real catalogue (or are a
    // deliberate standard set), so flagging them as sample data would both
    // mislabel them and expose them to a "clear sample data" purge.
    b.set(doc(collection(db, 'cndUnits')), {
      name: r.name, service: !!r.service, order: existing.length + i + 1, active: true, createdAt: serverTimestamp(),
    });
  });
  await b.commit();
  return add.length;
}

/** Add any of the standard units that are missing. */
export function seedCndUnits(): Promise<number> {
  return addMissingUnits(DEFAULT_CND_UNITS);
}

/** Rows sharing a normalized name — should never happen, but is recoverable. */
export function duplicateUnits(units: CndUnit[]): CndUnit[] {
  const seen = new Set<string>();
  const dups: CndUnit[] = [];
  for (const u of [...units].sort((a, b) => a.createdAt - b.createdAt)) {
    const n = normalizeUnitName(u.name);
    if (seen.has(n)) dups.push(u); else seen.add(n);
  }
  return dups;
}

/**
 * Delete duplicate rows, keeping the oldest of each name. Products need no
 * change: they reference the unit by name, and the surviving row has that name.
 */
export async function dedupeCndUnits(): Promise<number> {
  const dups = duplicateUnits(await getCndUnitsOnce());
  if (!dups.length) return 0;
  const b = writeBatch(db);
  for (const u of dups) b.delete(doc(db, 'cndUnits', u.id));
  await b.commit();
  return dups.length;
}

/**
 * Rename a unit AND retag every product still using the old wording, so the
 * catalogue and the registry never drift apart. If the new name already exists
 * this is a MERGE: the products move over and the old row is removed.
 *
 * Only products are retagged. Orders, POs and returns keep the wording they
 * were issued with — a bill must not change after the fact.
 */
export async function renameUnitEverywhere(
  fromName: string,
  toName: string,
): Promise<{ productsUpdated: number; merged: boolean }> {
  const units = await getCndUnitsOnce();     // never trust a held snapshot
  const from = fromName.trim();
  const to = toName.trim();
  if (!to) throw new Error('ຕ້ອງ ໃສ່ ຊື່ ໃໝ່');
  if (normalizeUnitName(from) === normalizeUnitName(to)) return { productsUpdated: 0, merged: false };

  // retag products (exact stored string — that is what the catalogue holds)
  const snap = await getDocs(query(collection(db, 'cndProducts'), where('unit', '==', from)));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const b = writeBatch(db);
    for (const d of snap.docs.slice(i, i + 400)) b.update(d.ref, { unit: to });
    await b.commit();
  }

  const target = units.find((u) => normalizeUnitName(u.name) === normalizeUnitName(to));
  const source = units.find((u) => normalizeUnitName(u.name) === normalizeUnitName(from));
  if (target && source && target.id !== source.id) {
    await deleteDoc(doc(db, 'cndUnits', source.id));      // merged into target
    return { productsUpdated: snap.size, merged: true };
  }
  if (source) await updateDoc(doc(db, 'cndUnits', source.id), { name: to });
  return { productsUpdated: snap.size, merged: false };
}

/** Units that products already use but which are not registered yet. */
export function missingUnitsFromProducts(productUnits: string[], existing: CndUnit[]): string[] {
  const seen = new Set(existing.map((u) => normalizeUnitName(u.name)));
  const out: string[] = [];
  for (const raw of productUnits) {
    const name = (raw || '').trim();
    const n = normalizeUnitName(name);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(name);
  }
  return out;
}
/**
 * Drop the sample-data flag from units. Units adopted from the real catalogue
 * were briefly stamped as mock by an earlier build; this un-stamps them so they
 * read as real config and survive a "clear sample data" purge.
 */
export async function unmarkCndUnitsMock(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndUnits'), where(MOCK_FLAG, '==', true)));
  if (!snap.size) return 0;
  for (let i = 0; i < snap.docs.length; i += 400) {
    const b = writeBatch(db);
    for (const d of snap.docs.slice(i, i + 400)) b.update(d.ref, { [MOCK_FLAG]: deleteField() });
    await b.commit();
  }
  return snap.size;
}

export async function clearCndUnits(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndUnits'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}
