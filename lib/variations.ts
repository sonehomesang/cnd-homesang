import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { computeQuote, type QuoteItem } from './bids';
import type { Installment } from './jobs';
import { notify } from './notifications';

export type VariationStatus = 'pending' | 'approved' | 'rejected';

/** A mid-job change-order: extra work found while the job is in progress that
 * the technician proposes and the customer must approve before it is billed. */
export interface JobVariation {
  id: string;
  jobId: string;
  techId: string;
  techName?: string;
  items: QuoteItem[];
  subtotal: number;
  vatRate: number;
  vat: number;
  total: number;
  note?: string;
  status: VariationStatus;
  createdAt: number;
  decidedAt?: number;
}

export interface CreateVariationInput {
  jobId: string;
  techId: string;
  techName?: string;
  items: QuoteItem[];
  vatRate?: number;
  note?: string;
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function mapVariation(id: string, data: any): JobVariation {
  const out: any = { id };
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = v instanceof Timestamp ? v.toMillis() : v;
  }
  if (typeof out.createdAt !== 'number') out.createdAt = Date.now();
  if (!Array.isArray(out.items)) out.items = [];
  return out as JobVariation;
}

/** Live-watch all change-orders on a job (both parties + admin). */
export function watchVariationsForJob(jobId: string, cb: (v: JobVariation[]) => void) {
  return onSnapshot(
    query(collection(db, 'jobVariations'), where('jobId', '==', jobId)),
    (snap) => {
      const list = snap.docs.map((d) => mapVariation(d.id, d.data()));
      list.sort((a, b) => a.createdAt - b.createdAt);
      cb(list);
    },
    (err) => {
      console.error('watchVariationsForJob:', err);
      cb([]);
    },
  );
}

/** Technician proposes extra work (pending customer approval). */
export async function createVariation(input: CreateVariationInput): Promise<string> {
  const items = input.items.filter((it) => it.desc.trim() !== '' || it.unitPrice > 0);
  if (!items.length) throw new Error('ໃສ່ ລາຍການ ວຽກເພີ່ມ ຢ່າງໜ້ອຍ 1 ລາຍການ');
  const vatRate = input.vatRate ?? 0;
  const { subtotal, vat, total } = computeQuote(items, 0, vatRate);
  const ref = await addDoc(
    collection(db, 'jobVariations'),
    strip({
      jobId: input.jobId,
      techId: input.techId,
      techName: input.techName,
      items,
      subtotal,
      vatRate,
      vat,
      total,
      note: input.note?.trim() || undefined,
      status: 'pending' as VariationStatus,
      createdAt: serverTimestamp(),
    }),
  );
  try {
    const jobSnap = await getDoc(doc(db, 'jobs', input.jobId));
    await notify(jobSnap.data()?.customerId, {
      type: 'job',
      title: 'ຊ່າງ ສະເໜີ ວຽກເພີ່ມ 🧰',
      body: `${input.techName ?? 'ຊ່າງ'} ຂໍ ເພີ່ມ ${total.toLocaleString()} ກີບ${input.note ? ` — "${input.note.trim()}"` : ''}`,
      link: `/jobs/${input.jobId}`,
    });
  } catch { /* best-effort */ }
  return ref.id;
}

/** Customer approves extra work → raises the job's final price by the total. */
export async function approveVariation(variationId: string, callerId: string) {
  const vSnap = await getDoc(doc(db, 'jobVariations', variationId));
  if (!vSnap.exists()) throw new Error('ບໍ່ພົບ ວຽກເພີ່ມ');
  const v = mapVariation(vSnap.id, vSnap.data());
  if (v.status !== 'pending') throw new Error('ວຽກເພີ່ມ ນີ້ ຕັດສິນ ແລ້ວ');
  const jobSnap = await getDoc(doc(db, 'jobs', v.jobId));
  if (!jobSnap.exists()) throw new Error('ບໍ່ພົບ ງານ');
  if (jobSnap.data()?.customerId !== callerId) throw new Error('ສະເພາະ ເຈົ້າຂອງ ງານ ອະນຸມັດ ໄດ້');
  await updateDoc(doc(db, 'jobVariations', variationId), {
    status: 'approved' as VariationStatus,
    decidedAt: serverTimestamp(),
  });
  // Bump the job's final price by the approved amount. When the job is on a
  // deposit/installment schedule, also append the change-order as a new payment
  // line so the schedule keeps summing to finalPrice — otherwise the extra work
  // is invoiced but never collected, and the job would auto-complete once the
  // ORIGINAL installments are confirmed (see confirmInstallment in ./jobs).
  const jobData = jobSnap.data() ?? {};
  const installments: Installment[] = Array.isArray(jobData.paymentInstallments)
    ? jobData.paymentInstallments
    : [];
  const jobUpdate: Record<string, unknown> = { finalPrice: increment(v.total) };
  if (installments.length > 0) {
    const line: Installment = {
      label: v.note?.trim() ? `ວຽກເພີ່ມ: ${v.note.trim()}` : 'ວຽກເພີ່ມ',
      amount: v.total,
    };
    jobUpdate.paymentInstallments = [...installments, line];
  }
  await updateDoc(doc(db, 'jobs', v.jobId), jobUpdate);
  try {
    await notify(v.techId, {
      type: 'job',
      title: 'ລູກຄ້າ ອະນຸມັດ ວຽກເພີ່ມ ✅',
      body: `+${v.total.toLocaleString()} ກີບ ເຂົ້າ ໃນ ງານ`,
      link: `/jobs/${v.jobId}`,
    });
  } catch { /* best-effort */ }
}

/** Customer declines the extra work. */
export async function rejectVariation(variationId: string, callerId: string) {
  const vSnap = await getDoc(doc(db, 'jobVariations', variationId));
  if (!vSnap.exists()) throw new Error('ບໍ່ພົບ ວຽກເພີ່ມ');
  const v = mapVariation(vSnap.id, vSnap.data());
  if (v.status !== 'pending') throw new Error('ວຽກເພີ່ມ ນີ້ ຕັດສິນ ແລ້ວ');
  const jobSnap = await getDoc(doc(db, 'jobs', v.jobId));
  if (jobSnap.data()?.customerId !== callerId) throw new Error('ສະເພາະ ເຈົ້າຂອງ ງານ ປະຕິເສດ ໄດ້');
  await updateDoc(doc(db, 'jobVariations', variationId), {
    status: 'rejected' as VariationStatus,
    decidedAt: serverTimestamp(),
  });
  try {
    await notify(v.techId, {
      type: 'job',
      title: 'ລູກຄ້າ ບໍ່ ອະນຸມັດ ວຽກເພີ່ມ',
      body: `ງານ "${jobSnap.data()?.title ?? ''}"`,
      link: `/jobs/${v.jobId}`,
    });
  } catch { /* best-effort */ }
}
