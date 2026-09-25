import {
  addDoc, collection, deleteDoc, doc, getCountFromServer, getDoc, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { stampMock } from './mock';

/**
 * MK Plan · KPI & Campaigns. `mkCampaigns` = tracked campaigns (goal + progress).
 * `mkMetrics/current` = manually-entered top-line numbers (reach/spend/leads).
 * fetchAutoKpis() pulls live counts from collections a marketing user can read
 * (techCards / shops / jobCards) — the "hybrid" (auto + manual) dashboard.
 * Gated to the marketing role (firestore.rules isMarketing()).
 */
export type MkCampaignStatus = 'active' | 'paused' | 'done';
export interface MkCampaign {
  id: string;
  name: string;
  goal?: string;
  target?: number;
  current?: number;
  status: MkCampaignStatus;
  note?: string;
  createdAt: number;
  __mock?: boolean;
}
export const MK_CAMPAIGN_STATUS_LABEL: Record<MkCampaignStatus, string> = { active: 'ກຳລັງ ດຳເນີນ', paused: 'ພັກ', done: 'ຈົບ' };

export interface MkMetrics { reach: number; engagementPct: number; adSpendKip: number; leads: number }
export interface AutoKpis { techs: number; shops: number; openJobs: number; partnersActive: number; postsPublished: number }

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function strip<T extends Record<string, any>>(o: T): Partial<T> {
  const out: any = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v; return out;
}
function mapC(id: string, d: any): MkCampaign {
  return { id, name: d.name ?? '', goal: d.goal, target: d.target, current: d.current, status: d.status ?? 'active', note: d.note, createdAt: ms(d.createdAt), __mock: !!d.__mock };
}

export function watchMkCampaigns(cb: (list: MkCampaign[]) => void) {
  return onSnapshot(query(collection(db, 'mkCampaigns')),
    (s) => cb(s.docs.map((d) => mapC(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchMkCampaigns:', e); cb([]); });
}
export type MkCampaignInput = Omit<MkCampaign, 'id' | 'createdAt'>;
export async function createMkCampaign(input: MkCampaignInput) { await addDoc(collection(db, 'mkCampaigns'), strip({ ...input, createdAt: serverTimestamp() })); }
export async function updateMkCampaign(id: string, patch: Partial<MkCampaignInput>) { await updateDoc(doc(db, 'mkCampaigns', id), strip({ ...patch }) as any); }
export async function deleteMkCampaign(id: string) { await deleteDoc(doc(db, 'mkCampaigns', id)); }

export async function seedMkCampaignsSample(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const items: MkCampaignInput[] = [
    { name: 'ຮັບ ສະໝັກ ຊ່າງ 100 ຄົນ (Q1)', goal: 'ຊ່າງ ໃໝ່ ໃຊ້ ງານ ຈິງ', target: 100, current: 34, status: 'active' },
    { name: 'ໂພສ ງານ ຟຣີ — ດຶງ ລູກຄ້າ', goal: 'ງານ ໂພສ ໃໝ່/ເດືອນ', target: 500, current: 210, status: 'active' },
    { name: 'BNPL ຜ່ອນ ສິນຄ້າ 0%', goal: 'ຍອດ ຜ່ອນ ອະນຸມັດ', target: 50, current: 12, status: 'active' },
    { name: 'referral ແນະນຳ ເພື່ອນ', goal: 'ຜູ້ ໃຊ້ ໃໝ່ ຈາກ referral', target: 300, current: 300, status: 'done' },
  ];
  const batch = writeBatch(db);
  for (const it of items) batch.set(doc(collection(db, 'mkCampaigns')), strip(stampMock({ ...it, createdAt: serverTimestamp() })));
  await batch.commit();
  return items.length;
}

// ── manual top-line metrics (single doc) ──
export function watchMkMetrics(cb: (m: MkMetrics) => void) {
  return onSnapshot(doc(db, 'mkMetrics', 'current'), (s) => {
    const d: any = s.data() || {};
    cb({ reach: Number(d.reach) || 0, engagementPct: Number(d.engagementPct) || 0, adSpendKip: Number(d.adSpendKip) || 0, leads: Number(d.leads) || 0 });
  }, (e) => { console.error('watchMkMetrics:', e); cb({ reach: 0, engagementPct: 0, adSpendKip: 0, leads: 0 }); });
}
export async function saveMkMetrics(m: MkMetrics) {
  await setDoc(doc(db, 'mkMetrics', 'current'), { ...m, updatedAt: serverTimestamp() }, { merge: true });
}
export async function getMkMetrics(): Promise<MkMetrics> {
  try { const s = await getDoc(doc(db, 'mkMetrics', 'current')); const d: any = s.data() || {};
    return { reach: Number(d.reach) || 0, engagementPct: Number(d.engagementPct) || 0, adSpendKip: Number(d.adSpendKip) || 0, leads: Number(d.leads) || 0 };
  } catch { return { reach: 0, engagementPct: 0, adSpendKip: 0, leads: 0 }; }
}

// ── auto metrics (server-computed via Cloud Function; marketing can't read orders) ──
export interface MkAutoMetrics { users: number; jobsDone: number; ordersDone: number; gmv30dKip: number; orders30d: number; updatedAt?: number }
export function watchMkAutoMetrics(cb: (m: MkAutoMetrics) => void) {
  return onSnapshot(doc(db, 'mkMetrics', 'auto'), (s) => {
    const d: any = s.data() || {};
    cb({ users: Number(d.users) || 0, jobsDone: Number(d.jobsDone) || 0, ordersDone: Number(d.ordersDone) || 0, gmv30dKip: Number(d.gmv30dKip) || 0, orders30d: Number(d.orders30d) || 0, updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toMillis() : undefined });
  }, (e) => { console.error('watchMkAutoMetrics:', e); cb({ users: 0, jobsDone: 0, ordersDone: 0, gmv30dKip: 0, orders30d: 0 }); });
}
/** Ask the server to recompute mkMetrics/auto now (marketing/admin gated). */
export async function refreshMkAutoMetrics(): Promise<boolean> {
  try { const r: any = await httpsCallable(functions, 'refreshMkAutoMetrics')({}); return !!r?.data?.ok; }
  catch (e) { console.error('refreshMkAutoMetrics', e); return false; }
}

/** Live counts from collections a marketing user can read (server-side count —
 *  no docs downloaded). Any that fails (rules) falls back to 0. */
export async function fetchAutoKpis(): Promise<AutoKpis> {
  const count = async (q: any) => { try { return (await getCountFromServer(q)).data().count; } catch { return 0; } };
  const [techs, shops, openJobs, partnersActive, postsPublished] = await Promise.all([
    count(query(collection(db, 'techCards'))),
    count(query(collection(db, 'shops'))),
    count(query(collection(db, 'jobCards'), where('status', '==', 'open'))),
    count(query(collection(db, 'mkPartners'), where('stage', '==', 'active'))),
    count(query(collection(db, 'mkContent'), where('status', '==', 'published'))),
  ]);
  return { techs, shops, openJobs, partnersActive, postsPublished };
}
