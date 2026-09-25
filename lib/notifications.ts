import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';

export interface AppNotification {
  id: string;
  userId: string; // recipient
  type: string; // bid | bid_accepted | workflow | message | comment | like
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  createdAt: number;
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * Create a notification for a recipient. Never throws — a failed notification
 * must not break the action that triggered it.
 */
export async function notify(
  userId: string | undefined,
  data: { type: string; title: string; body?: string; link?: string },
) {
  if (!userId) return;
  try {
    // Written SERVER-side: a notification becomes a real push, so the client no
    // longer writes the collection directly (rules now allow admin only). The
    // callable stamps the true sender, rejects external links and rate-limits
    // per sender, which is what stops a scripted mass-spoof.
    await httpsCallable(functions, 'sendNotification')({ userId, ...data });
  } catch (e) {
    console.error('notify:', e);
  }
}

/**
 * Send the same notification to many recipients (admin broadcast).
 * Batched in chunks of 400; returns how many were written.
 */
export async function broadcastNotification(
  userIds: string[],
  data: { title: string; body?: string; link?: string },
): Promise<number> {
  let sent = 0;
  for (let i = 0; i < userIds.length; i += 400) {
    const slice = userIds.slice(i, i + 400);
    const batch = writeBatch(db);
    slice.forEach((uid) => {
      const ref = doc(collection(db, 'notifications'));
      batch.set(ref, strip({ userId: uid, type: 'broadcast', ...data, read: false, createdAt: serverTimestamp() }));
    });
    await batch.commit();
    sent += slice.length;
  }
  return sent;
}

export function watchMyNotifications(uid: string, cb: (n: AppNotification[]) => void) {
  // Filter-only query, newest picked client-side (same pattern as
  // watchUserActivity — avoids a composite index). A server-side limit(50) here
  // would be WRONG: without an orderBy, Firestore falls back to its implicit
  // orderBy(__name__), so past 50 lifetime notifications the newest ones (random
  // auto-ids) never entered the window — the bell silently stopped showing new
  // alerts and markAllRead could never reach them.
  const q = query(collection(db, 'notifications'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data: any = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt ?? Date.now(),
        } as AppNotification;
      });
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list.slice(0, 50)); // newest 50, chosen AFTER sorting
    },
    (e) => {
      console.error('watchMyNotifications:', e);
      cb([]);
    },
  );
}

export async function markRead(id: string) {
  try {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  } catch (e) {
    console.error('markRead:', e);
  }
}

/** Mark a set of notifications read in one batch. */
export async function markAllRead(ids: string[]) {
  if (ids.length === 0) return;
  const batch = writeBatch(db);
  ids.forEach((id) => batch.update(doc(db, 'notifications', id), { read: true }));
  try {
    await batch.commit();
  } catch (e) {
    console.error('markAllRead:', e);
  }
}
