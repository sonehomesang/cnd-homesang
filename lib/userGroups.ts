import { collection, getDocs, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';

// Account-type taxonomy (separate from RBAC roles, which are permissions).
// A user belongs to ONE group; sub-types refine it. DB-backed (not hardcoded).

export interface UserSubType {
  key: string;
  nameLao: string;
  nameEn?: string;
}

export interface UserGroup {
  id: string;
  key: string;
  order: number;
  icon: string;
  nameLao: string;
  nameEn: string;
  desc: string;
  active: boolean;
  subTypes: UserSubType[];
}

export function watchUserGroups(cb: (g: UserGroup[]) => void) {
  return onSnapshot(
    collection(db, 'userGroups'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserGroup);
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      cb(list);
    },
    (e) => { console.error('watchUserGroups:', e); cb([]); },
  );
}

// 4 account-type groups (owner-defined 2026-07-05). Each non-admin group
// manages full CRUD of its OWN content (goods/services/profile/posts) — the
// role responsibilities are shown in ບົດບາດ&ສິດ; enforcement uses the app
// capabilities (postJob/bid/sell/buy/community). System Admin manages the
// back-office (admin console) via the RBAC per-section CRUD matrix.
const SEED: Omit<UserGroup, 'id'>[] = [
  {
    key: 'admin', order: 1, icon: '👑', nameLao: 'ຜູ້ດູແລ ລະບົບຫຼັງບ້ານ', nameEn: 'System Admin',
    desc: 'ທີມຈັດການ ຫຼັງບ້ານ — ຄຸ້ມຄອງ CRUD ຂອງ ລະບົບ (3 ລະດັບ)',
    active: true,
    subTypes: [
      { key: 'super', nameLao: 'Super admin', nameEn: 'Super admin (system + developer)' },
      { key: 'cs', nameLao: 'CS admin (ບໍລິການລູກຄ້າ)', nameEn: 'Customer service / Sub admin' },
      { key: 'cp', nameLao: 'CP admin (ເນື້ອຫາ&ສິນຄ້າ)', nameEn: 'Content & products / Sub admin' },
    ],
  },
  {
    key: 'corporation', order: 2, icon: '🏢', nameLao: 'ບໍລິສັດ - ຮ້ານຄ້າ', nameEn: 'Corporation',
    desc: 'ບໍລິສັດ / ນິຕິບຸກຄົນ ແລະ ຮ້ານຄ້າ — Corporate admin: ຄຸ້ມຄອງ CRUD ສິນຄ້າ/ບໍລິການ/ໂປຣໄຟລ໌ ຂອງ ຕົນ (ພາຍໃຕ້ ເງື່ອນໄຂ)',
    active: true,
    subTypes: [
      { key: 'contractor', nameLao: 'ຮັບເໝົາ', nameEn: 'Contractor' },
      { key: 'survey', nameLao: 'ສຳຫຼວດ', nameEn: 'Survey' },
      { key: 'design', nameLao: 'ອອກແບບ', nameEn: 'Design' },
      { key: 'construction', nameLao: 'ກໍ່ສ້າງ', nameEn: 'Construction' },
      { key: 'institution', nameLao: 'ສະຖາບັນ (ໂຮງຮຽນ/ໂຮງໝໍ...)', nameEn: 'Institution' },
      { key: 'commercial', nameLao: 'ຫ້າງ/ອາຄານພານິດ', nameEn: 'Commercial building' },
      { key: 'hardware', nameLao: 'ເຄື່ອງຊ່າງ/Hardware', nameEn: 'Home hardware' },
      { key: 'decoration', nameLao: 'ຕົກແຕ່ງ', nameEn: 'Decoration' },
      { key: 'material', nameLao: 'ວັດສະດຸກໍ່ສ້າງ', nameEn: 'Construction material' },
      { key: 'furniture', nameLao: 'ເຟີນິເຈີ', nameEn: 'Furniture' },
      { key: 'tools', nameLao: 'ເຄື່ອງມື', nameEn: 'Tools' },
    ],
  },
  {
    key: 'technician', order: 3, icon: '🛠️', nameLao: 'ຊ່າງ - ຜູ້ໃຫ້ບໍລິການ', nameEn: 'Individual Services',
    desc: 'ຊ່າງ, ທີ່ປຶກສາ, ວິສະວະກອນ, ອາຊີບອິດສະຫຼະ — Shelf admin: ຄຸ້ມຄອງ CRUD ບໍລິການ/ຜົນງານ/ໂປຣໄຟລ໌ ຂອງ ຕົນ (ພາຍໃຕ້ ເງື່ອນໄຂ)',
    active: true,
    subTypes: [
      { key: 'electrical', nameLao: 'ໄຟຟ້າ', nameEn: 'Electrical' },
      { key: 'plumbing', nameLao: 'ປະປາ', nameEn: 'Plumbing' },
      { key: 'aircon', nameLao: 'ແອ', nameEn: 'Air-con' },
      { key: 'carpenter', nameLao: 'ຊ່າງໄມ້', nameEn: 'Carpenter' },
      { key: 'painter', nameLao: 'ທາສີ', nameEn: 'Painter' },
      { key: 'consultant', nameLao: 'ທີ່ປຶກສາ', nameEn: 'Consultant' },
      { key: 'engineer', nameLao: 'ວິສະວະກອນ', nameEn: 'Engineer' },
      { key: 'freelance', nameLao: 'ອາຊີບອິດສະຫຼະ', nameEn: 'Freelancer' },
    ],
  },
  {
    key: 'general', order: 4, icon: '🏠', nameLao: 'ຜູ້ໃຊ້ງານທົ່ວໄປ', nameEn: 'General Users',
    desc: 'ຜູ້ໃຊ້ຕາມບ້ານ (16 ປີຂຶ້ນໄປ) — Shelf admin: ໂພສ ຫາຊ່າງ, ຊື້ສິນຄ້າ, ຄຸ້ມຄອງ ໂພສ/ໂປຣໄຟລ໌ ຂອງ ຕົນ (ຍົກເລີກ ໂພສ ໄດ້)',
    active: true,
    subTypes: [
      { key: 'hirer', nameLao: 'ຜູ້ຈ້າງ/ຫາຊ່າງ', nameEn: 'Hirer' },
      { key: 'buyer', nameLao: 'ຜູ້ຊື້ສິນຄ້າ', nameEn: 'Buyer' },
    ],
  },
];

