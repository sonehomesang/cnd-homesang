import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG, stampMock } from '../mock';

/**
 * CND back-office RBAC — roles (which admin sections + capabilities) + a staff
 * registry. Mirrors the HomeSang Roles/Users model but scoped to CND. The store
 * owner (HomeSang admin) is always super; roles gate what each staff member can
 * reach. Gating is demonstrated in-admin via a "view as role" preview.
 */
export type CndSection =
  | 'report' | 'orders' | 'returns' | 'customers' | 'products' | 'cats' | 'units' | 'inventory'
  | 'branches' | 'suppliers' | 'labels' | 'techs' | 'schedule' | 'install' | 'reviews' | 'promos' | 'finance' | 'banks' | 'delivery' | 'settings' | 'staff' | 'audit' | 'i18n';
export const CND_SECTIONS: { k: CndSection; label: string }[] = [
  { k: 'report', label: '📊 Dashboard' }, { k: 'orders', label: '🧾 ອໍເດີ' }, { k: 'returns', label: '↩️ ຮັບ ຄືນ' },
  { k: 'customers', label: '👤 ລູກຄ້າ' }, { k: 'products', label: '📦 ສິນຄ້າ' }, { k: 'cats', label: '🗂️ ໝວດ' }, { k: 'units', label: '📏 ຫົວໜ່ວຍ' }, { k: 'inventory', label: '📥 ສາງ' },
  { k: 'branches', label: '🏬 ສາຂາ' }, { k: 'suppliers', label: '🏭 ຜູ້ຂາຍ/PO' }, { k: 'labels', label: '🏷️ ປ້າຍ' }, { k: 'techs', label: '👷 ຊ່າງ' }, { k: 'schedule', label: '📅 ຕາຕະລາງ ຊ່າງ' },
  { k: 'install', label: '🔧 ຄ່າ ຕິດຕັ້ງ' }, { k: 'reviews', label: '⭐ ຣີວິວ' }, { k: 'promos', label: '🎯 ໂປຣ' }, { k: 'finance', label: '💰 ການເງິນ' }, { k: 'banks', label: '💳 ທະນາຄານ/QR' }, { k: 'delivery', label: '🚚 ຂົນ ສົ່ງ' }, { k: 'settings', label: '⚙️ ຕັ້ງຄ່າ' }, { k: 'staff', label: '🔐 ພະນັກງານ' }, { k: 'audit', label: '📋 Audit log' }, { k: 'i18n', label: '🌐 ແປ / ແກ້ ຄຳ' },
];
const ALL: CndSection[] = CND_SECTIONS.map((s) => s.k);

export interface CndRole {
  key: string;
  name: string;
  sections: CndSection[];
  canRefund: boolean;
  canManageStaff: boolean;
  canPos: boolean;
  order?: number;
  __mock?: boolean;
}
export interface CndStaff {
  id: string;
  name: string;
  phone?: string;
  roleKey: string;
  active: boolean;
  createdAt: number;
  __mock?: boolean;
}

export const DEFAULT_ROLES: Omit<CndRole, '__mock'>[] = [
  { key: 'owner', name: '🔴 Super-Admin (CND-HomeSang)', sections: [...ALL], canRefund: true, canManageStaff: true, canPos: true, order: 1 },
  { key: 'manager', name: '🟠 Admin (CND-HomeSang)', sections: ['report', 'orders', 'returns', 'customers', 'products', 'cats', 'inventory', 'branches', 'suppliers', 'labels', 'techs', 'schedule', 'install', 'reviews', 'promos', 'finance', 'banks', 'delivery', 'settings'], canRefund: true, canManageStaff: false, canPos: true, order: 2 },
  { key: 'cashier', name: '🟢 ແຄຊເຊຍ (POS / ໜ້າ ຮ້ານ)', sections: ['report', 'orders', 'returns', 'customers'], canRefund: false, canManageStaff: false, canPos: true, order: 3 },
  { key: 'stock', name: '🔵 ພະນັກງານ ສາງ', sections: ['products', 'cats', 'inventory', 'branches', 'suppliers', 'labels'], canRefund: false, canManageStaff: false, canPos: false, order: 4 },
];

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function mapRole(id: string, d: any): CndRole {
  return { key: id, name: d.name ?? id, sections: Array.isArray(d.sections) ? d.sections : [], canRefund: !!d.canRefund, canManageStaff: !!d.canManageStaff, canPos: d.canPos !== false, order: d.order ?? 99, __mock: !!d[MOCK_FLAG] };
}
function mapStaff(id: string, d: any): CndStaff {
  return { id, name: d.name ?? '', phone: d.phone, roleKey: d.roleKey ?? 'cashier', active: d.active !== false, createdAt: ms(d.createdAt), __mock: !!d[MOCK_FLAG] };
}

