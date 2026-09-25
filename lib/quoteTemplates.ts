import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { QuoteItem } from './bids';
import type { PaymentPlan } from './jobs';

/** A technician-owned preset of a WHOLE quotation (lines + discount + VAT +
 * payment plan) that can be reloaded into the builder for a similar job. */
export interface QuoteTemplate {
  id: string;
  ownerId: string; // the technician who owns this template
  name: string;
  category?: string;
  items: QuoteItem[];
  discount?: number;
  vatRate?: number;
  paymentPlan?: PaymentPlan;
  createdAt?: number;
}

export interface SaveQuoteTemplateInput {
  ownerId: string;
  name: string;
  category?: string;
  items: QuoteItem[];
  discount?: number;
  vatRate?: number;
  paymentPlan?: PaymentPlan;
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function mapTpl(id: string, data: any): QuoteTemplate {
  return {
    id,
    ownerId: data?.ownerId ?? '',
    name: data?.name ?? '',
    category: data?.category ?? '',
    items: Array.isArray(data?.items) ? data.items : [],
    discount: data?.discount,
    vatRate: data?.vatRate,
    paymentPlan: data?.paymentPlan,
    createdAt: data?.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data?.createdAt,
  };
}

/** Live-watch the templates owned by one technician. */
export function watchMyQuoteTemplates(ownerId: string, cb: (t: QuoteTemplate[]) => void) {
  return onSnapshot(
    query(collection(db, 'quoteTemplates'), where('ownerId', '==', ownerId)),
    (snap) => {
      const t = snap.docs.map((d) => mapTpl(d.id, d.data()));
      t.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(t);
    },
    (err) => {
      console.error('watchMyQuoteTemplates:', err);
      cb([]);
    },
  );
}

/** Save the current draft as a reusable template. Per-line photos are
 * job-specific evidence, so they are dropped from the stored template. */
export async function saveQuoteTemplate(input: SaveQuoteTemplateInput): Promise<string> {
  const items = input.items.map((it) => {
    const copy: QuoteItem = { ...it };
    delete copy.photos;
    return copy;
  });
  const ref = await addDoc(
    collection(db, 'quoteTemplates'),
    strip({
      ownerId: input.ownerId,
      name: input.name || 'ແມ່ແບບໃໝ່',
      category: input.category || '',
      items,
      discount: input.discount,
      vatRate: input.vatRate,
      paymentPlan: input.paymentPlan,
      createdAt: serverTimestamp(),
    }),
  );
  return ref.id;
}

export async function deleteQuoteTemplate(id: string) {
  await deleteDoc(doc(db, 'quoteTemplates', id));
}
