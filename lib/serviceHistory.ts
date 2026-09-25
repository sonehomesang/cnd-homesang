import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { Job } from './jobs';

export type WarrantyState = 'active' | 'expiring' | 'expired' | 'none';
export interface WarrantyStatus {
  state: WarrantyState;
  endMs?: number;
  daysLeft?: number;
}

function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/** Warranty state for a job, derived from its completion date + warranty months. */
export function warrantyStatus(job: Job, expiringDays = 60): WarrantyStatus {
  const months = job.warrantyMonths ?? 0;
  const start = job.completedAt ?? job.techDoneAt;
  if (!months || !start) return { state: 'none' };
  const endMs = addMonths(start, months);
  const daysLeft = Math.ceil((endMs - Date.now()) / 86_400_000);
  if (daysLeft < 0) return { state: 'expired', endMs, daysLeft };
  if (daysLeft <= expiringDays) return { state: 'expiring', endMs, daysLeft };
  return { state: 'active', endMs, daysLeft };
}

/** Group a customer's jobs by their site/address. */
export function groupByLocation(jobs: Job[]): { location: string; jobs: Job[] }[] {
  const map = new Map<string, Job[]>();
  for (const j of jobs) {
    const key = (j.address || '').trim() || 'ບໍ່ ໄດ້ ລະບຸ ສະຖານທີ່';
    const arr = map.get(key);
    if (arr) arr.push(j);
    else map.set(key, [j]);
  }
  return [...map.entries()].map(([location, list]) => ({ location, jobs: list }));
}

/** Lifetime spend + active-warranty count across a customer's completed jobs. */
export function summarise(jobs: Job[]) {
  const done = jobs.filter((j) => j.status === 'completed');
  const totalSpend = done.reduce((s, j) => s + (j.finalPrice ?? 0), 0);
  const activeWarranties = jobs.filter((j) => {
    const w = warrantyStatus(j).state;
    return w === 'active' || w === 'expiring';
  }).length;
  const locations = new Set(jobs.map((j) => (j.address || '').trim()).filter(Boolean)).size;
  return { count: jobs.length, totalSpend, activeWarranties, locations };
}

function toMs(v: any): number | undefined {
  return v && typeof v.toMillis === 'function' ? v.toMillis() : v;
}

/** Admin follow-up: completed jobs whose warranty expires within `withinDays`
 * (and hasn't expired yet). Reads all jobs — admin use. */
export function watchExpiringWarranties(cb: (jobs: Job[]) => void, withinDays = 60) {
  return onSnapshot(
    collection(db, 'jobs'),
    (snap) => {
      const jobs = snap.docs.map((d) => {
        const data = d.data() as any;
        return { id: d.id, ...data, createdAt: toMs(data.createdAt) ?? 0, completedAt: toMs(data.completedAt), techDoneAt: toMs(data.techDoneAt) } as Job;
      });
      const rows = jobs
        .filter((j) => j.status === 'completed')
        .map((j) => ({ job: j, w: warrantyStatus(j, withinDays) }))
        .filter((r) => r.w.state === 'expiring')
        .sort((a, b) => (a.w.daysLeft ?? 0) - (b.w.daysLeft ?? 0))
        .map((r) => r.job);
      cb(rows);
    },
    (err) => { console.error('watchExpiringWarranties:', err); cb([]); },
  );
}