export async function seedUserGroupsIfEmpty(): Promise<number> {
  const snap = await getDocs(collection(db, 'userGroups'));
  if (!snap.empty) return 0;
  const batch = writeBatch(db);
  SEED.forEach((g) => batch.set(doc(collection(db, 'userGroups')), g));
  await batch.commit();
  return SEED.length;
}

/**
 * Migrate the DB from the old 5-group taxonomy (admin/general/technician/
 * company/seller) to the 4-group one (admin/corporation/technician/general).
 * Merges the old `company` + `seller` sub-types into a new `corporation`
 * group, refreshes labels/desc/order/icon on the kept groups (preserving any
 * admin-edited sub-types), and deletes the retired company/seller groups.
 */
export async function reconcileUserGroups(): Promise<{ added: number; updated: number; removed: number }> {
  const snap = await getDocs(collection(db, 'userGroups'));
  const byKey = new Map(snap.docs.map((d) => [(d.data() as any).key as string, { id: d.id, data: d.data() as any }]));
  let added = 0, updated = 0, removed = 0;
  const batch = writeBatch(db);

  // kept groups (admin/technician/general): refresh meta, KEEP existing sub-types
  for (const g of SEED.filter((s) => s.key !== 'corporation')) {
    const ex = byKey.get(g.key);
    if (!ex) { batch.set(doc(collection(db, 'userGroups')), g); added++; }
    else {
      batch.update(doc(db, 'userGroups', ex.id), { order: g.order, icon: g.icon, nameLao: g.nameLao, nameEn: g.nameEn, desc: g.desc, active: true });
      updated++;
    }
  }

  // corporation: create by merging company+seller sub-types (or refresh meta if it exists)
  const seedCorp = SEED.find((s) => s.key === 'corporation')!;
  const corp = byKey.get('corporation');
  if (!corp) {
    const merged = [...(byKey.get('company')?.data.subTypes ?? []), ...(byKey.get('seller')?.data.subTypes ?? [])];
    batch.set(doc(collection(db, 'userGroups')), { ...seedCorp, subTypes: merged.length ? merged : seedCorp.subTypes });
    added++;
  } else {
    batch.update(doc(db, 'userGroups', corp.id), { order: seedCorp.order, icon: seedCorp.icon, nameLao: seedCorp.nameLao, nameEn: seedCorp.nameEn, desc: seedCorp.desc, active: true });
    updated++;
  }

  // retire the old company + seller groups
  for (const k of ['company', 'seller']) {
    const ex = byKey.get(k);
    if (ex) { batch.delete(doc(db, 'userGroups', ex.id)); removed++; }
  }

  await batch.commit();
  return { added, updated, removed };
}
