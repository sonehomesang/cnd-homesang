import {
  addDoc,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { notify } from './notifications';
import { uploadImage } from './storage';
import { addAssetHistory, newHistoryId, type AssetHistoryType } from './assets';

export type JobStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'pending_payment';

export type PaymentMethod = 'cash' | 'transfer' | 'qr';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, { lao: string; icon: string }> = {
  cash: { lao: 'ເງິນສົດ', icon: '💵' },
  transfer: { lao: 'ໂອນທະນາຄານ', icon: '🏦' },
  qr: { lao: 'QR / ພ້ອມເພ', icon: '📱' },
};

/** Payment plan set by the technician on a quotation. */
export interface PaymentPlan {
  type: 'full' | 'deposit' | 'installments';
  depositPct?: number; // for 'deposit'
  installmentCount?: number; // for 'installments'
}

/** One scheduled payment (deposit or installment). */
export interface Installment {
  label: string;
  amount: number;
  dueAt?: number;
  paidByCustomerAt?: number; // customer marked paid (step 1)
  method?: PaymentMethod;
  slip?: string;
  confirmedAt?: number; // technician/admin confirmed receipt (step 2)
}

/** Build the schedule from a total + plan (empty for 'full'). */
export function buildInstallments(total: number, plan?: PaymentPlan): Installment[] {
  if (!plan || plan.type === 'full') return [];
  if (plan.type === 'deposit') {
    const pct = Math.min(95, Math.max(5, plan.depositPct ?? 30));
    const dep = Math.round((total * pct) / 100);
    return [
      { label: `ມັດຈຳ ${pct}%`, amount: dep },
      { label: 'ສ່ວນທີ່ເຫຼືອ', amount: total - dep },
    ];
  }
  const n = Math.min(12, Math.max(2, plan.installmentCount ?? 2));
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({
    label: `ງວດ ${i + 1}/${n}`,
    amount: i === n - 1 ? total - base * (n - 1) : base,
  }));
}

export const JOB_STATUS_LABEL: Record<JobStatus, { lao: string; en: string }> = {
  open: { lao: 'ເປີດຮັບ', en: 'Open' },
  assigned: { lao: 'ມີຊ່າງຮັບ', en: 'Assigned' },
  in_progress: { lao: 'ກຳລັງເຮັດ', en: 'In progress' },
  completed: { lao: 'ສຳເລັດ', en: 'Completed' },
  cancelled: { lao: 'ຍົກເລີກ', en: 'Cancelled' },
  pending_payment: { lao: 'ລໍຈ່າຍ', en: 'Pending payment' },
};

export interface Job {
  id: string;
  customerId: string;
  customerName?: string;
  category: string;
  title: string;
  description: string;
  address?: string;
  lat?: number;
  lng?: number;
  budget?: number;
  preferredDate?: number;
  /** application deadline — after this the posting stops accepting bids */
  closeAt?: number;
  /** customer wants the technician to do an on-site survey before quoting */
  surveyRequested?: boolean;
  /** urgent / emergency posting — floats to the top of the feed + instant-alerts techs */
  urgent?: boolean;
  urgentFee?: number; // snapshot of the urgent fee charged at post time

