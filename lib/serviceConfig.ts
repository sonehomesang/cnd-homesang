import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/** An admin-editable option (work type / continuity). */
export interface WorkOption { key: string; label: string; icon?: string }
/** An admin-editable terms clause. Body may use {price} {warranty} {payment} {worktype}. */
export interface TermsClause { title: string; body: string }

export interface ServiceConfig {
  workTypes: WorkOption[];
  continuity: WorkOption[];
  terms: TermsClause[];
}

export const DEFAULT_SERVICE_CONFIG: ServiceConfig = {
  workTypes: [
    { key: 'repair', label: 'ສ້ອມແປງ', icon: '🔧' },
    { key: 'extend', label: 'ຕໍ່ເຕີມ', icon: '➕' },
    { key: 'newbuild', label: 'ສ້າງໃໝ່', icon: '🏗️' },
    { key: 'install', label: 'ຕິດຕັ້ງ', icon: '🔩' },
    { key: 'maintain', label: 'ບຳລຸງ ຮັກສາ', icon: '🧰' },
    { key: 'other', label: 'ອື່ນໆ', icon: '📌' },
  ],
  continuity: [
    { key: 'fresh', label: 'ວຽກ ໃໝ່ ໃຕ້ ໂຮມຊ່າງ', icon: '🆕' },
    { key: 'continued', label: 'ສືບຕໍ່ ຈາກ ຊ່າງ ອື່ນ', icon: '🔗' },
  ],
  terms: [
    { title: 'ຂອບເຂດ ວຽກ', body: 'ຄ່າ ບໍລິການ ຕາມ ໃບສະເໜີ ({price} ກີບ). ວຽກ ນອກ ຂອບເຂດ ຕ້ອງ ຕົກລົງ ເພີ່ມ ກ່ອນ.' },
    { title: 'ການ ຮັບປະກັນ', body: 'ຮັບປະກັນ {warranty}. ຄອບຄຸມ ຄ່າແຮງ + ອຸປະກອນ ທີ່ ຊ່າງ ຈັດ. ບໍ່ ຄອບຄຸມ ການ ໃຊ້ ຜິດ ຫຼື ໄພ ທຳມະຊາດ.' },
    { title: 'ການ ຈ່າຍເງິນ', body: '{payment}. ຜ່ານ ລະບົບ escrow ໂຮມຊ່າງ — ເງິນ ປ່ອຍ ໃຫ້ ຊ່າງ ຫຼັງ ຮັບ ມອບ ວຽກ.' },
    { title: 'ຄວາມ ຮັບຜິດຊອບ', body: 'ຊ່າງ ຮັບຜິດຊອບ ຄຸນນະພາບ ຕາມ ໃບກວດງານ ແລະ ມາດຕະຖານ ໂຮມຊ່າງ.' },
    { title: 'ຂໍ້ຕົກລົງ ສາມ ຝ່າຍ', body: 'ຜູ້ຈ້າງ, ຊ່າງ ແລະ ໂຮມຊ່າງ ເຂົ້າໃຈ ແລະ ຕົກລົງ ຮ່ວມ ກັນ ຕາມ ເງື່ອນໄຂ ນີ້.' },
  ],
};

function merge(data: any): ServiceConfig {
  return {
    workTypes: Array.isArray(data?.workTypes) && data.workTypes.length ? data.workTypes : DEFAULT_SERVICE_CONFIG.workTypes,
    continuity: Array.isArray(data?.continuity) && data.continuity.length ? data.continuity : DEFAULT_SERVICE_CONFIG.continuity,
    terms: Array.isArray(data?.terms) && data.terms.length ? data.terms : DEFAULT_SERVICE_CONFIG.terms,
  };
}

export function watchServiceConfig(cb: (c: ServiceConfig) => void) {
  return onSnapshot(
    doc(db, 'settings', 'service'),
    (snap) => cb(snap.exists() ? merge(snap.data()) : DEFAULT_SERVICE_CONFIG),
    () => cb(DEFAULT_SERVICE_CONFIG),
  );
}

export async function fetchServiceConfig(): Promise<ServiceConfig> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'service'));
    return snap.exists() ? merge(snap.data()) : DEFAULT_SERVICE_CONFIG;
  } catch {
    return DEFAULT_SERVICE_CONFIG;
  }
}

export async function saveServiceConfig(c: Partial<ServiceConfig>) {
  await setDoc(doc(db, 'settings', 'service'), { ...c, updatedAt: serverTimestamp() }, { merge: true });
}

/** Fill {placeholders} in a terms clause with this job's actual values. */
export function fillTerms(body: string, vals: { price?: string; warranty?: string; payment?: string; worktype?: string }): string {
  return body
    .replace(/\{price\}/g, vals.price ?? '—')
    .replace(/\{warranty\}/g, vals.warranty ?? '—')
    .replace(/\{payment\}/g, vals.payment ?? '—')
    .replace(/\{worktype\}/g, vals.worktype ?? '—');
}

export function labelOf(opts: WorkOption[], key?: string): WorkOption | undefined {
  return key ? opts.find((o) => o.key === key) : undefined;
}
