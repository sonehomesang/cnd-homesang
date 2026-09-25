import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { auth, db } from './firebase';

export interface AuditEntry {
  id: string;
  ts: number;
  actorUid: string;
  actorName: string;
  action: 'create' | 'update' | 'delete';
  collection: string;
  docId: string;
  changedKeys: string[];
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
}

// Firestore Timestamps → millis so diffs compare like-for-like with the UI values.
function normalize(raw: any): Record<string, any> {
  const o: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    o[k] = v && typeof (v as any).toMillis === 'function' ? (v as any).toMillis() : v;
  }
  return o;
}

function pick(obj: Record<string, any> | undefined, keys: string[]): Record<string, any> | null {
  if (!obj) return null;
  const o: Record<string, any> = {};
  for (const k of keys) if (k in obj) o[k] = obj[k];
  return o;
}

const nameCache: Record<string, string> = {};
async function actorName(uid: string): Promise<string> {
  if (nameCache[uid]) return nameCache[uid];
  try {
    const s = await getDoc(doc(db, 'users', uid));
    const d: any = s.data() ?? {};
    const n =
      [d.firstName, d.lastName].filter(Boolean).join(' ') || d.name || d.phone || uid;
    nameCache[uid] = n;
    return n;
  } catch {
    return uid;
  }
}

/**
 * Append an immutable audit entry describing an admin write. Best-effort: never
 * throws into the caller (a failed log must not block the actual change).
 */
export async function logAdminAction(params: {
  action: 'create' | 'update' | 'delete';
  collection: string;
  docId: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
}) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const { action, collection: col, docId } = params;
  const before = params.before ? normalize(params.before) : undefined;
  const after = params.after ? normalize(params.after) : undefined;

  let changedKeys: string[] = [];
  if (action === 'update' && before && after) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      if (k === 'updatedAt' || k === 'id') continue;
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changedKeys.push(k);
    }
    if (changedKeys.length === 0) return; // nothing actually changed
  } else if (action === 'create' && after) {
    changedKeys = Object.keys(after).filter((k) => k !== 'id');
  } else if (action === 'delete' && before) {
    changedKeys = Object.keys(before).filter((k) => k !== 'id');
  }

  const name = await actorName(uid);
  try {
    await addDoc(collection(db, 'auditLogs'), {
      ts: Date.now(),
      actorUid: uid,
      actorName: name,
      action,
      collection: col,
      docId,
      changedKeys,
      before: pick(before, changedKeys),
      after: pick(after, changedKeys),
    });
  } catch (e) {
    console.error('logAdminAction:', e);
  }
}

export function watchAuditLogs(cb: (entries: AuditEntry[]) => void, max = 300) {
  const q = query(collection(db, 'auditLogs'), orderBy('ts', 'desc'), limit(max));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditEntry)),
    (e) => {
      console.error('watchAuditLogs:', e);
      cb([]);
    },
  );
}
