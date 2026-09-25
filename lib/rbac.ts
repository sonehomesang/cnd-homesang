import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

export type RoleType = 'user' | 'admin';
export type AdminAction = 'view' | 'create' | 'edit' | 'delete';

export const APP_CAPS = [
  { key: 'postJob', lao: 'ໂພສຫາຊ່າງ' },
  { key: 'bid', lao: 'ສະເໜີລາຄາ (bid)' },
  { key: 'sell', lao: 'ຂາຍສິນຄ້າ' },
  { key: 'buy', lao: 'ຊື້ສິນຄ້າ' },
  { key: 'community', lao: 'ໂພສ ໂຮມເພື່ອນ' },
] as const;

// admin console sections — MUST match the NAV item keys in app/admin/index.tsx
export const ADMIN_SECTIONS = [
  { key: 'dash', lao: '📊 Dashboard' },
  { key: 'growth', lao: '📈 ການ ເຕີບ ໂຕ' },
  { key: 'users', lao: '👥 ຜູ້ໃຊ້ງານ & ສິດ' },
  { key: 'techverify', lao: '🧑‍🔧 ຮັບ+ຢືນຢັນ ຊ່າງ' },
  { key: 'jobs', lao: '📣 ປະກາດວຽກ' },
  { key: 'quotations', lao: '📝 ໃບສະເໜີລາຄາ' },
  { key: 'sites', lao: '🏠 ອາຄານ & ຊັບສິນ' },
  { key: 'catalog', lao: '🛍️ ສິນຄ້າ-ຮ້ານຄ້າ' },
  { key: 'disputes', lao: '⚠️ ຂໍ້ຂັດແຍ່ງ' },
  { key: 'reviews', lao: '⭐ ຣີວິວ' },
  { key: 'broadcast', lao: '📢 ແຈ້ງເຕືອນລວມ' },
  { key: 'audit', lao: '📜 ບັນທຶກການແກ້ໄຂ' },
  { key: 'finance', lao: '💰 ບໍລິຫານການເງິນ' },
  { key: 'categories', lao: '📂 ໝວດໝູ່' },
  { key: 'survey', lao: '📋 ແບບສຳຫຼວດ' },
  { key: 'pricing', lao: '💲 ລາຄາກາງ' },
  { key: 'bom', lao: '📦 ຊຸດ BOM' },
  { key: 'units', lao: '📏 ຫົວໜ່ວຍ' },
  { key: 'banners', lao: '🖼️ ປ້າຍ' },
  { key: 'memberships', lao: '🎫 ສະມາຊິກ' },
  { key: 'coupons', lao: '🎟️ ລະຫັດ ສ່ວນ ຫຼຸດ' },
  { key: 'settings', lao: '⚙️ ທົ່ວໄປ' },
  { key: 'feedrank', lao: '🔀 ຈັດລຽງ Feed' },
  { key: 'translations', lao: '🌐 ການແປ' },
  { key: 'cms', lao: '📄 ເນື້ອຫາ' },
  { key: 'marketing', lao: '📣 ການ ຕະຫຼາດ (MK Plan)' },
  { key: 'errors', lao: '🐞 Error logs' },
] as const;

export const ADMIN_ACTIONS: AdminAction[] = ['view', 'create', 'edit', 'delete'];

// Own-content CRUD — what a USER role may do to ITS OWN data. Admin grants each
// action per domain (a matrix like the admin one). The matching app-capability
// is derived from the row (any action on → capability on) so the coarse gate
// stays enforced; fine-grained per-action gating is read via ownCan().
export type OwnAction = 'create' | 'edit' | 'delete' | 'onoff';
export const OWN_ACTIONS: OwnAction[] = ['create', 'edit', 'delete', 'onoff'];
export const OWN_DOMAINS = [
  { key: 'jobs', lao: '📣 ໂພສ ຫາຊ່າງ' },
  { key: 'bids', lao: '📝 ໃບສະເໜີ / ຜົນງານ' },
  { key: 'goods', lao: '🏬 ສິນຄ້າ / ບໍລິການ' },
  { key: 'orders', lao: '🛒 ຄຳສັ່ງຊື້' },
  { key: 'community', lao: '💬 ໂພສ ໂຮມເພື່ອນ' },
  { key: 'profile', lao: '👤 ໂປຣໄຟລ໌ ຕົນເອງ' },
] as const;
// which app-capability each own-content domain maps to (profile has none)
export const DOMAIN_CAP: Record<string, string> = { jobs: 'postJob', bids: 'bid', goods: 'sell', orders: 'buy', community: 'community' };

export interface Role {
  id: string;
  name: string; // slug, referenced by users.roles[]
  nameLao: string;
  icon?: string;
  type: RoleType;
  active: boolean;
  order?: number;
  capabilities: Record<string, boolean>;
  adminPerms: Record<string, Record<AdminAction, boolean>>;
  ownPerms?: Record<string, Record<OwnAction, boolean>>; // own-content CRUD (user roles)
}

