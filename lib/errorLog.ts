import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

export interface ErrorLog {
  id: string;
  message: string;
  stack?: string;
  source?: string; // where it came from: 'window' | 'promise' | a tag
  uid?: string;
  url?: string;
  at: number;
}

function tsToMs(v: any): number {
  return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : Date.now();
}

function strip(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v;
  return out;
}

// avoid runaway loops (an error inside logging would re-trigger handlers)
let logging = false;

/** Record a client error. Never throws — best-effort. */
export async function logError(
  message: string,
  extra?: { stack?: string; source?: string; uid?: string; url?: string },
): Promise<void> {
  if (logging) return;
  logging = true;
  try {
    await addDoc(
      collection(db, 'errorLogs'),
      strip({
        message: String(message).slice(0, 2000),
        stack: extra?.stack?.slice(0, 4000),
        source: extra?.source,
        uid: extra?.uid,
        url: extra?.url,
        createdAt: serverTimestamp(),
      }),
    );
  } catch {
    /* swallow — logging must never break the app */
  } finally {
    logging = false;
  }
}

let installed = false;
/** Install global web error handlers once (no-op off-web or if already set). */
export function installGlobalErrorLogging(getUid: () => string | undefined) {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const url = () => (typeof window !== 'undefined' ? window.location?.href : undefined);
  window.addEventListener('error', (e: any) => {
    logError(e?.message ?? 'window error', {
      stack: e?.error?.stack,
      source: 'window',
      uid: getUid(),
      url: url(),
    });
  });
  window.addEventListener('unhandledrejection', (e: any) => {
    const r = e?.reason;
    logError(r?.message ?? String(r ?? 'unhandledrejection'), {
      stack: r?.stack,
      source: 'promise',
      uid: getUid(),
      url: url(),
    });
  });
}

export function watchErrorLogs(cb: (logs: ErrorLog[]) => void) {
  return onSnapshot(
    query(collection(db, 'errorLogs'), limit(200)),
    (snap) => {
      const list = snap.docs.map((d) => {
        const data: any = d.data();
        return { id: d.id, ...data, at: tsToMs(data.createdAt) } as ErrorLog;
      });
      list.sort((a, b) => b.at - a.at);
      cb(list);
    },
    (e) => { console.error('watchErrorLogs:', e); cb([]); },
  );
}

/** Delete all error logs (super admin). Batched. */
export async function clearErrorLogs(): Promise<number> {
  const snap = await getDocs(collection(db, 'errorLogs'));
  let n = 0;
  const ids = snap.docs.map((d) => d.id);
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(db);
    ids.slice(i, i + 400).forEach((id) => batch.delete(doc(db, 'errorLogs', id)));
    await batch.commit();
    n += Math.min(400, ids.length - i);
  }
  return n;
}
