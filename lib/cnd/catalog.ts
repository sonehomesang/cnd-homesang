import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, increment, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG, stampMock } from '../mock';
import { SERVICE_TEMPLATES } from '../ninesang';

/**
 * Flag existing service SKUs as isService (+ fill the structured template) — for
 * stores seeded BEFORE the service-detail template existed (seedCndCatalog skips
 * products when the catalog is non-empty, so a re-seed can't backfill them).
 * Idempotent: only touches products in the ບໍລິການ category tree that lack the
 * isService flag. Returns how many were upgraded.
 */
export async function upgradeCndServiceProducts(): Promise<number> {
  const [csnap, psnap] = await Promise.all([
    getDocs(query(collection(db, 'cndCategories'))),
    getDocs(query(collection(db, 'cndProducts'))),
  ]);
  const cats = csnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const svcRoot = cats.find((c) => !c.parentId && /ບໍລິການ/.test(c.name || ''));
  const svcIds = new Set<string>();
  if (svcRoot) { svcIds.add(svcRoot.id); cats.forEach((c) => { if (c.parentId === svcRoot.id) svcIds.add(c.id); }); }
  const match = (name: string) => {
    const n = name || '';
    if (/ຮື້|ຖອນ/.test(n)) return SERVICE_TEMPLATES.find((t) => t.key === 'ac-remove');
    if (/ລ້າງ.*ແອ|ແອ.*ລ້າງ/.test(n)) return SERVICE_TEMPLATES.find((t) => t.key === 'ac-clean');
    if (/ຕິດຕັ້ງ.*ແອ|ແອ/.test(n)) return SERVICE_TEMPLATES.find((t) => t.key === 'ac-install');
    if (/ໄຟ|ໂຄມ|led/i.test(n)) return SERVICE_TEMPLATES.find((t) => t.key === 'light');
    if (/ນ້ຳ|ປະປາ|ຮົ່ວ|ໂຖ|ສ້ວມ/.test(n)) return SERVICE_TEMPLATES.find((t) => t.key === 'plumb');
    if (/ຊັກ|ນ້ຳ ອຸ່ນ|ເຄື່ອງ ໃຊ້/.test(n)) return SERVICE_TEMPLATES.find((t) => t.key === 'appliance');
    return undefined;
  };
  const batch = writeBatch(db);
  let n = 0;
  psnap.forEach((d) => {
    const p = d.data() as any;
    if (p.isService) return;                                   // already a service
    const isSvc = svcIds.has(p.categoryId) || p.unit === 'ຄັ້ງ' || p.unit === 'ຈຸດ';
    if (!isSvc) return;
    const patch: any = { isService: true };
    if (p.unit === 'ໜ່ວຍ') patch.unit = 'ຄັ້ງ';
    const tpl = match(p.name);
    if (tpl && !Array.isArray(p.serviceScope)) {
      patch.serviceScope = [...tpl.scope]; patch.serviceExcludes = [...tpl.excludes]; patch.serviceRequirements = [...tpl.requirements];
      patch.durationMin = tpl.durationMin; patch.durationMax = tpl.durationMax;
      if (!p.warrantyDays && tpl.warrantyDays) patch.warrantyDays = tpl.warrantyDays;
    }
    batch.update(d.ref, patch); n++;
  });
  if (n) await batch.commit();
  return n;
}

/**
 * CND — a partner hardware store ("Home Hardware shop & services") hosted at
 * cnd.homesang.pro, on its own /cnd shell + independent admin. Data is CND-
 * namespaced (cnd*) so it never mixes with the HomeSang marketplace. Reuses the
 * HomeSang commerce PATTERNS (catalog / cart / checkout) as code, not data.
 *
 * The signature CND feature: buying a product can offer a technician to install
 * it for a configurable % service fee (see lib/cnd/config + install).
 */

export interface CndCategory {
  id: string;
  name: string;
  icon?: string;
  order?: number;
  parentId?: string;      // undefined/'' = top-level main; else child of that category (up to 3 levels deep)
  installFeePct?: number; // per-category install-fee % override (see config)
  __mock?: boolean;
}

// ── category tree helpers (main → sub → sub2) ────────────────────────────────
const pid = (c: CndCategory) => c.parentId || null;
/** Direct children of a category; pass null/undefined for the top-level mains. */
export function catChildren(cats: CndCategory[], parentId?: string | null): CndCategory[] {
  return cats.filter((c) => pid(c) === (parentId || null)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}
/** A category's own id + every descendant id (for filtering / counting a whole branch). */
export function catWithDescendants(cats: CndCategory[], id: string): Set<string> {
  const out = new Set<string>([id]);
  for (let added = true; added;) { added = false; for (const c of cats) if (c.parentId && out.has(c.parentId) && !out.has(c.id)) { out.add(c.id); added = true; } }
  return out;
}
/** Depth: 0 = main, 1 = sub, 2 = sub2. */
export function catDepth(cats: CndCategory[], id: string): number {
  let d = 0; let cur = cats.find((c) => c.id === id);
  while (cur?.parentId) { d++; const p = cur.parentId; cur = cats.find((c) => c.id === p); if (d > 8) break; }
  return d;
}
/** Ancestor→self chain (breadcrumb), root first. */
export function catPath(cats: CndCategory[], id: string): CndCategory[] {
  const path: CndCategory[] = []; let cur = cats.find((c) => c.id === id);
  while (cur) { path.unshift(cur); const p = cur.parentId; cur = p ? cats.find((c) => c.id === p) : undefined; if (path.length > 8) break; }
  return path;
}
/** Product count for a category, counting every descendant leaf too. */
export function catProductCount(cats: CndCategory[], products: { categoryId: string }[], id: string): number {
  const set = catWithDescendants(cats, id);
  return products.filter((p) => set.has(p.categoryId)).length;
}

export interface CndProduct {
  id: string;
  name: string;
  categoryId: string;
  brand?: string;
  unit: string;          // ໜ່ວຍ · ກະສອບ · ເສັ້ນ · ກ່ອງ · ຖັງ · ແມັດ …
  price: number;         // kip (selling price)
  cost?: number;         // kip (unit cost — for margin)
  oldPrice?: number;     // for a discount strike-through
  images?: string[];
  sku?: string;
  stock?: number;                          // total across branches (mirror; storefront/POS display)
  stockByBranch?: Record<string, number>;  // per-branch stock (phase 2b)
  installable?: boolean;      // offer a technician to install this
  installFeePct?: number;     // per-product install-fee % override (wins over category/global)
  warrantyDays?: number;      // service/install warranty length (days) — shown on product + invoice
  description?: string;
  // ── ninesang service-detail template (SKU sold "per ຄັ້ງ", e.g. ຮື້ຖອນ/ລ້າງ ແອ) ──
  isService?: boolean;            // service SKU → show the structured service block
  serviceScope?: string[];       // ✓ ຂອບ ເຂດ ງານ (what's included)
  serviceExcludes?: string[];    // ✕ ບໍ່ ລວມ ໃນ ລາຄາ (what's excluded)
  serviceRequirements?: string[];// 📋 ລູກຄ້າ ຕຽມ / ຂໍ້ ຄວນ ຮູ້
  durationMin?: number;          // ⏱ ໄລຍະ ເວລາ ຕ່ຳ (ນາທີ)
  durationMax?: number;          // ⏱ ໄລຍະ ເວລາ ສູງ (ນາທີ)
  createdAt: number;
  __mock?: boolean;
}

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function strip<T extends Record<string, any>>(o: T): Partial<T> {
  const out: any = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v; return out;
}

// ── Categories ───────────────────────────────────────────────────────────────
function mapCat(id: string, d: any): CndCategory {
  return { id, name: d.name ?? '', icon: d.icon, order: d.order, parentId: d.parentId || undefined, installFeePct: d.installFeePct, __mock: !!d[MOCK_FLAG] };
}
export type CndCategoryInput = { name: string; icon?: string; order?: number; parentId?: string; installFeePct?: number };
export async function createCndCategory(input: CndCategoryInput) {
  await addDoc(collection(db, 'cndCategories'), strip({ ...input }));
}
export async function updateCndCategory(id: string, patch: Partial<Pick<CndCategory, 'name' | 'icon' | 'order' | 'parentId' | 'installFeePct'>>) {
  const clean: any = { ...patch };
  if ('parentId' in clean && !clean.parentId) clean.parentId = deleteField();  // clearing → back to a main
  await updateDoc(doc(db, 'cndCategories', id), clean);
}
export async function deleteCndCategory(id: string) { await deleteDoc(doc(db, 'cndCategories', id)); }
export function watchCndCategories(cb: (c: CndCategory[]) => void) {
  return onSnapshot(query(collection(db, 'cndCategories')),
    (s) => cb(s.docs.map((d) => mapCat(d.id, d.data())).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))),
    (e) => { console.error('watchCndCategories:', e); cb([]); });
}

