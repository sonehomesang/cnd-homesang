import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ScrapRate } from './siteConfig';

export type AssetHistoryType = 'install' | 'maintain' | 'repair' | 'other';

export interface AssetHistoryEntry {
  id: string;
  type: AssetHistoryType;
  date: number;
  note?: string;
  jobId?: string;
  by?: string;
  byName?: string;
  /** parameter readings measured at this service (label → value) */
  readings?: { label: string; value: string }[];
}

/** A measured parameter with its factory baseline + install reading (Phase 3+). */
export interface AssetParam {
  id: string;
  label: string;
  unit?: string;
  /** factory-specified reference value (from the category template) */
  factory?: string;
  /** value the technician achieved at first installation (baseline) */
  install?: string;
}

export type ScrapMode = 'manual' | 'reference';

export interface Asset {
  id: string;
  siteId: string;
  siteName?: string;
  roomId?: string;
  roomName?: string;
  ownerId: string;
  sharedWith: string[];
  category: string;
  brand?: string;
  model?: string;
  serial?: string;
  installedAt?: number;
  installedBy?: string;
  warrantyMonths?: number;
  /** custom assetFields values (BTU/voltage/...) */
  fields: Record<string, any>;
  /** factory/install parameter baseline (Phase 3+) */
  parameters?: AssetParam[];
  scrapMode?: ScrapMode;
  scrapValue?: number;
  scrapMaterial?: string;
  scrapWeightKg?: number;
  photos?: string[];
  history: AssetHistoryEntry[];
  createdBy?: string;
  createdByName?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface CreateAssetInput {
  siteId: string;
  siteName?: string;
  roomId?: string;
  roomName?: string;
  ownerId: string;
  sharedWith?: string[];
  category: string;
  brand?: string;
  model?: string;
  serial?: string;
  installedAt?: number;
  installedBy?: string;
  warrantyMonths?: number;
  fields?: Record<string, any>;
  parameters?: AssetParam[];
  scrapMode?: ScrapMode;
  scrapValue?: number;
  scrapMaterial?: string;
  scrapWeightKg?: number;
  photos?: string[];
  history?: AssetHistoryEntry[];
  createdBy?: string;
  createdByName?: string;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Recursively drop undefined values — Firestore rejects them even when nested
 *  inside arrays/objects (e.g. a parameter row whose install value is unset). */
function deepStrip<T>(v: T): T {
  if (Array.isArray(v)) return v.map(deepStrip) as any;
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const [k, val] of Object.entries(v)) if (val !== undefined) o[k] = deepStrip(val as any);
    return o;
  }
  return v;
}

function mapAsset(id: string, data: any): Asset {
  const out: any = { id };
  for (const [k, v] of Object.entries(data ?? {})) out[k] = v instanceof Timestamp ? v.toMillis() : v;
  out.fields = out.fields ?? {};
  out.parameters = Array.isArray(out.parameters) ? out.parameters : [];
  out.history = Array.isArray(out.history) ? out.history : [];
  out.sharedWith = Array.isArray(out.sharedWith) ? out.sharedWith : [];
  if (typeof out.createdAt !== 'number') out.createdAt = Date.now();
  return out as Asset;
}

// ---------- reads ----------

export function watchAssetsForSite(siteId: string, cb: (assets: Asset[]) => void) {
  return onSnapshot(
    query(collection(db, 'assets'), where('siteId', '==', siteId)),
    (snap) => {
      const a = snap.docs.map((d) => mapAsset(d.id, d.data()));
      a.sort((x, y) => (y.installedAt ?? y.createdAt) - (x.installedAt ?? x.createdAt));
      cb(a);
    },
    () => cb([]),
  );
}

export function watchAsset(id: string, cb: (a: Asset | null) => void) {
  return onSnapshot(doc(db, 'assets', id), (s) => cb(s.exists() ? mapAsset(s.id, s.data()) : null), () => cb(null));
}

export async function fetchAsset(id: string): Promise<Asset | null> {
  try { const s = await getDoc(doc(db, 'assets', id)); return s.exists() ? mapAsset(s.id, s.data()) : null; } catch { return null; }
}

