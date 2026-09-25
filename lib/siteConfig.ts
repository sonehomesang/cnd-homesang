import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Schema-driven building/site registry config. Everything the admin can extend
 * lives here: site-level SECTIONS (each a list of custom FIELDS) plus a per-room
 * field TEMPLATE + room types. Adding a category (eg "ກຳແພງ/ຮົ້ວ") or a field is
 * pure data — the site form + Dossier render dynamically, no code change.
 */

export type FieldType = 'text' | 'number' | 'select' | 'multiselect' | 'toggle';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** unit shown after a number field (ມ, ຕ.ມ, A...) */
  unit?: string;
  /** choices for select / multiselect */
  options?: string[];
  /** when set, this field is COMPUTED (read-only) = product of the given field
   *  keys' numeric values. eg area = [width,length], volume = [width,length,height] */
  factors?: string[];
}

export interface SectionDef {
  key: string;
  label: string;
  icon?: string;
  fields: FieldDef[];
}

export interface RoomTypeOption { key: string; label: string; icon?: string }

/** Scrap-material reference rate for the "ຕີ ລາຄາ ເສດ" reference mode. */
export interface ScrapRate { material: string; ratePerKg: number }

/** A factory-spec parameter template for an asset category (baseline reference). */
export interface AssetParamDef { key: string; label: string; unit?: string; factory?: string }

/** Phase 3B — per-category knowledge base entries. */
export interface SparePart { key: string; name: string; price?: number }
export interface ServiceRateRef { key: string; label: string; price?: number }
export interface TroubleItem { key: string; symptom: string; cause?: string; fix?: string; est?: string }

/** An asset category with its own custom fields + parameter template (Phase 3+)
 *  and a knowledge base: spare parts, service rates, troubleshooting (Phase 3B). */
export interface AssetCategory extends RoomTypeOption {
  /** category-specific fields (aircon → inverter/refrigerant; fridge → other) */
  fields?: FieldDef[];
  /** factory-spec parameters measured at install + over service life */
  paramTemplate?: AssetParamDef[];
  /** essential spare parts + reference prices */
  spareParts?: SparePart[];
  /** service/labor rate references */
  serviceRates?: ServiceRateRef[];
  /** symptom → cause → fix guide (+ ballpark estimate) */
  troubleshooting?: TroubleItem[];
}

