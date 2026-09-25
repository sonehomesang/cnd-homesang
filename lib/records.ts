import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { logAdminAction } from './auditLog';
import { assertUserUnique } from './users';

export interface RecordDoc {
  id: string;
  [key: string]: any;
}

// Collections an admin can browse/edit
export const COLLECTIONS = [
  { name: 'users', lao: 'ຜູ້ໃຊ້', titleField: 'name' },
  { name: 'jobs', lao: 'ງານ', titleField: 'title' },
  { name: 'bids', lao: 'ຄຳສະເໜີ', titleField: 'technicianName' },
  { name: 'products', lao: 'ສິນຄ້າ', titleField: 'name' },
  { name: 'shops', lao: 'ຮ້ານຄ້າ', titleField: 'name' },
  { name: 'orders', lao: 'ການສັ່ງຊື້', titleField: 'orderNumber' },
  { name: 'orderItems', lao: 'ລາຍການສັ່ງຊື້', titleField: 'productName' },
  { name: 'claims', lao: 'ຄືນເງິນ/claims', titleField: 'reason' },
  { name: 'reviews', lao: 'ຣີວິວ', titleField: 'comment' },
  { name: 'posts', lao: 'ໂພສ', titleField: 'content' },
  { name: 'comments', lao: 'ຄອມເມັນ', titleField: 'content' },
  { name: 'categories', lao: 'ໝວດ', titleField: 'nameLao' },
  { name: 'units', lao: 'ຫົວໜ່ວຍ', titleField: 'nameLao' },
  { name: 'roles', lao: 'ບົດບາດ', titleField: 'nameLao' },
  { name: 'userGroups', lao: 'ປະເພດຜູ້ໃຊ້', titleField: 'nameLao' },
  { name: 'banners', lao: 'ປ້າຍ', titleField: 'title' },
  { name: 'referrals', lao: 'ແນະນຳ', titleField: 'code' },
  { name: 'membershipPlans', lao: 'ແພັກສະມາຊິກ', titleField: 'nameLao' },
  { name: 'subscriptions', lao: 'ການສະໝັກ', titleField: 'planName' },
  { name: 'favorites', lao: 'ທີ່ມັກ', titleField: 'name' },
  { name: 'bankAccounts', lao: 'ບັນຊີທະນາຄານ', titleField: 'bankName' },
  { name: 'paymentProviders', lao: 'ຊ່ອງທາງຈ່າຍເງິນ', titleField: 'name' },
  { name: 'logisticsProviders', lao: 'ຜູ້ຂົນສົ່ງ', titleField: 'name' },
  { name: 'riders', lao: 'ໄຮເດີ້', titleField: 'name' },
  { name: 'deliveryTasks', lao: 'ວຽກຈັດສົ່ງ', titleField: 'orderNumber' },
  { name: 'walletTransactions', lao: 'ກະເປົາ/ຖອນເງິນ', titleField: 'type' },
  { name: 'conversations', lao: 'ສົນທະນາ', titleField: 'lastMessage' },
  { name: 'messages', lao: 'ຂໍ້ຄວາມ', titleField: 'text' },
  { name: 'notifications', lao: 'ການແຈ້ງເຕືອນ', titleField: 'title' },
  { name: 'payments', lao: 'ການຈ່າຍເງິນ', titleField: 'type' },
  { name: 'commissions', lao: 'ຄອມມິຊັ່ນ', titleField: 'jobId' },
  { name: 'disputes', lao: 'ຂໍ້ຂັດແຍ່ງ', titleField: 'reason' },
  { name: 'priceCatalog', lao: 'ລາຄາກາງ', titleField: 'nameLao' },
  { name: 'bomTemplates', lao: 'ຊຸດ BOM', titleField: 'nameLao' },
  { name: 'surveyTemplates', lao: 'ແບບສຳຫຼວດ', titleField: 'nameLao' },
  { name: 'servicePricing', lao: 'ລາຄາບໍລິການ', titleField: 'nameLao' },
  { name: 'translations', lao: 'ການແປ', titleField: 'key' },
  { name: 'settings', lao: 'ຕັ້ງຄ່າ', titleField: 'id' },
  { name: 'deliveryAddresses', lao: 'ທີ່ຢູ່ສົ່ງ', titleField: 'label' },
] as const;

export function watchCollection(name: string, cb: (docs: RecordDoc[]) => void) {
  return onSnapshot(
    collection(db, name),
    (snap) => {
      const docs = snap.docs.map((d) => {
        const data: any = { id: d.id };
        const raw = d.data();
        for (const [k, v] of Object.entries(raw)) {
          data[k] = v instanceof Timestamp ? v.toMillis() : v;
        }
        return data as RecordDoc;
      });
      cb(docs);
    },
    (e) => {
      console.error('watchCollection ' + name, e);
      cb([]);
    },
  );
}

/** Save (merge) an existing record, or create new when id is null. */
export async function saveRecord(name: string, id: string | null, data: Record<string, any>) {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'id') continue;
    if (v !== undefined) clean[k] = v;
  }
  // enforce phone/email/name uniqueness when an admin creates/edits a user
  if (name === 'users') {
    await assertUserUnique(id, { phone: clean.phone, email: clean.email, name: clean.name });
  }
  if (id) {
    let before: Record<string, any> | undefined;
    try {
      const s = await getDoc(doc(db, name, id));
      before = s.exists() ? (s.data() as Record<string, any>) : undefined;
    } catch {
      /* ignore — logging is best-effort */
    }
    await setDoc(doc(db, name, id), clean, { merge: true });
    void logAdminAction({ action: 'update', collection: name, docId: id, before, after: clean });
    return id;
  }
  // creating a NEW record: stamp a creation time so it can rank as "new" in feeds
  // (the freshness engine needs createdAt; the generic editor never set it before).
  if (clean.createdAt === undefined) clean.createdAt = Date.now();
  // admin-created products go LIVE immediately (admin is trusted). Approval can be
  // toggled afterwards from the ສິນຄ້າ panel. Seller-submitted products (createProduct)
  // still start pending. Keeps new items visible on the storefront right away.
  if (name === 'products') {
    clean.approved = true;
    if (clean.active === undefined) clean.active = true;
  }
  const ref = await addDoc(collection(db, name), clean);
  void logAdminAction({ action: 'create', collection: name, docId: ref.id, after: clean });
  return ref.id;
}

export async function deleteRecord(name: string, id: string) {
  let before: Record<string, any> | undefined;
  try {
    const s = await getDoc(doc(db, name, id));
    before = s.exists() ? (s.data() as Record<string, any>) : undefined;
  } catch {
    /* ignore */
  }
  await deleteDoc(doc(db, name, id));
  void logAdminAction({ action: 'delete', collection: name, docId: id, before });
}

export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export function fieldType(v: any): FieldType {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (Array.isArray(v)) return 'array';
  if (v && typeof v === 'object') return 'object';
  return 'string';
}
