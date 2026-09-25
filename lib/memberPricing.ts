/**
 * Member / account-group pricing — negotiated discounts by buyer group
 * (ຊ່າງ / ບໍລິສັດ-ຮ້ານຄ້າ / ຄົນທົ່ວໄປ). Every % is admin/shop-configurable (never
 * hardcoded) and resolved in LAYERS, most-specific first, so each shop and each
 * product can differ:
 *     1. per-PRODUCT override   product.memberDiscounts[]
 *     2. per-SHOP rule          shop.memberDiscountRules[]  (optionally by category)
 *     3. GLOBAL default         settings.memberDiscounts[]
 * The discount is "best price wins" vs any active flash-sale / group-buy price
 * (never stacked below the lowest), applied at checkout as its own line and
 * recorded on the order. Admin buyers get no member discount (they are staff).
 */

/** A product-level override: a flat % for one group. */
export interface MemberDiscount {
  group: string;
  pct: number;
}

/** A shop / global rule: % for a group, optionally scoped to a product category. */
export interface MemberDiscountRule {
  group: string;
  category?: string; // empty = every category
  pct: number;
}

/** Buyer-facing groups eligible for member pricing (admin excluded). */
export const MEMBER_GROUPS: { key: string; label: string; icon: string }[] = [
  { key: 'technician', label: 'ຊ່າງ - ຜູ້ໃຫ້ບໍລິການ', icon: '🛠️' },
  { key: 'corporation', label: 'ບໍລິສັດ - ຮ້ານຄ້າ', icon: '🏢' },
  { key: 'general', label: 'ຜູ້ໃຊ້ທົ່ວໄປ', icon: '🏠' },
];

export function memberGroupLabel(key: string): string {
  return MEMBER_GROUPS.find((g) => g.key === key)?.label ?? key;
}
export function memberGroupIcon(key: string): string {
  return MEMBER_GROUPS.find((g) => g.key === key)?.icon ?? '👤';
}

/**
 * The buyer's account group (mirrors lib/admin.ts groupOf): explicit `group`
 * field wins, else derived from RBAC roles. Accepts a minimal profile shape to
 * avoid an import cycle.
 */
export function buyerGroup(profile?: { group?: string; roles?: string[]; isSuperAdmin?: boolean } | null): string {
  if (!profile) return 'general';
  if (profile.group) return profile.group;
  const r = profile.roles ?? [];
  if (profile.isSuperAdmin || r.includes('admin') || r.includes('cs_admin') || r.includes('cp_admin')) return 'admin';
  if (r.includes('shop')) return 'corporation';
  if (r.includes('technician')) return 'technician';
  return 'general';
}

/**
 * Resolve the member discount % for (product, group), layered most-specific
 * first. Within a layer, if several entries match the group, the highest % wins;
 * shop rules prefer a category-specific match over a generic one.
 */
export function resolveMemberPct(
  product: { category?: string; memberDiscounts?: MemberDiscount[] },
  group: string,
  shopRules?: MemberDiscountRule[],
  globalRules?: MemberDiscountRule[],
): { pct: number; source: 'product' | 'shop' | 'global' | 'none' } {
  if (!group || group === 'admin') return { pct: 0, source: 'none' };

  const pd = (product.memberDiscounts ?? []).filter((d) => d.group === group && d.pct > 0);
  if (pd.length) return { pct: Math.max(...pd.map((d) => d.pct)), source: 'product' };

  const sr = (shopRules ?? []).filter((r) => r.group === group && r.pct > 0 && (!r.category || r.category === product.category));
  if (sr.length) {
    const cat = sr.filter((r) => r.category);
    const pick = cat.length ? cat : sr;
    return { pct: Math.max(...pick.map((r) => r.pct)), source: 'shop' };
  }

  const gr = (globalRules ?? []).filter((r) => r.group === group && r.pct > 0 && (!r.category || r.category === product.category));
  if (gr.length) return { pct: Math.max(...gr.map((r) => r.pct)), source: 'global' };

  return { pct: 0, source: 'none' };
}

/**
 * Effective unit price for a member: the lower of the current price (which may
 * already be flash/group discounted) and the member price off the ORIGINAL
 * price. Never stacks below the best available.
 */
export function memberUnitPrice(currentUnit: number, origPrice: number, pct: number): number {
  if (!(pct > 0)) return currentUnit;
  const mp = Math.round(origPrice * (1 - pct / 100));
  return Math.max(0, Math.min(currentUnit, mp));
}
