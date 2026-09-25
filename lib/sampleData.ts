import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/** A single collection purge rule: keep docs matching `match`, delete the rest. */
interface PurgeRule {
  col: string;
  match: (data: any) => boolean;
}

// seeded sample/mock records carry recognizable markers (see the seed* helpers
// + lib/sampleSeed.ts, which tags every doc with `sample: true`).
const bySample = (d: any) => d.sample === true;
const RULES: PurgeRule[] = [
  { col: 'claims', match: (d) => String(d.orderId ?? '').startsWith('sample-') || String(d.orderNumber ?? '').startsWith('HS-SAMP') || d.shopId === 'sample-shop' },
  { col: 'disputes', match: (d) => String(d.jobId ?? '').startsWith('sample-') },
  { col: 'posts', match: (d) => bySample(d) || String(d.authorId ?? '').startsWith('mock-') },
  { col: 'comments', match: (d) => bySample(d) || String(d.authorId ?? '').startsWith('mock-') },
  // full sample-catalog seed (lib/sampleSeed.ts)
  { col: 'products', match: bySample },
  { col: 'shops', match: bySample },
  { col: 'groupBuys', match: bySample },
  { col: 'reels', match: bySample },
  { col: 'orders', match: bySample },
  { col: 'orderItems', match: bySample },
  { col: 'riders', match: bySample },
];

async function deleteMatching(col: string, match: (d: any) => boolean): Promise<number> {
  const snap = await getDocs(collection(db, col));
  const ids = snap.docs.filter((d) => match(d.data())).map((d) => d.id);
  let n = 0;
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, col, id)));
    await batch.commit();
    n += Math.min(400, ids.length - i);
  }
  return n;
}

/** Delete seeded sample/mock records. Returns per-collection counts. */
export async function purgeSampleData(): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const r of RULES) {
    try {
      result[r.col] = await deleteMatching(r.col, r.match);
    } catch (e) {
      console.error('purge ' + r.col, e);
      result[r.col] = -1;
    }
  }
  return result;
}