  // refundable survey fee (snapshot of the config at post time)
  surveyFee?: number;
  surveyFeeMode?: 'prepay' | 'agree';
  surveyFeePaid?: boolean; // prepay: fee collected (set server-side by spendWallet)
  surveyFeePaidAt?: number;
  /** prepay outcome once the job ends: refunded to the customer, or forfeited to the tech */
  surveyFeeSettled?: 'refunded' | 'forfeited';
  surveyFeeSlipUrl?: string; // (legacy) prepay payment slip — prepay now debits the wallet
  /** number of technicians who have submitted a bid/quotation (denormalized) */
  bidCount?: number;
  photos?: string[];
  status: JobStatus;
  assignedProviderId?: string;
  assignedProviderName?: string;
  finalPrice?: number;
  assignedAt?: number;
  /** 4-digit code the customer shows the assigned tech to confirm on-site arrival */
  arrivalCode?: string;
  arrivedAt?: number; // tech confirmed arrival with the customer's code
  startedAt?: number;
  /** technician's self-reported completion percentage (0–100) while working */
  progressPct?: number;
  techDoneAt?: number;
  /** before/after evidence the technician attaches when marking the work done */
  completionPhotos?: string[];
  completedAt?: number;
  // payment / settlement
  workConfirmedAt?: number; // customer confirmed the work is done (→ pending_payment)
  paymentMethod?: PaymentMethod;
  paidByCustomerAt?: number; // customer marked "paid"
  paymentSlip?: string; // optional transfer/QR slip photo
  paymentConfirmedAt?: number; // technician confirmed receipt (→ completed)
  paymentPlan?: PaymentPlan; // installment/deposit plan (from the accepted quote)
  paymentInstallments?: Installment[]; // schedule when a plan is set
  customerReviewed?: boolean;
  techReviewed?: boolean;
  // customer's sign-to-accept on the quotation
  signatureUrl?: string;
  signedAt?: number;
  signedByName?: string;
  // customer accepted the job-specific service terms at accept-quote time
  termsAcceptedAt?: number;
  termsAcceptedByName?: string;
  // customer's sign-off ACCEPTING the finished work (handover)
  acceptanceComment?: string;
  acceptanceSignatureUrl?: string;
  acceptanceSignedByName?: string;
  acceptedAt?: number;
  // completion inspection + warranty + manual (handover pack)
  inspection?: { items: { label: string; pass: boolean; note?: string }[]; passCount: number; total: number; inspectedAt: number };
  parameters?: { key: string; unit?: string; standard?: string; actual?: string; ok?: boolean; custom?: boolean }[];
  warrantyMonths?: number;
  warrantyTerms?: string;
  manualUrl?: string;
  manualNote?: string;
  // cancellation / reassignment
  cancelledBy?: 'customer' | 'technician' | 'admin';
  cancelReason?: string;
  cancelledAt?: number;
  /** how many times this job was reopened after a provider dropped out */
  reassignCount?: number;
  /** providers removed mid-job (used to derive provider reliability) */
  abandonedProviderIds?: string[];
  // optional link to a registered Site + a specific room (Building Registry)
  siteId?: string;
  roomId?: string;
  roomName?: string;
  /** room specs snapshot at post time (dims/area/volume/wall/sun) for the tech */
  roomSpecs?: { label: string; value: string }[];
  /** optional link to a registered asset the job is about (auto-logs history) */
  assetId?: string;
  assetName?: string;
  createdAt: number;
}

export interface CreateJobInput {
  customerId: string;
  customerName?: string;
  category: string;
  title: string;
  description: string;
  address?: string;
  lat?: number;
  lng?: number;
  budget?: number;
  preferredDate?: number;
  closeAt?: number;
  surveyRequested?: boolean;
  urgent?: boolean;
  urgentFee?: number;
  surveyFee?: number;
  surveyFeeMode?: 'prepay' | 'agree';
  surveyFeePaid?: boolean;
  surveyFeeSlipUrl?: string;
  photos?: string[];
  siteId?: string;
  roomId?: string;
  roomName?: string;
  roomSpecs?: { label: string; value: string }[];
  assetId?: string;
  assetName?: string;
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mapJob(id: string, data: any): Job {
  const out: any = { id };
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = v instanceof Timestamp ? v.toMillis() : v;
  }
  if (typeof out.createdAt !== 'number') out.createdAt = Date.now();
  return out as Job;
}

/** Default application window: 7 days from posting. */
const DEFAULT_OPEN_DAYS = 7;

