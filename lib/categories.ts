export type CategoryValue =
  | 'electrical'
  | 'plumbing'
  | 'aircon'
  | 'carpenter'
  | 'painter'
  | 'cleaning'
  | 'construction'
  | 'garden'
  | 'moving'
  | 'cctv'
  | 'other';

export interface Category {
  value: CategoryValue;
  lao: string;
  en: string;
  icon: string;
}

export const CATEGORIES: Category[] = [
  { value: 'electrical', lao: 'ໄຟຟ້າ', en: 'Electrical', icon: '⚡' },
  { value: 'plumbing', lao: 'ປະປາ', en: 'Plumbing', icon: '💧' },
  { value: 'aircon', lao: 'ແອ', en: 'A/C', icon: '❄️' },
  { value: 'carpenter', lao: 'ຊ່າງໄມ້', en: 'Carpenter', icon: '🔨' },
  { value: 'painter', lao: 'ທາສີ', en: 'Painter', icon: '🎨' },
  { value: 'cleaning', lao: 'ທຳສະອາດ', en: 'Cleaning', icon: '✨' },
  { value: 'construction', lao: 'ກໍ່ສ້າງ', en: 'Construction', icon: '🏗️' },
  { value: 'garden', lao: 'ສວນ', en: 'Garden', icon: '🌿' },
  { value: 'moving', lao: 'ຍ້າຍຂອງ', en: 'Moving', icon: '📦' },
  { value: 'cctv', lao: 'CCTV', en: 'CCTV', icon: '📹' },
  { value: 'other', lao: 'ອື່ນໆ', en: 'Other', icon: '🔧' },
];

// ===================== LIVE DB SERVICE CATEGORIES =====================
// The built-in CATEGORIES above stay as the canonical 12 (existing job.category /
// specialties slugs depend on them). Admin-added service categories (DB
// `categories` type 'service') are OVERLAID on top so they appear live in the
// pickers without breaking existing data.
import { useSyncExternalStore } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';

// Overlay state (admin-added DB categories + subscribers) is held on globalThis so
// that EVERY copy of this module shares it. The production web export duplicates
// this module across several bundle chunks — startServiceCategories() was observed
// running 6× each with its OWN module-level state — which fragmented the state: the
// instance whose Firestore subscription populated the categories was NOT the one the
// home grid / pickers read from, so admin-added categories never appeared. One
// shared global store collapses those copies into a single source of truth.
interface ServiceCatStore { dbExtra: Category[]; listeners: Set<() => void>; started: boolean; snapshot: Category[]; }
const _store: ServiceCatStore =
  (globalThis as any).__hsServiceCatStore ||
  ((globalThis as any).__hsServiceCatStore = { dbExtra: [], listeners: new Set<() => void>(), started: false, snapshot: CATEGORIES });

// Cached snapshot with a STABLE reference for useSyncExternalStore — its identity
// changes only when the category set actually changes, so React re-renders then.
function recomputeServiceCatSnapshot() {
  _store.snapshot = _store.dbExtra.length ? [...CATEGORIES, ..._store.dbExtra] : CATEGORIES;
}

function slugify(s: string): string {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function mapDbCat(d: any): Category {
  const s = slugify(d.nameEn);
  return {
    value: (s || `svc-${d.id}`) as any,
    lao: d.nameLao || d.nameEn || d.id,
    en: d.nameEn || d.nameLao || d.id,
    icon: d.icon || '🔧',
  };
}

/** Start the DB subscription once (call at app init). Safe to call repeatedly. */
export function startServiceCategories() {
  if (_store.started) return;
  _store.started = true;
  // Subscribe DIRECTLY to Firestore. A previous version used `import('./refdata')`
  // to break a (no-longer-existing) import cycle, but that dynamic import rejects in
  // the production web export (no async chunk is emitted for the already-bundled
  // module), so admin-added categories silently never loaded. Static import + an
  // error handler that surfaces real failures instead of swallowing them.
  const q = query(collection(db, 'categories'), where('type', '==', 'service'));
  onSnapshot(
    q,
    (snap) => {
      const staticVals = new Set(CATEGORIES.map((c) => c.value as string));
      // Dedup ONLY against the built-in slugs (so the seeded duplicates of the
      // built-ins collapse). Do NOT drop by English name — an admin-added
      // category that happens to share an en name must still appear.
      _store.dbExtra = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((c) => c.active !== false)
        .map(mapDbCat)
        .filter((c) => !staticVals.has(c.value as string));
      recomputeServiceCatSnapshot();
      _store.listeners.forEach((fn) => fn());
    },
    (e) => { console.error('service categories subscription:', e); _store.started = false; },
  );
}

/** Canonical 12 + admin-added DB service categories. */
export function allServiceCategories(): Category[] {
  return _store.snapshot;
}

function subscribeServiceCats(onChange: () => void): () => void {
  startServiceCategories();
  _store.listeners.add(onChange);
  return () => { _store.listeners.delete(onChange); };
}

/** Reactive list for pickers — re-renders when admin adds/edits a category. */
export function useServiceCategories(): Category[] {
  // useSyncExternalStore re-reads the snapshot right AFTER subscribing, so it never
  // misses an update that lands between render and effect (the race that left admin
  // categories off the grid). Third arg mirrors the client snapshot for web export.
  return useSyncExternalStore(subscribeServiceCats, () => _store.snapshot, () => _store.snapshot);
}

export function getCategory(value: string): Category | undefined {
  return allServiceCategories().find((c) => c.value === value);
}

/** Ionicons name + colour per category (for the home service grid). */
export const CAT_ICON: Record<string, { name: string; color: string }> = {
  electrical: { name: 'flash', color: '#F59E0B' },
  plumbing: { name: 'water', color: '#0EA5E9' },
  aircon: { name: 'snow', color: '#38BDF8' },
  carpenter: { name: 'hammer', color: '#DC2626' },
  painter: { name: 'color-palette', color: '#8B5CF6' },
  cleaning: { name: 'sparkles', color: '#10B981' },
  construction: { name: 'construct', color: '#EA580C' },
  garden: { name: 'leaf', color: '#16A34A' },
  moving: { name: 'cube', color: '#CA8A04' },
  cctv: { name: 'videocam', color: '#475569' },
  other: { name: 'build', color: '#64748B' },
};
