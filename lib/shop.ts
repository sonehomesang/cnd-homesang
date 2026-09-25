import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

/** Safety caps on the whole-collection feed reads — non-breaking at current
 *  scale (the client already sorts by createdAt); bounds the worst-case download
 *  as the catalogue grows. Beyond these, the feed needs real pagination. */
const FEED_CAP_PRODUCTS = 500;
const FEED_CAP_SHOPS = 300;
import { db } from './firebase';
import type { MemberDiscount, MemberDiscountRule } from './memberPricing';
import type { CommissionRule } from './pricingConfig';

/** A variant group, e.g. name "ຂະໜາດ" with options S/M/L (each an optional price delta). */
export interface ProductVariantGroup {
  name: string;
  options: { label: string; priceDelta?: number }[];
}

export interface Product {
  id: string;
  shopId: string;
  shopName?: string;
  category: string; // English category name (matches product category nameEn)
  categoryLao?: string;
  name: string;
  description?: string;
  descriptionHtml?: string; // rich-text product description (HTML) — falls back to `description`
  brand?: string; // ຍີ່ຫໍ້
  model?: string; // ລຸ້ນ / model no.
  specs?: string; // technical specs — one "label: value" per line, shown as a spec table
  usage?: string; // ການນຳໃຊ້ ທີ່ເໝາະສົມ (suitable usage) — one bullet per line
  usageExamples?: string; // ຕົວຢ່າງ ການນຳໃຊ້ — "title | note" per line
  installGuide?: string; // ຄູ່ມື/ເຕັກນິກ ການຕິດຕັ້ງ — one step per line
  safetyNotes?: string; // ຄວາມປອດໄພ — one note per line
  price: number;
  unit: string;
  stock?: number;
  deliveryFee?: number;
  images: string[];
  variants?: ProductVariantGroup[];
  approved: boolean;
  active: boolean;
  featured?: boolean; // admin-curated "recommended"
  soldCount?: number; // denormalized units sold (for best-sellers)
  rating?: number; // avg product review (1-5)
  reviewCount?: number; // number of product reviews
  // Y2 flash deal (time-limited discount)
  salePrice?: number;
  saleEndsAt?: number; // ms — deal expiry; past = no active deal
  // member/account-group pricing — per-product override (see lib/memberPricing)
  memberDiscounts?: MemberDiscount[];
  // back-office pricing (partner materials pulled into quotes)
  quotable?: boolean; // available to pull into a quotation
  costPrice?: number; // wholesale / back price
  commissionPct?: number; // per-product commission override (else config default)
  createdAt: number;
}

