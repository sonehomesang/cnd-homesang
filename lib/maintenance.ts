import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Recurring maintenance plans (ສ້ອມ ບຳຣຸງ ປະຈຳ) — B2B feature phase 1, built on
 * the Building & Asset Registry. A customer sets a cycle ("clean the aircon every
 * 3 months"); the maintenanceDailySweep Cloud Function then, on the due date,
 * either auto-posts a job or reminds the owner, and rolls the next due date
 * forward. High-value for hotels / factories / property managers.
 */
export interface MaintenancePlan {
  id: string;
  ownerId: string;
  siteId?: string;
  siteName?: string;
  assetId?: string;
  title: string;          // what to service
  category?: string;      // service category (aircon/electrical/…)
  intervalMonths: number; // every N months
  nextDueAt: number;      // ms
  lastServiceAt?: number;
  active: boolean;
  autoPost: boolean;      // true → auto-create a job on due; false → just remind
  note?: string;
  remindedFor?: number;   // the dueAt we already pre-reminded (avoids spam)
  createdAt: number;
}

export const MAINT_INTERVALS = [1, 2, 3, 6, 12] as const;
export const MONTH_MS = 30 * 86_400_000;

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): MaintenancePlan {
  return {
    id, ownerId: d.ownerId ?? '', siteId: d.siteId, siteName: d.siteName, assetId: d.assetId,
    title: d.title ?? '', category: d.category, intervalMonths: Number(d.intervalMonths) || 3,
    nextDueAt: ms(d.nextDueAt), lastServiceAt: d.lastServiceAt ? ms(d.lastServiceAt) : undefined,
    active: d.active !== false, autoPost: d.autoPost === true, note: d.note, remindedFor: d.remindedFor, createdAt: ms(d.createdAt),
  };
}
function strip<T extends Record<string, any>>(o: T): Partial<T> {
  const out: any = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v; return out;
}

/** A plan's status for display. */
export function maintStatus(p: MaintenancePlan, now: number): 'due' | 'soon' | 'ok' | 'off' {
  if (!p.active) return 'off';
  if (now >= p.nextDueAt) return 'due';
  if (now >= p.nextDueAt - 7 * 86_400_000) return 'soon';
  return 'ok';
}

export function watchMaintenancePlansForOwner(ownerId: string, cb: (list: MaintenancePlan[]) => void) {
  return onSnapshot(query(collection(db, 'maintenancePlans'), where('ownerId', '==', ownerId)),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => a.nextDueAt - b.nextDueAt)),
    (e) => { console.error('watchMaintenancePlans:', e); cb([]); });
}

export type MaintenancePlanInput = Omit<MaintenancePlan, 'id' | 'createdAt' | 'remindedFor'>;
export async function createMaintenancePlan(input: MaintenancePlanInput) {
  await addDoc(collection(db, 'maintenancePlans'), strip({ ...input, createdAt: serverTimestamp() }));
}
export async function updateMaintenancePlan(id: string, patch: Partial<MaintenancePlanInput>) {
  await updateDoc(doc(db, 'maintenancePlans', id), strip({ ...patch }) as any);
}
export async function deleteMaintenancePlan(id: string) { await deleteDoc(doc(db, 'maintenancePlans', id)); }