// ── Products ─────────────────────────────────────────────────────────────────
function mapProd(id: string, d: any): CndProduct {
  return {
    id, name: d.name ?? '', categoryId: d.categoryId ?? '', brand: d.brand, unit: d.unit ?? 'ໜ່ວຍ',
    price: Number(d.price) || 0, cost: typeof d.cost === 'number' ? d.cost : undefined, oldPrice: d.oldPrice ? Number(d.oldPrice) : undefined,
    images: Array.isArray(d.images) ? d.images : undefined, sku: d.sku, stock: d.stock, stockByBranch: (d.stockByBranch && typeof d.stockByBranch === 'object') ? d.stockByBranch : undefined,
    installable: !!d.installable, installFeePct: typeof d.installFeePct === 'number' ? d.installFeePct : undefined,
    warrantyDays: typeof d.warrantyDays === 'number' ? d.warrantyDays : undefined,
    description: d.description,
    isService: !!d.isService,
    serviceScope: Array.isArray(d.serviceScope) ? d.serviceScope : undefined,
    serviceExcludes: Array.isArray(d.serviceExcludes) ? d.serviceExcludes : undefined,
    serviceRequirements: Array.isArray(d.serviceRequirements) ? d.serviceRequirements : undefined,
    durationMin: typeof d.durationMin === 'number' ? d.durationMin : undefined,
    durationMax: typeof d.durationMax === 'number' ? d.durationMax : undefined,
    createdAt: ms(d.createdAt), __mock: !!d[MOCK_FLAG],
  };
}
export function watchCndProducts(cb: (p: CndProduct[]) => void) {
  return onSnapshot(query(collection(db, 'cndProducts')),
    (s) => cb(s.docs.map((d) => mapProd(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchCndProducts:', e); cb([]); });
}
/** Stock at a specific branch (falls back to total when not yet branch-split). */
export function branchStock(p: Pick<CndProduct, 'stock' | 'stockByBranch'>, branchId?: string | null): number {
  if (branchId && p.stockByBranch && branchId in p.stockByBranch) return p.stockByBranch[branchId] || 0;
  if (branchId && p.stockByBranch) return 0;
  return p.stock ?? 0;
}

export async function getCndProduct(id: string): Promise<CndProduct | null> {
  try { const s = await getDoc(doc(db, 'cndProducts', id)); return s.exists() ? mapProd(s.id, s.data()) : null; } catch { return null; }
}
/** Resolve the install-fee % for a product: product override → category → global default. */
export function resolveInstallPct(p: Pick<CndProduct, 'installFeePct' | 'categoryId'>, cats: CndCategory[], globalDefault = 10): number {
  if (typeof p.installFeePct === 'number') return p.installFeePct;
  const c = cats.find((x) => x.id === p.categoryId);
  if (typeof c?.installFeePct === 'number') return c.installFeePct;
  return globalDefault;
}

export type CndProductInput = Omit<CndProduct, 'id' | 'createdAt' | '__mock'>;
export async function createCndProduct(input: CndProductInput) { await addDoc(collection(db, 'cndProducts'), strip({ ...input, createdAt: serverTimestamp() })); }
export async function updateCndProduct(id: string, patch: Partial<CndProductInput>) { await updateDoc(doc(db, 'cndProducts', id), strip({ ...patch }) as any); }
export async function deleteCndProduct(id: string) { await deleteDoc(doc(db, 'cndProducts', id)); }

/**
 * One-tap cleanup of Thai-in-Lao mojibake in LIVE catalog DATA (product +
 * category names/text already stored in Firestore — the storefront reads these,
 * not the seed source). Fixes only "mixed" runs (a Thai codepoint fused into a
 * Lao word = byte-corrupted Lao) by mapping each Thai char to its Lao twin
 * (+0x80). A genuine Thai word (e.g. a bilingual search keyword) has no Lao char
 * in the run and is left untouched. Safe + idempotent; returns how many changed.
 */
function deMojiStr(s?: string): string {
  if (!s) return s ?? '';
  return s.replace(/[฀-໿]+/g, (run) => {
    const hasThai = /[฀-๿]/.test(run), hasLao = /[຀-໿]/.test(run);
    if (!hasThai || !hasLao) return run;                 // pure-Thai (intentional) or pure-Lao → keep
    return run.replace(/[฀-๿]/g, (c) => { const cp = c.charCodeAt(0) + 0x80; return cp <= 0x0EFF ? String.fromCharCode(cp) : c; });
  });
}
function deMojiArr(a?: string[]): string[] | undefined {
  if (!Array.isArray(a)) return a;
  return a.map(deMojiStr);
}
export async function deMojibakeCndCatalog(products: CndProduct[], cats: CndCategory[]): Promise<{ products: number; cats: number }> {
  let np = 0, nc = 0;
  for (const p of products) {
    const patch: Partial<CndProductInput> = {};
    const name = deMojiStr(p.name); if (name !== p.name) patch.name = name;
    const brand = deMojiStr(p.brand); if (p.brand && brand !== p.brand) patch.brand = brand;
    const desc = deMojiStr(p.description); if (p.description && desc !== p.description) patch.description = desc;
    const sc = deMojiArr(p.serviceScope); if (p.serviceScope && JSON.stringify(sc) !== JSON.stringify(p.serviceScope)) patch.serviceScope = sc;
    const se = deMojiArr(p.serviceExcludes); if (p.serviceExcludes && JSON.stringify(se) !== JSON.stringify(p.serviceExcludes)) patch.serviceExcludes = se;
    const sr = deMojiArr(p.serviceRequirements); if (p.serviceRequirements && JSON.stringify(sr) !== JSON.stringify(p.serviceRequirements)) patch.serviceRequirements = sr;
    if (Object.keys(patch).length) { await updateCndProduct(p.id, patch); np++; }
  }
  for (const c of cats) {
    const name = deMojiStr(c.name);
    if (name !== c.name) { await updateCndCategory(c.id, { name }); nc++; }
  }
  return { products: np, cats: nc };
}

/** Best-effort stock decrement after a sale (only for stock-tracked lines; the
 *  caller passes only products whose stock is a number). Shared by POS + online. */
export async function decrementCndStock(lines: { productId: string; qty: number }[]) {
  await Promise.all(lines.map((l) => updateDoc(doc(db, 'cndProducts', l.productId), { stock: increment(-Math.abs(l.qty)) }).catch(() => {})));
}

// ── Sample / mock catalog ────────────────────────────────────────────────────
const CATS: { key: string; name: string; icon: string; order: number; installFeePct?: number }[] = [
  { key: 'elec', name: 'ໄຟຟ້າ', icon: '💡', order: 1, installFeePct: 12 },
  { key: 'plumb', name: 'ປະປາ / ສຸຂະພັນ', icon: '🚰', order: 2, installFeePct: 15 },
  { key: 'aircon', name: 'ແອຣ໌', icon: '❄️', order: 3, installFeePct: 8 },
  { key: 'paint', name: 'ສີ ທາ ບ້ານ', icon: '🎨', order: 4 },
  { key: 'tools', name: 'ເຄຣື່ອງມືອ ຊ່າງ', icon: '🔧', order: 5 },
  { key: 'build', name: 'ວັດສະດຸ ກໍ່ສ້າງ', icon: '🧱', order: 6 },
  { key: 'service', name: 'ບໍລິການ ຊ່າງ', icon: '🛠️', order: 7, installFeePct: 10 },
];

// sub / sub2 categories (dohome-style tree). `parent` refers to a CATS key or another SUBS key.
const SUBS: { key: string; name: string; icon: string; parent: string; order: number }[] = [
  { key: 'elec-bulb', name: 'ຫຼອດ ໄຟ / LED', icon: '💡', parent: 'elec', order: 1 },
  { key: 'elec-wire', name: 'ສາຍ ໄຟ / ສະວິດ / ຕູ້ ໄຟ', icon: '🔌', parent: 'elec', order: 2 },
  { key: 'elec-fan', name: 'ພັດ ລົມ', icon: '🌀', parent: 'elec', order: 3 },
  { key: 'plumb-faucet', name: 'ກ໊ອກ / ອ່າງ / ຝັກບົວ', icon: '🚿', parent: 'plumb', order: 1 },
  { key: 'plumb-pipe', name: 'ທໍ່ / ຂໍ້ ຕໍ່ / ปั๊ม', icon: '🔧', parent: 'plumb', order: 2 },
  { key: 'plumb-toilet', name: 'ໂຖ ສ້ວມ / ນ້ຳ ຮ້ອນ', icon: '🚽', parent: 'plumb', order: 3 },
  { key: 'aircon-wall', name: 'ແອຣ໌ ຕິດ ຝາ', icon: '❄️', parent: 'aircon', order: 1 },
  { key: 'aircon-etc', name: 'ພັດ ລົມ ໄອ ນ້ຳ / ອຸປະກອນ', icon: '💨', parent: 'aircon', order: 2 },
  { key: 'tools-power', name: 'ເຄຣື່ອງມືອ ໄຟຟ້າ', icon: '🔩', parent: 'tools', order: 1 },
  { key: 'tools-hand', name: 'ເຄຣື່ອງມືອ ມື / ບັນໄດ', icon: '🛠️', parent: 'tools', order: 2 },
  { key: 'build-cement', name: 'ปูน / ອິດ / ເຫຼັກ', icon: '🧱', parent: 'build', order: 1 },
  { key: 'build-tile', name: 'ກະເບື້ອງ / ຫີນ / ຊາຍ', icon: '🪨', parent: 'build', order: 2 },
  // a 3rd level (sub2) demo under "ແອຣ໌ ຕິດ ຝາ"
  { key: 'aircon-wall-inv', name: 'Inverter (ປະຢັດ ໄຟ)', icon: '🌿', parent: 'aircon-wall', order: 1 },
  { key: 'aircon-wall-std', name: 'ທຳມະດາ (Fixed speed)', icon: '⚙️', parent: 'aircon-wall', order: 2 },
];

const CAT_COLOR: Record<string, string> = { elec: '#e8551e', plumb: '#0a7ea4', aircon: '#2b8ac6', paint: '#7a4bd0', tools: '#c4400f', build: '#6b7280', service: '#1f9d57' };
/** Self-contained product image (SVG data URI) — tinted card + icon + brand. */
function svgImg(icon: string, color: string, label: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${color}'/><stop offset='1' stop-color='#20303f'/></linearGradient></defs><rect width='400' height='400' fill='url(#g)'/><text x='200' y='236' font-size='166' text-anchor='middle'>${icon}</text><text x='200' y='352' font-size='26' font-family='Arial,sans-serif' font-weight='bold' fill='#ffffff' fill-opacity='0.9' text-anchor='middle'>${label}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/** Seed CND categories + a demo catalog (stamped __mock). Idempotent-ish. */
export async function seedCndCatalog(existingCats: number, existingProds: number): Promise<{ cats: number; products: number }> {
  const catIds: Record<string, string> = {};
  let cats = 0;
  if (existingCats === 0) {
    const b = writeBatch(db);
    for (const c of CATS) { const ref = doc(collection(db, 'cndCategories')); catIds[c.key] = ref.id; b.set(ref, stampMock({ name: c.name, icon: c.icon, order: c.order, installFeePct: c.installFeePct })); }
    // subs need their parent's id, so pre-allocate ids and set parentId (SUBS is ordered parent-before-child)
    for (const s of SUBS) { const ref = doc(collection(db, 'cndCategories')); catIds[s.key] = ref.id; b.set(ref, stampMock({ name: s.name, icon: s.icon, order: s.order, parentId: catIds[s.parent] })); }
    await b.commit();
    cats = CATS.length + SUBS.length;
  } else {
    // map existing category keys by name so products still attach
    const snap = await getDocs(query(collection(db, 'cndCategories')));
    for (const c of CATS) { const found = snap.docs.find((d) => d.data().name === c.name); if (found) catIds[c.key] = found.id; }
    for (const s of SUBS) { const found = snap.docs.find((d) => d.data().name === s.name); if (found) catIds[s.key] = found.id; }
  }
  if (existingProds > 0) return { cats, products: 0 };
  const P = (name: string, cat: string, unit: string, price: number, opts: Partial<CndProductInput> = {}): any => {
    const cm = CATS.find((x) => x.key === cat) || SUBS.find((x) => x.key === cat);
    const rootKey = cat.split('-')[0];    // color by the top-level main
    const label = (opts.brand as string) || name.split(' ').slice(0, 2).join(' ');
    return stampMock({ name, categoryId: catIds[cat] ?? catIds[rootKey] ?? '', unit, price, cost: Math.round(price * 0.75), stock: 20, images: [svgImg(cm?.icon ?? '📦', CAT_COLOR[rootKey] ?? '#2b3a4a', label)], createdAt: serverTimestamp(), ...opts });
  };
  const items = [
    P('ແອຣ໌ 12000 BTU Inverter', 'aircon-wall-inv', 'ໜ່ວຍ', 2890000, { brand: 'HISENSE', oldPrice: 3390000, installable: true }),
    P('ແອຣ໌ 18000 BTU', 'aircon-wall-std', 'ໜ່ວຍ', 4290000, { brand: 'TCL', installable: true }),
    P('ໂຖ ສ້ວມ ຊັກໂຄຣກ 2 ระบบ', 'plumb-toilet', 'ໜ່ວຍ', 1250000, { brand: 'COTTO', installable: true }),
    P('ปั๊ม ນ້ຳ ອັດຕະໂນມັດ 250W', 'plumb-pipe', 'ໜ່ວຍ', 890000, { brand: 'MITSUBISHI', installable: true }),
    P('ກ໊ອກ ອ່າງ ລ້າງ ໜ້າ ສແຕນເລສ', 'plumb-faucet', 'ຊຸດ', 185000, { brand: 'MARINE' }),
    P('ໂຄມໄຟ LED ດາວນ໌ໄລທ໌ 9W', 'elec-bulb', 'ໜ່ວຍ', 45000, { installable: true, installFeePct: 20 }),
    P('ພັດ ລົມ ເພດານ 56 ນິ້ວ', 'elec-fan', 'ໜ່ວຍ', 690000, { brand: 'HATARI', installable: true }),
    P('ສາຍ ໄຟ THW 2.5sq ຂາວ', 'elec-wire', 'ມ້ວນ', 320000, { brand: 'BCC' }),
    P('ສີ ນ້ຳ ພລາສ ຕິກ ພາຍ ໃນ 18.925L', 'paint', 'ຖັງ', 890000, { brand: 'TOA' }),
    P('ສີ ຮອງ ພື້ນ ปูน ໃໝ່ 18.925L', 'paint', 'ຖັງ', 750000, { brand: 'TOA' }),
    P('ສະ ຫວ່ານ ໄຟຟ້າ ໄຮ້ ສາຍ 20V', 'tools-power', 'ໜ່ວຍ', 780000, { brand: 'MAKITA', oldPrice: 990000 }),
    P('ຊຸດ ໄຂ ຄວງ 32 ຕົວ', 'tools-hand', 'ຊຸດ', 145000, { brand: 'STANLEY' }),
    P('ปูน TPI M300', 'build-cement', 'ກະສອບ', 55000, { brand: 'TPI' }),
    P('ອິດ ບລ໊ອກ 7 ຊມ.', 'build-cement', 'ກ້ອນ', 6250, {}),
    P('ກະເບື້ອງ ปูพื้น 60x60', 'build-tile', 'ກ່ອງ', 128000, { brand: 'DYNASTY' }),
    P('ท่อ PVC 4 ນິ້ວ ຊັ້ນ 8.5', 'plumb-pipe', 'ເສັ້ນ', 78000, { brand: 'SCG' }),
    P('ແອຣ໌ 9000 BTU Inverter', 'aircon-wall-inv', 'ໜ່ວຍ', 2390000, { brand: 'MITSUBISHI', installable: true, sku: 'AC-9INV', description: 'ແອຣ໌ ຕິດ ຝາ Inverter 9000 BTU · ຮັບປະກັນ ຄອມເພຣສເ຋ອຣ໌ 5 ปี · R32 ປະຢັດ ໄຟ' }),
    P('ພັດ ລົມ ໄອ ນ້ຳ ເຢັນ', 'aircon-etc', 'ໜ່ວຍ', 890000, { brand: 'HATARI', sku: 'FAN-MIST' }),
    P('ຕູ້ ໄຟ ຄອນ຋ູມເມອຣ໌ 8 ຊ່ອງ', 'elec-wire', 'ໜ່ວຍ', 285000, { brand: 'SQUARE D', installable: true, sku: 'CU-8' }),
    P('ปลั๊ก ໄຟ ພ່ວງ 5 ຊ່ອງ', 'elec-wire', 'ໜ່ວຍ', 95000, { brand: 'TOSHINO' }),
    P('ຫຼອດ ໄຟ LED 12W (ແພັກ 3)', 'elec-bulb', 'ແພັກ', 78000, { brand: 'PHILIPS' }),
    P('ເຄຣື່ອງ ທຳ ນ້ຳ ຮ້ອນ 3500W', 'plumb-toilet', 'ໜ່ວຍ', 1290000, { brand: 'PANASONIC', installable: true, sku: 'WH-3500' }),
    P('ອ່າງ ລ້າງ ໜ້າ ແຂວນ', 'plumb-faucet', 'ໜ່ວຍ', 990000, { brand: 'AMERICAN STANDARD', installable: true }),
    P('ຝັກບົວ ອາບ ນ້ຳ ຊຸດ', 'plumb-faucet', 'ຊຸດ', 245000, { brand: 'MARINE' }),
    P('ສີ ນ້ຳມັນ ເຄືອບ ເງົາ 3.7L', 'paint', 'ຖັງ', 285000, { brand: 'JBP' }),
    P('ຊຸດ ລູກ ກລິ້ງ + ຖາດ ທາສີ', 'paint', 'ຊຸດ', 45000, {}),
    P('ເຄຣື່ອງ ຕັດ ໄຟເບີ 4 ນິ້ວ', 'tools-power', 'ໜ່ວຍ', 620000, { brand: 'BOSCH' }),
    P('ບັນໄດ ອລູມິເນີຢມ 6 ຂັ້ນ', 'tools-hand', 'ໜ່ວຍ', 450000, {}),
    P('ຕລັບ ແມັດ 5 ແມັດ', 'tools-hand', 'ໜ່ວຍ', 35000, { brand: 'STANLEY' }),
    P('ເຫຼັກ ເສັ້ນ RB6', 'build-cement', 'ເສັ້ນ', 42000, {}),
    P('ຫີນ ແຮ່', 'build-tile', 'ຄິວ', 220000, {}),
    P('ຊາຍ ຫຍາບ', 'build-tile', 'ຄິວ', 180000, {}),
    P('ບໍລິການ ຕິດຕັ້ງ ແອ (9000–12000 BTU)', 'service', 'ຄັ້ງ', 250000, {
      isService: true, warrantyDays: 180, durationMin: 60, durationMax: 120,
      serviceScope: ['ຕິດ ຕົວ ໃນ + ຕົວ ນອກ', 'ເດີນ ທໍ່ ນ້ຳຢາ ≤ 4 ແມັດ', 'ເຮັດ ສູນຍາກາດ + ທົດ ສອບ ການ ເຮັດ ວຽກ'],
      serviceExcludes: ['ທໍ່ ສ່ວນ ເກີນ 4 ແມັດ (ຄິດ ຕໍ່ ແມັດ)', 'ເຈາະ ຝາ ຄອນກຣີດ / ຂາ ແຂວນ ພິເສດ', 'ອຸປະກອນ ແອ (ຄິດ ແຍກ)'],
      serviceRequirements: ['ຕຽມ ຈຸດ ໄຟຟ້າ ໃຫ້ ພ້ອມ', 'ຕົກລົງ ຕຳແໜ່ງ ຕິດ ກ່ອນ ວັນ ນັດ'],
    }),
    P('ບໍລິການ ຮື້ ຖອນ ແອ', 'service', 'ຄັ້ງ', 200000, {
      isService: true, warrantyDays: 30, durationMin: 45, durationMax: 60,
      serviceScope: ['ຮື້ ຕົວ ໃນ (fan coil) + ຕົວ ນອກ (CDU)', 'ຖອດ ທໍ່ ນ້ຳຢາ ລະບົບ ເດີນ ທໍ່', 'ເກັບ ອຸປະກອນ ຄືນ ໃຫ້ ລູກຄ້າ ຮຽບຮ້ອຍ'],
      serviceExcludes: ['ອຸດ / ປິດ ຮູ ເຈາະ ຕ່າງ ໆ', 'ຍ້າຍ ໄປ ຕິດຕັ້ງ ໃໝ່ (ຄິດ ແຍກ)'],
      serviceRequirements: ['ມີ ບ່ອນ ໃຫ້ ຊ່າງ ເຂົ້າ ເຖິງ ຕົວ ນອກ ໄດ້'],
    }),
    P('ບໍລິການ ລ້າງ ແອ', 'service', 'ຄັ້ງ', 120000, {
      isService: true, warrantyDays: 30, durationMin: 45, durationMax: 60,
      serviceScope: ['ລ້າງ ຄອຍ ເຢັນ (ຕົວ ໃນ) + ຖາດ ນ້ຳ ຖິ້ມ', 'ພົ່ນ ຢາ ຂ້າ ເຊື້ອ / ດັບ ກິ່ນ', 'ກວດ ແຮງ ດັນ ນ້ຳຢາ + ທົດ ສອບ'],
      serviceExcludes: ['ຕື່ມ ນ້ຳຢາ (ຄິດ ແຍກ ຕາມ ຈິງ)', 'ຮື້ ຖອນ / ຍ້າຍ ຈຸດ ຕິດຕັ້ງ'],
      serviceRequirements: ['ມີ ໄຟຟ້າ + ນ້ຳ ໃຫ້ ໃຊ້ ໜ້າ ງານ', 'ເກັບ ເຄື່ອງ ໃຕ້ ແອ ອອກ ກ່ອນ'],
    }),
    P('ບໍລິການ ຕິດຕັ້ງ ໂຖ ສ້ວມ', 'service', 'ຄັ້ງ', 200000, {
      isService: true, warrantyDays: 90, durationMin: 45, durationMax: 90,
      serviceScope: ['ຕິດຕັ້ງ ໂຖ + ຕໍ່ ນ້ຳ ເຂົ້າ', 'ຢາ ແນວ ກັນ ຮົ່ວ + ທົດ ສອບ ກົດ ນ້ຳ'],
      serviceExcludes: ['ໂຖ ສ້ວມ + ອຸປະກອນ (ຄິດ ແຍກ)', 'ທຸບ / ຍ້າຍ ຈຸດ ທໍ່ ເດີມ'],
      serviceRequirements: ['ມີ ຈຸດ ນ້ຳ ດີ / ນ້ຳ ຖິ້ມ ພ້ອມ'],
    }),
    P('ບໍລິການ ຊ່ອມ ປະປາ (ກວດ + ແກ້)', 'service', 'ຄັ້ງ', 150000, {
      isService: true, warrantyDays: 30, durationMin: 30, durationMax: 90,
      serviceScope: ['ກວດ ຫາ ຈຸດ ຮົ່ວ / ຕັນ', 'ປ່ຽນ / ອັດ ຈຸດ ຮົ່ວ ຕາມ ຈິງ', 'ທົດ ສອບ ນ້ຳ ໄຫຼ'],
      serviceExcludes: ['ອຸປະກອນ ປະປາ (ທໍ່/ກ໊ອກ/ປັ໊ມ — ຄິດ ແຍກ)', 'ຕິດຕັ້ງ ລະບົບ ໃໝ່ ທັງ ໝົດ'],
      serviceRequirements: ['ຊີ້ ຈຸດ ບັນຫາ ໃຫ້ ຊ່າງ', 'ມີ ນ້ຳ ໃຫ້ ທົດ ສອບ'],
    }),
    P('ບໍລິການ ທາສີ ບ້ານ', 'service', 'ຕລ.ມ.', 35000, {
      isService: true, durationMin: 0, durationMax: 0,
      serviceScope: ['ຄ່າ ແຮງ ທາສີ ຕໍ່ ຕາຕະລາງ ແມັດ', 'ທາ 2 ຮອບ + ຮອງ ພື້ນ'],
      serviceExcludes: ['ສີ + ອຸປະກອນ (ຄິດ ແຍກ)', 'ໂປ້ວ / ຂັດ ຝາ ໜັກ (ຄິດ ເພີ່ມ)'],
      serviceRequirements: ['ໜ້າ ງານ ≥ 20 ຕລ.ມ.', 'ຍ້າຍ ເຄື່ອງ ອອກ ຈາກ ພື້ນ ທີ່ ກ່ອນ'],
    }),
  ];
  const b = writeBatch(db);
  for (const it of items) b.set(doc(collection(db, 'cndProducts')), it);
  await b.commit();
  return { cats, products: items.length };
}

/**
 * One-tap "organize into a tree": takes a FLAT catalog (all products on top-level
 * mains) and builds a dohome-style 2-level tree — creates standard sub-categories
 * under each recognised main, moves each product into the matching sub (by keyword
 * on its name), and nests any leftover parent-less category (owner-added extras)
 * under the building-materials main. Safe + idempotent: only sets parentId /
 * categoryId, never deletes; re-running does nothing new.
 */
const ORG_MAIN_KW: { type: string; kw: string[] }[] = [
  { type: 'elec', kw: ['ໄຟຟ້າ'] }, { type: 'plumb', kw: ['ປະປາ'] }, { type: 'aircon', kw: ['ແອ'] },
  { type: 'paint', kw: ['ສີ'] }, { type: 'tools', kw: ['ເຄື່ອງມື', 'ເຄຣື່ອງມືອ'] },
  { type: 'build', kw: ['ວັດສະດຸ', 'ກໍ່ສ້າງ'] }, { type: 'service', kw: ['ບໍລິການ'] },
];
const ORG_SUBS: Record<string, { name: string; icon: string; kw: string[] }[]> = {
  elec: [
    { name: 'ຫຼອດ ໄຟ / LED', icon: '💡', kw: ['ຫຼອດ', 'led', 'ໂຄມໄຟ', 'ໂຄມ', 'ດາວ'] },
    { name: 'ສາຍ ໄຟ / ສະວິດ / ຕູ້ ໄຟ', icon: '🔌', kw: ['ສາຍ', 'ปลั๊ก', 'ປລັກ', 'ຕູ້', 'ຄອນ', 'ສະວິດ'] },
    { name: 'ພັດ ລົມ', icon: '🌀', kw: ['ພັດ'] },
  ],
  plumb: [
    { name: 'ກ໊ອກ / ອ່າງ / ຝັກບົວ', icon: '🚿', kw: ['ກ໊', 'ອ່າງ', 'ຝັກບົວ'] },
    { name: 'ທໍ່ / ปั๊ม', icon: '🔧', kw: ['ທໍ່', 'ปั๊ม', 'ປັ້ມ', 'ຂໍ້ ຕໍ່'] },
    { name: 'ໂຖ ສ້ວມ / ນ້ຳ ຮ້ອນ', icon: '🚽', kw: ['ໂຖ', 'ສ້ວມ', 'ຮ້ອນ', 'ທຳ ນ້ຳ'] },
  ],
  aircon: [
    { name: 'ພັດ ລົມ ໄອ ນ້ຳ / ອຸປະກອນ', icon: '💨', kw: ['ພັດ', 'ໄອ'] },
    { name: 'ແອຣ໌ ຕິດ ຝາ', icon: '❄️', kw: ['ແອ'] },
  ],
  paint: [
    { name: 'ອຸປະກອນ ທາສີ', icon: '🖌️', kw: ['ລູກ', 'ຖາດ', 'ແປງ', 'ອຸປະກອນ'] },
    { name: 'ສີ ນ້ຳ / ນ້ຳມັນ', icon: '🎨', kw: ['ສີ'] },
  ],
  tools: [
    { name: 'ເຄຣື່ອງມືອ ໄຟຟ້າ', icon: '🔩', kw: ['ໄຟຟ້າ', 'ໄຟຟ້າ', 'ໄຟເບີ', 'ຫວ່ານ'] },
    { name: 'ເຄຣື່ອງມືອ ມື / ບັນໄດ', icon: '🛠️', kw: ['ໄຂ', 'ບັນໄດ', 'ຕລັບ', 'ແມັດ', 'ຄ້ອນ'] },
  ],
  build: [
    { name: 'ปูน / ອິດ / ເຫຼັກ', icon: '🧱', kw: ['ปูน', 'ປູນ', 'ອິດ', 'ບລ໊ອກ', 'ເຫຼັກ'] },
    { name: 'ຫີນ / ຊາຍ', icon: '🪨', kw: ['ຫີນ', 'ຊາຍ'] },
    { name: 'ກະເບື້ອງ / ພື້ນ', icon: '⬜', kw: ['ກະເບື້ອງ', 'ปูพื้น', 'ພື້ນ'] },
  ],
  service: [],
};
function orgTypeOf(name: string): string | null {
  for (const m of ORG_MAIN_KW) if (m.kw.some((k) => name.includes(k))) return m.type;
  return null;
}
export async function organizeCndTree(): Promise<{ subs: number; nested: number; moved: number }> {
  const csnap = await getDocs(query(collection(db, 'cndCategories')));
  const cats = csnap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name ?? '', parentId: (d.data() as any).parentId || '' }));
  const psnap = await getDocs(query(collection(db, 'cndProducts')));
  const prods = psnap.docs.map((d) => ({ id: d.id, categoryId: (d.data() as any).categoryId || '', name: (d.data() as any).name ?? '' }));
  const mains = cats.filter((c) => !c.parentId);
  const typeOfMain = new Map<string, string>();     // mainId -> type
  const mainByType = new Map<string, string>();      // type -> mainId (first)
  for (const m of mains) { const t = orgTypeOf(m.name); if (t) { typeOfMain.set(m.id, t); if (!mainByType.has(t)) mainByType.set(t, m.id); } }

  const subId = new Map<string, string>();           // `${mainId}|${subName}` -> catId
  for (const c of cats) if (c.parentId) subId.set(`${c.parentId}|${c.name}`, c.id);

  const b1 = writeBatch(db); let subs = 0, nested = 0;
  // 1) ensure standard subs under each recognised main (plain, not __mock, so they persist)
  for (const m of mains) {
    const t = typeOfMain.get(m.id); if (!t) continue;
    let order = 1;
    for (const s of ORG_SUBS[t] ?? []) {
      const key = `${m.id}|${s.name}`;
      if (!subId.has(key)) { const ref = doc(collection(db, 'cndCategories')); b1.set(ref, { name: s.name, icon: s.icon, order, parentId: m.id, createdAt: serverTimestamp() }); subId.set(key, ref.id); subs++; }
      order++;
    }
  }
  // 2) nest leftover parent-less non-main categories under the building-materials main
  const buildMain = mainByType.get('build');
  if (buildMain) for (const m of mains) if (!typeOfMain.has(m.id) && m.id !== buildMain) { b1.update(doc(db, 'cndCategories', m.id), { parentId: buildMain }); nested++; }
  await b1.commit();

  // 3) move each product on a recognised MAIN into its matching sub
  const b2 = writeBatch(db); let moved = 0;
  for (const p of prods) {
    const t = typeOfMain.get(p.categoryId); if (!t) continue;
    const spec = ORG_SUBS[t] ?? []; if (!spec.length) continue;
    const n = p.name.toLowerCase();
    const s = spec.find((x) => x.kw.some((k) => n.includes(k.toLowerCase())));
    if (!s) continue;
    const target = subId.get(`${p.categoryId}|${s.name}`);
    if (target && target !== p.categoryId) { b2.update(doc(db, 'cndProducts', p.id), { categoryId: target }); moved++; }
  }
  await b2.commit();
  return { subs, nested, moved };
}

/**
 * Fill EMPTY leaf categories that match a known material keyword (doors / composite
 * wood / marble) with curated starter products (stamped __mock so they show 🧪 and
 * can be cleared). Only touches empty categories — safe to re-run.
 */
const MAT_SAMPLES: { kw: string; icon: string; color: string; items: [string, string, number, boolean?][] }[] = [
  { kw: 'ປະຕູ', icon: '🚪', color: '#6b7280', items: [
    ['ປະຕູ UPVC ບານ ເລື່ອນ 2 ບານ (ພ້ອມ ມຸ້ງ ລວດ)', 'ຊຸດ', 3900000, true],
    ['ປະຕູ ໄມ້ ສັກ ແກະ ລາຍ 80x200', 'ບານ', 2650000, false],
    ['ປະຕູ ອາລູ ກະຈົກ ບານ ເປີດ', 'ຊຸດ', 2200000, true],
    ['ປະຕູ PVC ຫ້ອງ ນ້ຳ 70x200', 'ບານ', 480000, false],
  ] },
  { kw: 'ໄມ້ທຽມ', icon: '🪵', color: '#9a6a3a', items: [
    ['ພື້ນ ໄມ້ ລາມິເນດ 8mm (ກ່ອງ ~2.4 ຕ.ມ.)', 'ກ່ອງ', 320000, true],
    ['ພື້ນ ໄມ້ SPC ຄລິກ ລ໊ອກ 4mm', 'ກ່ອງ', 390000, true],
    ['ໄມ້ ຝາ WPC ກັນ ນ້ຳ', 'ແຜ່ນ', 185000, false],
    ['ໄມ້ ລະແນງ WPC ຕົກ ແຕ່ງ', 'ເສັ້ນ', 145000, false],
  ] },
  { kw: 'ຫີນອ່ອນ', icon: '🪨', color: '#3D5063', items: [
    ['ຫີນ ອ່ອນ ຂາວ Carrara 60x60', 'ກ່ອງ', 850000, false],
    ['ຫີນ ແກຣນິດ ດຳ ຂັດ ເງົາ 60x60', 'ກ່ອງ', 620000, false],
    ['ຫີນ ອ່ອນ ປູ ຂັ້ນ ໄດ', 'ເສັ້ນ', 550000, false],
    ['ໜ້າ ເຄົາເຕີ ຫີນ Quartz ສັງ ເຄາະ', 'ຕ.ມ.', 1250000, true],
  ] },
];
export async function seedCndMaterialSamples(): Promise<{ added: number; cats: number }> {
  const csnap = await getDocs(query(collection(db, 'cndCategories')));
  const leaves = csnap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name ?? '', parentId: (d.data() as any).parentId || '' })).filter((c) => c.parentId);
  const psnap = await getDocs(query(collection(db, 'cndProducts')));
  const pc = new Map<string, number>();
  psnap.docs.forEach((d) => { const c = (d.data() as any).categoryId || ''; pc.set(c, (pc.get(c) || 0) + 1); });
  const b = writeBatch(db); let added = 0, catsHit = 0;
  for (const spec of MAT_SAMPLES) {
    const cat = leaves.find((c) => c.name.includes(spec.kw));
    if (!cat || (pc.get(cat.id) || 0) > 0) continue;   // only fill an empty matching category
    catsHit++;
    for (const [name, unit, price, install] of spec.items) {
      b.set(doc(collection(db, 'cndProducts')), stampMock({
        name, categoryId: cat.id, unit, price, cost: Math.round(price * 0.75), stock: 15,
        images: [svgImg(spec.icon, spec.color, name.split(' ').slice(0, 2).join(' '))],
        installable: !!install, createdAt: serverTimestamp(),
      }));
      added++;
    }
  }
  await b.commit();
  return { added, cats: catsHit };
}

