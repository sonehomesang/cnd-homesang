import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
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
import { notify } from './notifications';
import { getOrCreateConversation, sendMessage, sendQuoteCard, sendCounterOffer } from './chat';
import type { SurveyCheck } from './surveyTemplates';
import { buildInstallments, type PaymentPlan } from './jobs';

export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

/** One line of an itemized quotation. */
export interface QuoteItem {
  desc: string;
  qty: number;
  unit: string;
  unitPrice: number;
  // reference photos for this specific line (measurements, the exact part, damage, etc.)
  photos?: string[];
  // back-office economics — set when the line is pulled from a partner shop
  sourceShopId?: string;
  costPrice?: number;
  commissionPct?: number;
}

/** One line in a customer's line-level counter (a proposed BOQ). */
export interface LineCounterItem {
  desc: string;
  qty: number;
  unit: string;
  unitPrice: number; // the price the customer proposes for this line
  keep: boolean;     // false = customer wants this line dropped
}

/** A customer's structured, per-line counter to a quote (kept lines + prices). */
export interface LineCounter {
  items: LineCounterItem[];
  note?: string;
  total: number;  // recomputed from the kept lines (pre-discount/VAT summary)
  at: number;
  by: string;     // customer uid
}

/** Subtotal / VAT / grand total for a set of quote items. */
export function computeQuote(items: QuoteItem[], discount = 0, vatRate = 0) {
  const subtotal = items.reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const vat = Math.round(((subtotal - discount) * vatRate) / 100);
  const total = subtotal - discount + vat;
  return { subtotal, vat, total };
}

export interface Bid {
  id: string;
  jobId: string;
  technicianId: string;
  technicianName?: string;
  technicianImage?: string;
  technicianRating?: number;
  technicianReviewCount?: number;
  price: number; // canonical amount (= quote total when itemized)
  etaDays?: number;
  note?: string;
  // itemized quotation (optional — flat-price bids omit these)
  items?: QuoteItem[];
  subtotal?: number;
  discount?: number;
  vatRate?: number;
  vat?: number;
  total?: number;
  // light on-site survey
  surveyNote?: string;
  surveyPhotos?: string[];
  surveyChecklist?: SurveyCheck[];
  // work classification (set during the survey/quote)
  workType?: string; // repair | extend | newbuild | ... (from serviceConfig)
  workContinuity?: string; // fresh | continued
  workContinuityNote?: string; // condition/handover note when continued from another tech
  paymentPlan?: PaymentPlan;
  validUntil?: number;
  status: BidStatus;
  // line-level counter (a customer's proposed per-line BOQ, pending the tech's OK)
  lineCounter?: LineCounter;
  // revision / versioning (negotiation loop)
  version?: number; // 1-based; bumped each time the tech revises
  revisionRequested?: boolean; // customer asked for a revised quote
  revisionNote?: string; // human-readable summary of what the customer wants
  revisionRequest?: RevisionRequestInput; // structured request
  revisionRequestedAt?: number;
  revisedAt?: number; // last time the tech revised it
  createdAt: number;
}

export interface CreateBidInput {
  jobId: string;
  technicianId: string;
  price: number;
  etaDays?: number;
  note?: string;
  items?: QuoteItem[];
  subtotal?: number;
  discount?: number;
  vatRate?: number;
  vat?: number;
  total?: number;
  surveyNote?: string;
  surveyPhotos?: string[];
  surveyChecklist?: SurveyCheck[];
  workType?: string;
  workContinuity?: string;
  workContinuityNote?: string;
  paymentPlan?: PaymentPlan;
  validUntil?: number;
}

function mapBid(id: string, data: any): Bid {
  const out: any = { id };
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = v instanceof Timestamp ? v.toMillis() : v;
  }
  if (typeof out.createdAt !== 'number') out.createdAt = Date.now();
  return out as Bid;
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

