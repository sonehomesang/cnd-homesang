/**
 * Auto skill tier for a technician, derived from data we ALREADY have (rating +
 * review count). No new subsystem — reviews earn the badge. Later this can also
 * factor in verified licences / completed-job count.
 */
export type TechTier = 'new' | 'experienced' | 'expert';

export function techTier(t: { rating?: number; reviewCount?: number } | null | undefined): TechTier {
  const r = t?.rating ?? 0;
  const n = t?.reviewCount ?? 0;
  if (r >= 4.5 && n >= 20) return 'expert';
  if (n >= 5) return 'experienced';
  return 'new';
}

export const TIER_BADGE: Record<TechTier, { label: string; emoji: string; bg: string; fg: string }> = {
  new:         { label: 'ໃໝ່',      emoji: '🌱', bg: '#ecfdf5', fg: '#065f46' },
  experienced: { label: 'ຊຳນານ',    emoji: '🔧', bg: '#eff6ff', fg: '#1e40af' },
  expert:      { label: 'ຊ່ຽວຊານ',  emoji: '⭐', bg: '#fffbeb', fg: '#92400e' },
};
