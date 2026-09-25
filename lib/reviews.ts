import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

export type RateeRole = 'technician' | 'customer' | 'rider';

export interface Review {
  id: string;
  jobId: string;
  /** set instead of jobId when the review is for a delivery (rider) */
  taskId?: string;
  raterId: string;
  raterName: string;
  raterImage?: string;
  rateeId: string;
  role: RateeRole; // what the rated person is
  rating: number; // 1..5
  comment?: string;
  hidden?: boolean; // admin-moderated: hidden from public display
  createdAt: number;
}

export interface CreateReviewInput {
  jobId: string;
  raterId: string;
  raterName: string;
  raterImage?: string;
  rateeId: string;
  role: RateeRole;
  rating: number;
  comment?: string;
  /** Which job flag to set so the same party can't review twice. */
  jobFlagField: 'customerReviewed' | 'techReviewed';
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function mapReview(id: string, data: any): Review {
  const out: any = { id };
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = v instanceof Timestamp ? v.toMillis() : v;
  }
  if (typeof out.createdAt !== 'number') out.createdAt = Date.now();
  return out as Review;
}

/**
 * Create a review + set the job's "reviewed" flag. The ratee's average rating /
 * reviewCount (on users + techCards) is recomputed SERVER-SIDE by the
 * onReviewWritten Cloud Function — the client is not trusted to write ratings.
 */
export async function createReview(input: CreateReviewInput) {
  const { jobFlagField, ...review } = input;
  const batch = writeBatch(db);
  // deterministic id = one review per job per rater (rules enforce it too), so
  // ratings can't be padded by looping addDoc with random ids
  batch.set(
    doc(db, 'reviews', `${review.jobId}_${review.raterId}`),
    strip({ ...review, createdAt: serverTimestamp() }),
  );
  batch.update(doc(db, 'jobs', review.jobId), { [jobFlagField]: true });
  await batch.commit();
}

/**
 * Rate the RIDER who delivered an order. Unlike a job review this hangs off the
 * delivery task (there is no job), and writes no task flag — the "already
 * rated?" check is the existence of a review carrying this taskId, which keeps
 * the tightened deliveryTasks rules untouched. The ratee's average is still
 * recomputed server-side by onReviewWritten.
 */
export async function createRiderReview(input: {
  taskId: string;
  raterId: string;
  raterName: string;
  raterImage?: string;
  rateeId: string;
  rating: number;
  comment?: string;
}) {
  // deterministic id = one rider review per delivery task per rater
  await setDoc(doc(db, 'reviews', `${input.taskId}_${input.raterId}`), strip({
    ...input,
    jobId: '',
    role: 'rider' as RateeRole,
    createdAt: serverTimestamp(),
  }));
}

/** The review left for one delivery task (null when not rated yet). */
export function watchTaskReview(taskId: string, cb: (r: Review | null) => void) {
  return onSnapshot(
    query(collection(db, 'reviews'), where('taskId', '==', taskId)),
    (snap) => cb(snap.empty ? null : mapReview(snap.docs[0].id, snap.docs[0].data())),
    (e) => { console.error('watchTaskReview:', e); cb(null); },
  );
}

/** Stream reviews received by a user, newest first. */
export function watchReviewsFor(rateeId: string, cb: (reviews: Review[]) => void) {
  const q = query(collection(db, 'reviews'), where('rateeId', '==', rateeId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapReview(d.id, d.data())).filter((r) => !r.hidden);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => {
      console.error('watchReviewsFor:', e);
      cb([]);
    },
  );
}

/** All reviews (admin moderation), newest first. */
export function watchAllReviews(cb: (reviews: Review[]) => void) {
  return onSnapshot(
    collection(db, 'reviews'),
    (snap) => {
      const list = snap.docs.map((d) => mapReview(d.id, d.data()));
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchAllReviews:', e); cb([]); },
  );
}

export async function setReviewHidden(id: string, hidden: boolean) {
  await updateDoc(doc(db, 'reviews', id), { hidden });
}

export async function deleteReview(id: string) {
  await deleteDoc(doc(db, 'reviews', id));
}