/**
 * Regenerate a DISTINCT sample image per product: picks an emoji by the product
 * name (so items in the same category no longer look identical), tints by the
 * top-level main, and writes a data-URI SVG card. Only overwrites SVG-placeholder
 * images (never a real uploaded http photo). Owner can still replace with a real
 * photo anytime.
 */
const IMG_EMOJI: [string[], string][] = [
  [['ຫຼອດ', 'led', 'ໂຄມໄຟ', 'ໂຄມ', 'ດາວ'], '💡'], [['ปลั๊ก', 'ປລັກ', 'ສະວິດ'], '🔌'], [['ຕູ້ ໄຟ', 'ຕູ້ໄຟ', 'ຄອນ', 'breaker', 'ເບຣກ'], '🎛️'],
  [['ສາຍ ໄຟ', 'ສາຍໄຟ'], '🧵'], [['ພັດ ລົມ', 'ພັດລົມ'], '🌀'], [['ໄອ ນ້ຳ', 'ໄອນ້ຳ'], '💨'], [['ແອ'], '❄️'],
  [['ກ໊'], '🚰'], [['ອ່າງ'], '🪣'], [['ຝັກບົວ', 'ຊາວເວອຣ໌'], '🚿'], [['ທໍ່', 'ปั๊ม', 'ປັ້ມ', 'ວາລ໌ວ'], '🧰'], [['ໂຖ', 'ສ້ວມ'], '🚽'], [['ນ້ຳ ຮ້ອນ', 'ນ້ຳຮ້ອນ', 'ທຳ ນ້ຳ'], '♨️'], [['ແທ໋ງ', 'ຖັງ'], '🛢️'],
  [['ລູກ ກລິ້ງ', 'ຖາດ', 'ແປງ ທາ'], '🖌️'], [['ສີ'], '🎨'],
  [['ສະຫວ່ານ', 'ຫວ່ານ'], '🪛'], [['ຕັດ', 'ໄຟເບີ', 'ເຈຍ', 'ເລື່ອຍ'], '⚙️'], [['ໄຂ ຄວງ', 'ໄຂຄວງ'], '🔧'], [['ບັນໄດ'], '🪜'], [['ຕລັບ', 'ແມັດ', 'ວັດ'], '📏'], [['ຄ້ອນ'], '🔨'],
  [['ปูน', 'ປູນ', 'ຊີເມັນ'], '🧱'], [['ອິດ', 'ບລ໊ອກ'], '🧱'], [['ເຫຼັກ'], '🔩'], [['ຫີນ ອ່ອນ', 'ຫີນອ່ອນ', 'ແກຣນິດ', 'quartz', 'ຄາຣ໌', 'carrara'], '🪨'], [['ຫີນ', 'ຊາຍ'], '⛰️'],
  [['ກະເບື້ອງ', 'ปูพื้น', 'ພື້ນ'], '⬜'], [['ປະຕູ'], '🚪'], [['ໜ້າຕ່າງ', 'ໜ້າ ຕ່າງ'], '🪟'], [['ໄມ້'], '🪵'],
  [['ຄ່າ ຕິດຕັ້ງ', 'ຕິດຕັ້ງ'], '🔧'], [['ຄ່າ ລ້າງ', 'ລ້າງ'], '🧽'], [['ຄ່າ', 'ບໍລິການ', 'ຊ່ອມ'], '🛠️'],
];
const IMG_COLOR: Record<string, string> = { elec: '#E8551E', plumb: '#0a7ea4', aircon: '#0E7490', paint: '#7a4bd0', tools: '#C4400F', build: '#556072', service: '#1F9D57' };
function emojiForProduct(name: string): string {
  const n = name.toLowerCase();
  for (const [kws, e] of IMG_EMOJI) if (kws.some((k) => n.includes(k.toLowerCase()))) return e;
  return '📦';
}
function svgCard(emoji: string, color: string, name: string): string {
  const words = name.split(/\s+/); const lines: string[] = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 22) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); if (lines.length >= 2) break; }
  if (cur && lines.length < 3) lines.push(cur);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
  const tspans = lines.slice(0, 3).map((l, i) => `<text x='200' y='${330 + i * 30}' font-size='23' font-family='Arial,sans-serif' font-weight='bold' fill='#fff' fill-opacity='0.92' text-anchor='middle'>${esc(l)}</text>`).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${color}'/><stop offset='1' stop-color='#1A2231'/></linearGradient></defs><rect width='400' height='400' fill='url(#g)'/><circle cx='200' cy='168' r='118' fill='#ffffff' fill-opacity='0.10'/><text x='200' y='224' font-size='150' text-anchor='middle'>${emoji}</text>${tspans}</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
