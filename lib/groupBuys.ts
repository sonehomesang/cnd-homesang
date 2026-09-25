import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { notify } from './notifications';

/**
 * Y3 Slice A — group buy (ຊື້ເປັນກຸ່ມ). A shop/admin opens a campaign on one of
 * its products: reach `target` joiners before `endsAt` and the `groupPrice`
 * unlocks for everyone. Joining is a FREE commitment (no upfront payment,
 * manual-first — the platform never holds funds); when the target is hit every
 * joiner is notified and can buy at the group price (flows into cart/checkout
 * like a flash deal). Missed the target by the deadline → the campaign simply
 * expires. Membership is the trust anchor: count = joinerIds.length (derived,
 * never a spoofable separate counter), and rules only let a caller add their OWN
 * uid.
 */
export interface GroupBuy {
  id: string;
  productId: string;
  shopId: string;
  // product snapshot (so the card renders without a product read)
  productName: string;
  productImage?: string;
  productUnit?: string;
  origPrice: number;
  groupPrice: number;
  target: number;
  endsAt: number; // ms
  joinerIds: string[];
  status?: 'open' | 'unlocked'; // stored hint; real state is derived (see gbState)
  createdBy: string;
  createdAt: number;
}

export interface CreateGroupBuyInput {
  productId: string;
  shopId: string;
  productName: string;
  productImage?: string;
  productUnit?: string;
  origPrice: number;
  groupPrice: number;
  target: number;
  endsAt: number;
  createdBy: string;
}

export type GroupBuyState = {
  state: 'open' | 'unlocked' | 'expired';
  count: number;
  remaining: number;
  pct: number;
  unlocked: boolean;
  expired: boolean;
};

/** Derived, authoritative campaign state from its joiner list + clock. */
export function gbState(gb: Pick<GroupBuy, 'joinerIds' | 'target' | 'endsAt'>, now = Date.now()): GroupBuyState {
  const count = gb.joinerIds?.length ?? 0;
  const unlocked = count >= gb.target;
  const expired = !unlocked && now >= gb.endsAt;
  return {
    state: unlocked ? 'unlocked' : expired ? 'expired' : 'open',
    count,
    remaining: Math.max(0, gb.target - count),
    pct: Math.min(100, Math.round((count / Math.max(1, gb.target)) * 100)),
    unlocked,
    expired,
  };
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}
function mapGB(id: string, data: any): GroupBuy {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : typeof data.createdAt === 'number' ? data.createdAt : 0;
  return { id, ...data, joinerIds: data.joinerIds ?? [], createdAt } as GroupBuy;
}

/** Live campaigns (before their deadline): open OR already-unlocked. Near-target first. */
export function watchOpenGroupBuys(cb: (g: GroupBuy[]) => void, now = Date.now()) {
  return onSnapshot(
    collection(db, 'groupBuys'),
    (snap) => {
      const list = snap.docs
        .map((d) => mapGB(d.id, d.data()))
        .filter((g) => now < g.endsAt); // drop expired (past deadline & unmet)
      list.sort((a, b) => {
        const ra = gbState(a, now).remaining;
        const rb = gbState(b, now).remaining;
        if (ra !== rb) return ra - rb; // closest to unlocking first
        return a.endsAt - b.endsAt; // then soonest-ending
      });
      cb(list);
    },
    (e) => { console.error('watchOpenGroupBuys:', e); cb([]); },
  );
}

/** The live campaign for one product (most recent), or null. */
export function watchGroupBuyForProduct(productId: string, cb: (g: GroupBuy | null) => void, now = Date.now()) {
  return onSnapshot(
    query(collection(db, 'groupBuys'), where('productId', '==', productId)),
    (snap) => {
      const live = snap.docs
        .map((d) => mapGB(d.id, d.data()))
        .filter((g) => now < g.endsAt)
        .sort((a, b) => b.createdAt - a.createdAt);
      cb(live[0] ?? null);
    },
    (e) => { console.error('watchGroupBuyForProduct:', e); cb(null); },
  );
}

/** Campaigns opened for one shop (all, newest-first) — for the shop dashboard. */
export function watchGroupBuysByShop(shopId: string, cb: (g: GroupBuy[]) => void) {
  return onSnapshot(
    query(collection(db, 'groupBuys'), where('shopId', '==', shopId)),
    (snap) => {
      const list = snap.docs.map((d) => mapGB(d.id, d.data()));
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchGroupBuysByShop:', e); cb([]); },
  );
}

export async function createGroupBuy(input: CreateGroupBuyInput): Promise<string> {
  const ref = await addDoc(
    collection(db, 'groupBuys'),
    strip({ ...input, joinerIds: [], status: 'open', createdAt: serverTimestamp() }),
  );
  return ref.id;
}

export async function closeGroupBuy(id: string) {
  // end it now (set deadline to the past); campaign drops out of every live query
  await updateDoc(doc(db, 'groupBuys', id), { endsAt: 0 });
}

/**
 * Join a campaign (adds only the caller's uid). Runs in a transaction so the
 * "did THIS join cross the target?" check is race-free; the crossing joiner
 * flips status to 'unlocked' and notifies every joiner. Returns the resulting
 * state ('already' if the caller had joined before).
 */
export async function joinGroupBuy(
  gb: Pick<GroupBuy, 'id' | 'productId' | 'productName'>,
  uid: string,
): Promise<'joined' | 'unlocked' | 'already'> {
  const ref = doc(db, 'groupBuys', gb.id);
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('group buy not found');
    const data = snap.data() as any;
    const ids: string[] = data.joinerIds ?? [];
    if (ids.includes(uid)) return { outcome: 'already' as const, joinerIds: ids };
    const nextCount = ids.length + 1;
    const crossed = nextCount >= data.target && ids.length < data.target;
    tx.update(ref, strip({ joinerIds: arrayUnion(uid), status: crossed ? 'unlocked' : data.status }));
    return { outcome: crossed ? ('unlocked' as const) : ('joined' as const), joinerIds: [...ids, uid] };
  });

  if (result.outcome === 'unlocked') {
    // best-effort: tell every joiner the deal is live (allowed: internal link + capped title)
    await Promise.all(
      result.joinerIds.map((id) =>
        notify(id, {
          type: 'group_buy_unlocked',
          title: `🎉 ປົດລັອກແລ້ວ! ${gb.productName}`,
          body: 'ຊື້ເປັນກຸ່ມ ຄົບເປົ້າແລ້ວ — ຊື້ໄດ້ລາຄາກຸ່ມເລີຍ',
          link: `/products/${gb.productId}`,
        }),
      ),
    );
  }
  return result.outcome;
}

/** hh:mm:ss / "N ມື້" remaining until endsAt (empty when past). */
export function gbCountdown(endsAt: number, now = Date.now()): string {
  let sec = Math.floor((endsAt - now) / 1000);
  if (sec <= 0) return '';
  const days = Math.floor(sec / 86400);
  if (days >= 1) return `${days} ມື້`;
  sec = sec % 86400;
  const h = Math.floor(sec / 3600); sec -= h * 3600;
  const m = Math.floor(sec / 60); sec -= m * 60;
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}
