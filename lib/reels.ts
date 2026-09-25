import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { VideoSource } from './learnClips';

/**
 * Y2 Slice B — shoppable short-video feed. A reel is a seller-posted short video
 * (YouTube/FB link or uploaded file, played via the shared VideoEmbed) with an
 * optional attached catalog product (snapshot), so viewers buy straight from the
 * video. Reuses the LearnClips video helpers + the Slice-A product-attach shape.
 */
export interface Reel {
  id: string;
  authorId: string;
  authorName: string;
  authorImage?: string;
  caption?: string;
  videoType: VideoSource;
  videoUrl: string;
  thumbnail?: string;
  // product snapshot (shoppable)
  productId?: string;
  productName?: string;
  productImage?: string;
  productPrice?: number;
  productUnit?: string;
  shopId?: string;
  likeCount: number;
  viewCount?: number;
  active?: boolean;
  createdAt: number;
}

export interface CreateReelInput {
  authorId: string;
  authorName: string;
  authorImage?: string;
  caption?: string;
  videoType: VideoSource;
  videoUrl: string;
  thumbnail?: string;
  productId?: string;
  productName?: string;
  productImage?: string;
  productPrice?: number;
  productUnit?: string;
  shopId?: string;
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}
function mapReel(id: string, data: any): Reel {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : typeof data.createdAt === 'number' ? data.createdAt : 0;
  return { id, ...data, createdAt } as Reel;
}

/** Active reels, newest-first. */
export function watchReels(cb: (r: Reel[]) => void) {
  return onSnapshot(
    query(collection(db, 'reels'), limit(300)),
    (snap) => {
      const list = snap.docs.map((d) => mapReel(d.id, d.data())).filter((r) => r.active !== false);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchReels:', e); cb([]); },
  );
}

/** Active reels for one shop's storefront. */
export function watchReelsByShop(shopId: string, cb: (r: Reel[]) => void) {
  return onSnapshot(
    query(collection(db, 'reels'), where('shopId', '==', shopId)),
    (snap) => {
      const list = snap.docs.map((d) => mapReel(d.id, d.data())).filter((r) => r.active !== false);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchReelsByShop:', e); cb([]); },
  );
}

/** Active reels attached to one product (shown on the product page's video tab). */
export function watchReelsForProduct(productId: string, cb: (r: Reel[]) => void) {
  return onSnapshot(
    query(collection(db, 'reels'), where('productId', '==', productId)),
    (snap) => {
      const list = snap.docs.map((d) => mapReel(d.id, d.data())).filter((r) => r.active !== false);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchReelsForProduct:', e); cb([]); },
  );
}

/** Active reels posted by one author (technician/creator storefront). */
export function watchReelsByAuthor(authorId: string, cb: (r: Reel[]) => void) {
  return onSnapshot(
    query(collection(db, 'reels'), where('authorId', '==', authorId)),
    (snap) => {
      const list = snap.docs.map((d) => mapReel(d.id, d.data())).filter((r) => r.active !== false);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchReelsByAuthor:', e); cb([]); },
  );
}

export async function createReel(input: CreateReelInput): Promise<string> {
  const ref = await addDoc(collection(db, 'reels'), strip({ ...input, likeCount: 0, viewCount: 0, active: true, createdAt: serverTimestamp() }));
  return ref.id;
}

export async function deleteReel(id: string) {
  await updateDoc(doc(db, 'reels', id), { active: false });
}

/** Fire-and-forget view bump (any signed-in viewer may only bump viewCount). */
export async function bumpReelView(id: string) {
  try { await updateDoc(doc(db, 'reels', id), { viewCount: increment(1) }); } catch { /* best-effort */ }
}

// ===== likes (mirrors community postLikes) =====
const likeId = (reelId: string, uid: string) => `${reelId}_${uid}`;

export async function toggleReelLike(reelId: string, uid: string) {
  const likeRef = doc(db, 'reelLikes', likeId(reelId, uid));
  const snap = await getDoc(likeRef);
  const batch = writeBatch(db);
  if (snap.exists()) {
    batch.delete(likeRef);
    batch.update(doc(db, 'reels', reelId), { likeCount: increment(-1) });
  } else {
    batch.set(likeRef, { reelId, uid, createdAt: serverTimestamp() });
    batch.update(doc(db, 'reels', reelId), { likeCount: increment(1) });
  }
  await batch.commit();
}

export function watchMyReelLikes(uid: string, cb: (likedIds: Set<string>) => void) {
  return onSnapshot(
    query(collection(db, 'reelLikes'), where('uid', '==', uid)),
    (snap) => cb(new Set(snap.docs.map((d) => (d.data() as any).reelId))),
    (e) => { console.error('watchMyReelLikes:', e); cb(new Set()); },
  );
}
