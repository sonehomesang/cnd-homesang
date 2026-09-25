import { collection, deleteDoc, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_FLAG } from './mock';
import { seedMkContentSample } from './mkContent';
import { seedMkScriptsSample } from './mkScripts';
import { seedMkAssetsSample } from './mkAssets';
import { seedMkPartnersSample } from './mkPartners';
import { seedMkCampaignsSample } from './mkCampaigns';

/**
 * One-tap MK Plan sample-data — seeds every module (content / scripts / media /
 * partners / campaigns) so the platform isn't empty on first open. Every seeded
 * record is stamped __mock (see lib/mock.ts) → shows the 🧪 ຕົວຢ່າງ badge and is
 * removable in one tap. Each module is only seeded when empty (its seeder self-
 * guards on the count passed in).
 */
const MK_COLLECTIONS = ['mkContent', 'mkScripts', 'mkAssets', 'mkPartners', 'mkCampaigns'] as const;

async function countOf(col: string): Promise<number> {
  try { return (await getCountFromServer(query(collection(db, col)))).data().count; } catch { return 0; }
}

export async function seedAllMk(): Promise<number> {
  const [c, s, a, p, k] = await Promise.all(MK_COLLECTIONS.map(countOf));
  const results = await Promise.all([
    seedMkContentSample(c),
    seedMkScriptsSample(s),
    seedMkAssetsSample(a),
    seedMkPartnersSample(p),
    seedMkCampaignsSample(k),
  ]);
  return results.reduce((n, x) => n + x, 0);
}

/** Delete every sample (__mock) record across all MK collections. */
export async function clearAllMk(): Promise<number> {
  let removed = 0;
  for (const col of MK_COLLECTIONS) {
    try {
      const snap = await getDocs(query(collection(db, col), where(MOCK_FLAG, '==', true)));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      removed += snap.size;
    } catch (e) { console.error('clearAllMk', col, e); }
  }
  return removed;
}

export async function hasMkMock(): Promise<boolean> {
  for (const col of MK_COLLECTIONS) {
    try {
      const n = (await getCountFromServer(query(collection(db, col), where(MOCK_FLAG, '==', true)))).data().count;
      if (n > 0) return true;
    } catch { /* ignore */ }
  }
  return false;
}