export interface Shop {
  id: string;
  ownerId: string;
  name: string;
  image?: string; // shop logo / cover
  description?: string;
  phone?: string;
  address?: string;
  lat?: number;
  lng?: number;
  isOpen?: boolean;
  status?: string;
  isPartner?: boolean; // partner shop — its products can be pulled into quotes
  productCategories?: string[];
  commissionRules?: CommissionRule[]; // category × customer-type → % (back-office)
  memberDiscountRules?: MemberDiscountRule[]; // member/group customer discounts (see lib/memberPricing)
  createdAt: number;
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function mapProduct(id: string, data: any): Product {
  const createdAt =
    data.createdAt instanceof Timestamp
      ? data.createdAt.toMillis()
      : typeof data.createdAt === 'number'
      ? data.createdAt
      : 0;
  return { id, ...data, createdAt } as Product;
}

const img = (key: string, n: number) =>
  `https://picsum.photos/seed/hs-${key}-${n}/500/400`;

// ===================== BROWSE (public) =====================

/** Flash-deal state for a product: active only while the sale hasn't expired
 * and the sale price is a real discount. `price` is the effective unit price. */
export function saleInfo(
  p: Pick<Product, 'price' | 'salePrice' | 'saleEndsAt'>,
  now = Date.now(),
): { onSale: boolean; price: number; salePrice?: number; endsAt?: number; pct?: number } {
  const s = p.salePrice;
  const ends = p.saleEndsAt;
  const onSale = typeof s === 'number' && s > 0 && s < p.price && typeof ends === 'number' && ends > now;
  if (!onSale) return { onSale: false, price: p.price };
  return { onSale: true, price: s as number, salePrice: s, endsAt: ends, pct: Math.round((1 - (s as number) / p.price) * 100) };
}

/** hh:mm:ss remaining until `endsAt` (empty when past). */
export function countdownLabel(endsAt: number, now = Date.now()): string {
  let sec = Math.floor((endsAt - now) / 1000);
  if (sec <= 0) return '';
  const h = Math.floor(sec / 3600); sec -= h * 3600;
  const m = Math.floor(sec / 60); sec -= m * 60;
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

/** A product is only fit to show a shopper once it has a name and a real price
 *  — an incomplete record (created with those fields blank) otherwise renders as
 *  a nameless "0 ກີບ" row in listings, search and category pages, and can be
 *  added to the cart. Admin listings deliberately skip this filter so the broken
 *  record stays visible to be fixed. */
export function isListable(p: Pick<Product, 'name' | 'price'>): boolean {
  return !!(p.name && String(p.name).trim()) && typeof p.price === 'number' && p.price > 0;
}

export function watchProducts(cb: (p: Product[]) => void) {
  const q = query(
    collection(db, 'products'),
    where('approved', '==', true),
    where('active', '==', true),
    limit(FEED_CAP_PRODUCTS),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapProduct(d.id, d.data())).filter(isListable);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => {
      console.error('watchProducts:', e);
      cb([]);
    },
  );
}

export async function getProduct(id: string): Promise<Product | null> {
  const snap = await getDoc(doc(db, 'products', id));
  if (!snap.exists()) return null;
  return mapProduct(snap.id, snap.data());
}

/** Other approved+active products in the same category (for the compare row), best-sellers first. */
export async function getProductsByCategory(category: string, excludeId: string, max = 10): Promise<Product[]> {
  if (!category) return [];
  const snap = await getDocs(query(collection(db, 'products'), where('category', '==', category)));
  return snap.docs
    .map((d) => mapProduct(d.id, d.data()))
    .filter((p) => p.id !== excludeId && p.approved && p.active && isListable(p))
    .sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0))
    .slice(0, max);
}

// ===================== ADMIN =====================

