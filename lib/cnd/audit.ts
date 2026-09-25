import {
  addDoc, collection, deleteDoc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG } from '../mock';

/**
 * CND back-office audit trail — records who did what, when. The actor is set once
 * from the signed-in admin (setCndAuditActor) so call sites just log the action.
 */
export interface CndAuditLog { id: string; actor: string; action: string; target: string; detail?: string; at: number; __mock?: boolean; }

let ACTOR = 'admin';
export function setCndAuditActor(name?: string) { if (name && name.trim()) ACTOR = name.trim(); }

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndAuditLog {
  return { id, actor: d.actor ?? '—', action: d.action ?? '', target: d.target ?? '', detail: d.detail, at: ms(d.at), __mock: !!d[MOCK_FLAG] };
}
export function watchCndAuditLogs(cb: (l: CndAuditLog[]) => void) {
  return onSnapshot(query(collection(db, 'cndAuditLogs')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.at - a.at).slice(0, 200)),
    (e) => { console.error('watchCndAuditLogs:', e); cb([]); });
}
/** Fire-and-forget: record an action by the current actor. Never throws. */
export function logCndAudit(action: string, target: string, detail?: string) {
  addDoc(collection(db, 'cndAuditLogs'), { actor: ACTOR, action, target, detail: detail || undefined, at: serverTimestamp() }).catch(() => {});
}
export async function clearCndAuditLogs(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndAuditLogs')));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}