export async function refreshCndProductImages(): Promise<{ updated: number }> {
  const cs = await getDocs(query(collection(db, 'cndCategories')));
  const C = new Map<string, { name: string; parentId: string }>();
  cs.docs.forEach((d) => C.set(d.id, { name: (d.data() as any).name ?? '', parentId: (d.data() as any).parentId || '' }));
  const rootName = (cid: string): string => { let cur = C.get(cid); let guard = 0; while (cur && cur.parentId && guard++ < 8) cur = C.get(cur.parentId); return cur?.name ?? ''; };
  const ps = await getDocs(query(collection(db, 'cndProducts')));
  let batch = writeBatch(db), ops = 0, updated = 0;
  const flush = async () => { if (ops) { await batch.commit(); batch = writeBatch(db); ops = 0; } };
  for (const d of ps.docs) {
    const f = d.data() as any;
    const imgs: string[] = Array.isArray(f.images) ? f.images : [];
    const first = imgs[0] || '';
    if (first && !first.startsWith('data:image/svg')) continue;   // keep real uploaded photos
    const color = IMG_COLOR[orgTypeOf(rootName(f.categoryId || '')) || ''] || '#2B3A4A';
    batch.update(d.ref, { images: [svgCard(emojiForProduct(f.name ?? ''), color, f.name ?? '')] });
    updated++; ops++;
    if (ops >= 400) await flush();
  }
  await flush();
  return { updated };
}