// ── roles ──
export function watchCndRoles(cb: (r: CndRole[]) => void) {
  return onSnapshot(query(collection(db, 'cndRoles')),
    (s) => cb(s.docs.map((d) => mapRole(d.id, d.data())).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))),
    (e) => { console.error('watchCndRoles:', e); cb([]); });
}
export async function saveCndRole(key: string, patch: Partial<CndRole>) {
  await setDoc(doc(db, 'cndRoles', key), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}
export async function seedCndRoles(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const b = writeBatch(db);
  for (const r of DEFAULT_ROLES) b.set(doc(db, 'cndRoles', r.key), stampMock({ ...r }));
  await b.commit();
  return DEFAULT_ROLES.length;
}
/** Update the DISPLAY names of the standard roles to the current defaults (keys +
 *  permissions untouched) — for stores seeded before the names were clarified. */
export async function syncCndRoleNames(): Promise<number> {
  const b = writeBatch(db);
  for (const r of DEFAULT_ROLES) b.set(doc(db, 'cndRoles', r.key), { name: r.name }, { merge: true });
  await b.commit();
  return DEFAULT_ROLES.length;
}

// ── staff ──
export function watchCndStaff(cb: (s: CndStaff[]) => void) {
  return onSnapshot(query(collection(db, 'cndStaff')),
    (s) => cb(s.docs.map((d) => mapStaff(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name))),
    (e) => { console.error('watchCndStaff:', e); cb([]); });
}
export async function addCndStaff(t: { name: string; phone?: string; roleKey: string }) {
  await addDoc(collection(db, 'cndStaff'), { name: t.name.trim(), phone: t.phone?.trim() || undefined, roleKey: t.roleKey, active: true, createdAt: serverTimestamp() });
}
export async function updateCndStaff(id: string, patch: Partial<CndStaff>) { await updateDoc(doc(db, 'cndStaff', id), patch); }
export async function removeCndStaff(id: string) { await deleteDoc(doc(db, 'cndStaff', id)); }
export async function seedCndStaff(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const rows = [
    { name: 'ນາງ ໄໝ (ແຄຊເຊຍ)', phone: '020 7777 1001', roleKey: 'cashier' },
    { name: 'ທ້າວ ອຳ (ຜູ້ ຈັດການ)', phone: '020 7777 1002', roleKey: 'manager' },
    { name: 'ທ້າວ ບຸນ (ສາງ)', phone: '020 7777 1003', roleKey: 'stock' },
    { name: 'ນາງ ຄຳ (ແຄຊເຊຍ)', phone: '020 7777 1004', roleKey: 'cashier' },
  ];
  const b = writeBatch(db);
  for (const r of rows) b.set(doc(collection(db, 'cndStaff')), stampMock({ ...r, active: true, createdAt: serverTimestamp() }));
  await b.commit();
  return rows.length;
}
export async function clearCndStaff(): Promise<number> {
  let n = 0;
  for (const col of ['cndStaff', 'cndRoles']) {
    const snap = await getDocs(query(collection(db, col), where(MOCK_FLAG, '==', true)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    n += snap.size;
  }
  return n;
}

// ── access resolution ──
export interface CndAccess {
  roleKey: string; roleName: string; sections: Set<CndSection>;
  canRefund: boolean; canManageStaff: boolean; canPos: boolean; isOwner: boolean;
}
export function ownerAccess(): CndAccess {
  return { roleKey: 'owner', roleName: '🔴 Super-Admin (CND-HomeSang)', sections: new Set(ALL), canRefund: true, canManageStaff: true, canPos: true, isOwner: true };
}
/** Match two phones by their last 8 digits (ignores country code / spacing). */
export function samePhone(a?: string, b?: string): boolean {
  const x = (a || '').replace(/\D/g, '').slice(-8);
  const y = (b || '').replace(/\D/g, '').slice(-8);
  return x.length >= 6 && x === y;
}
/** Find the active staff record whose phone matches the signed-in user. */
export function findCndStaff(staff: CndStaff[], phone?: string): CndStaff | undefined {
  return staff.find((s) => s.active && samePhone(s.phone, phone));
}
export function accessForRole(role: CndRole | undefined): CndAccess {
  if (!role) return { roleKey: '', roleName: '—', sections: new Set(), canRefund: false, canManageStaff: false, canPos: false, isOwner: false };
  return { roleKey: role.key, roleName: role.name, sections: new Set(role.sections), canRefund: role.canRefund, canManageStaff: role.canManageStaff, canPos: role.canPos, isOwner: role.key === 'owner' };
}