function emptyPerms(): Record<string, Record<AdminAction, boolean>> {
  const p: Record<string, Record<AdminAction, boolean>> = {};
  for (const s of ADMIN_SECTIONS) p[s.key] = { view: false, create: false, edit: false, delete: false };
  return p;
}
function fullPerms(): Record<string, Record<AdminAction, boolean>> {
  const p: Record<string, Record<AdminAction, boolean>> = {};
  for (const s of ADMIN_SECTIONS) p[s.key] = { view: true, create: true, edit: true, delete: true };
  return p;
}
function caps(obj: Partial<Record<string, boolean>>): Record<string, boolean> {
  const c: Record<string, boolean> = {};
  for (const k of APP_CAPS) c[k.key] = !!obj[k.key];
  return c;
}
function emptyOwn(): Record<string, Record<OwnAction, boolean>> {
  const p: Record<string, Record<OwnAction, boolean>> = {};
  for (const d of OWN_DOMAINS) p[d.key] = { create: false, edit: false, delete: false, onoff: false };
  return p;
}
function fullOwn(): Record<string, Record<OwnAction, boolean>> {
  const p: Record<string, Record<OwnAction, boolean>> = {};
  for (const d of OWN_DOMAINS) p[d.key] = { create: true, edit: true, delete: true, onoff: true };
  return p;
}
// build an ownPerms map granting the listed actions per domain (rest false)
function ownPermsFor(spec: Record<string, OwnAction[]>): Record<string, Record<OwnAction, boolean>> {
  const p = emptyOwn();
  for (const [dom, acts] of Object.entries(spec)) if (p[dom]) for (const a of acts) p[dom][a] = true;
  return p;
}

export function watchRoles(cb: (r: Role[]) => void) {
  return onSnapshot(collection(db, 'roles'), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Role);
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    cb(list);
  }, (e) => { console.error('watchRoles:', e); cb([]); });
}

export async function createRole(data: Omit<Role, 'id'>) {
  await addDoc(collection(db, 'roles'), data);
}
export async function updateRole(id: string, patch: Partial<Role>) {
  await updateDoc(doc(db, 'roles', id), patch as any);
}
export async function deleteRole(id: string) {
  await deleteDoc(doc(db, 'roles', id));
}

/** Merge a user's roles into effective permissions. */
export function effectivePerms(userRoleNames: string[], allRoles: Role[], isSuperAdmin: boolean) {
  if (isSuperAdmin) {
    return { capabilities: caps({ postJob: true, bid: true, sell: true, buy: true, community: true }), adminPerms: fullPerms(), ownPerms: fullOwn(), isAdmin: true };
  }
  const capsOut: Record<string, boolean> = {};
  const perms = emptyPerms();
  const own = emptyOwn();
  let isAdmin = false;
  let matched = 0;
  for (const rn of userRoleNames) {
    const role = allRoles.find((r) => r.name === rn);
    if (!role) continue;
    matched++;
    if (role.type === 'admin') isAdmin = true;
    for (const k of APP_CAPS) if (role.capabilities?.[k.key]) capsOut[k.key] = true;
    for (const s of ADMIN_SECTIONS) {
      for (const a of ADMIN_ACTIONS) {
        if (role.adminPerms?.[s.key]?.[a]) perms[s.key][a] = true;
      }
    }
    for (const d of OWN_DOMAINS) {
      for (const a of OWN_ACTIONS) {
        if (role.ownPerms?.[d.key]?.[a]) own[d.key][a] = true;
      }
    }
  }
  // Default-permissive for app capabilities when the user's roles aren't
  // defined yet (roles collection not seeded) — avoids locking out real users.
  // Admin perms stay strict (never auto-granted).
  if (matched === 0) {
    return { capabilities: caps({ postJob: true, bid: true, sell: true, buy: true, community: true }), adminPerms: perms, ownPerms: fullOwn(), isAdmin };
  }
  return { capabilities: capsOut, adminPerms: perms, ownPerms: own, isAdmin };
}

// view+create+edit on the given admin sections (delete stays false — super only)
function permsFor(sections: string[]): Record<string, Record<AdminAction, boolean>> {
  const p = emptyPerms();
  sections.forEach((s) => { if (p[s]) { p[s].view = true; p[s].create = true; p[s].edit = true; } });
  return p;
}

const CS_SEC = ['dash', 'users', 'jobs', 'quotations', 'catalog', 'finance', 'disputes', 'reviews'];
const CP_SEC = ['dash', 'catalog', 'categories', 'survey', 'pricing', 'bom', 'units', 'banners', 'cms'];

/**
 * The canonical RBAC roles — exactly the roles the account-type groups derive
 * (see deriveAccountRoles). Lao names mirror the userGroups so the two admin
 * tabs stay consistent. Slugs are stable (users.roles[] references them).
 */