/**
 * Import a full dohome-style category tree (Lao). Enriches the 7 existing mains
 * with more sub-categories and adds new departments (appliances / kitchen /
 * furniture / garden). Matches existing mains by keyword (survives renames);
 * creates only categories whose name doesn't already exist under that parent.
 * Non-destructive + idempotent (never deletes, never touches products).
 */
const FULL_TREE: { main: string; icon: string; matchKw?: string; subs: [string, string][] }[] = [
  { main: 'ໄຟຟ້າ', icon: '💡', matchKw: 'ໄຟຟ້າ', subs: [
    ['ໂຄມ ໄຟ & ໄຟ ຕົກ ແຕ່ງ', '🔆'], ['ໄຟ ສຸກ ເສີນ', '🔦'], ['ໂຊລ່າ ເຊລ', '🔋'], ['ກລ້ອງ ວົງຈອນ ปิด', '📹'],
  ] },
  { main: 'ອຸປະກອນ ງານປະປາ', icon: '🚰', matchKw: 'ປະປາ', subs: [
    ['ວາລ໌ວ ນ້ຳ', '🧯'], ['ຖັງ ນ້ຳ & ຖັງ ບຳບັດ', '🛢️'], ['ສຸຂະພັນ ຫ້ອງ ນ້ຳ', '🛁'],
  ] },
  { main: 'ແອຣ໌ ບ້ານ', icon: '❄️', matchKw: 'ແອ', subs: [
    ['ແອ ຕັ້ງ ພື້ນ / ຝັງ ເພດານ', '🧊'],
  ] },
  { main: 'ສີທາ ທຸກປະເພດ', icon: '🎨', matchKw: 'ສີ', subs: [
    ['ສີ ຮອງ ພື້ນ', '🪣'], ['ນ້ຳຢາ & ກັນ ຊຶມ', '🧴'],
  ] },
  { main: 'ເຄື່ອງມືຊ່າງ', icon: '🔧', matchKw: 'ເຄື່ອງມື', subs: [
    ['ເຊື່ອມ & ບັດ ກຣີ', '🔥'], ['ວັດ ແທກ', '📏'], ['ອຸປະກອນ ຄວາມ ປອດ ໄພ', '🦺'],
  ] },
  { main: 'ວັດສະດຸ ກໍ່ສ້າງ', icon: '🧱', matchKw: 'ວັດສະດຸ', subs: [
    ['ຫລັງຄາ & ຮາງ ລິນ', '🏠'], ['ຝ້າ ເພດານ & ບອດ ສັງ ເຄາະ', '🪟'],
  ] },
  { main: 'ບໍລິການ ຊ່າງ', icon: '🛠️', matchKw: 'ບໍລິການ', subs: [
    ['ຕິດຕັ້ງ', '🔧'], ['ຊ່ອມ ແປງ', '🛠️'], ['ທາ ສີ', '🖌️'], ['ລ້າງ & ບຳ ລຸງ', '🧽'],
  ] },
  // ── new departments (dohome full) ──
  { main: 'ເຄື່ອງໃຊ້ ໄຟຟ້າ ໃນ ບ້ານ', icon: '📺', subs: [
    ['ຕູ້ ເຢ໇ນ & ຕູ້ ແຊ່', '🧊'], ['ເຄື່ອງ ຊັກ ຜ້າ', '🌀'], ['ໂທລະ ທັດ & ເຄື່ອງ ສຽງ', '📺'], ['ເຄື່ອງ ຄົວ ໄຟຟ້າ', '🍳'], ['ເຄື່ອງ ໃຊ້ ໄຟຟ້າ ນ້ອຍ', '🔌'],
  ] },
  { main: 'ຄົວ & ອຸປະກອນ', icon: '🍽️', subs: [
    ['ຊິ້ງ & ກ໊ອກ ຄົວ', '🚰'], ['ຕູ້ ຄົວ & ເຄົາ ເຕີ', '🗄️'], ['ເຕົາ & ເຄື່ອງ ດູດ ควัน', '🔥'], ['ເຄື່ອງ ຄົວ & ພາຊະນະ', '🍽️'],
  ] },
  { main: 'ເຟີນິເຈີ & ຕົກ ແຕ່ງ', icon: '🛋️', subs: [
    ['ເຟີນິເຈີ ຫ້ອງ ນອນ', '🛏️'], ['ຫ້ອງ ຮັບ ແຂກ', '🛋️'], ['ຫ້ອງ ອາຫານ', '🍽️'], ['ໂຕະ ເຮັດ ວຽກ', '🪑'], ['ຂອງ ຕົກ ແຕ່ງ ບ້ານ', '🖼️'], ['ຜ້າ ມ່ານ & ມູ່ ລີ່', '🪟'],
  ] },
  { main: 'ສວນ & ນອກ ບ້ານ', icon: '🌳', subs: [
    ['ເຄຣື່ອງມືອ ສວນ', '🧑‍🌾'], ['ຕົ້ນ ໄມ້ & ກະຖາງ', '🪴'], ['ລະບົບ ຮົດ ນ້ຳ', '💧'], ['BBQ & ນອກ ບ້ານ', '🍖'],
  ] },
];
export async function importCndFullTree(): Promise<{ mains: number; subs: number }> {
  const cs = await getDocs(query(collection(db, 'cndCategories')));
  const cats = cs.docs.map((d) => ({ id: d.id, name: (d.data() as any).name ?? '', parentId: (d.data() as any).parentId || '', order: (d.data() as any).order ?? 0 }));
  const b = writeBatch(db); let nMain = 0, nSub = 0;
  let mo = cats.reduce((m, c) => Math.max(m, c.order), 0) + 1;
  for (const node of FULL_TREE) {
    let main = node.matchKw
      ? cats.find((c) => !c.parentId && c.name.includes(node.matchKw!) && (node.matchKw !== 'ໄຟຟ້າ' || !c.name.includes('ເຄື່ອງ')))
      : cats.find((c) => !c.parentId && c.name === node.main);
    let mainId: string;
    if (main) mainId = main.id;
    else { const ref = doc(collection(db, 'cndCategories')); b.set(ref, { name: node.main, icon: node.icon, order: mo++, createdAt: serverTimestamp() }); mainId = ref.id; nMain++; cats.push({ id: mainId, name: node.main, parentId: '', order: mo }); }
    let so = 1;
    for (const [sname, sicon] of node.subs) {
      if (cats.some((c) => c.parentId === mainId && c.name === sname)) { so++; continue; }
      const ref = doc(collection(db, 'cndCategories')); b.set(ref, { name: sname, icon: sicon, order: so++, parentId: mainId, createdAt: serverTimestamp() }); nSub++;
      cats.push({ id: ref.id, name: sname, parentId: mainId, order: so });
    }
  }
  await b.commit();
  return { mains: nMain, subs: nSub };
}