export interface SiteConfig {
  /** site-level data groups (building / systems / walls / ...) */
  sections: SectionDef[];
  /** room categories a room can be tagged as */
  roomTypes: RoomTypeOption[];
  /** the field template every room is measured against */
  roomFields: FieldDef[];
  /** component categories inside a room (floor/wall/door/ceiling/window/...) */
  componentTypes: RoomTypeOption[];
  /** the field template every room-component is described with */
  componentFields: FieldDef[];
  /** asset/appliance categories (aircon/fridge/tv/pump/cctv/...) — Phase 3.
   *  Each may carry its own fields + parameter template (Phase 3+). */
  assetCategories: AssetCategory[];
  /** common fields on EVERY asset (voltage/...) — rendered before category fields */
  assetFields: FieldDef[];
  /** material scrap rates (ກີບ/kg) for the reference scrap-valuation mode */
  scrapRates: ScrapRate[];
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  sections: [
    {
      key: 'building',
      label: 'ອາຄານ',
      icon: '🏠',
      fields: [
        { key: 'buildingType', label: 'ປະເພດ ອາຄານ', type: 'select', options: ['ເຮືອນ', 'ໂຮງແຮມ', 'ໂຮງງານ', 'ໂຮງຮຽນ', 'ໂຮງໝໍ', 'ຮ້ານ / ຫ້ອງການ'] },
        { key: 'form', label: 'ຮູບແບບ', type: 'select', options: ['ຊັ້ນ ດຽວ', '2 ຊັ້ນ', '3 ຊັ້ນ ຂຶ້ນໄປ', 'ຫ້ອງແຖວ'] },
        { key: 'structure', label: 'ໂຄງສ້າງ', type: 'multiselect', options: ['ໂຄງເຫຼັກ', 'ກໍ່ ດິນຈີ່', 'ດິນ ບ໋ອກ', 'ISO Wall', 'ໄມ້', 'ຄອນກຣີຕ'] },
        { key: 'areaM2', label: 'ເນື້ອທີ່ ລວມ', type: 'number', unit: 'ຕ.ມ' },
        { key: 'floors', label: 'ຈຳນວນ ຊັ້ນ', type: 'number', unit: 'ຊັ້ນ' },
        { key: 'roof', label: 'ຫຼັງຄາ', type: 'select', options: ['ສັງກະສີ', 'ກະເບື້ອງ', 'ຄອນກຣີຕ', 'ອື່ນໆ'] },
      ],
    },
    {
      key: 'systems',
      label: 'ລະບົບ',
      icon: '🔌',
      fields: [
        { key: 'power', label: 'ໄຟຟ້າ', type: 'text' },
        { key: 'water', label: 'ປະປາ / ນ້ຳບາດານ', type: 'toggle' },
        { key: 'wastewater', label: 'ນ້ຳເສຍ / ສຸຂະພັນ', type: 'toggle' },
        { key: 'hvac', label: 'HVAC / ແອ', type: 'toggle' },
        { key: 'fire', label: 'ດັບເພີງ', type: 'toggle' },
        { key: 'elevator', label: 'ລິຟ', type: 'toggle' },
        { key: 'solar', label: 'ໂຊລ່າ', type: 'toggle' },
      ],
    },
  ],
  roomTypes: [
    { key: 'bedroom', label: 'ຫ້ອງ ນອນ', icon: '🛏️' },
    { key: 'living', label: 'ຫ້ອງ ຮັບແຂກ', icon: '🛋️' },
    { key: 'kitchen', label: 'ຫ້ອງ ຄົວ', icon: '🍳' },
    { key: 'bathroom', label: 'ຫ້ອງ ນ້ຳ', icon: '🚿' },
    { key: 'office', label: 'ຫ້ອງການ', icon: '🏢' },
    { key: 'other', label: 'ອື່ນໆ', icon: '📦' },
  ],
  roomFields: [
    { key: 'width', label: 'ກວ້າງ', type: 'number', unit: 'ມ' },
    { key: 'length', label: 'ຍາວ', type: 'number', unit: 'ມ' },
    { key: 'height', label: 'ສູງ ແພດານ', type: 'number', unit: 'ມ' },
    { key: 'area', label: 'ເນື້ອທີ່', type: 'number', unit: 'ຕ.ມ', factors: ['width', 'length'] },
    { key: 'volume', label: 'ບໍລິມາດ', type: 'number', unit: 'ມ³', factors: ['width', 'length', 'height'] },
    { key: 'ceiling', label: 'ປະເພດ ແພດານ', type: 'select', options: ['ຢິປຊັມ', 'ໄມ້', 'ປູນ', 'T-bar', 'ບໍ່ ມີ'] },
    { key: 'wall', label: 'ຝາ', type: 'select', options: ['ກໍ່ ດິນຈີ່ ສະໂປ', 'ຫຍິບຊັມ', 'ໄມ້', 'ກະຈົກ'] },
    { key: 'sun', label: 'ຖືກ ແດດ', type: 'select', options: ['ໜ້ອຍ', 'ປານກາງ', 'ຫຼາຍ'] },
    { key: 'usage', label: 'ໃຊ້ ເຮັດ ຫຍັງ', type: 'select', options: ['ຫ້ອງ ນອນ', 'ຮັບແຂກ', 'ຄົວ', 'ຫ້ອງການ', 'ອື່ນໆ'] },
  ],
  componentTypes: [
    { key: 'floor', label: 'ພື້ນ', icon: '🟫' },
    { key: 'wall', label: 'ຝາ', icon: '🧱' },
    { key: 'ceiling', label: 'ແພດານ', icon: '⬜' },
    { key: 'door', label: 'ປະຕູ', icon: '🚪' },
    { key: 'window', label: 'ປ່ອງຢ້ຽມ', icon: '🪟' },
    { key: 'other', label: 'ອື່ນໆ', icon: '🧩' },
  ],
  componentFields: [
    { key: 'material', label: 'ວັດສະດຸ', type: 'select', options: ['ທາສີ', 'ກຣະເບື້ອງ', 'ໄມ້', 'ຄອນກຣີຕ', 'ອາລູ', 'ກະຈົກ', 'ຢິປຊັມ', 'T-bar', 'ພຣມ', 'ອື່ນໆ'] },
    { key: 'condition', label: 'ສະພາບ', type: 'select', options: ['ດີ', 'ພໍໃຊ້', 'ຕ້ອງ ສ້ອມ'] },
    { key: 'count', label: 'ຈຳນວນ', type: 'number', unit: 'ອັນ' },
    { key: 'note', label: 'ໝາຍເຫດ', type: 'text' },
  ],
  assetCategories: [
    {
      key: 'aircon', label: 'ແອ', icon: '❄️',
      fields: [
        { key: 'inverter', label: 'ປະເພດ', type: 'select', options: ['Inverter', 'Non-inverter'] },
        { key: 'refrigerant', label: 'Refrigerant No.', type: 'select', options: ['R32', 'R410A', 'R22', 'R290'] },
        { key: 'btu', label: 'BTU', type: 'text' },
      ],
      paramTemplate: [
        { key: 'pressure', label: 'ຄວາມ ດັນ', unit: 'psi', factory: '150' },
        { key: 'outtemp', label: 'ອຸນຫະ ລົມ ອອກ', unit: '°C', factory: '12–15' },
        { key: 'current', label: 'ກະແສ', unit: 'A', factory: '≤6.5' },
      ],
      spareParts: [
        { key: 'capacitor', name: 'Capacitor (ຄາປາຊິເຕີ)', price: 85000 },
        { key: 'compressor', name: 'Compressor', price: 1200000 },
        { key: 'fanmotor', name: 'Fan motor', price: 350000 },
        { key: 'gasr32', name: 'ນ້ຳຢາ R32 (ຕໍ່ ຄັ້ງ)', price: 180000 },
        { key: 'remote', name: 'Remote', price: 120000 },
      ],
      serviceRates: [
        { key: 'clean', label: 'ລ້າງ ແອ ຕິດ ຝາ', price: 80000 },
        { key: 'refill', label: 'ຕື່ມ ນ້ຳຢາ + ກວດ ຮົ່ວ', price: 200000 },
        { key: 'relocate', label: 'ຖອດ / ຕິດ ຍ້າຍ ບ່ອນ', price: 300000 },
      ],
      troubleshooting: [
        { key: 'notcold', symptom: 'ແອ ບໍ່ ເຢັນ / ເຢັນ ໜ້ອຍ', cause: 'ນ້ຳຢາ ໝົດ/ຮົ່ວ · ຄອຍ ເປື້ອນ · compressor ອ່ອນ', fix: 'ກວດ ຮົ່ວ + ຕື່ມ ນ້ຳຢາ · ລ້າງ ຄອຍ', est: '~200,000–380,000 ກີບ' },
        { key: 'leak', symptom: 'ແອ ມີ ນ້ຳ ຢົດ', cause: 'ທໍ່ ນ້ຳ ຕັນ · ຖາດ ຮັບ ນ້ຳ ເຕັມ', fix: 'ລ້າງ ທໍ່ ນ້ຳ · ກວດ ຄວາມ ຊັນ', est: '~80,000–150,000 ກີບ' },
        { key: 'noisy', symptom: 'ມີ ສຽງ ດັງ ຜິດ ປົກກະຕິ', cause: 'fan ຫຼວມ · ໃບພັດ ເປື້ອນ · bearing', fix: 'ຂັນ ແໜ້ນ · ລ້າງ · ປ່ຽນ bearing', est: '~100,000–350,000 ກີບ' },
      ],
    },
    { key: 'fridge', label: 'ຕູ້ເຢັນ', icon: '🧊' },
    { key: 'tv', label: 'ໂທລະທັດ', icon: '📺' },
    { key: 'waterheater', label: 'ເຄື່ອງ ຕົ້ມ ນ້ຳ', icon: '♨️' },
    { key: 'pump', label: 'ປໍ້າ ນ້ຳ', icon: '💧' },
    { key: 'cctv', label: 'CCTV', icon: '📷' },
    { key: 'solar', label: 'ໂຊລ່າ', icon: '☀️' },
    { key: 'washer', label: 'ເຄື່ອງ ຊັກ', icon: '🧺' },
    { key: 'other', label: 'ອື່ນໆ', icon: '🔩' },
  ],
  assetFields: [
    { key: 'voltage', label: 'ແຮງດັນ / ໄຟ', type: 'text' },
  ],
  scrapRates: [
    { material: 'ເຫຼັກ / ໂລຫະ', ratePerKg: 3000 },
    { material: 'ທອງແດງ', ratePerKg: 40000 },
    { material: 'ອາລູມິນຽມ', ratePerKg: 12000 },
    { material: 'ພລາສຕິກ', ratePerKg: 1500 },
  ],
};