export async function createBid(input: CreateBidInput): Promise<string> {
  // Denormalize technician info for display in the bids list
  const techSnap = await getDoc(doc(db, 'users', input.technicianId));
  const tech = techSnap.data() ?? {};
  const ref = await addDoc(
    collection(db, 'bids'),
    strip({
      ...input,
      technicianName: tech.name ?? tech.firstName ?? 'ຊ່າງ',
      technicianImage: tech.image,
      technicianRating: tech.rating,
      technicianReviewCount: tech.reviewCount,
      status: 'pending' as BidStatus,
      version: 1,
      createdAt: serverTimestamp(),
    }),
  );
  // bump the denormalized interested-technician counter (best-effort)
  try {
    await updateDoc(doc(db, 'jobs', input.jobId), { bidCount: increment(1) });
  } catch {
    /* counter is best-effort */
  }
  // notify the job owner
  try {
    const jobSnap = await getDoc(doc(db, 'jobs', input.jobId));
    const job = jobSnap.data();
    await notify(job?.customerId, {
      type: 'bid',
      title: 'ມີໃບສະເໜີລາຄາໃໝ່',
      body: `${tech.name ?? tech.firstName ?? 'ຊ່າງ'} ສະເໜີລາຄາໃຫ້ງານ "${job?.title ?? ''}"`,
      link: `/jobs/${input.jobId}`,
    });
  } catch {
    /* notify is best-effort */
  }
  return ref.id;
}

export function watchBidsForJob(jobId: string, cb: (bids: Bid[]) => void) {
  const q = query(collection(db, 'bids'), where('jobId', '==', jobId));
  return onSnapshot(
    q,
    (snap) => {
      const bids = snap.docs.map((d) => mapBid(d.id, d.data()));
      bids.sort((a, b) => a.price - b.price); // cheapest first
      cb(bids);
    },
    (err) => {
      console.error('watchBidsForJob:', err);
      cb([]);
    },
  );
}

/** All quotations across every job (admin monitoring). */
export function watchAllBids(cb: (bids: Bid[]) => void) {
  return onSnapshot(
    collection(db, 'bids'),
    (snap) => {
      const bids = snap.docs.map((d) => mapBid(d.id, d.data()));
      bids.sort((a, b) => b.createdAt - a.createdAt);
      cb(bids);
    },
    (err) => {
      console.error('watchAllBids:', err);
      cb([]);
    },
  );
}

/** The accepted bid for a job (for invoices / receipts), or null. */
export async function getAcceptedBid(jobId: string): Promise<Bid | null> {
  // Single-field query + client-side status filter, to avoid a composite index.
  const snap = await getDocs(query(collection(db, 'bids'), where('jobId', '==', jobId)));
  const accepted = snap.docs
    .map((d) => mapBid(d.id, d.data()))
    .find((b) => b.status === 'accepted');
  return accepted ?? null;
}

export function watchMyBids(technicianId: string, cb: (bids: Bid[]) => void) {
  const q = query(collection(db, 'bids'), where('technicianId', '==', technicianId));
  return onSnapshot(
    q,
    (snap) => {
      const bids = snap.docs.map((d) => mapBid(d.id, d.data()));
      bids.sort((a, b) => b.createdAt - a.createdAt);
      cb(bids);
    },
    (err) => {
      console.error('watchMyBids:', err);
      cb([]);
    },
  );
}

