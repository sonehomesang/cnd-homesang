// ── App-wide "sample / mock data" convention ─────────────────────────────────
// Any record seeded as a demo (so a new user sees a populated screen instead of
// an empty one) carries __mock: true. The UI renders <MockBadge/> next to it so
// real data is never confused with sample data, and a one-tap cleanup deletes
// everything where __mock == true. Use this for EVERY feature that ships seeded
// demo content — it is the pattern across the whole app.
//
//   import { stampMock, isMock, MOCK_FLAG } from '@/lib/mock';
//   await addDoc(col, stampMock({ ...fields }));          // write
//   {isMock(rec) && <MockBadge />}                        // show
//   query(col, where(MOCK_FLAG, '==', true))              // clean up

import { collection, deleteDoc, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { useAppSettings } from './appSettings';

export const MOCK_FLAG = '__mock' as const;

export function isMock(o: any): boolean {
  return !!(o && o[MOCK_FLAG] === true);
}

/** Stamp a payload as sample data before writing it. */
export function stampMock<T extends object>(o: T): T & { __mock: true } {
  return { ...o, [MOCK_FLAG]: true } as T & { __mock: true };
}

// ── Every collection that gets __mock-stamped records (keep in sync when a new
//    feature adds a mock seeder) — used by the admin app-wide clear + count. ──
export const MOCK_COLLECTIONS = [
  'orgVendors', 'rfqs', 'orgInvoices',
  'mkContent', 'mkScripts', 'mkAssets', 'mkPartners', 'mkCampaigns',
  'cndCategories', 'cndProducts', 'cndTechs', 'cndOrders', 'cndShifts', 'cndBranches',
  'cndRoles', 'cndStaff', 'cndReturns', 'cndSuppliers', 'cndPurchaseOrders', 'cndExpenses',
  'cndCoupons', 'cndBanners', 'cndZones', 'cndBanks',
  'coupons', 'techQuizQuestions',
] as const;

/** Go-live gate: are the 🧪 seed buttons available? Default ON until an admin
 *  turns mock mode OFF (settings/app.mockEnabled === false) for launch. */
export function useMockEnabled(): boolean {
  const s = useAppSettings();
  return (s as any)?.mockEnabled !== false;
}

/** Admin: delete EVERY __mock record across all mock collections. Returns the
 *  count removed. (Admin bypasses per-doc rules, so the org-scoped collections
 *  are covered too.) */
export async function clearAllMockData(): Promise<number> {
  let removed = 0;
  for (const col of MOCK_COLLECTIONS) {
    try {
      const snap = await getDocs(query(collection(db, col), where(MOCK_FLAG, '==', true)));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      removed += snap.size;
    } catch (e) { console.error('clearAllMockData', col, e); }
  }
  return removed;
}

/** Admin: total count of __mock records across the app (for the panel display). */
export async function countAllMockData(): Promise<number> {
  let total = 0;
  for (const col of MOCK_COLLECTIONS) {
    try { total += (await getCountFromServer(query(collection(db, col), where(MOCK_FLAG, '==', true)))).data().count; }
    catch { /* ignore per-collection */ }
  }
  return total;
}
