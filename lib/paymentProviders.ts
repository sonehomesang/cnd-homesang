import { addDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { PaymentMethod } from './orders';

/**
 * Pluggable payment-provider abstraction (Slice 2, manual-first).
 * Each doc in the `paymentProviders` collection is one way a customer can pay.
 * `type` decides the checkout UX:
 *   - qr_static     → show a static QR image + slip upload (BCEL One / PromptPay)
 *   - bank_transfer → show account details + slip upload
 *   - cod           → pay on delivery (no slip)
 *   - api           → a gateway (PhaJay etc.) — slot reserved, not wired yet
 * Admin enables/disables each via the ✏️ editor. New non-bank rails (wallets,
 * gateways) drop in behind the same interface with no checkout rework.
 */
export type PaymentProviderType = 'qr_static' | 'bank_transfer' | 'cod' | 'api' | 'wallet';

export const PAYMENT_TYPE_LABEL: Record<PaymentProviderType, string> = {
  qr_static: 'QR ຄົງທີ່',
  bank_transfer: 'ໂອນທະນາຄານ',
  cod: 'ເກັບເງິນປາຍທາງ',
  api: 'API gateway',
  wallet: 'ກະເປົາ ເງິນ',
};

export interface PaymentProvider {
  id: string;
  name: string;
  type: PaymentProviderType;
  qrImage?: string; // uploaded QR (qr_static)
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  instructions?: string;
  minAmount?: number;
  maxAmount?: number;
  currencies?: string[]; // e.g. ['LAK','THB']
  enabled: boolean;
  order?: number;
}

/** Whether this provider needs a transfer-slip upload at checkout. */
export function requiresSlip(type: PaymentProviderType): boolean {
  return type === 'qr_static' || type === 'bank_transfer';
}

/** Map a provider type onto the legacy Order.paymentMethod (kept for back-compat). */
export function paymentMethodFor(type: PaymentProviderType): PaymentMethod {
  return type === 'cod' ? 'cod' : type === 'wallet' ? 'wallet' : 'bank_transfer';
}

/** Enabled providers only, sorted — for checkout. */
export function watchEnabledPaymentProviders(cb: (p: PaymentProvider[]) => void) {
  return onSnapshot(
    collection(db, 'paymentProviders'),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as PaymentProvider)
        .filter((p) => p.enabled !== false && p.type !== 'api'); // api slot hidden until wired
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      cb(list);
    },
    (e) => { console.error('watchEnabledPaymentProviders:', e); cb([]); },
  );
}

/**
 * One-time migration: if the paymentProviders collection is empty, seed it from
 * the legacy `bankAccounts` docs (as bank_transfer providers) plus a COD entry.
 * Writes require admin (firestore rules), so this succeeds when an admin first
 * opens the panel; for everyone else it fails silently and checkout falls back.
 */
export async function seedPaymentProvidersIfEmpty(): Promise<number> {
  const snap = await getDocs(collection(db, 'paymentProviders'));
  if (!snap.empty) return 0;
  const banks = await getDocs(collection(db, 'bankAccounts'));
  let order = 1;
  const created: Promise<unknown>[] = [];
  if (banks.empty) {
    created.push(addDoc(collection(db, 'paymentProviders'), {
      name: 'BCEL One QR', type: 'qr_static', bankName: 'BCEL',
      accountName: 'HomeSang', accountNumber: '040-12-00-1234567-001',
      instructions: 'ສະແກນ QR ດ້ວຍ BCEL One / ແອັບທະນາຄານ ຫຼື PromptPay',
      currencies: ['LAK', 'THB'], enabled: true, order: order++,
    }));
  } else {
    banks.docs.forEach((b) => {
      const d = b.data() as any;
      created.push(addDoc(collection(db, 'paymentProviders'), {
        name: d.bankName ?? 'ໂອນທະນາຄານ', type: 'bank_transfer',
        bankName: d.bankName, accountName: d.accountName, accountNumber: d.accountNumber,
        qrImage: d.qrUrl, currencies: ['LAK'], enabled: d.active !== false, order: d.order ?? order++,
      }));
    });
  }
  created.push(addDoc(collection(db, 'paymentProviders'), {
    name: 'ເກັບເງິນປາຍທາງ (COD)', type: 'cod',
    instructions: 'ຈ່າຍເປັນເງິນສົດ ຕອນຮັບສິນຄ້າ', enabled: true, order: 90,
  }));
  await Promise.all(created);
  return created.length;
}