const CANONICAL_ROLES: Omit<Role, 'id'>[] = [
  { name: 'customer', nameLao: 'ຜູ້ໃຊ້ງານທົ່ວໄປ', icon: '🏠', type: 'user', active: true, order: 1,
    capabilities: caps({ postJob: true, buy: true, community: true }), adminPerms: emptyPerms(),
    ownPerms: ownPermsFor({ jobs: ['create', 'edit', 'delete', 'onoff'], orders: ['create', 'onoff'], community: ['create', 'edit', 'delete'], profile: ['edit'] }) },
  { name: 'technician', nameLao: 'ຊ່າງ - ຜູ້ໃຫ້ບໍລິການ', icon: '🛠️', type: 'user', active: true, order: 2,
    capabilities: caps({ bid: true, buy: true, community: true }), adminPerms: emptyPerms(),
    ownPerms: ownPermsFor({ bids: ['create', 'edit', 'delete', 'onoff'], orders: ['create', 'onoff'], community: ['create', 'edit', 'delete'], profile: ['edit'] }) },
  { name: 'shop', nameLao: 'ບໍລິສັດ - ຮ້ານຄ້າ', icon: '🏢', type: 'user', active: true, order: 3,
    capabilities: caps({ sell: true, buy: true, community: true }), adminPerms: emptyPerms(),
    ownPerms: ownPermsFor({ goods: ['create', 'edit', 'delete', 'onoff'], orders: ['create', 'onoff'], community: ['create', 'edit', 'delete'], profile: ['edit'] }) },
  { name: 'cs_admin', nameLao: 'CS admin (ບໍລິການລູກຄ້າ)', icon: '🎧', type: 'admin', active: true, order: 4,
    capabilities: caps({ buy: true, community: true }), adminPerms: permsFor(CS_SEC), ownPerms: emptyOwn() },
  { name: 'cp_admin', nameLao: 'CP admin (ເນື້ອຫາ&ສິນຄ້າ)', icon: '🗂️', type: 'admin', active: true, order: 5,
    capabilities: caps({ buy: true, community: true }), adminPerms: permsFor(CP_SEC), ownPerms: emptyOwn() },
  { name: 'marketing', nameLao: 'Marketing (ການຕະຫຼາດ)', icon: '📣', type: 'admin', active: true, order: 6,
    capabilities: caps({ buy: true, community: true }), adminPerms: permsFor(['marketing']), ownPerms: emptyOwn() },
  { name: 'admin', nameLao: 'Super admin', icon: '👑', type: 'admin', active: true, order: 7,
    capabilities: caps({ postJob: true, bid: true, sell: true, buy: true, community: true }), adminPerms: fullPerms(), ownPerms: fullOwn() },
];

export async function seedRolesIfEmpty(): Promise<number> {
  const snap = await getDocs(collection(db, 'roles'));
  const hasRbac = snap.docs.some((d) => (d.data() as any).capabilities);
  if (hasRbac) return 0;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref)); // clear legacy bare docs
  CANONICAL_ROLES.forEach((r) => batch.set(doc(collection(db, 'roles')), r));
  await batch.commit();
  return CANONICAL_ROLES.length;
}

/**
 * Align the roles collection to the canonical 6: create missing (cs_admin/
 * cp_admin), fix Lao names/icons/order (preserving any edited capabilities/
 * adminPerms), and delete non-canonical roles (moderator + ad-hoc extras).
 */
export async function reconcileRoles(): Promise<{ added: number; updated: number; removed: number }> {
  const snap = await getDocs(collection(db, 'roles'));
  const byName = new Map(snap.docs.map((d) => [(d.data() as any).name as string, { id: d.id, data: d.data() as any }]));
  const canonical = new Set(CANONICAL_ROLES.map((r) => r.name));
  let added = 0, updated = 0, removed = 0;
  const batch = writeBatch(db);
  for (const r of CANONICAL_ROLES) {
    const ex = byName.get(r.name);
    if (!ex) {
      batch.set(doc(collection(db, 'roles')), r);
      added++;
    } else {
      const patch: any = { nameLao: r.nameLao, icon: r.icon, type: r.type, order: r.order, active: true };
      if (!ex.data.capabilities) patch.capabilities = r.capabilities;
      // (re)set admin section access when missing or using stale (pre-hub) keys
      const stalePerms = !ex.data.adminPerms || !('catalog' in ex.data.adminPerms);
      if (stalePerms) patch.adminPerms = r.adminPerms;
      // add own-content CRUD perms when missing (new field — preserves edits once set)
      if (!ex.data.ownPerms) patch.ownPerms = r.ownPerms ?? emptyOwn();
      batch.update(doc(db, 'roles', ex.id), patch);
      updated++;
    }
  }
  for (const [name, ex] of byName) {
    if (!canonical.has(name)) { batch.delete(doc(db, 'roles', ex.id)); removed++; }
  }
  await batch.commit();
  return { added, updated, removed };
}