/** Accept a bid: job → assigned + assignedProvider + finalPrice; other bids → rejected. */
export async function acceptBid(bidId: string, callerId: string) {
  const bidSnap = await getDoc(doc(db, 'bids', bidId));
  if (!bidSnap.exists()) throw new Error('ບໍ່ພົບຄຳສະເໜີ');
  const bid = mapBid(bidSnap.id, bidSnap.data());

  const jobSnap = await getDoc(doc(db, 'jobs', bid.jobId));
  if (!jobSnap.exists()) throw new Error('ບໍ່ພົບງານ');
  const job = jobSnap.data();
  if (job.customerId !== callerId) throw new Error('ສະເພາະເຈົ້າຂອງງານ ເລືອກໄດ້');

  const allBids = await getDocs(
    query(collection(db, 'bids'), where('jobId', '==', bid.jobId)),
  );

  const plan = bid.paymentPlan;
  const installments = plan && plan.type !== 'full' ? buildInstallments(bid.price, plan) : [];

  const batch = writeBatch(db);
  batch.update(doc(db, 'jobs', bid.jobId), {
    status: 'assigned',
    assignedProviderId: bid.technicianId,
    assignedProviderName: bid.technicianName ?? null,
    finalPrice: bid.price,
    assignedAt: serverTimestamp(),
    // 4-digit arrival code — the customer shows it to the technician on-site so
    // the tech can confirm arrival (same pattern as the rider handoverCode).
    arrivalCode: String(Math.floor(1000 + Math.random() * 9000)),
    ...(installments.length > 0 ? { paymentPlan: plan, paymentInstallments: installments } : {}),
  });
  allBids.forEach((b) => {
    batch.update(doc(db, 'bids', b.id), {
      status: b.id === bidId ? 'accepted' : 'rejected',
    });
  });
  await batch.commit();

  // notify the chosen technician
  await notify(bid.technicianId, {
    type: 'bid_accepted',
    title: 'ໃບສະເໜີຂອງເຈົ້າຖືກເລືອກ 🎉',
    body: `ລູກຄ້າເລືອກເຈົ້າສຳລັບງານ "${job.title ?? ''}"`,
    link: `/jobs/${bid.jobId}`,
  });
}

export async function withdrawBid(bidId: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'bids', bidId), { status: 'withdrawn' });
  await batch.commit();
}

/** A structured "ask for revision / discount" request. */
export interface RevisionRequestInput {
  scope: 'whole' | 'line';
  lineLabel?: string; // which line, when scope==='line'
  type: 'percent' | 'amount' | 'other';
  value?: number; // % or kip
  note?: string;
}

/** Human-readable one-line summary of a revision request. */
export function summariseRevision(req: RevisionRequestInput): string {
  const scope = req.scope === 'line' && req.lineLabel ? `ລາຍການ "${req.lineLabel}"` : 'ທັງ ໃບ';
  const ask =
    req.type === 'percent' ? `ຫຼຸດ ${req.value ?? 0}%`
    : req.type === 'amount' ? `ຫຼຸດ ${(req.value ?? 0).toLocaleString('en-US')} ກີບ`
    : 'ຂໍ ໃຫ້ ແກ້';
  return `${ask} (${scope})${req.note ? ` — ${req.note}` : ''}`;
}

/** Customer asks the technician to revise a (still-pending) quote. The request
 * is stored structured on the bid AND posted to the 1:1 chat for discussion. */
export async function requestBidRevision(bidId: string, req: RevisionRequestInput, callerId: string) {
  const bidSnap = await getDoc(doc(db, 'bids', bidId));
  if (!bidSnap.exists()) throw new Error('ບໍ່ພົບຄຳສະເໜີ');
  const bid = mapBid(bidSnap.id, bidSnap.data());
  if (bid.status !== 'pending') throw new Error('ຂໍ ໃຫ້ ແກ້ ໄດ້ ສະເພາະ ໃບສະເໜີ ທີ່ ຍັງ ລໍຕອບ');
  const jobSnap = await getDoc(doc(db, 'jobs', bid.jobId));
  const job = jobSnap.data();
  if (job?.customerId !== callerId) throw new Error('ສະເພາະ ເຈົ້າຂອງ ງານ ຂໍ ໃຫ້ ແກ້ ໄດ້');
  const summary = summariseRevision(req);
  await updateDoc(doc(db, 'bids', bidId), {
    revisionRequested: true,
    revisionNote: summary,
    revisionRequest: strip({ scope: req.scope, lineLabel: req.lineLabel, type: req.type, value: req.value, note: req.note?.trim() || undefined }),
    revisionRequestedAt: serverTimestamp(),
  });
  await notify(bid.technicianId, {
    type: 'bid',
    title: 'ລູກຄ້າ ຂໍ ໃຫ້ ແກ້ ໃບສະເໜີ ✏️',
    body: summary,
    link: `/jobs/${bid.jobId}`,
  }).catch(() => {});
  // surface the negotiation in the 1:1 chat
  try {
    const cid = await getOrCreateConversation(callerId, bid.technicianId, { jobId: bid.jobId, jobTitle: job?.title ?? '' });
    await sendMessage(cid, callerId, `🔧 ຂໍ ໃຫ້ ແກ້ ໃບສະເໜີ: ${summary}`);
  } catch (e) { console.error('revision chat post:', e); }
}

