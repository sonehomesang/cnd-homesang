import {
  addDoc,
  collection,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  doc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

/** Kinds of events recorded to a user's activity trail. */
export type ActivityType =
  | 'signup'
  | 'login'
  | 'logout'
  | 'profile_update'
  | 'role_change'
  | 'status_change'
  | 'post_job'
  | 'other';

export interface UserActivity {
  id: string;
  uid: string;
  ts: number;
  type: ActivityType;
  detail?: string;
  /** who caused it, when it wasn't the user themselves (e.g. an admin edit) */
  actorUid?: string;
  actorName?: string;
}

function strip<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Append one activity entry for a user (best-effort — never throws to the caller). */
export async function logUserActivity(
  uid: string,
  type: ActivityType,
  opts?: { detail?: string; actorUid?: string; actorName?: string },
) {
  try {
    await addDoc(collection(db, 'userActivity'), strip({
      uid,
      type,
      detail: opts?.detail,
      actorUid: opts?.actorUid,
      actorName: opts?.actorName,
      ts: serverTimestamp(),
    }));
  } catch (e) {
    console.warn('logUserActivity:', e);
  }
}

/** Record a real sign-in: bump lastLoginAt + loginCount and log a 'login' event. */
export async function recordLogin(uid: string) {
  try {
    await updateDoc(doc(db, 'users', uid), { lastLoginAt: Date.now(), lastActiveAt: Date.now(), loginCount: increment(1) });
  } catch (e) {
    console.warn('recordLogin bump:', e);
  }
  await logUserActivity(uid, 'login');
}

/** Lightweight "last seen" touch on app open (no event row). */
export async function touchActive(uid: string) {
  try {
    await updateDoc(doc(db, 'users', uid), { lastActiveAt: Date.now() });
  } catch { /* best-effort */ }
}

/** Admin/owner view of a user's activity, newest first. Filter-only query (no
 *  orderBy) so it needs no composite index; sorted client-side. */
export function watchUserActivity(uid: string, cb: (rows: UserActivity[]) => void, max = 60) {
  return onSnapshot(
    query(collection(db, 'userActivity'), where('uid', '==', uid)),
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data: any = d.data();
        const ts = data.ts instanceof Timestamp ? data.ts.toMillis() : (typeof data.ts === 'number' ? data.ts : Date.now());
        return { id: d.id, ...data, ts } as UserActivity;
      });
      rows.sort((a, b) => b.ts - a.ts);
      cb(rows.slice(0, max));
    },
    (err) => { console.error('watchUserActivity:', err); cb([]); },
  );
}

export const ACTIVITY_META: Record<ActivityType, { icon: string; label: string }> = {
  signup: { icon: '✍️', label: 'ສະໝັກ ບັນຊີ' },
  login: { icon: '🔑', label: 'ເຂົ້າ ລະບົບ' },
  logout: { icon: '🚪', label: 'ອອກ ຈາກ ລະບົບ' },
  profile_update: { icon: '✏️', label: 'ແກ້ ໂປຣຟາຍ' },
  role_change: { icon: '🛡️', label: 'ປ່ຽນ ບົດບາດ' },
  status_change: { icon: '🔁', label: 'ປ່ຽນ ສະຖານະ' },
  post_job: { icon: '📣', label: 'ໂພສ ວຽກ' },
  other: { icon: '•', label: 'ອື່ນໆ' },
};