/**
 * Non-destructive REPAIR: after a "clear sample" wiped the original main
 * categories, (1) re-parents orphaned sub-categories (parent missing) to the
 * correct current main by keyword, and (2) re-homes products whose categoryId is
 * empty/invalid to the correct leaf sub by keyword on the product name. Never
 * deletes anything.
 */
const REPAIR_SUB_TO_MAIN: [string, string][] = [   // sub-name kw → main-name kw (specific first)
  ['ພັດ ລົມ ໄອ', 'ແອ'], ['ແອ', 'ແອ'],
  ['ຫຼອດ', 'ໄຟຟ້າ'], ['ສາຍ ໄຟ', 'ໄຟຟ້າ'], ['ໂຄມ', 'ໄຟຟ້າ'], ['ໂຊລ່າ', 'ໄຟຟ້າ'], ['ກລ້ອງ', 'ໄຟຟ້າ'], ['ໄຟ ສຸກ', 'ໄຟຟ້າ'], ['ພັດ ລົມ', 'ໄຟຟ້າ'],
  ['ກ໊', 'ປະປາ'], ['ທໍ່', 'ປະປາ'], ['ໂຖ', 'ປະປາ'], ['ວາລ໌ວ', 'ປະປາ'], ['ຖັງ', 'ປະປາ'], ['ສຸຂະພັນ', 'ປະປາ'],
  ['ທາສີ', 'ສີທາ'], ['ກັນ ຊຶມ', 'ສີທາ'], ['ສີ', 'ສີທາ'],
  ['ເຊື່ອມ', 'ເຄື່ອງມື'], ['ວັດ ແທກ', 'ເຄື່ອງມື'], ['ຄວາມ ປອດ', 'ເຄື່ອງມື'], ['ເຄຣື່ອງມືອ', 'ເຄື່ອງມື'],
  ['ปูน', 'ວັດສະດຸ'], ['ຫີນ', 'ວັດສະດຸ'], ['ຊາຍ', 'ວັດສະດຸ'], ['ກະເບື້ອງ', 'ວັດສະດຸ'], ['ປະຕູ', 'ວັດສະດຸ'], ['ໄມ້', 'ວັດສະດຸ'], ['ຫລັງຄາ', 'ວັດສະດຸ'], ['ຝ້າ', 'ວັດສະດຸ'],
  ['ຕິດຕັ້ງ', 'ບໍລິການ'], ['ຊ່ອມ', 'ບໍລິການ'], ['ລ້າງ', 'ບໍລິການ'], ['ບຳ ລຸງ', 'ບໍລິການ'],
];
const REPAIR_PROD_TO_SUB: [string, string][] = [   // product-name kw → target leaf-sub name kw
  ['ສີ ຮອງ', 'ສີ ຮອງ'], ['ລູກ ກລິ້ງ', 'ອຸປະກອນ ທາສີ'], ['ຖາດ ທາ', 'ອຸປະກອນ ທາສີ'], ['ສີ', 'ສີ ນ້ຳ'],
  ['ปั๊ม', 'ທໍ່'], ['ท่อ', 'ທໍ່'], ['ໂຖ', 'ໂຖ ສ້ວມ'], ['ນ້ຳ ຮ້ອນ', 'ໂຖ ສ້ວມ'],
  ['ກະເບື້ອງ', 'ກະເບື້ອງ'], ['ຫີນ', 'ຫີນ / ຊາຍ'], ['ຊາຍ', 'ຫີນ / ຊາຍ'],
  ['ຄ່າ ລ້າງ', 'ລ້າງ'], ['ຄ່າ ຊ່ອມ', 'ຊ່ອມ'], ['ຄ່າ ທາສີ', 'ທາ ສີ'], ['ຄ່າ ຕິດຕັ້ງ', 'ຕິດຕັ້ງ'], ['ຕິດຕັ້ງ', 'ຕິດຕັ້ງ'],
  ['ແອ', 'ແອຣ໌ ຕິດ ຝາ'],
];
const HOME_SAMPLES: { kw: string; color: string; items: [string, string, number, boolean?][] }[] = [
  // ── ເຄື່ອງໃຊ້ ໄຟຟ້າ ──
  { kw: 'ຕູ້ ເຢ໇ນ', color: '#0E7490', items: [['ຕູ້ ເຢ໇ນ 2 ປະຕູ 15 ຄິວ', 'ໜ່ວຍ', 3990000, true], ['ຕູ້ ແຊ່ ນອນ 300L', 'ໜ່ວຍ', 4500000, true]] },
  { kw: 'ຊັກ ຜ້າ', color: '#0E7490', items: [['ເຄື່ອງ ຊັກ ຜ້າ ຝາ ເທິງ 12kg', 'ໜ່ວຍ', 3290000, true], ['ເຄື່ອງ ຊັກ ຝາ ໜ້າ 9kg Inverter', 'ໜ່ວຍ', 5900000, true]] },
  { kw: 'ໂທລະ ທັດ', color: '#0E7490', items: [['ໂທລະ ທັດ LED 43 ນິ້ວ', 'ໜ່ວຍ', 2490000, false], ['ລຳໂພງ Bluetooth', 'ໜ່ວຍ', 890000, false]] },
  { kw: 'ເຄື່ອງ ຄົວ ໄຟ', color: '#0E7490', items: [['ໝໍ້ ຫຸງ ເຂົ້າ ໄຟຟ້າ 1.8L', 'ໜ່ວຍ', 490000, false], ['ເຕົາ Induction ໄຟຟ້າ', 'ໜ່ວຍ', 690000, false]] },
  { kw: 'ໄຟຟ້າ ນ້ອຍ', color: '#0E7490', items: [['ພັດ ລົມ ຕັ້ງ ໂຕະ', 'ໜ່ວຍ', 250000, false], ['ເຕົາ ຮີດ ຜ້າ ໄອ ນ້ຳ', 'ໜ່ວຍ', 320000, false]] },
  // ── ຄົວ & ອຸປະກອນ ──
  { kw: 'ຊິ້ງ', color: '#C4400F', items: [['ຊິ້ງ ລ້າງ ຖ້ວຍ ສແຕນເລສ 2 ຫລຸມ', 'ຊຸດ', 1250000, true], ['ກ໊ອກ ຄົວ ດຶງ ອອກ ໄດ້', 'ຊຸດ', 650000, false]] },
  { kw: 'ຕູ້ ຄົວ', color: '#C4400F', items: [['ຕູ້ ຄົວ ຊຸດ ພ້ອມ ເຄົາເຕີ 2.4 ແມັດ', 'ຊຸດ', 8900000, true]] },
  { kw: 'ເຕົາ &', color: '#C4400F', items: [['ເຕົາ ແກ໊ສ ຝັງ 2 ຫົວ', 'ໜ່ວຍ', 2900000, true], ['ເຄື່ອງ ດູດ ควัน 90cm', 'ໜ່ວຍ', 3200000, true]] },
  { kw: 'ພາຊະນະ', color: '#C4400F', items: [['ຊຸດ ໝໍ້ ສແຕນເລສ 5 ໃບ', 'ຊຸດ', 890000, false], ['ຊຸດ ມີດ ຄົວ 8 ອັນ', 'ຊຸດ', 350000, false]] },
  // ── ເຟີນິເຈີ & ຕົກ ແຕ່ງ ──
  { kw: 'ຫ້ອງ ນອນ', color: '#7a4bd0', items: [['ຕຽງ ນອນ 6 ຟຸດ ພ້ອມ ບ່ອນ ນອນ', 'ຊຸດ', 4500000, false], ['ຕູ້ ເສື້ອ ຜ້າ 3 ບານ', 'ໜ່ວຍ', 3200000, false]] },
  { kw: 'ຮັບ ແຂກ', color: '#7a4bd0', items: [['ໂຊຟາ L-shape ຜ້າ', 'ຊຸດ', 6900000, false], ['ໂຕະ ກາງ ໄມ້', 'ໜ່ວຍ', 1590000, false]] },
  { kw: 'ຫ້ອງ ອາຫານ', color: '#7a4bd0', items: [['ຊຸດ ໂຕະ ອາຫານ 4 ບ່ອນ', 'ຊຸດ', 3990000, false]] },
  { kw: 'ເຮັດ ວຽກ', color: '#7a4bd0', items: [['ໂຕະ ເຮັດ ວຽກ + ຕັ່ງ', 'ຊຸດ', 1890000, false]] },
  { kw: 'ຕົກ ແຕ່ງ ບ້ານ', color: '#7a4bd0', items: [['ໂຄມ ໄຟ ຕັ້ງ ພື້ນ', 'ໜ່ວຍ', 690000, false], ['ກຣອບ ຮູບ & ໂມບາຍ ຕົກ ແຕ່ງ', 'ຊຸດ', 250000, false]] },
  { kw: 'ຜ້າ ມ່ານ', color: '#7a4bd0', items: [['ຜ້າ ມ່ານ ສຳ ເລັດ ຮູບ', 'ຊຸດ', 1200000, true], ['ມູ່ ລີ່ ໄມ້ ໄຜ່', 'ຊຸດ', 850000, true]] },
  // ── ສວນ & ນອກ ບ້ານ ──
  { kw: 'ເຄຣື່ອງມືອ ສວນ', color: '#1F9D57', items: [['ກຣຣໄກຣ ຕັດ ຕົ້ນ ໄມ້', 'ໜ່ວຍ', 180000, false], ['ຄາດ ຫຍ້າ ໄຟຟ້າ', 'ໜ່ວຍ', 1290000, false]] },
  { kw: 'ຕົ້ນ ໄມ້', color: '#1F9D57', items: [['ກະຖາງ ດິນ ເຜົາ ຊຸດ 3 ໃບ', 'ຊຸດ', 220000, false], ['ຕົ້ນ ໄມ້ ທຽມ ຕົກ ແຕ່ງ', 'ຕົ້ນ', 450000, false]] },
  { kw: 'ຮົດ ນ້ຳ', color: '#1F9D57', items: [['ຊຸດ ຫົວ ສະ ໜອງ ນ້ຳ ອັດຕະໂນມັດ', 'ຊຸດ', 890000, true]] },
  { kw: 'BBQ', color: '#1F9D57', items: [['ເຕົາ ปิ้ง BBQ ຖ່ານ', 'ໜ່ວຍ', 750000, false], ['ຊຸດ ໂຕະ ເກ້າອີ້ ສນາມ', 'ຊຸດ', 2900000, false]] },
];
export async function seedCndHomeSamples(): Promise<{ added: number; cats: number }> {
  const csnap = await getDocs(query(collection(db, 'cndCategories')));
  const leaves = csnap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name ?? '', parentId: (d.data() as any).parentId || '' })).filter((c) => c.parentId);
  const psnap = await getDocs(query(collection(db, 'cndProducts')));
  const pc = new Map<string, number>();
  psnap.docs.forEach((d) => { const c = (d.data() as any).categoryId || ''; pc.set(c, (pc.get(c) || 0) + 1); });
  const b = writeBatch(db); let added = 0, catsHit = 0;
  for (const spec of HOME_SAMPLES) {
    const cat = leaves.find((c) => c.name.includes(spec.kw));
    if (!cat || (pc.get(cat.id) || 0) > 0) continue;
    catsHit++;
    for (const [name, unit, price, install] of spec.items) {
      b.set(doc(collection(db, 'cndProducts')), stampMock({
        name, categoryId: cat.id, unit, price, cost: Math.round(price * 0.75), stock: 10,
        images: [svgCard(emojiForProduct(name), spec.color, name)], installable: !!install, createdAt: serverTimestamp(),
      }));
      added++;
    }
  }
  await b.commit();
  return { added, cats: catsHit };
}

