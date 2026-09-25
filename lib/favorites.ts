import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

export type FavType = 'product' | 'shop' | 'technician';

export interface Favorite {
  id: string;
  uid: string;
  targetType: FavType;
  targetId: string;
  name?: string;
  image?: string;
  createdAt: number;
}

function strip(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}
function favId(uid: string, type: FavType, targetId: string) {
  return `${uid}_${type}_${targetId}`;
}

/** Toggle a favorite. Returns the new state (true = now favorited). */
export async function toggleFavorite(
  uid: string,
  type: FavType,
  targetId: string,
  meta?: { name?: string; image?: string },
): Promise<boolean> {
  const ref = doc(db, 'favorites', favId(uid, type, targetId));
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, strip({ uid, targetType: type, targetId, ...meta, createdAt: serverTimestamp() }));
  return true;
}

export function watchFavorite(uid: string, type: FavType, targetId: string, cb: (fav: boolean) => void) {
  return onSnapshot(doc(db, 'favorites', favId(uid, type, targetId)), (snap) => cb(snap.exists()));
}

export function watchMyFavorites(uid: string, cb: (f: Favorite[]) => void) {
  const q = query(collection(db, 'favorites'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data: any = d.data();
        return { id: d.id, ...data, createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt ?? 0 } as Favorite;
      });
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchMyFavorites:', e); cb([]); },
  );
}
