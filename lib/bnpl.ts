/**
 * Product BNPL / installment (ຜ່ອນ ສິນຄ້າ) — the money-maker built on the
 * customer wallet. This module is PURE: config shape, schedule math and the
 * eligibility check. No Firestore / money movement lives here — that's the
 * startBnpl / payInstallment Cloud Functions (later phases), which are the only
 * things allowed to touch a balance or a schedule, so nothing can be forged.
 *
 * Two modes (admin-selectable, both may be offered):
 *  - 'layaway' (ຈອງ-ຜ່ອນ-ຮັບ): pay to full THEN ship. Zero risk.
 *  - 'bnpl'    (ຮັບ ກ່ອນ ຜ່ອນ): down payment → ship now → pay the rest. Risk-bearing.
 *
 * Fee payer: 'customer' (the service fee is added to what the buyer pays) or
 * 'merchant' (0% to the buyer — the shop/platform absorbs it to lift sales).
 */

export type BnplMode = 'layaway' | 'bnpl';
export type BnplFeePayer = 'customer' | 'merchant';

/** One installment tenor the admin offers, with its service fee. */
export interface BnplPlan {
  tenor: number;   // number of monthly installments (e.g. 3 / 6 / 12)
  feePct: number;  // service fee % of the price (0 = interest-free promo)
  enabled?: boolean;
}

export interface BnplConfig {
  enabled: boolean;
  modes: BnplMode[];        // which modes are offered (both allowed)
  defaultMode: BnplMode;    // used when a product doesn't override
  plans: BnplPlan[];
  downPct: number;          // down-payment % (applied in 'bnpl' mode)
  feePayer: BnplFeePayer;
  creditLimitKip: number;   // max total outstanding per customer
  minOrderKip: number;      // order price must be ≥ this to qualify
  maxOrderKip: number;      // …and ≤ this
  minAccountAgeDays: number;
  minCompletedOrders: number; // required for 'bnpl' (ship-first) only
  graceDays: number;        // days after a due date before a late fee applies
  lateFeePct: number;       // % of the installment, per overdue installment
  freezeAfterDays: number;  // overdue > N days → no new BNPL until cleared
}

export const DEFAULT_BNPL: BnplConfig = {
  enabled: false,
  modes: ['layaway', 'bnpl'],
  defaultMode: 'bnpl',
  plans: [
    { tenor: 3, feePct: 0 },
    { tenor: 6, feePct: 3 },
    { tenor: 12, feePct: 6 },
  ],
  downPct: 20,
  feePayer: 'customer',
  creditLimitKip: 10_000_000,
  minOrderKip: 300_000,
  maxOrderKip: 20_000_000,
  minAccountAgeDays: 30,
  minCompletedOrders: 1,
  graceDays: 3,
  lateFeePct: 2,
  freezeAfterDays: 14,
};

export type BnplInstallmentStatus = 'upcoming' | 'due' | 'paid' | 'overdue';

export interface BnplInstallment {
  seq: number;      // 1..tenor
  dueAt: number;    // ms
  amount: number;   // principal + spread fee for this installment
  status: BnplInstallmentStatus;
  paidAt?: number;
  spendId?: string;    // the walletSpends id that paid it (traceability)
  lateFee?: number;    // accrued late fee on this installment
  remindStage?: number; // 0/1/2/3 — how far the reminder ladder has fired (sweep)
}

/** A priced-out plan preview (no dates yet — those are stamped at start time). */
export interface BnplQuote {
  mode: BnplMode;
  tenor: number;
  price: number;
  down: number;         // paid now (0 in layaway)
  feeTotal: number;     // service fee the buyer pays (0 when merchant-funded)
  financed: number;     // amount spread across the installments (incl. any customer-fee)
  perMonth: number;     // representative monthly amount (first installments)
  amounts: number[];    // exact installment amounts, length = tenor (last absorbs rounding)
  total: number;        // total the buyer pays (down + all installments) = price + feeTotal
}

const round = (n: number) => Math.round(n);
export const DAY_MS = 86_400_000;
const MONTH_MS = 30 * DAY_MS;

/** Price out one plan for a product at `price`, in a given mode. Pure math. */
export function computeQuote(price: number, plan: BnplPlan, cfg: BnplConfig, mode: BnplMode): BnplQuote {
  const p = Math.max(0, round(price));
  const tenor = Math.max(1, Math.floor(plan.tenor));
  // down payment applies in ship-first mode; layaway is pure installments
  const down = mode === 'bnpl' ? round((p * cfg.downPct) / 100) : 0;
  // the buyer only pays the fee when the customer funds it
  const feeTotal = cfg.feePayer === 'customer' ? round((p * plan.feePct) / 100) : 0;
  const financed = Math.max(0, p - down) + feeTotal;
  // even split, last installment absorbs the rounding remainder
  const base = Math.floor(financed / tenor);
  const amounts = Array.from({ length: tenor }, (_, i) =>
    i === tenor - 1 ? financed - base * (tenor - 1) : base,
  );
  return {
    mode, tenor, price: p, down, feeTotal, financed,
    perMonth: amounts[0] ?? 0,
    amounts,
    total: down + financed,
  };
}

/** Stamp due dates onto a quote's amounts → a concrete schedule.
 *  Installment `seq` is due `seq` months after `startMs` (down is paid at start). */