function merge(data: any): SiteConfig {
  return {
    sections: Array.isArray(data?.sections) && data.sections.length ? data.sections : DEFAULT_SITE_CONFIG.sections,
    roomTypes: Array.isArray(data?.roomTypes) && data.roomTypes.length ? data.roomTypes : DEFAULT_SITE_CONFIG.roomTypes,
    roomFields: Array.isArray(data?.roomFields) && data.roomFields.length ? data.roomFields : DEFAULT_SITE_CONFIG.roomFields,
    componentTypes: Array.isArray(data?.componentTypes) && data.componentTypes.length ? data.componentTypes : DEFAULT_SITE_CONFIG.componentTypes,
    componentFields: Array.isArray(data?.componentFields) && data.componentFields.length ? data.componentFields : DEFAULT_SITE_CONFIG.componentFields,
    assetCategories: Array.isArray(data?.assetCategories) && data.assetCategories.length ? data.assetCategories : DEFAULT_SITE_CONFIG.assetCategories,
    assetFields: Array.isArray(data?.assetFields) && data.assetFields.length ? data.assetFields : DEFAULT_SITE_CONFIG.assetFields,
    scrapRates: Array.isArray(data?.scrapRates) && data.scrapRates.length ? data.scrapRates : DEFAULT_SITE_CONFIG.scrapRates,
  };
}

