// ===================== FRESHNESS RANKING ENGINE =====================
// Shared, PURE (no React / no Firebase) helper for ranking any feed so brand-new
// records surface first, then age out into an admin-chosen order. Used by the
// product grid first, then replicated to techs / posts / jobs / members.
//
//   age < freshDays  → "fresh": always on top, newest-first, gets a "ໃໝ່" badge.
//   age ≥ freshDays  → ordered by `mode`:
//       'random'   → shuffled, but STABLE within a calendar day (rotates daily),
//                    so every item gets fair exposure without reshuffling on
//                    every render.
//       'priority' → by an admin-controlled priority score (desc), then newest.

export type FeedMode = 'random' | 'priority';

export interface FeedRankConfig {
  freshDays: number; // days a record counts as "new"
  mode: FeedMode; // ordering AFTER the fresh window
}

export const DEFAULT_FEED_CONFIG: FeedRankConfig = { freshDays: 15, mode: 'random' };

/** Feed identifiers used as keys in settings.feedRanking. */
export type FeedKey = 'products' | 'techs' | 'posts' | 'jobs' | 'members';

export const FEED_KEYS: { key: FeedKey; lao: string; icon: string }[] = [
  { key: 'products', lao: 'ສິນຄ້າ', icon: '🛒' },
  { key: 'techs', lao: 'ບໍລິການ / ຊ່າງ', icon: '🛠️' },
  { key: 'members', lao: 'ສະມາຊິກໃໝ່', icon: '👥' },
  { key: 'posts', lao: 'ໂພສ / ປະກາດ', icon: '📣' },
  { key: 'jobs', lao: 'ປະກາດວຽກ', icon: '📋' },
];

const DAY_MS = 86_400_000;

/** True while a record is still within its "new" window. */
export function isFresh(createdAt: number, freshDays: number, now: number = Date.now()): boolean {
  return createdAt > 0 && createdAt >= now - Math.max(0, freshDays) * DAY_MS;
}

// mulberry32 — tiny deterministic PRNG so a given seed always yields the same order.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Rank a feed by freshness. Returns a NEW array (does not mutate input).
 * @param opts.createdAt  ms-epoch creation time of an item (0/absent → treated as old)
 * @param opts.priority   optional admin priority score for 'priority' mode (higher first)
 */
export function rankByFreshness<T>(
  items: T[],
  cfg: FeedRankConfig,
  opts: {
    createdAt: (t: T) => number;
    priority?: (t: T) => number;
    now?: number;
    // When provided, the OLD bucket keeps this order instead of random/priority
    // (used by the "nearby" feeds to keep distance sorting for older items).
    oldCompare?: (a: T, b: T) => number;
  },
): T[] {
  const now = opts.now ?? Date.now();
  const freshDays = cfg.freshDays > 0 ? cfg.freshDays : DEFAULT_FEED_CONFIG.freshDays;
  const cutoff = now - freshDays * DAY_MS;

  const fresh: T[] = [];
  const old: T[] = [];
  for (const it of items) {
    const c = opts.createdAt(it);
    if (c > 0 && c >= cutoff) fresh.push(it);
    else old.push(it);
  }
  fresh.sort((a, b) => opts.createdAt(b) - opts.createdAt(a)); // newest-first

  const older = opts.oldCompare
    ? old.slice().sort(opts.oldCompare)
    : cfg.mode === 'priority'
    ? old
        .slice()
        .sort(
          (a, b) =>
            (opts.priority?.(b) ?? 0) - (opts.priority?.(a) ?? 0) ||
            opts.createdAt(b) - opts.createdAt(a),
        )
    : seededShuffle(old, Math.floor(now / DAY_MS)); // stable within the day

  return [...fresh, ...older];
}