export async function repairCndCatalog(): Promise<{ reparented: number; rehomed: number }> {
  const cs = await getDocs(query(collection(db, 'cndCategories')));
  const cats = cs.docs.map((d) => ({ id: d.id, name: (d.data() as any).name ?? '', parentId: (d.data() as any).parentId || '' }));
  const ids = new Set(cats.map((c) => c.id));
  const mains = cats.filter((c) => !c.parentId);
  // prefer an exact-name main; for 'ໄຟຟ້າ' never match 'ເຄື່ອງໃຊ້ ໄຟຟ້າ' (appliances)
  const mainByKw = (kw: string) => mains.find((m) => m.name === kw)
    || mains.find((m) => m.name.includes(kw) && !(kw === 'ໄຟຟ້າ' && m.name.includes('ເຄື່ອງ')));
  const b = writeBatch(db); let reparented = 0;
  // 1) re-parent orphaned subs (parent id no longer exists)
  for (const c of cats) {
    if (!c.parentId || ids.has(c.parentId)) continue;   // has a valid parent or is a main
    const rule = REPAIR_SUB_TO_MAIN.find(([kw]) => c.name.includes(kw));
    const main = rule && mainByKw(rule[1]);
    if (main) { b.update(doc(db, 'cndCategories', c.id), { parentId: main.id }); c.parentId = main.id; reparented++; }
  }
  // 1b) corrective: electrical subs mis-placed under the appliances main → move to ໄຟຟ້າ
  const elec = mains.find((m) => m.name === 'ໄຟຟ້າ');
  if (elec) for (const c of cats) {
    if (!c.parentId || c.parentId === elec.id) continue;
    const parent = cats.find((x) => x.id === c.parentId);
    if (parent && parent.name.includes('ເຄື່ອງໃຊ້') && /ຫຼອດ ໄຟ|ສາຍ ໄຟ|ໂຄມ ໄຟ|ໄຟ ສຸກ|ໂຊລ່າ|ກລ້ອງ|^ພັດ ລົມ$/.test(c.name)) {
      b.update(doc(db, 'cndCategories', c.id), { parentId: elec.id }); c.parentId = elec.id; reparented++;
    }
  }
  await b.commit();
  // 2) re-home products with empty/invalid categoryId
  const ps = await getDocs(query(collection(db, 'cndProducts')));
  const leaf = (kw: string) => cats.find((c) => c.parentId && c.name.includes(kw));
  const b2 = writeBatch(db); let rehomed = 0;
  for (const d of ps.docs) {
    const f = d.data() as any; const cid = f.categoryId || '';
    if (cid && ids.has(cid)) continue;   // already valid
    const name: string = f.name ?? '';
    const rule = REPAIR_PROD_TO_SUB.find(([kw]) => name.includes(kw));
    const target = rule && leaf(rule[1]);
    if (target) { b2.update(d.ref, { categoryId: target.id }); rehomed++; }
  }
  await b2.commit();
  return { reparented, rehomed };
}