export function buildBnplSchedule(quote: BnplQuote, startMs: number): BnplInstallment[] {
  return quote.amounts.map((amount, i) => ({
    seq: i + 1,
    dueAt: startMs + (i + 1) * MONTH_MS,
    amount,
    status: 'upcoming' as BnplInstallmentStatus,
  }));
}

/** The cheapest per-month across the offered plans — for the product-page badge. */
export function bnplFromPerMonth(price: number, cfg: BnplConfig, mode: BnplMode): { perMonth: number; tenor: number } | null {
  if (!cfg.enabled || price < cfg.minOrderKip || price > cfg.maxOrderKip) return null;
  const enabled = cfg.plans.filter((pl) => pl.enabled !== false);
  if (!enabled.length) return null;
  let best: { perMonth: number; tenor: number } | null = null;
  for (const pl of enabled) {
    const q = computeQuote(price, pl, cfg, mode);
    if (!best || q.perMonth < best.perMonth) best = { perMonth: q.perMonth, tenor: q.tenor };
  }
  return best;
}

export interface BnplEligibilityInput {
  accountCreatedAt?: number;  // ms
  completedOrders: number;
  outstandingKip: number;     // sum of the customer's active-BNPL remaining balance
  hasOverdue: boolean;
  orderAmount: number;
  mode: BnplMode;
}

export interface BnplEligibility {
  ok: boolean;
  reasons: string[]; // Lao messages for the UI (empty when ok)
}

/** Gate check — mirrored server-side by startBnpl (the authoritative one). */
export function bnplEligibility(cfg: BnplConfig, input: BnplEligibilityInput, now: number): BnplEligibility {
  const reasons: string[] = [];
  if (!cfg.enabled) reasons.push('ຜ່ອນ ສິນຄ້າ ຍັງ ບໍ່ ເປີດ ໃຫ້ ບໍລິການ');
  if (!cfg.modes.includes(input.mode)) reasons.push('ໂໝດ ຜ່ອນ ນີ້ ບໍ່ ເປີດ');
  if (input.orderAmount < cfg.minOrderKip) reasons.push(`ຍອດ ຕ້ອງ ≥ ${cfg.minOrderKip.toLocaleString('en-US')} ກີບ`);
  if (input.orderAmount > cfg.maxOrderKip) reasons.push(`ຍອດ ຕ້ອງ ≤ ${cfg.maxOrderKip.toLocaleString('en-US')} ກີບ`);
  const ageDays = input.accountCreatedAt ? (now - input.accountCreatedAt) / DAY_MS : 0;
  if (ageDays < cfg.minAccountAgeDays) reasons.push(`ບັນຊີ ຕ້ອງ ອາຍຸ ≥ ${cfg.minAccountAgeDays} ວັນ`);
  // "ship first" carries risk → require a track record; layaway is open to all
  if (input.mode === 'bnpl' && input.completedOrders < cfg.minCompletedOrders) {
    reasons.push(`ຕ້ອງ ມີ ປະຫວັດ ຊື້ ສຳເລັດ ≥ ${cfg.minCompletedOrders} ຄັ້ງ`);
  }
  if (input.hasOverdue) reasons.push('ມີ ງວດ ຄ້າງ ຊຳລະ ຢູ່ — ກະລຸນາ ຊຳລະ ກ່ອນ');
  if (input.outstandingKip + input.orderAmount > cfg.creditLimitKip) {
    reasons.push(`ເກີນ ວົງເງິນ ຜ່ອນ (${cfg.creditLimitKip.toLocaleString('en-US')} ກີບ)`);
  }
  return { ok: reasons.length === 0, reasons };
}

export const BNPL_MODE_LABEL: Record<BnplMode, string> = {
  layaway: 'ຈອງ-ຜ່ອນ-ຮັບ',
  bnpl: 'ຮັບ ກ່ອນ ຜ່ອນ',
};

// ── client → server ─────────────────────────────────────────────────────────
// Everything money-moving is a server callable; these are thin wrappers.
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface StartBnplInput {
  productId: string;
  qty: number;
  variantLabel?: string;
  tenor: number;
  mode: BnplMode;
  autopay: boolean;
  deliveryMethod: 'delivery' | 'pickup';
  deliveryAddress?: string;
  customerPhone?: string;
  requestId?: string; // idempotency key — a retry with the same id won't re-charge
}

/** Start an installment purchase. The server validates eligibility, prices the
 *  schedule, takes the down payment and creates the order — all authoritative. */
export async function startBnpl(input: StartBnplInput): Promise<{ orderId: string; down: number }> {
  const res: any = await httpsCallable(functions, 'startBnpl')(input);
  return { orderId: res?.data?.orderId ?? '', down: res?.data?.down ?? 0 };
}

/** Pay a single installment from the wallet (server-verified). */
export async function payBnplInstallment(orderId: string, seq: number): Promise<any> {
  const res: any = await httpsCallable(functions, 'payInstallment')({ orderId, seq });
  return res?.data;
}

/** Pay off the whole remaining balance early — waives the unpaid fee portion. */
export async function payoffBnpl(orderId: string): Promise<any> {
  const res: any = await httpsCallable(functions, 'payInstallment')({ orderId, payoff: true });
  return res?.data;
}

/** Live display status for one installment (colour-coding). */
export function installmentDisplayStatus(inst: BnplInstallment, now: number, graceDays: number): BnplInstallmentStatus {
  if (inst.status === 'paid') return 'paid';
  if (now > inst.dueAt + graceDays * DAY_MS) return 'overdue';
  if (now >= inst.dueAt) return 'due';
  return 'upcoming';
}