// ---------- writes ----------

export async function createAsset(input: CreateAssetInput): Promise<string> {
  const ref = await addDoc(collection(db, 'assets'), {
    ...stripUndefined({
      siteId: input.siteId,
      siteName: input.siteName,
      roomId: input.roomId,
      roomName: input.roomName,
      ownerId: input.ownerId,
      category: input.category,
      brand: input.brand,
      model: input.model,
      serial: input.serial,
      installedAt: input.installedAt,
      installedBy: input.installedBy,
      warrantyMonths: input.warrantyMonths,
      scrapMode: input.scrapMode,
      scrapValue: input.scrapValue,
      scrapMaterial: input.scrapMaterial,
      scrapWeightKg: input.scrapWeightKg,
      createdBy: input.createdBy,
      createdByName: input.createdByName,
    }),
    fields: deepStrip(input.fields ?? {}),
    parameters: deepStrip(input.parameters ?? []),
    photos: input.photos ?? [],
    sharedWith: input.sharedWith ?? [],
    history: deepStrip(input.history ?? []),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateAsset(id: string, patch: Partial<Asset>) {
  await updateDoc(doc(db, 'assets', id), { ...deepStrip(stripUndefined(patch as any)), updatedAt: serverTimestamp() });
}

export async function deleteAsset(id: string) {
  await deleteDoc(doc(db, 'assets', id));
}

/** Append a maintenance/repair/install record (owner/tech-shared/admin). */
export async function addAssetHistory(id: string, entry: AssetHistoryEntry) {
  await updateDoc(doc(db, 'assets', id), { history: arrayUnion(deepStrip(stripUndefined(entry as any))), updatedAt: serverTimestamp() });
}

// ---------- derived ----------

function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

export type WarrantyState = 'active' | 'expired' | 'none';

/** Warranty status from installedAt + warrantyMonths. `now` injectable for tests. */
export function warrantyStatus(asset: Asset, now = Date.now()): { state: WarrantyState; endMs?: number } {
  if (!asset.installedAt || !asset.warrantyMonths) return { state: 'none' };
  const endMs = addMonths(asset.installedAt, asset.warrantyMonths);
  return { state: now < endMs ? 'active' : 'expired', endMs };
}

/** Compute scrap value. manual → the typed value; reference → rate×weight. */
export function computeScrap(
  opts: { mode?: ScrapMode; value?: number; material?: string; weightKg?: number },
  rates: ScrapRate[],
): number | undefined {
  if (opts.mode === 'reference') {
    const rate = rates.find((r) => r.material === opts.material)?.ratePerKg;
    if (rate === undefined || !opts.weightKg) return undefined;
    return Math.round(rate * opts.weightKg);
  }
  return typeof opts.value === 'number' ? opts.value : undefined;
}

export const HISTORY_META: Record<AssetHistoryType, { label: string; icon: string }> = {
  install: { label: 'ຕິດຕັ້ງ', icon: '🔩' },
  maintain: { label: 'ບຳລຸງ ຮັກສາ', icon: '🧰' },
  repair: { label: 'ສ້ອມແປງ', icon: '🔧' },
  other: { label: 'ອື່ນໆ', icon: '📌' },
};

export function newHistoryId(): string {
  return `h${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export function newParamId(): string {
  return `p${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export interface ParamRow { label: string; unit?: string; factory?: string; install?: string; latest?: string; latestAt?: number }

/**
 * Build the factory / install / latest comparison rows for an asset. "latest"
 * comes from the most recent history entry that carries a reading for the param.
 */
export function paramComparison(asset: Asset): ParamRow[] {
  const hist = [...asset.history].sort((a, b) => b.date - a.date);
  return (asset.parameters ?? []).map((p) => {
    let latest: string | undefined;
    let latestAt: number | undefined;
    for (const h of hist) {
      const r = h.readings?.find((x) => x.label === p.label);
      if (r && r.value !== '') { latest = r.value; latestAt = h.date; break; }
    }
    return { label: p.label, unit: p.unit, factory: p.factory, install: p.install, latest, latestAt };
  });
}