/** Customer sends a LINE-LEVEL counter — a proposed BOQ (which lines to keep +
 * a proposed price per line). Stored on the bid + surfaced in chat; the tech
 * accepts (→ reviseBid to that BOQ) or declines. */
export async function sendLineCounter(bidId: string, items: LineCounterItem[], note: string | undefined, callerId: string) {
  const bidSnap = await getDoc(doc(db, 'bids', bidId));
  if (!bidSnap.exists()) throw new Error('ບໍ່ພົບຄຳສະເໜີ');
  const bid = mapBid(bidSnap.id, bidSnap.data());
  if (bid.status !== 'pending') throw new Error('ຕໍ່ ລອງ ໄດ້ ສະເພາະ ໃບສະເໜີ ທີ່ ຍັງ ລໍຕອບ');
  const jobSnap = await getDoc(doc(db, 'jobs', bid.jobId));
  const job = jobSnap.data();
  if (job?.customerId !== callerId) throw new Error('ສະເພາະ ເຈົ້າຂອງ ງານ ຕໍ່ ລອງ ໄດ້');
  const kept = items.filter((x) => x.keep);
  if (!kept.length) throw new Error('ຕ້ອງ ເກັບ ໄວ້ ຢ່າງ ໜ້ອຍ 1 ລາຍການ');
  const total = kept.reduce((s, x) => s + (Number(x.qty) || 0) * (Number(x.unitPrice) || 0), 0);
  const counter: LineCounter = {
    items: items.map((x) => ({ desc: x.desc, qty: Number(x.qty) || 0, unit: x.unit, unitPrice: Math.round(Number(x.unitPrice) || 0), keep: !!x.keep })),
    note: note?.trim() || undefined, total, at: Date.now(), by: callerId,
  };
  await updateDoc(doc(db, 'bids', bidId), { lineCounter: strip(counter as any), revisionRequested: true });
  const dropped = items.length - kept.length;
  const summary = `ຕໍ່ ລອງ ຕໍ່ ລາຍການ: ເກັບ ${kept.length}${dropped ? `, ຕັດ ${dropped}` : ''} ລາຍການ · ລວມ ${total.toLocaleString('en-US')} ກີບ`;
  await notify(bid.technicianId, { type: 'bid', title: 'ລູກຄ້າ ຕໍ່ ລອງ ຕໍ່ ລາຍການ ✏️', body: summary, link: `/jobs/${bid.jobId}` }).catch(() => {});
  try {
    const cid = await getOrCreateConversation(callerId, bid.technicianId, { jobId: bid.jobId, jobTitle: job?.title ?? '' });
    await sendMessage(cid, callerId, `🧾 ${summary}${counter.note ? ` — ${counter.note}` : ''}`);
  } catch (e) { console.error('lineCounter chat:', e); }
}

/** Technician accepts a line-level counter → applies it as a revised quote. */
export async function acceptLineCounter(bidId: string, callerId: string) {
  const bidSnap = await getDoc(doc(db, 'bids', bidId));
  if (!bidSnap.exists()) throw new Error('ບໍ່ພົບຄຳສະເໜີ');
  const bid = mapBid(bidSnap.id, bidSnap.data());
  if (bid.technicianId !== callerId) throw new Error('ສະເພາະ ຊ່າງ ເຈົ້າຂອງ ໃບສະເໜີ');
  const lc = bid.lineCounter;
  if (!lc) throw new Error('ບໍ່ ມີ ຄຳ ຕໍ່ ລອງ');
  const revisedItems: QuoteItem[] = lc.items.filter((x) => x.keep).map((x) => ({ desc: x.desc, qty: x.qty, unit: x.unit, unitPrice: x.unitPrice }));
  if (!revisedItems.length) throw new Error('ບໍ່ ມີ ລາຍການ ເຫຼືອ');
  const subtotal = revisedItems.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const discount = Math.min(bid.discount ?? 0, subtotal);
  const vatRate = bid.vatRate ?? 0;
  const vat = Math.round(((subtotal - discount) * vatRate) / 100);
  const total = subtotal - discount + vat;
  await reviseBid(bidId, {
    price: total, items: revisedItems, subtotal, discount, vatRate, vat, total,
    workType: bid.workType, workContinuity: bid.workContinuity, workContinuityNote: bid.workContinuityNote,
    paymentPlan: bid.paymentPlan, etaDays: bid.etaDays, note: bid.note,
    surveyNote: bid.surveyNote, surveyPhotos: bid.surveyPhotos, surveyChecklist: bid.surveyChecklist,
    validUntil: bid.validUntil,
  });
  await updateDoc(doc(db, 'bids', bidId), { lineCounter: null });
}