export async function createJob(input: CreateJobInput): Promise<string> {
  const ref = await addDoc(collection(db, 'jobs'), {
    ...stripUndefined(input as unknown as Record<string, unknown>),
    status: 'open' as JobStatus,
    bidCount: 0,
    closeAt: input.closeAt ?? Date.now() + DEFAULT_OPEN_DAYS * 86400000,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Instant booking: create a job already assigned to a chosen technician at an
 * agreed price (skips the open/bidding stage). Returns the new job id.
 */
export async function createInstantJob(input: {
  customerId: string;
  technicianId: string;
  technicianName?: string;
  category: string;
  title: string;
  description: string;
  address?: string;
  lat?: number;
  lng?: number;
  price: number;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'jobs'), {
    ...stripUndefined({
      customerId: input.customerId,
      category: input.category,
      title: input.title,
      description: input.description,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      assignedProviderId: input.technicianId,
      assignedProviderName: input.technicianName,
      finalPrice: input.price,
      budget: input.price,
    }),
    status: 'assigned' as JobStatus,
    instantBooked: true,
    assignedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  try {
    await notify(input.technicianId, {
      type: 'workflow',
      title: 'ມີການຈ້າງໂດຍກົງ ⚡',
      body: input.title,
      link: `/jobs/${ref.id}`,
    });
  } catch {
    /* best-effort */
  }
  return ref.id;
}

export function watchMyJobs(
  customerId: string,
  callback: (jobs: Job[]) => void,
  statusFilter?: JobStatus,
) {
  // Filter only (single-field index always exists). Sort client-side so we
  // never depend on a composite index that might not be deployed yet.
  const q = query(collection(db, 'jobs'), where('customerId', '==', customerId));
  return onSnapshot(
    q,
    (snap) => {
      let jobs = snap.docs.map((d) => mapJob(d.id, d.data()));
      jobs.sort((a, b) => b.createdAt - a.createdAt);
      if (statusFilter) jobs = jobs.filter((j) => j.status === statusFilter);
      callback(jobs);
    },
    (err) => {
      console.error('watchMyJobs error:', err);
      callback([]);
    },
  );
}

/** Jobs a technician has been assigned to (won the bid) — "ວຽກ ທີ່ ຂ້ອຍ ຮັບ". */
export function watchAssignedJobs(technicianId: string, callback: (jobs: Job[]) => void) {
  const q = query(collection(db, 'jobs'), where('assignedProviderId', '==', technicianId));
  return onSnapshot(
    q,
    (snap) => {
      const jobs = snap.docs.map((d) => mapJob(d.id, d.data()));
      jobs.sort((a, b) => b.createdAt - a.createdAt);
      callback(jobs);
    },
    (err) => { console.error('watchAssignedJobs error:', err); callback([]); },
  );
}

/** All jobs linked to a registered Site (Building Registry Dossier feed). */
export function watchJobsForSite(siteId: string, callback: (jobs: Job[]) => void) {
  const q = query(collection(db, 'jobs'), where('siteId', '==', siteId));
  return onSnapshot(
    q,
    (snap) => {
      const jobs = snap.docs.map((d) => mapJob(d.id, d.data()));
      jobs.sort((a, b) => b.createdAt - a.createdAt);
      callback(jobs);
    },
    (err) => { console.error('watchJobsForSite error:', err); callback([]); },
  );
}

export function watchJob(jobId: string, callback: (job: Job | null) => void) {
  return onSnapshot(
    doc(db, 'jobs', jobId),
    (snap) => callback(snap.exists() ? mapJob(snap.id, snap.data()) : null),
    // jobs are signed-in only now; a logged-out reader gets permission-denied —
    // resolve to null so the screen shows its gate instead of hanging on loading
    (e) => { console.error('watchJob:', e); callback(null); },
  );
}

export async function getJob(jobId: string): Promise<Job | null> {
  const snap = await getDoc(doc(db, 'jobs', jobId));
  if (!snap.exists()) return null;
  return mapJob(snap.id, snap.data());
}

/** Open jobs not owned by the given user (for technicians to browse). */
export function watchOpenJobs(
  excludeUserId: string,
  callback: (jobs: Job[]) => void,
) {
  // Reads the world-readable jobCards PROJECTION (coarse area, ~1 km rounded
  // coords, no poster name / full address / phone) so the Explore feed + map work
  // for logged-out visitors without exposing the poster's PII. The full job doc
  // is signed-in only and loaded on the job-detail screen.
  // cap the open-jobs feed — non-breaking now (client sorts urgent+newest), bounds
  // the worst-case download as postings grow; beyond this, add pagination.
  const q = query(collection(db, 'jobCards'), where('status', '==', 'open'), limit(300));
  return onSnapshot(
    q,
    (snap) => {
      const jobs = snap.docs
        .map((d) => { const j = mapJob(d.id, d.data()); (j as any).address = (d.data() as any).area ?? ''; return j; })
        .filter((j) => j.customerId !== excludeUserId);
      // urgent posts float to the top, then newest-first
      jobs.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || b.createdAt - a.createdAt);
      callback(jobs);
    },
    (err) => {
      console.error('watchOpenJobs:', err);
      callback([]);
    },
  );
}

/** All jobs (public showcase on landing). Sorted newest first. */
export function watchAllJobs(callback: (jobs: Job[]) => void) {
  const q = query(collection(db, 'jobs'));
  return onSnapshot(
    q,
    (snap) => {
      const jobs = snap.docs.map((d) => mapJob(d.id, d.data()));
      jobs.sort((a, b) => b.createdAt - a.createdAt);
      callback(jobs);
    },
    (err) => {
      console.error('watchAllJobs:', err);
      callback([]);
    },
  );
}

/** Haversine distance in km between two coordinates. */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function cancelJob(
  jobId: string,
  by: 'customer' | 'technician' | 'admin' = 'customer',
  reason?: string,
) {
  await updateDoc(
    doc(db, 'jobs', jobId),
    stripUndefined({
      status: 'cancelled' as JobStatus,
      cancelledBy: by,
      cancelReason: reason,
      cancelledAt: serverTimestamp(),
    }),
  );
}

/**
 * Reopen an assigned/in-progress job after the provider dropped out (ກ່ຽງງານ).
 * Clears the assignment so the customer can pick a new technician, records the
 * abandoning provider for reliability, and notifies them.
 */
export async function reassignJob(jobId: string, reason?: string) {
  const snap = await getDoc(doc(db, 'jobs', jobId));
  const j: any = snap.data();
  const formerId: string | undefined = j?.assignedProviderId;
  await updateDoc(doc(db, 'jobs', jobId), {
    status: 'open' as JobStatus,
    assignedProviderId: deleteField(),
    assignedProviderName: deleteField(),
    finalPrice: deleteField(),
    assignedAt: deleteField(),
    startedAt: deleteField(),
    techDoneAt: deleteField(),
    paymentInstallments: deleteField(),
    paymentPlan: deleteField(),
    reassignCount: increment(1),
    closeAt: Date.now() + DEFAULT_OPEN_DAYS * 86400000,
    ...(formerId ? { abandonedProviderIds: arrayUnion(formerId) } : {}),
    ...(reason ? { cancelReason: reason } : {}),
  });
  if (formerId) {
    try {
      await notify(formerId, {
        type: 'workflow',
        title: 'ງານ ຖືກ ເປີດ ໃໝ່ — ຫາ ຊ່າງ ຄົນ ໃໝ່ ⚠️',
        body: j?.title ?? '',
        link: `/jobs/${jobId}`,
      });
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Derive a provider's mid-job drop-out count from jobs (no cross-user writes):
 * jobs they cancelled as the technician + jobs they were reassigned away from.
 * Uses single-field queries (no composite index) and de-dupes client-side.
 */
export async function getProviderAbandonCount(techId: string): Promise<number> {
  const [assignedSnap, abandonedSnap] = await Promise.all([
    getDocs(query(collection(db, 'jobs'), where('assignedProviderId', '==', techId))),
    getDocs(query(collection(db, 'jobs'), where('abandonedProviderIds', 'array-contains', techId))),
  ]);
  const ids = new Set<string>();
  assignedSnap.forEach((d) => {
    if ((d.data() as any).cancelledBy === 'technician') ids.add(d.id);
  });
  abandonedSnap.forEach((d) => ids.add(d.id));
  return ids.size;
}

// ============ WORKFLOW ============
// assigned (bid accepted) → in_progress (tech starts) → tech marks done →
// customer confirms → completed.

async function notifyJob(jobId: string, recipient: 'customer' | 'tech', title: string) {
  try {
    const snap = await getDoc(doc(db, 'jobs', jobId));
    const j: any = snap.data();
    const userId = recipient === 'customer' ? j?.customerId : j?.assignedProviderId;
    await notify(userId, { type: 'workflow', title, body: j?.title ?? '', link: `/jobs/${jobId}` });
  } catch {
    /* best-effort */
  }
}

/** Technician confirms on-site arrival with the 4-digit code the customer shows
 * them. Returns false if the code doesn't match (so the UI can show an error). */
export async function confirmArrival(jobId: string, code: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'jobs', jobId));
  if (!snap.exists()) return false;
  const expected = String((snap.data() as any).arrivalCode ?? '');
  if (!expected || code.trim() !== expected) return false;
  await updateDoc(doc(db, 'jobs', jobId), { arrivedAt: serverTimestamp() });
  await notifyJob(jobId, 'customer', 'ຊ່າງ ມາ ເຖິງ ໜ້າ ງານ ແລ້ວ 📍');
  return true;
}

/** Technician starts the assigned work. */
export async function startJob(jobId: string) {
  await updateDoc(doc(db, 'jobs', jobId), {
    status: 'in_progress' as JobStatus,
    startedAt: serverTimestamp(),
  });
  await notifyJob(jobId, 'customer', 'ຊ່າງເລີ່ມງານແລ້ວ 🛠️');
}

/** Technician flags the work finished; awaits customer confirmation. */
/** Customer signs to accept the quotation — uploads the signature image. */
export async function setJobSignature(jobId: string, dataUrl: string, name: string) {
  const url = await uploadImage(dataUrl, `jobs/${jobId}/signature-${Date.now()}.jpg`);
  await updateDoc(doc(db, 'jobs', jobId), {
    signatureUrl: url,
    signedAt: serverTimestamp(),
    signedByName: name,
  });
  await notifyJob(jobId, 'tech', 'ລູກຄ້າ ເຊັນຮັບ ໃບສະເໜີ ✍️');
  return url;
}

/** Customer signs off ACCEPTING the finished work (handover). Uploads the
 * signature image, records the acceptance comment + the profile name stamp. */
export async function setJobHandoverAcceptance(
  jobId: string,
  input: { comment?: string; signatureDataUrl?: string; name: string; warrantyMonths?: number; warrantyTerms?: string },
) {
  let acceptanceSignatureUrl: string | undefined;
  if (input.signatureDataUrl) {
    acceptanceSignatureUrl = await uploadImage(
      input.signatureDataUrl,
      `jobs/${jobId}/acceptance-${Date.now()}.jpg`,
    );
  }
  const patch: Record<string, unknown> = {
    acceptanceComment: input.comment?.trim() || undefined,
    acceptanceSignatureUrl,
    acceptanceSignedByName: input.name,
    acceptedAt: serverTimestamp(),
  };
  // Guarantee a warranty record even when the tech skipped the inspection (the
  // handover sheet already promised one) — but never override a warranty the
  // inspection itself set.
  if (input.warrantyMonths != null) {
    const snap = await getDoc(doc(db, 'jobs', jobId));
    if (snap.exists() && snap.get('warrantyMonths') == null) {
      patch.warrantyMonths = input.warrantyMonths;
      if (input.warrantyTerms) patch.warrantyTerms = input.warrantyTerms;
    }
  }
  await updateDoc(doc(db, 'jobs', jobId), stripUndefined(patch) as any);
  await notifyJob(jobId, 'tech', 'ລູກຄ້າ ຮັບ ມອບ ວຽກ ແລ້ວ ✅');
}

/** Technician records the completion inspection + stamps warranty/manual. */
export async function setJobInspection(
  jobId: string,
  input: {
    items: { label: string; pass: boolean; note?: string }[];
    parameters?: { key: string; unit?: string; standard?: string; actual?: string; ok?: boolean; custom?: boolean }[];
    warrantyMonths?: number;
    warrantyTerms?: string;
    manualUrl?: string;
    manualNote?: string;
  },
) {
  const items = input.items.map((it) => stripUndefined({ label: it.label, pass: it.pass, note: it.note?.trim() || undefined }) as any);
  const passCount = input.items.filter((it) => it.pass).length;
  // keep only parameters that carry an actual reading; strip empty keys
  const parameters = (input.parameters ?? [])
    .filter((p) => (p.actual ?? '').trim() !== '')
    .map((p) => stripUndefined({ key: p.key, unit: p.unit || undefined, standard: p.standard || undefined, actual: p.actual?.trim(), ok: p.ok, custom: p.custom || undefined }) as any);
  await updateDoc(
    doc(db, 'jobs', jobId),
    stripUndefined({
      inspection: { items, passCount, total: input.items.length, inspectedAt: Date.now() },
      parameters: parameters.length > 0 ? parameters : undefined,
      warrantyMonths: input.warrantyMonths,
      warrantyTerms: input.warrantyTerms,
      manualUrl: input.manualUrl?.trim() || undefined,
      manualNote: input.manualNote?.trim() || undefined,
    }) as any,
  );
  await notifyJob(jobId, 'customer', 'ຊ່າງ ອອກ ໃບກວດງານ + ຮັບປະກັນ ແລ້ວ 📋');
}

/** Technician updates the self-reported completion percentage (0–100). */
export async function setJobProgress(jobId: string, pct: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  await updateDoc(doc(db, 'jobs', jobId), { progressPct: clamped });
}

/** Record that the customer accepted the job-specific service terms. */
export async function setTermsAccepted(jobId: string, name: string) {
  await updateDoc(doc(db, 'jobs', jobId), {
    termsAcceptedAt: serverTimestamp(),
    termsAcceptedByName: name,
  });
}

export async function technicianMarkDone(jobId: string, completionPhotos?: string[]) {
  await updateDoc(
    doc(db, 'jobs', jobId),
    stripUndefined({
      techDoneAt: serverTimestamp(),
      progressPct: 100,
      completionPhotos: completionPhotos && completionPhotos.length > 0 ? completionPhotos : undefined,
    }) as any,
  );
  await notifyJob(jobId, 'customer', 'ຊ່າງແຈ້ງສຳເລັດ — ກະລຸນາຢືນຢັນ');
}

/**
 * Customer confirms the work is done → moves to payment stage (pending_payment).
 * The job is only marked 'completed' once payment is settled (2-step below).
 */
/** map a job's work type to an asset-history event type. */
const WORKTYPE_TO_HISTORY: Record<string, AssetHistoryType> = {
  repair: 'repair', install: 'install', newbuild: 'install', maintain: 'maintain', extend: 'other', other: 'other',
};

export async function confirmWorkDone(jobId: string) {
  await updateDoc(doc(db, 'jobs', jobId), {
    status: 'pending_payment' as JobStatus,
    workConfirmedAt: serverTimestamp(),
  });
  await notifyJob(jobId, 'tech', 'ລູກຄ້າຢືນຢັນງານ — ກຳລັງເຂົ້າຂັ້ນຕອນຊຳລະ 💰');
  // Building Registry: when the confirmed job is linked to an asset, the owner
  // (who is confirming) auto-logs it into that asset's service history. The
  // confirmation IS the owner's consent, and the owner may write their asset.
  try {
    const job = await getJob(jobId);
    if (job?.assetId) {
      // work-type lives on the accepted BID, not the job — read it there so the
      // asset service-history entry gets the real type (install/maintain/…)
      // instead of always falling back to 'repair'. (Single-field query + client
      // filter, same pattern as getAcceptedBid, to avoid a composite index.)
      const bidSnap = await getDocs(query(collection(db, 'bids'), where('jobId', '==', jobId)));
      const workType = bidSnap.docs.map((d) => d.data()).find((b) => b.status === 'accepted')?.workType ?? '';
      await addAssetHistory(job.assetId, {
        id: newHistoryId(),
        type: WORKTYPE_TO_HISTORY[workType] ?? 'repair',
        date: Date.now(),
        note: job.title,
        jobId,
        byName: job.assignedProviderName || job.customerName,
      } as any);
    }
  } catch {}
}

/** Customer records that they have paid (step 1 of settlement). */
export async function markPaidByCustomer(
  jobId: string,
  method: PaymentMethod,
  slip?: string,
) {
  await updateDoc(
    doc(db, 'jobs', jobId),
    stripUndefined({
      paymentMethod: method,
      paidByCustomerAt: serverTimestamp(),
      paymentSlip: slip,
    }) as any,
  );
  await notifyJob(jobId, 'tech', 'ລູກຄ້າແຈ້ງຈ່າຍແລ້ວ — ກະລຸນາຢືນຢັນຮັບເງິນ 💸');
}

/** Technician confirms receipt of payment (step 2) → job is fully completed. */
export async function confirmPaymentReceived(jobId: string) {
  await updateDoc(doc(db, 'jobs', jobId), {
    status: 'completed' as JobStatus,
    paymentConfirmedAt: serverTimestamp(),
    completedAt: serverTimestamp(),
  });
  await notifyJob(jobId, 'customer', 'ຊ່າງຢືນຢັນຮັບເງິນແລ້ວ — ງານສຳເລັດ ✅');
}

/** Customer marks one installment paid (step 1). */
export async function markInstallmentPaid(
  jobId: string,
  index: number,
  method: PaymentMethod,
  slip?: string,
) {
  const snap = await getDoc(doc(db, 'jobs', jobId));
  if (!snap.exists()) throw new Error('ບໍ່ພົບງານ');
  const list: Installment[] = [...((snap.data() as any).paymentInstallments ?? [])];
  if (!list[index]) throw new Error('ບໍ່ພົບງວດ');
  const updated: Installment = { ...list[index], paidByCustomerAt: Date.now(), method };
  if (slip) updated.slip = slip;
  list[index] = updated;
  await updateDoc(doc(db, 'jobs', jobId), { paymentInstallments: list });
  await notifyJob(jobId, 'tech', `ລູກຄ້າແຈ້ງຈ່າຍ ${list[index].label} — ກະລຸນາຢືນຢັນ 💸`);
}

/** Technician/admin confirms one installment received (step 2); completes job when all paid. */
export async function confirmInstallment(jobId: string, index: number) {
  const snap = await getDoc(doc(db, 'jobs', jobId));
  if (!snap.exists()) throw new Error('ບໍ່ພົບງານ');
  const list: Installment[] = [...((snap.data() as any).paymentInstallments ?? [])];
  if (!list[index]) throw new Error('ບໍ່ພົບງວດ');
  list[index] = { ...list[index], confirmedAt: Date.now() };
  const allDone = list.every((it) => !!it.confirmedAt);
  await updateDoc(doc(db, 'jobs', jobId), {
    paymentInstallments: list,
    ...(allDone
      ? { status: 'completed' as JobStatus, paymentConfirmedAt: serverTimestamp(), completedAt: serverTimestamp() }
      : {}),
  });
  await notifyJob(
    jobId,
    'customer',
    allDone ? 'ຊ່າງຢືນຢັນ ຮັບເງິນ ຄົບທຸກງວດ — ງານສຳເລັດ ✅' : `ຊ່າງຢືນຢັນ ຮັບ ${list[index].label} ✅`,
  );
}

export async function updateJob(
  jobId: string,
  updates: Partial<Omit<CreateJobInput, 'customerId'>>,
) {
  await updateDoc(
    doc(db, 'jobs', jobId),
    stripUndefined(updates as unknown as Record<string, unknown>) as any,
  );
}
