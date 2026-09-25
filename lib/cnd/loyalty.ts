/** CND loyalty tiers — ranked by lifetime spend; higher tiers unlock a discount. */
export interface CndTier { key: string; name: string; icon: string; color: string; min: number; discountPct: number; }
export const TIERS: CndTier[] = [
  { key: 'bronze', name: 'ທອງ ແດງ', icon: '🥉', color: '#B08D57', min: 0, discountPct: 0 },
  { key: 'silver', name: 'ເງິນ', icon: '🥈', color: '#8B95A5', min: 3_000_000, discountPct: 2 },
  { key: 'gold', name: 'ຄຳ', icon: '🥇', color: '#D9A400', min: 10_000_000, discountPct: 5 },
  { key: 'platinum', name: 'ແພລທິນັມ', icon: '💎', color: '#0891B2', min: 30_000_000, discountPct: 8 },
];
export function tierFor(spent: number): { tier: CndTier; next?: CndTier; toNext: number; progress: number } {
  let idx = 0;
  for (let i = TIERS.length - 1; i >= 0; i--) { if (spent >= TIERS[i].min) { idx = i; break; } }
  const tier = TIERS[idx];
  const next = TIERS[idx + 1];
  const toNext = next ? Math.max(0, next.min - spent) : 0;
  const progress = next ? Math.min(1, (spent - tier.min) / (next.min - tier.min)) : 1;
  return { tier, next, toNext, progress };
}