/** Technician declines a line-level counter — keeps the current quote. */
export async function declineLineCounter(bidId: string, callerId: string) {
  const bidSnap = await getDoc(doc(db, 'bids', bidId));
  if (!bidSnap.exists()) throw new Error('ບໍ່ພົບຄຳສະເໜີ');
  const bid = mapBid(bidSnap.id, bidSnap.data());
  if (bid.technicianId !== callerId) throw new Error('ສະເພາະ ຊ່າງ ເຈົ້າຂອງ ໃບສະເໜີ');
  await updateDoc(doc(db, 'bids', bidId), { lineCounter: null, revisionRequested: false });
  const job = (await getDoc(doc(db, 'jobs', bid.jobId))).data();
  try {
    if (job?.customerId) {
      const cid = await getOrCreateConversation(bid.technicianId, job.customerId, { jobId: bid.jobId, jobTitle: job.title ?? '' });
      await sendMessage(cid, bid.technicianId, '↩ ຊ່າງ ຂໍ ຄົງ ລາຄາ ເດີມ — ຄຸຍ ຕໍ່ ໄດ້');
    }
  } catch { /* best-effort */ }
  await notify(job?.customerId, { type: 'bid', title: 'ຊ່າງ ຄົງ ລາຄາ ເດີມ', body: 'ຄຳ ຕໍ່ ລອງ ຕໍ່ ລາຍການ ບໍ່ ຖືກ ຮັບ — ຄຸຍ ຕໍ່ ໄດ້', link: `/jobs/${bid.jobId}` }).catch(() => {});
}

