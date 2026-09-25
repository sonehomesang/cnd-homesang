import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { notify } from './notifications';

export type UpdateRole = 'tech' | 'customer';

/** A progress note posted on a job while it is being carried out. */
export interface JobUpdate {
  id: string;
  jobId: string;
  by: string; // author uid
  byName?: string;
  byRole: UpdateRole;
  note: string;
  photos?: string[];
  createdAt: number;
}

export interface AddJobUpdateInput {
  jobId: string;
  by: string;
  byName?: string;
  byRole: UpdateRole;
  note: string;
  photos?: string[];
}

function mapUpdate(id: string, data: any): JobUpdate {
  const out: any = { id };
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = v instanceof Timestamp ? v.toMillis() : v;
  }
  if (typeof out.createdAt !== 'number') out.createdAt = Date.now();
  return out as JobUpdate;
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

export async function addJobUpdate(input: AddJobUpdateInput): Promise<string> {
  const ref = await addDoc(
    collection(db, 'jobUpdates'),
    strip({
      ...input,
      photos: input.photos && input.photos.length > 0 ? input.photos : undefined,
      createdAt: serverTimestamp(),
    }),
  );
  // notify the other party (best-effort)
  try {
    const jobSnap = await getDoc(doc(db, 'jobs', input.jobId));
    const job = jobSnap.data();
    const other = input.byRole === 'tech' ? job?.customerId : job?.assignedProviderId;
    if (other && other !== input.by) {
      await notify(other, {
        type: 'workflow',
        title: 'ມີອັບເດດຄວາມຄືບໜ້າ 📝',
        body: `${input.byName ?? (input.byRole === 'tech' ? 'ຊ່າງ' : 'ລູກຄ້າ')}: ${input.note.slice(0, 60)}`,
        link: `/jobs/${input.jobId}`,
      });
    }
  } catch {
    /* notify is best-effort */
  }
  return ref.id;
}

/** Watch a job's progress updates, newest first. */
export function watchJobUpdates(jobId: string, cb: (updates: JobUpdate[]) => void) {
  const q = query(collection(db, 'jobUpdates'), where('jobId', '==', jobId));
  return onSnapshot(
    q,
    (snap) => {
      const ups = snap.docs.map((d) => mapUpdate(d.id, d.data()));
      ups.sort((a, b) => b.createdAt - a.createdAt);
      cb(ups);
    },
    (err) => {
      console.error('watchJobUpdates:', err);
      cb([]);
    },
  );
}
