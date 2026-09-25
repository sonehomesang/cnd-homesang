import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { notify } from './notifications';
import { createClaim } from './claims';
import { creditTechnician } from './wallet';
import type { Job } from './jobs';

export type DisputeStatus = 'open' | 'resolved' | 'rejected';
export type DisputeRole = 'customer' | 'technician';

export const DISPUTE_STATUS_LABEL: Record<DisputeStatus, string> = {
  open: 'ກຳລັງກວດ',
  resolved: 'ແກ້ໄຂແລ້ວ',
  rejected: 'ປະຕິເສດ',
};

export interface Dispute {
  id: string;
  jobId: string;
  jobTitle?: string;
  raisedBy: string;
  raiserName?: string;
  raiserRole: DisputeRole;
  counterpartyId?: string;
  reason: string;
  photos?: string[];
  status: DisputeStatus;
  adminNote?: string;
  createdAt: number;
  resolvedAt?: number;
  /** ຖ້າ ໄກ່ເກ່ຍ ແລ້ວ ຕ້ອງ ຄືນເງິນ — ຈຳນວນ + claim ທີ່ ສ້າງ ໃຫ້ ອັຕໂນມັດ. */
  refundAmount?: number;
  refundClaimId?: string;
  /** set once the technician payout has been credited — blocks a re-pay */
  techPaidAt?: number;
  /** ໄກ່ເກ່ຍ ແບ່ງສ່ວນ — ຄ່າແຮງ ທີ່ ຈ່າຍ ໃຫ້ ຊ່າງ ສຳລັບ ວຽກ ທີ່ ເຮັດ ໄປ ແລ້ວ. */
  techPayout?: number;
}

/** ໜ້າປ່ອງເວລາ ແຈ້ງ ຂໍ້ຂັດແຍ່ງ ງານ = 3 ມື້ ຫຼັງ ສຳເລັດ. */
export const DISPUTE_WINDOW_DAYS = 3;

/**
 * ກວດ ເງື່ອນໄຂ ການ ແຈ້ງ ຂໍ້ຂັດແຍ່ງ ງານ:
 * - ງານ ຕ້ອງ ມີ ການ ມອບໝາຍ ແລ້ວ (assigned/in_progress/pending_payment) ຫຼື
 *   ສຳເລັດ ພາຍໃນ 3 ມື້ — ບໍ່ໃຫ້ ແຈ້ງ ກັບ ງານ ເປີດ/ຍົກເລີກ
 */
export function canDisputeJob(job: Job, now = Date.now()): { ok: boolean; reason?: string } {
  if (['assigned', 'in_progress', 'pending_payment'].includes(job.status)) return { ok: true };
  if (job.status === 'completed') {
    const done = typeof job.completedAt === 'number' ? job.completedAt : 0;
    if (done > 0 && now - done > DISPUTE_WINDOW_DAYS * 86400000) {
      return { ok: false, reason: `ໝົດ ກຳນົດ ແຈ້ງ ບັນຫາ ແລ້ວ (ພາຍໃນ ${DISPUTE_WINDOW_DAYS} ມື້ ຫຼັງ ງານ ສຳເລັດ)` };
    }
    return { ok: true };
  }
  return { ok: false, reason: 'ງານ ນີ້ ຍັງ ແຈ້ງ ບັນຫາ ບໍ່ໄດ້' };
}

function strip(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}
function toMillis(v: any): number {
  return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;
}
function mapDispute(id: string, data: any): Dispute {
  return { id, ...data, createdAt: toMillis(data.createdAt), resolvedAt: data.resolvedAt ? toMillis(data.resolvedAt) : undefined } as Dispute;
}

export interface CreateDisputeInput {
  jobId: string;
  jobTitle?: string;
  raisedBy: string;
  raiserName?: string;
  raiserRole: DisputeRole;
  counterpartyId?: string;
  reason: string;
  photos?: string[];
}

export async function createDispute(input: CreateDisputeInput): Promise<string> {
  const ref = await addDoc(
    collection(db, 'disputes'),
    strip({ ...input, status: 'open' as DisputeStatus, createdAt: serverTimestamp() }),
  );
  if (input.counterpartyId) {
    try {
      await notify(input.counterpartyId, {
        type: 'workflow',
        title: 'ມີການແຈ້ງບັນຫາ ໃນງານ ⚠️',
        body: input.jobTitle ?? '',
        link: `/jobs/${input.jobId}`,
      });
    } catch {
      /* best-effort */
    }
  }
  return ref.id;
}

export function watchDisputesForJob(jobId: string, cb: (d: Dispute[]) => void) {
  const q = query(collection(db, 'disputes'), where('jobId', '==', jobId));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => mapDispute(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchDisputesForJob:', e); cb([]); },
  );
}

