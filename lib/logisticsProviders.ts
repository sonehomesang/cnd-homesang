import { addDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Pluggable logistics-provider abstraction (Slice 2, manual-first).
 * Delivery is 4 LAYERS, not one (owner insight):
 *   - job    (A) technician carries the job-linked materials to site — fee 0, asset-light edge
 *   - rider  (B) in-city same-day rider — fast, flat fee
 *   - parcel (C) cross-province courier (Anousith / HAL) — cheap, distance-priced, COD
 *   - own    (D) HomeSang's own express brand — reserved for Year 2–3 (start disabled)
 * `type=manual` books offline + tracking entered by hand; `type=api` (courier
 * APIs) drops in behind the same interface later with no checkout rework.
 */
export type LogisticsTier = 'job' | 'rider' | 'parcel' | 'own';
export type LogisticsType = 'manual' | 'api';

export const LOGISTICS_TIER_LABEL: Record<LogisticsTier, string> = {
  job: '🧰 ຊ່າງຖືໄປໜ້າງານ',
  rider: '🛵 ສົ່ງດ່ວນໃນເມືອງ',
  parcel: '📦 ພັດສະດຸຂ້າມແຂວງ',
  own: '🚚 HomeSang Express',
};

export interface DistanceRate {
  upToKm: number;
  fee: number;
}

export interface LogisticsProvider {
  id: string;
  name: string;
  tier: LogisticsTier;
  type: LogisticsType;
  coverage?: string;
  flatFee?: number; // fixed fee (rider); leave empty for job (0) or distance-priced
  deliveryRates?: DistanceRate[]; // km × fee tiers (parcel)
  codSupported?: boolean;
  bookingInfo?: string;
  speed?: string;
  enabled: boolean;
  order?: number;
}

/**
 * Estimate the delivery fee at checkout. Distance is unknown in the cart, so a
 * distance-priced provider quotes its first (base) tier; the courier confirms
 * the exact fee on booking.
 */
export function resolveDeliveryFee(p: LogisticsProvider | null | undefined): number {
  if (!p) return 0;
  if (p.tier === 'job') return 0;
  if (p.flatFee != null) return p.flatFee;
  if (p.deliveryRates && p.deliveryRates.length) return Number(p.deliveryRates[0].fee) || 0;
  return 0;
}

/** Enabled providers only, sorted — for checkout. */
export function watchEnabledLogisticsProviders(cb: (p: LogisticsProvider[]) => void) {
  return onSnapshot(
    collection(db, 'logisticsProviders'),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as LogisticsProvider)
        .filter((p) => p.enabled !== false);
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      cb(list);
    },
    (e) => { console.error('watchEnabledLogisticsProviders:', e); cb([]); },
  );
}

/** Seed the 4-layer defaults if the collection is empty (admin-only write). */
export async function seedLogisticsProvidersIfEmpty(): Promise<number> {
  const snap = await getDocs(collection(db, 'logisticsProviders'));
  if (!snap.empty) return 0;
  const defaults: Omit<LogisticsProvider, 'id'>[] = [
    { name: 'ຊ່າງຖືໄປໜ້າງານ', tier: 'job', type: 'manual', coverage: 'ຕາມວຽກ', codSupported: true, speed: 'ພ້ອມວຽກ', enabled: true, order: 1,
      bookingInfo: 'ຊ່າງນຳວັດສະດຸໄປພ້ອມ ຕອນເຮັດວຽກ (ຜູກກັບໃບສະເໜີລາຄາ)' },
    { name: 'Rider ໃນເມືອງ', tier: 'rider', type: 'manual', coverage: 'ນະຄອນຫຼວງວຽງຈັນ', flatFee: 25000, codSupported: true, speed: 'ພາຍໃນມື້', enabled: true, order: 2,
      bookingInfo: 'ໃຊ້ບໍລິການ rider ໃນເມືອງ (Loca ຯລຯ) — ຈອງເອງ' },
    { name: 'Anousith Express', tier: 'parcel', type: 'manual', coverage: 'ທົ່ວປະເທດ (17 ແຂວງ)', codSupported: true, speed: '3–7 ມື້', enabled: true, order: 3,
      deliveryRates: [{ upToKm: 5, fee: 15000 }, { upToKm: 20, fee: 30000 }, { upToKm: 100, fee: 55000 }, { upToKm: 9999, fee: 90000 }],
      bookingInfo: 'ຈອງທີ່ສາຂາ Anousith — ໃສ່ເລກ tracking ຄືນໃນຫຼັງບ້ານ' },
    { name: 'HAL Express (ຮຸ່ງອາລຸນ)', tier: 'parcel', type: 'manual', coverage: 'ທົ່ວປະເທດ', codSupported: true, speed: '3–7 ມື້', enabled: true, order: 4,
      deliveryRates: [{ upToKm: 5, fee: 15000 }, { upToKm: 20, fee: 30000 }, { upToKm: 100, fee: 55000 }, { upToKm: 9999, fee: 90000 }],
      bookingInfo: 'ຈອງທີ່ສາຂາ HAL / ຮຸ່ງອາລຸນ — ໃສ່ເລກ tracking ຄືນໃນຫຼັງບ້ານ' },
    { name: 'HomeSang Express', tier: 'own', type: 'manual', coverage: 'ນະຄອນຫຼວງວຽງຈັນ', flatFee: 25000, codSupported: true, speed: 'ພາຍໃນມື້', enabled: true, order: 5,
      bookingInfo: 'rider ໂຮມຊ່າງ ຮັບງານເອງ (asset-light) — order ກາຍເປັນ delivery task ອັດຕະໂນມັດ' },
  ];
  await Promise.all(defaults.map((d) => addDoc(collection(db, 'logisticsProviders'), d)));
  return defaults.length;
}