/** Technician submits a revised quote — bumps the version, keeps the same bid. */
export async function reviseBid(bidId: string, input: Partial<CreateBidInput>) {
  const bidSnap = await getDoc(doc(db, 'bids', bidId));
  if (!bidSnap.exists()) throw new Error('ບໍ່ພົບຄຳສະເໜີ');
  const bid = mapBid(bidSnap.id, bidSnap.data());
  const nextVersion = (bid.version ?? 1) + 1;
  // G5: keep the OUTGOING version as immutable history before overwriting it, so
  // both sides can compare v1 / v2 / v3 later (reviseBid replaces in place).
  try {
    await setDoc(doc(db, 'bids', bidId, 'versions', String(bid.version ?? 1)), strip({
      version: bid.version ?? 1,
      price: bid.price,
      items: bid.items,
      subtotal: bid.subtotal,
      discount: bid.discount,
      vatRate: bid.vatRate,
      vat: bid.vat,
      total: bid.total,
      note: bid.note,
      etaDays: bid.etaDays,
      workType: bid.workType,
      revisionNote: bid.revisionNote, // the ask that led to the NEXT version
      revisedAt: bid.revisedAt ?? bid.createdAt,
      archivedAt: serverTimestamp(),
    }));
  } catch (e) { console.error('snapshot bid version:', e); }
  // A revision fully REPLACES the previous version. Fields the technician can
  // clear (discount, survey photos/notes, eta, validity, …) must be written with
  // explicit empty values — never strip()'d away — otherwise Firestore keeps the
  // stale value while the totals are recomputed without it, and the invoice no
  // longer foots (e.g. a removed discount still shows a "-50,000" line above a
  // grand total that doesn't subtract it).
  await updateDoc(doc(db, 'bids', bidId), strip({
    // always-present quote figures (safe to strip if somehow omitted)
    price: input.price,
    items: input.items,
    subtotal: input.subtotal,
    vatRate: input.vatRate,
    vat: input.vat,
    total: input.total,
    workType: input.workType,
    workContinuity: input.workContinuity,
    paymentPlan: input.paymentPlan,
    // clearable fields — coerce to explicit empties so a revision overwrites v-1
    discount: input.discount ?? 0,
    etaDays: input.etaDays ?? null,
    note: input.note ?? '',
    surveyNote: input.surveyNote ?? '',
    surveyPhotos: input.surveyPhotos ?? [],
    surveyChecklist: input.surveyChecklist ?? [],
    workContinuityNote: input.workContinuityNote ?? '',
    validUntil: input.validUntil ?? null,
    // versioning / status
    version: nextVersion,
    revisionRequested: false,
    revisedAt: serverTimestamp(),
    status: 'pending' as BidStatus,
  }));
  try {
    const jobSnap = await getDoc(doc(db, 'jobs', bid.jobId));
    const job = jobSnap.data();
    await notify(job?.customerId, {
      type: 'bid',
      title: `ໃບສະເໜີ ຖືກ ແກ້ໄຂ ໃໝ່ (v${nextVersion}) 🔁`,
      body: `${bid.technicianName ?? 'ຊ່າງ'} ສົ່ງ ໃບສະເໜີ ສະບັບ ໃໝ່`,
      link: `/jobs/${bid.jobId}`,
    });
    // post the revised quote into the negotiation chat as an interactive card
    if (job?.customerId) {
      const cid = await getOrCreateConversation(bid.technicianId, job.customerId, { jobId: bid.jobId, jobTitle: job.title ?? '' });
      await sendQuoteCard(cid, bid.technicianId, {
        bidId,
        jobId: bid.jobId,
        version: nextVersion,
        total: input.total ?? bid.total ?? bid.price ?? 0,
        itemCount: (input.items ?? bid.items ?? []).length,
        status: 'pending',
      });
    }
  } catch (e) { console.error('revise chat/notify:', e); }
}

// ============ price negotiation in chat (quote card + counter-offer) ============

/** Customer opens the negotiation: seeds the current quote as a card in the 1:1
 * chat and returns the conversation id (to navigate to). */
export async function openQuoteInChat(bidId: string, callerId: string): Promise<string> {
  const bidSnap = await getDoc(doc(db, 'bids', bidId));
  if (!bidSnap.exists()) throw new Error('ບໍ່ພົບຄຳສະເໜີ');
  const bid = mapBid(bidSnap.id, bidSnap.data());
  const jobSnap = await getDoc(doc(db, 'jobs', bid.jobId));
  const job = jobSnap.data();
  const cid = await getOrCreateConversation(callerId, bid.technicianId, { jobId: bid.jobId, jobTitle: job?.title ?? '' });
  await sendQuoteCard(cid, callerId, {
    bidId,
    jobId: bid.jobId,
    version: bid.version ?? 1,
    total: bid.total ?? bid.price ?? 0,
    itemCount: (bid.items ?? []).length,
    status: bid.status,
  });
  return cid;
}

/** Customer proposes a counter grand-total; posts a structured counter bubble. */
export async function sendCustomerCounter(bidId: string, amount: number, note: string | undefined, callerId: string) {
  const bidSnap = await getDoc(doc(db, 'bids', bidId));
  if (!bidSnap.exists()) throw new Error('ບໍ່ພົບຄຳສະເໜີ');
  const bid = mapBid(bidSnap.id, bidSnap.data());
  const jobSnap = await getDoc(doc(db, 'jobs', bid.jobId));
  const job = jobSnap.data();
  const cid = await getOrCreateConversation(callerId, bid.technicianId, { jobId: bid.jobId, jobTitle: job?.title ?? '' });
  await sendCounterOffer(cid, callerId, 'customer', amount, { bidId, jobId: bid.jobId, note });
  await notify(bid.technicianId, {
    type: 'bid',
    title: 'ລູກຄ້າ ຂໍ ຕໍ່ ລາຄາ 💬',
    body: `ຂໍ ເປັນ ${amount.toLocaleString('en-US')} ກີບ`,
    link: `/jobs/${bid.jobId}`,
  }).catch(() => {});
}