export function watchAllProducts(cb: (p: Product[]) => void) {
  return onSnapshot(
    query(collection(db, 'products'), limit(FEED_CAP_PRODUCTS)),
    (snap) => {
      const list = snap.docs.map((d) => mapProduct(d.id, d.data()));
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => {
      console.error('watchAllProducts:', e);
      cb([]);
    },
  );
}

export async function setProductApproved(id: string, approved: boolean) {
  await updateDoc(doc(db, 'products', id), { approved });
}
export async function setProductActive(id: string, active: boolean) {
  await updateDoc(doc(db, 'products', id), { active });
}
export async function setProductFeatured(id: string, featured: boolean) {
  await updateDoc(doc(db, 'products', id), { featured });
}
/**
 * Set or clear a product's flash deal. Pass a positive salePrice + future
 * saleEndsAt to run a deal; pass null (or a non-positive price) to clear it.
 * The owning shop / admin may write these fields (rules allow product update).
 */
export async function setProductSale(id: string, salePrice: number | null, saleEndsAt: number | null) {
  if (salePrice == null || saleEndsAt == null || salePrice <= 0) {
    await updateDoc(doc(db, 'products', id), { salePrice: deleteField(), saleEndsAt: deleteField() });
  } else {
    await updateDoc(doc(db, 'products', id), { salePrice, saleEndsAt });
  }
}
export async function setProductBackOffice(
  id: string,
  patch: { quotable?: boolean; costPrice?: number; commissionPct?: number },
) {
  await updateDoc(doc(db, 'products', id), strip(patch as Record<string, unknown>) as any);
}
export async function setShopPartner(id: string, isPartner: boolean) {
  await updateDoc(doc(db, 'shops', id), { isPartner });
}
/** Set a product's per-group member discounts (owning shop / admin). */
export async function setProductMemberDiscounts(id: string, memberDiscounts: MemberDiscount[]) {
  const clean = memberDiscounts.filter((d) => d.pct > 0);
  await updateDoc(doc(db, 'products', id), { memberDiscounts: clean.length ? clean : deleteField() });
}
/** Set a shop's member-discount rules (owning shop / admin). */
export async function setShopMemberRules(id: string, rules: MemberDiscountRule[]) {
  const clean = rules.filter((r) => r.pct > 0 && r.group);
  await updateDoc(doc(db, 'shops', id), { memberDiscountRules: clean.length ? clean : deleteField() });
}

// ===================== BROWSE SHOPS (public) =====================

function shopCreatedAt(data: any): number {
  return data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : typeof data.createdAt === 'number' ? data.createdAt : 0;
}

export function watchShops(cb: (s: Shop[]) => void) {
  return onSnapshot(
    query(collection(db, 'shops'), limit(FEED_CAP_SHOPS)),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data(), createdAt: shopCreatedAt(d.data()) }) as Shop)
        .filter((s) => s.status !== 'rejected');
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchShops:', e); cb([]); },
  );
}

export function watchShop(id: string, cb: (s: Shop | null) => void) {
  return onSnapshot(doc(db, 'shops', id), (snap) =>
    cb(snap.exists() ? ({ id: snap.id, ...snap.data(), createdAt: shopCreatedAt(snap.data()) } as Shop) : null),
  );
}

/** Approved + active products for one shop (public storefront). */
export function watchShopProductsPublic(shopId: string, cb: (p: Product[]) => void) {
  const q = query(collection(db, 'products'), where('shopId', '==', shopId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => mapProduct(d.id, d.data()))
        .filter((p) => p.approved && p.active && isListable(p));
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchShopProductsPublic:', e); cb([]); },
  );
}

// ===================== SELLER (shop owner) =====================

