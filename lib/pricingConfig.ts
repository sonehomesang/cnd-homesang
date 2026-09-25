import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Back-office pricing / commission engine config (single doc settings/pricing).
 * Every model is built as a toggle so the owner can experiment with which
 * mechanism fits — see the pricing-quotation phase notes.
 */
export interface PricingConfig {
  // A — price model (either or both)
  wholesaleEnabled: boolean; // A1: customer sees retail; (retail - cost) = margin
  commissionEnabled: boolean; // A2: shop pays a % commission on the sale
  defaultCommissionPct: number; // used when a product has no commissionPct
  // B — who gets the margin/commission (% to HomeSang, remainder to the technician)
  marginToHomesangPct: number; // 100 = all HomeSang, 0 = all technician, 50 = split
  // C — visibility of the back-office numbers
  hideFromCustomer: boolean;
  hideFromTech: boolean;
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  wholesaleEnabled: false,
  commissionEnabled: false,
  defaultCommissionPct: 5,
  marginToHomesangPct: 100,
  hideFromCustomer: true,
  hideFromTech: true,
};

export function watchPricingConfig(cb: (c: PricingConfig) => void) {
  return onSnapshot(
    doc(db, 'settings', 'pricing'),
    (snap) => {
      cb(snap.exists() ? { ...DEFAULT_PRICING_CONFIG, ...(snap.data() as any) } : DEFAULT_PRICING_CONFIG);
    },
    () => cb(DEFAULT_PRICING_CONFIG),
  );
}

/** One-shot read of the pricing config (for non-reactive callers like checkout). */
export async function getPricingConfig(): Promise<PricingConfig> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'pricing'));
    return snap.exists() ? { ...DEFAULT_PRICING_CONFIG, ...(snap.data() as any) } : DEFAULT_PRICING_CONFIG;
  } catch {
    return DEFAULT_PRICING_CONFIG;
  }
}

export async function savePricingConfig(c: PricingConfig) {
  await setDoc(doc(db, 'settings', 'pricing'), { ...c, updatedAt: serverTimestamp() }, { merge: true });
}

/** A shop-level commission rule: category × customer-type → percent. */
export interface CommissionRule {
  category?: string; // product category (nameEn) or empty/ທັງໝົດ = any
  customer?: string; // user-group key or empty/ທັງໝົດ = any
  pct: number;
}

const ANY_VALUES = ['', 'all', 'ທັງໝົດ', 'ທັງ ໝົດ'];
const isAny = (v: unknown) => v == null || ANY_VALUES.includes(String(v));

/**
 * Resolve the commission % for a product, layered most-specific → broad:
 *   1. per-product override (product.commissionPct)
 *   2. shop rule — best match on category (+ customer type)
 *   3. global default (cfg.defaultCommissionPct)
 */
export function resolveCommissionPct(
  product: { category?: string; commissionPct?: number | null },
  rules: CommissionRule[] | undefined,
  customerType: string | undefined,
  cfg: { defaultCommissionPct: number },
): { pct: number; source: 'product' | 'rule' | 'default' } {
  if (product.commissionPct != null) return { pct: product.commissionPct, source: 'product' };
  if (rules && rules.length) {
    let best: CommissionRule | null = null;
    let bestScore = -1;
    for (const r of rules) {
      const catOk = isAny(r.category) || r.category === product.category;
      const custOk = isAny(r.customer) || r.customer === customerType;
      if (!catOk || !custOk) continue;
      const score = (isAny(r.category) ? 0 : 2) + (isAny(r.customer) ? 0 : 1);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (best) return { pct: best.pct, source: 'rule' };
  }
  return { pct: cfg.defaultCommissionPct, source: 'default' };
}

/** One quote line's back-office economics (a partner-shop material). */
export interface LineEconomics {
  retail: number; // qty * unitPrice (what the customer pays)
  cost: number; // qty * costPrice (wholesale)
  commission: number; // commission charged to the shop
}

/**
 * Compute margin for a set of quote lines under the active config.
 * `lines` carry optional costPrice / commissionPct (set when pulled from a
 * partner shop). Returns the total margin and how it splits.
 */
export function computeMargin(
  lines: { qty: number; unitPrice: number; costPrice?: number; commissionPct?: number }[],
  cfg: PricingConfig,
) {
  let margin = 0;
  for (const l of lines) {
    const retail = (l.qty || 0) * (l.unitPrice || 0);
    if (cfg.wholesaleEnabled && l.costPrice != null) {
      margin += retail - (l.qty || 0) * l.costPrice;
    }
    if (cfg.commissionEnabled) {
      const pct = l.commissionPct ?? cfg.defaultCommissionPct;
      margin += Math.round((retail * pct) / 100);
    }
  }
  const toHomesang = Math.round((margin * cfg.marginToHomesangPct) / 100);
  const toTech = margin - toHomesang;
  return { margin, toHomesang, toTech };
}
