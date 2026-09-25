import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Y3 Slice C — value-added take-rate engine. The platform grows revenue by
 * charging for the jobs-to-be-done it performs (escrow, fulfillment, COD
 * handling) rather than raising the flat commission. Each fee component is
 * back-office revenue (deducted from the shop's settlement, like `commission`)
 * — it NEVER touches the buyer's grandTotal. Components are computed at
 * placeOrder and recorded on the order as a breakdown; the income panel sums
 * them by type. Everything ships DISABLED so behaviour is unchanged until the
 * owner switches a component on.
 */
export type FeeCondition = 'all' | 'express' | 'cod' | 'bank';

export const FEE_CONDITION_LABEL: Record<FeeCondition, string> = {
  all: 'ທຸກ order',
  express: 'HomeSang Express',
  cod: 'COD (ເກັບປາຍທາງ)',
  bank: 'ໂອນ ທະນາຄານ',
};

export interface PlatformFeeComponent {
  key: string;
  label: string;
  emoji?: string;
  kind: 'pct' | 'flat'; // pct = % of goods subtotal; flat = fixed kip per order
  value: number;
  appliesTo: FeeCondition;
  enabled: boolean;
}

/** A fee actually charged on one order (stored in order.platformFees). */
export interface AppliedFee {
  key: string;
  label: string;
  amount: number;
}

export interface FeeContext {
  subtotal: number;
  paymentMethod: 'bank_transfer' | 'cod';
  logisticsTier?: string; // 'own' == HomeSang Express
}

export const DEFAULT_PLATFORM_FEES: PlatformFeeComponent[] = [
  { key: 'escrow', emoji: '🔒', label: 'ຄ່າ Escrow / ຮັບປະກັນ', kind: 'pct', value: 1.5, appliesTo: 'bank', enabled: false },
  { key: 'fulfillment', emoji: '🚚', label: 'ຄ່າ Fulfillment', kind: 'pct', value: 2, appliesTo: 'express', enabled: false },
  { key: 'cod', emoji: '💵', label: 'ຄ່າ ຈັດການ COD', kind: 'flat', value: 5000, appliesTo: 'cod', enabled: false },
  { key: 'service', emoji: '✨', label: 'ຄ່າ ບໍລິການ ທົ່ວໄປ', kind: 'pct', value: 0, appliesTo: 'all', enabled: false },
];

const REF = () => doc(db, 'settings', 'platformFees');

function read(data: any): PlatformFeeComponent[] {
  const list = data?.components;
  return Array.isArray(list) && list.length ? (list as PlatformFeeComponent[]) : DEFAULT_PLATFORM_FEES;
}

export function watchPlatformFees(cb: (c: PlatformFeeComponent[]) => void) {
  return onSnapshot(
    REF(),
    (snap) => cb(read(snap.exists() ? snap.data() : null)),
    (e) => { console.error('watchPlatformFees:', e); cb(DEFAULT_PLATFORM_FEES); },
  );
}

export async function getPlatformFeeComponents(): Promise<PlatformFeeComponent[]> {
  try {
    const snap = await getDoc(REF());
    return read(snap.exists() ? snap.data() : null);
  } catch {
    return DEFAULT_PLATFORM_FEES;
  }
}

export async function savePlatformFees(components: PlatformFeeComponent[]) {
  await setDoc(REF(), { components, updatedAt: serverTimestamp() }, { merge: true });
}

/** Seed the default (disabled) components once, so the admin panel has rows to toggle. */
export async function seedPlatformFeesIfEmpty() {
  const snap = await getDoc(REF());
  if (snap.exists() && Array.isArray(snap.data()?.components)) return;
  await savePlatformFees(DEFAULT_PLATFORM_FEES);
}

function feeApplies(c: PlatformFeeComponent, ctx: FeeContext): boolean {
  switch (c.appliesTo) {
    case 'all': return true;
    case 'express': return ctx.logisticsTier === 'own';
    case 'cod': return ctx.paymentMethod === 'cod';
    case 'bank': return ctx.paymentMethod === 'bank_transfer';
    default: return false;
  }
}

/** Compute the fees charged on one order from the enabled components + context. */
export function computePlatformFees(components: PlatformFeeComponent[], ctx: FeeContext): AppliedFee[] {
  const out: AppliedFee[] = [];
  for (const c of components) {
    if (!c.enabled || !feeApplies(c, ctx)) continue;
    const amount = c.kind === 'pct' ? Math.round((ctx.subtotal * c.value) / 100) : Math.round(c.value);
    if (amount > 0) out.push({ key: c.key, label: c.label, amount });
  }
  return out;
}