/** Technician settles a negotiation on an agreed grand total: reruns the quote
 * with a VAT-aware discount so the total lands exactly on the number, then
 * reviseBid posts the fresh quote card. Used by "accept counter" / "counter back". */
export async function reviseBidToTotal(bidId: string, targetTotal: number) {
  const bidSnap = await getDoc(doc(db, 'bids', bidId));
  if (!bidSnap.exists()) throw new Error('ບໍ່ພົບຄຳສະເໜີ');
  const bid = mapBid(bidSnap.id, bidSnap.data());
  const items = bid.items ?? [];
  const rate = bid.vatRate ?? 0;
  const subtotal = bid.subtotal ?? computeQuote(items).subtotal;
  const discount = Math.max(0, Math.round(subtotal - targetTotal / (1 + rate / 100)));
  const { subtotal: s, vat, total } = computeQuote(items, discount, rate);
  await reviseBid(bidId, {
    items,
    subtotal: s,
    discount,
    vatRate: rate,
    vat,
    total,
    price: total,
    // preserve the non-price parts of the quote across the re-price
    etaDays: bid.etaDays,
    note: bid.note,
    workType: bid.workType,
    workContinuity: bid.workContinuity,
    workContinuityNote: bid.workContinuityNote,
    paymentPlan: bid.paymentPlan,
    validUntil: bid.validUntil,
    surveyNote: bid.surveyNote,
    surveyPhotos: bid.surveyPhotos,
    surveyChecklist: bid.surveyChecklist,
  });
}

/** Technician declines a counter — posts a plain notice into the thread. */
export async function declineCounter(bidId: string, callerId: string, amount: number) {
  const bidSnap = await getDoc(doc(db, 'bids', bidId));
  if (!bidSnap.exists()) return;
  const bid = mapBid(bidSnap.id, bidSnap.data());
  const jobSnap = await getDoc(doc(db, 'jobs', bid.jobId));
  const job = jobSnap.data();
  const cid = await getOrCreateConversation(callerId, job?.customerId ?? '', { jobId: bid.jobId, jobTitle: job?.title ?? '' });
  await sendMessage(cid, callerId, `❌ ຂໍໂທດ, ຮັບ ລາຄາ ${amount.toLocaleString('en-US')} ກີບ ບໍ່ ໄດ້ — ຂໍ ຮັກສາ ລາຄາ ເດີມ`);
}

// ============ retained quote version history (G5) ============

/** One archived (superseded) version of a quotation. */
export interface BidVersion {
  version: number;
  price?: number;
  items?: QuoteItem[];
  subtotal?: number;
  discount?: number;
  vatRate?: number;
  vat?: number;
  total?: number;
  note?: string;
  etaDays?: number;
  workType?: string;
  revisionNote?: string;
  revisedAt?: number;
  archivedAt?: number;
}

/** All archived versions of a bid, newest first (the LIVE bid is the current one). */
export function watchBidVersions(bidId: string, cb: (v: BidVersion[]) => void) {
  return onSnapshot(
    collection(db, 'bids', bidId, 'versions'),
    (snap) => {
      const list = snap.docs.map((d) => {
        const data: any = d.data();
        const out: any = {};
        for (const [k, v] of Object.entries(data)) out[k] = v instanceof Timestamp ? v.toMillis() : v;
        return out as BidVersion;
      });
      list.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
      cb(list);
    },
    (e) => { console.error('watchBidVersions:', e); cb([]); },
  );
}

/** Live single bid (the current/latest version). */
export function watchBid(bidId: string, cb: (b: Bid | null) => void) {
  return onSnapshot(doc(db, 'bids', bidId), (snap) => cb(snap.exists() ? mapBid(snap.id, snap.data()) : null));
}