/** Seed a few sample disputes for admin testing (no-op if any exist). */
export async function seedDisputesIfEmpty(): Promise<number> {
  const snap = await getDocs(collection(db, 'disputes'));
  if (snap.size > 0) return 0;
  const now = Date.now();
  const samples = [
    { jobId: 'sample-job-1', jobTitle: 'ຕິດຕັ້ງ ໄຟຟ້າ ບ້ານ', raisedBy: 'mock-cust-1', raiserName: 'ລູກຄ້າ ທົດສອບ', raiserRole: 'customer', reason: 'ຊ່າງ ມາ ຊ້າ ກວ່າ ນັດ 2 ຊົ່ວໂມງ', status: 'open', createdAt: now - 3600000 },
    { jobId: 'sample-job-2', jobTitle: 'ສ້ອມ ແອ', raisedBy: 'mock-tech-1', raiserName: 'ຊ່າງ ທົດສອບ', raiserRole: 'technician', reason: 'ລູກຄ້າ ບໍ່ ຈ່າຍ ເງິນ ຕາມ ຕົກລົງ', status: 'open', createdAt: now - 7200000 },
    { jobId: 'sample-job-3', jobTitle: 'ທາສີ ບ້ານ', raisedBy: 'mock-cust-2', raiserName: 'ລູກຄ້າ ທົດສອບ 2', raiserRole: 'customer', reason: 'ງານ ບໍ່ ຮຽບຮ້ອຍ', status: 'resolved', adminNote: 'ໄກ່ເກ່ຍ ແລ້ວ — ຊ່າງ ແກ້ໄຂ ໃໝ່', createdAt: now - 172800000 },
  ];
  for (const s of samples) await addDoc(collection(db, 'disputes'), s);
  return samples.length;
}

export function watchAllDisputes(cb: (d: Dispute[]) => void) {
  return onSnapshot(
    collection(db, 'disputes'),
    (snap) => cb(snap.docs.map((d) => mapDispute(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchAllDisputes:', e); cb([]); },
  );
}

export async function resolveDispute(
  d: Dispute,
  patch: { status: DisputeStatus; adminNote?: string; refundAmount?: number; techPayout?: number },
) {
  // Idempotency: read the CURRENT dispute, never trust the snapshot the caller
  // is holding. A double-tap on "ແກ້ໄຂແລ້ວ" fires two calls before the snapshot
  // flips, and both used to pass the stale checks — crediting the technician (and
  // creating the refund claim) twice.
  const freshSnap = await getDoc(doc(db, 'disputes', d.id));
  const fresh: any = freshSnap.exists() ? freshSnap.data() : {};
  if (fresh.status === 'resolved' && patch.status === 'resolved') {
    return; // already settled — the money side must not run again
  }

  // ໄກ່ເກ່ຍ ແບ່ງສ່ວນ → ຈ່າຍ ຄ່າແຮງ ໃຫ້ ຊ່າງ (credit wallet) ສຳລັບ ວຽກ ທີ່ ເຮັດ ໄປ ແລ້ວ
  const techId = d.raiserRole === 'technician' ? d.raisedBy : d.counterpartyId;
  const payout = patch.status === 'resolved' && patch.techPayout && patch.techPayout > 0
    ? patch.techPayout
    : undefined;
  let techPaidAt: number | undefined;
  if (payout && techId && !fresh.techPaidAt) {
    try {
      await creditTechnician(techId, payout, `ໄກ່ເກ່ຍ ງານ: ${d.jobTitle ?? d.jobId}`, d.jobId);
      techPaidAt = Date.now(); // stamped on the dispute so a retry can't re-pay
    } catch (e) {
      console.error('resolveDispute → creditTechnician:', e);
    }
  }

  // ໄກ່ເກ່ຍ ແລ້ວ ຕ້ອງ ຄືນເງິນ → ສ້າງ refund record (claim) ຜູກ ກັບ ຂໍ້ຂັດແຍ່ງ ນີ້ ອັຕໂນມັດ
  let refundClaimId: string | undefined;
  const refund = patch.status === 'resolved' && patch.refundAmount && patch.refundAmount > 0
    ? patch.refundAmount
    : undefined;
  if (refund && !fresh.refundClaimId) {
    // refund recipient = the customer (raiser if they're the customer, else the
    // counterparty). Never default to the raiser — that would refund the wrong
    // party (e.g. a technician-raised dispute crediting the technician).
    const customerId = d.raiserRole === 'customer' ? d.raisedBy : d.counterpartyId;
    if (!customerId) throw new Error('ບໍ່ຮູ້ ຜູ້ຮັບເງິນຄືນ — ຕ້ອງ ລະບຸ ຄູ່ກໍລະນີ (ລູກຄ້າ) ກ່ອນ ໄກ່ເກ່ຍ ແບບ ຄືນເງິນ');
    try {
      refundClaimId = await createClaim({
        orderId: d.jobId,
        orderNumber: d.jobTitle,
        customerId,
        type: 'other',
        reason: `ຄືນເງິນ ຈາກ ຂໍ້ຂັດແຍ່ງ ງານ: ${d.reason}`,
        status: 'approved',
        refundAmount: refund,
        adminNote: patch.adminNote,
        jobId: d.jobId,
        disputeId: d.id,
      });
    } catch (e) {
      console.error('resolveDispute → createClaim:', e);
    }
  }

  await updateDoc(
    doc(db, 'disputes', d.id),
    strip({ ...patch, refundClaimId, techPaidAt, resolvedAt: serverTimestamp() } as Record<string, unknown>),
  );
  const label = DISPUTE_STATUS_LABEL[patch.status];
  const recipients = [d.raisedBy, d.counterpartyId].filter(Boolean) as string[];
  for (const uid of recipients) {
    try {
      await notify(uid, {
        type: 'workflow',
        title: `ຂໍ້ຂັດແຍ່ງ: ${label}`,
        body: d.jobTitle ?? '',
        link: `/jobs/${d.jobId}`,
      });
    } catch {
      /* best-effort */
    }
  }
}
