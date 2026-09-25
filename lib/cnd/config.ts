import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';

// CND store config (single doc cndConfig/main) — the freely-settable install-fee
// default % + basic store settings. Per-category / per-product overrides live on
// the category / product records; this is the global fallback.
export interface CndConfig {
  installFeeDefaultPct: number;
  deliveryFee: number;
  storeName: string;
  // store profile (shown on storefront + receipts)
  tagline?: string;
  phone?: string;
  address?: string;
  hours?: string;
  // payment + billing
  acceptCash?: boolean;
  acceptQr?: boolean;
  taxPct?: number;          // VAT/service tax % on receipts (0 = none)
  receiptNote?: string;     // footer line printed on receipts
  currency?: string;        // display currency label (ກີບ)
  commissionPct?: number;   // HomeSang platform commission % on net revenue
  // ninesang survey fee (ຄ່າ ສຳຫຼວດ ໜ້າ ງານ) for big install jobs
  surveyFeeMode?: 'off' | 'agree' | 'prepay';  // off=none · agree=T&C only · prepay=charge upfront (refund-as-discount)
  surveyFee?: number;                          // kip
  // QR / bank transfer payment (customer transfers, shop confirms — pre-PSP)
  payQrUrl?: string;        // merchant QR image (BCEL One myQR etc.)
  bankName?: string;
  bankAccount?: string;
  bankAccountName?: string;
  // ninesang booking — book a tech slot in advance (no product needed)
  bookingEnabled?: boolean;
  bookingSlots?: string[];                  // per-day time-slot labels
  bookingCapacityMode?: 'byTech' | 'unlimited' | 'fixed'; // admin choice
  bookingSlotCap?: number;                  // max bookings/slot when mode = 'fixed'
  bookingDays?: number;                      // how many days ahead the calendar shows
  // ninesang urgent call-out
  urgentEnabled?: boolean;
  urgentFee?: number;                        // kip
  urgentHours?: string;                      // service window, e.g. '08:00–20:00'
  // storefront product grid columns (admin-tunable) — fewer = bigger, more vivid cards
  gridColsMobile?: number;                   // phones (2–3)
  gridColsWide?: number;                     // desktop (3–6)
}
const DEF: CndConfig = {
  installFeeDefaultPct: 10, deliveryFee: 50000, storeName: 'CND',
  tagline: 'Home Hardware & Services', phone: '020 5555 0000', address: 'ນະຄອນຫຼວງ ວຽງຈັນ',
  hours: 'ຈ-ອາ 8:00–18:00', acceptCash: true, acceptQr: true, taxPct: 10, receiptNote: 'ຂອບໃຈ ທີ່ ອຸດໜູນ CND 🙏', currency: 'ກີບ', commissionPct: 3,
  surveyFeeMode: 'off', surveyFee: 0,
  bookingEnabled: true, bookingSlots: ['09:00–10:30', '10:30–12:00', '13:00–14:30', '14:30–16:00', '16:00–17:30'],
  bookingCapacityMode: 'byTech', bookingSlotCap: 3, bookingDays: 14,
  urgentEnabled: true, urgentFee: 50000, urgentHours: '08:00–20:00',
  gridColsMobile: 2, gridColsWide: 4,
};
const REF = () => doc(db, 'cndConfig', 'main');
function merge(d: any): CndConfig { return { ...DEF, ...(d || {}) }; }

export function watchCndConfig(cb: (c: CndConfig) => void) {
  return onSnapshot(REF(), (s) => cb(merge(s.data())), (e) => { console.error('watchCndConfig:', e); cb(DEF); });
}
export async function saveCndConfig(patch: Partial<CndConfig>) {
  await setDoc(REF(), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}
export function useCndConfig(): CndConfig {
  const [c, setC] = useState<CndConfig>(DEF);
  useEffect(() => watchCndConfig(setC), []);
  return c;
}
