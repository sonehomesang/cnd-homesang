import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

export interface ProductReview {
  id: string;
  productId: string;
  raterId: string;
  raterName?: string;
  raterImage?: string;
  rating: number; // 1-5
  comment?: string;
  createdAt: number;
}

export interface CreateProductReviewInput {
  productId: string;
  raterId: string;
  raterName?: string;
  raterImage?: string;
  rating: number;
  comment?: string;
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function mapReview(id: string, data: any): ProductReview {
  const out: any = { id };
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = v instanceof Timestamp ? v.toMillis() : v;
  }
  if (typeof out.createdAt !== 'number') out.createdAt = Date.now();
  return out as ProductReview;
}

/**
 * Create a product review. The product's rating / reviewCount aggregate is
 * recomputed SERVER-SIDE by the onProductReviewWritten Cloud Function — the
 * client is not trusted to write product ratings.
 */
export async function createProductReview(input: CreateProductReviewInput) {
  // Deterministic id = one review per product per rater. With a random id a
  // client could loop hundreds of 1-star reviews at a rival's product and drag
  // the server-computed average down; the id is enforced by the rules too.
  await setDoc(
    doc(db, 'productReviews', `${input.productId}_${input.raterId}`),
    strip({ ...input, createdAt: serverTimestamp() }),
  );
}

/** Stream a product's reviews, newest first. */
export function watchProductReviews(productId: string, cb: (r: ProductReview[]) => void) {
  const q = query(collection(db, 'productReviews'), where('productId', '==', productId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapReview(d.id, d.data()));
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (err) => {
      console.error('watchProductReviews:', err);
      cb([]);
    },
  );
}