export async function getMyShop(ownerId: string): Promise<Shop | null> {
  const snap = await getDocs(query(collection(db, 'shops'), where('ownerId', '==', ownerId)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data: any = d.data();
  return {
    id: d.id,
    ...data,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt ?? 0,
  } as Shop;
}

export async function getShopById(id: string): Promise<Shop | null> {
  const snap = await getDoc(doc(db, 'shops', id));
  if (!snap.exists()) return null;
  const data: any = snap.data();
  return { id: snap.id, ...data, createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt ?? 0 } as Shop;
}

/**
 * Resolve the shop a user may manage: their OWN shop (shop.ownerId == uid) or,
 * for a linked staff member, the shop set on their profile (user.shopId) with
 * their shop role. Owner = full control; admin = manage products/orders only.
 */
export async function resolveMyShop(
  uid: string,
  linked?: { shopId?: string; shopRole?: string },
): Promise<{ shop: Shop; role: 'owner' | 'admin' } | null> {
  const owned = await getMyShop(uid);
  if (owned) return { shop: owned, role: 'owner' };
  if (linked?.shopId) {
    const s = await getShopById(linked.shopId);
    if (s) return { shop: s, role: linked.shopRole === 'owner' ? 'owner' : 'admin' };
  }
  return null;
}

export async function createShop(
  ownerId: string,
  data: { name: string; phone?: string; address?: string; description?: string },
): Promise<string> {
  const ref = await addDoc(
    collection(db, 'shops'),
    strip({ ownerId, ...data, isOpen: true, status: 'approved', createdAt: serverTimestamp() }),
  );
  return ref.id;
}

/** All products for a shop (any status) — for the owner dashboard. */
export function watchMyProducts(shopId: string, cb: (p: Product[]) => void) {
  const q = query(collection(db, 'products'), where('shopId', '==', shopId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapProduct(d.id, d.data()));
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => {
      console.error('watchMyProducts:', e);
      cb([]);
    },
  );
}

export interface CreateProductInput {
  shopId: string;
  shopName?: string;
  category: string;
  categoryLao?: string;
  name: string;
  description?: string;
  descriptionHtml?: string;
  brand?: string;
  model?: string;
  specs?: string; // technical specs — one "label: value" per line, shown as a spec table
  usage?: string;
  usageExamples?: string;
  installGuide?: string;
  safetyNotes?: string;
  price: number;
  unit: string;
  stock?: number;
  deliveryFee?: number;
  images: string[];
  variants?: ProductVariantGroup[];
  memberDiscounts?: MemberDiscount[];
}

/** Seller creates a product — starts pending (approved:false) until admin approves. */
export async function createProduct(input: CreateProductInput): Promise<string> {
  const ref = await addDoc(
    collection(db, 'products'),
    strip({ ...input, approved: false, active: true, createdAt: serverTimestamp() }),
  );
  return ref.id;
}

export async function updateProduct(id: string, patch: Partial<CreateProductInput>) {
  await updateDoc(doc(db, 'products', id), strip(patch as Record<string, unknown>));
}

// ===================== SEED =====================

const MOCK = [
  ['ປູນຊີມັງ TigerCem', 'Construction', 'ກໍ່ສ້າງ', 68000, 'ຖົງ', 240, 'cement', 'ປູນ ປອດແລນ ປະເພດ 1 ຄຸນນະພາບສູງ ເໝາະງານໂຄງສ້າງ.'],
  ['ເຫຼັກເສັ້ນ DB12', 'Construction', 'ກໍ່ສ້າງ', 52000, 'ເສັ້ນ', 500, 'rebar', 'ເຫຼັກເສັ້ນ ກົມ DB12 ມາດຕະຖານ ມອກ.'],
  ['ດິນຈີ່ມອນ', 'Construction', 'ກໍ່ສ້າງ', 1200, 'ກ້ອນ', 9000, 'brick', 'ດິນຈີ່ມອນ ເຜົາ ແຂງແຮງ.'],
  ['ສາຍໄຟ VCT 2x2.5', 'Electrical', 'ໄຟຟ້າ', 12000, 'ແມັດ', 800, 'wire', 'ສາຍໄຟ ທອງແດງ VCT 2x2.5 sq.mm.'],
  ['ສະວິດໄຟ Panasonic', 'Electrical', 'ໄຟຟ້າ', 35000, 'ອັນ', 120, 'switch', 'ສະວິດໄຟ Panasonic ຄຸນນະພາບ.'],
  ['ຫຼອດໄຟ LED 9W', 'Electrical', 'ໄຟຟ້າ', 18000, 'ອັນ', 300, 'led', 'ຫຼອດໄຟ LED 9W ປະຢັດໄຟ ແສງຂາວ.'],
  ['ທໍ່ PVC 3 ນິ້ວ', 'Plumbing', 'ນໍ້າປະປາ', 45000, 'ເສັ້ນ', 150, 'pvc', 'ທໍ່ PVC 3 ນິ້ວ ໜາ ມາດຕະຖານ.'],
  ['ກ໊ອກນ້ຳ Cotto', 'Plumbing', 'ນໍ້າປະປາ', 125000, 'ອັນ', 60, 'faucet', 'ກ໊ອກນ້ຳ Cotto ສະແຕນເລດ.'],
  ['ປໍ້ານ້ຳ Hitachi', 'Plumbing', 'ນໍ້າປະປາ', 1450000, 'ໜ່ວຍ', 12, 'pump', 'ປໍ້ານ້ຳອັດຕະໂນມັດ Hitachi 250W.'],
  ['ແອ Mitsubishi 12000 BTU', 'AC & Cooling', 'ແອ/ເຄື່ອງເຢັນ', 3200000, 'ໜ່ວຍ', 20, 'aircon', 'ແອຕິດຝາ Mitsubishi 12000 BTU Inverter.'],
  ['ນ້ຳຢາແອ R32', 'AC & Cooling', 'ແອ/ເຄື່ອງເຢັນ', 280000, 'ກະປ໋ອງ', 40, 'refrigerant', 'ນ້ຳຢາແອ R32 ສຳລັບ ບໍລິການ.'],
  ['ສີນ້ຳ TOA 18.9L', 'Paint & Coating', 'ສີ ແລະ ເຄືອບ', 520000, 'ຖັງ', 80, 'paint', 'ສີນ້ຳ TOA ພາຍນອກ ກັນນ້ຳ 18.9 ລິດ.'],
  ['ກະເບື້ອງ 60x60', 'Decoration', 'ຕົກແຕ່ງ', 85000, 'ກ່ອງ', 200, 'tile', 'ກະເບື້ອງປູພື້ນ 60x60 ຊມ ຜິວດ້ານ.'],
  ['ໂຖສ້ວມ American Standard', 'Sanitary', 'ສຸຂະພັນ', 1250000, 'ຊຸດ', 18, 'toilet', 'ໂຖສ້ວມ ນັ່ງລາບ American Standard.'],
  ['ສະຫວ່ານໄຟຟ້າ Bosch', 'Tools', 'ເຄື່ອງມື', 680000, 'ອັນ', 15, 'drill', 'ສະຫວ່ານກະແທກ Bosch GSB 550W.'],
  ['ໄມ້ອັດ 15mm', 'Wood & Boards', 'ໄມ້ ແລະ ແຜ່ນ', 165000, 'ແຜ່ນ', 90, 'plywood', 'ໄມ້ອັດ ໜາ 15mm ຂະໜາດ 4x8 ຟຸດ.'],
  ['ນັອດສະກຣູ 3 ນິ້ວ', 'Metal & Fasteners', 'ໂລຫະ ແລະ ນັອດ', 25000, 'ກ່ອງ', 300, 'screw', 'ນັອດສະກຣູໄມ້ 3 ນິ້ວ ກ່ອງ 100 ໂຕ.'],
] as const;

export async function seedShopAndProductsIfEmpty(ownerUid: string): Promise<number> {
  const existing = await getDocs(collection(db, 'products'));
  if (!existing.empty) return 0;

  // create a mock shop
  const shopRef = await addDoc(collection(db, 'shops'), {
    ownerId: ownerUid,
    name: 'ຮ້ານ ວັດສະດຸ ສະຫວ່າງ',
    nameEn: 'Savang Materials',
    description: 'ຮ້ານຂາຍວັດສະດຸກໍ່ສ້າງ ແລະ ອຸປະກອນ ຄົບວົງຈອນ',
    phone: '+8562055500000',
    address: 'ບ້ານ ໂພນຕ້ອງ ເມືອງ ສີໂຄດ ນະຄອນຫຼວງວຽງຈັນ',
    isOpen: true,
    platformCommission: 5,
    status: 'approved',
    createdAt: Date.now(),
  });

  const batch = writeBatch(db);
  MOCK.forEach(([name, category, categoryLao, price, unit, stock, key, description]) => {
    batch.set(doc(collection(db, 'products')), {
      shopId: shopRef.id,
      shopName: 'ຮ້ານ ວັດສະດຸ ສະຫວ່າງ',
      category,
      categoryLao,
      name,
      description,
      price,
      unit,
      stock,
      images: [img(key as string, 1), img(key as string, 2), img(key as string, 3)],
      approved: true,
      active: true,
      createdAt: Date.now(),
    });
  });
  await batch.commit();
  return MOCK.length;
}