export function watchSiteConfig(cb: (c: SiteConfig) => void) {
  return onSnapshot(
    doc(db, 'settings', 'siteConfig'),
    (snap) => cb(snap.exists() ? merge(snap.data()) : DEFAULT_SITE_CONFIG),
    () => cb(DEFAULT_SITE_CONFIG),
  );
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'siteConfig'));
    return snap.exists() ? merge(snap.data()) : DEFAULT_SITE_CONFIG;
  } catch {
    return DEFAULT_SITE_CONFIG;
  }
}

export async function saveSiteConfig(c: Partial<SiteConfig>) {
  await setDoc(doc(db, 'settings', 'siteConfig'), { ...c, updatedAt: serverTimestamp() }, { merge: true });
}

/** Seed the default config doc once (idempotent — only writes when absent). */
export async function seedSiteConfig() {
  const snap = await getDoc(doc(db, 'settings', 'siteConfig'));
  if (!snap.exists()) await setDoc(doc(db, 'settings', 'siteConfig'), { ...DEFAULT_SITE_CONFIG, seededAt: serverTimestamp() });
}

/** A field is computed (read-only, auto-derived) when it declares factors. */
export function isComputed(f: FieldDef): boolean {
  return Array.isArray(f.factors) && f.factors.length > 0;
}

/**
 * Resolve a field's display value. Computed fields multiply their factors from
 * `values`; others return the stored value. Returns undefined when a factor is
 * missing so the UI can show a dash.
 */
export function computeValue(f: FieldDef, values: Record<string, any>): any {
  if (!isComputed(f)) return values[f.key];
  let product = 1;
  for (const k of f.factors!) {
    const n = Number(values[k]);
    if (!Number.isFinite(n) || n === 0) return undefined;
    product *= n;
  }
  return Math.round(product * 100) / 100;
}

/** Pretty one-line summary of a field value (for Dossier rows / job specs). */
export function formatFieldValue(f: FieldDef, values: Record<string, any>): string {
  const v = computeValue(f, values);
  if (f.type === 'toggle') return v ? 'ມີ' : '—';
  if (f.type === 'multiselect') return Array.isArray(v) && v.length ? v.join(', ') : '—';
  if (v === undefined || v === '' || v === null) return '—';
  return f.unit ? `${v} ${f.unit}` : String(v);
}