/** Delete every sample (__mock) CND catalog record. */
export async function clearCndCatalog(): Promise<number> {
  let removed = 0;
  for (const col of ['cndProducts', 'cndCategories']) {
    const snap = await getDocs(query(collection(db, col), where(MOCK_FLAG, '==', true)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    removed += snap.size;
  }
  return removed;
}

/**
 * Bulk import products from parsed CSV rows (row 0 = headers). Upserts by SKU
 * (matching SKU → update, else create), auto-creates missing categories by name.
 * Headers (case-insensitive): name*, price, cost, sku, unit, category, stock,
 * brand, oldprice, installable, installfeepct.
 */
export async function importCndProducts(rows: string[][], cats: CndCategory[], existing: CndProduct[]): Promise<{ created: number; updated: number; newCats: number; skipped: number }> {
  if (!rows || rows.length < 2) return { created: 0, updated: 0, newCats: 0, skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const ix = (n: string) => header.indexOf(n);
  const c = { name: ix('name'), price: ix('price'), cost: ix('cost'), sku: ix('sku'), unit: ix('unit'), category: ix('category'), stock: ix('stock'), brand: ix('brand'), old: ix('oldprice'), inst: ix('installable'), instpct: ix('installfeepct') };
  if (c.name < 0) throw new Error('CSV ຕ້ອງ ມີ ຖັນ "name"');
  const num = (s?: string) => { const n = Number(String(s ?? '').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };
  const truthy = (s?: string) => /^(1|true|yes|y|ແມ່ນ)$/i.test(String(s ?? '').trim());
  const data = rows.slice(1).filter((r) => (r[c.name] || '').trim());

  // 1) create missing categories (by name)
  const catByName = new Map(cats.map((x) => [x.name.trim().toLowerCase(), x.id]));
  let newCats = 0;
  if (c.category >= 0) {
    const want = new Set<string>();
    for (const r of data) { const nm = (r[c.category] || '').trim(); if (nm && !catByName.has(nm.toLowerCase())) want.add(nm); }
    if (want.size) {
      const b = writeBatch(db);
      let order = cats.reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1;
      const made: { id: string; name: string }[] = [];
      for (const nm of want) { const ref = doc(collection(db, 'cndCategories')); b.set(ref, { name: nm, icon: '📦', order: order++, createdAt: serverTimestamp() }); made.push({ id: ref.id, name: nm }); }
      await b.commit();
      for (const m of made) catByName.set(m.name.toLowerCase(), m.id);
      newCats = made.length;
    }
  }

  // 2) upsert products by SKU, chunked into batches
  const skuMap = new Map(existing.filter((p) => p.sku).map((p) => [String(p.sku).trim().toLowerCase(), p.id]));
  let created = 0, updated = 0, ops = 0;
  let batch = writeBatch(db);
  const flush = async () => { if (ops) { await batch.commit(); batch = writeBatch(db); ops = 0; } };
  for (const r of data) {
    const name = (r[c.name] || '').trim();
    if (!name) continue;
    const sku = c.sku >= 0 ? (r[c.sku] || '').trim() : '';
    const catName = c.category >= 0 ? (r[c.category] || '').trim() : '';
    const payload: any = { name, price: c.price >= 0 ? num(r[c.price]) : 0, unit: c.unit >= 0 ? ((r[c.unit] || '').trim() || 'ໜ່ວຍ') : 'ໜ່ວຍ' };
    if (catName && catByName.get(catName.toLowerCase())) payload.categoryId = catByName.get(catName.toLowerCase());
    if (c.cost >= 0) payload.cost = num(r[c.cost]);
    if (sku) payload.sku = sku;
    if (c.stock >= 0) payload.stock = num(r[c.stock]);
    if (c.brand >= 0 && (r[c.brand] || '').trim()) payload.brand = r[c.brand].trim();
    if (c.old >= 0 && (r[c.old] || '').trim()) payload.oldPrice = num(r[c.old]);
    if (c.inst >= 0) payload.installable = truthy(r[c.inst]);
    if (c.instpct >= 0 && (r[c.instpct] || '').trim()) payload.installFeePct = num(r[c.instpct]);
    const existId = sku ? skuMap.get(sku.toLowerCase()) : undefined;
    if (existId) { batch.update(doc(db, 'cndProducts', existId), payload); updated++; }
    else { batch.set(doc(collection(db, 'cndProducts')), { ...payload, images: [], createdAt: serverTimestamp() }); created++; }
    ops++;
    if (ops >= 400) await flush();
  }
  await flush();
  return { created, updated, newCats, skipped: (rows.length - 1) - data.length };
}
