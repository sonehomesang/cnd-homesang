import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { PLATFORM_FEE_RATE, type Earning } from './wallet';
import { notify } from './notifications';
import { type OrderStatus, updateOrderStatus } from './orders';

/**
 * Slice 3 — HomeSang Express rider marketplace (asset-light).
 * Any registered user can opt-in to become a rider (a `riders/{uid}` doc — the
 * single source of truth, no RBAC role needed). Orders that choose the
 * HomeSang Express delivery tier (logistics tier 'own') spawn a `deliveryTasks`
 * doc; riders self-claim from the open queue (like watchOpenJobs), then move it
 * open → accepted → picked_up → delivered. Rider earnings are DERIVED from
 * delivered tasks (gross fee − platform commission), mirroring watchEarnings —
 * they flow into the existing wallet, so withdrawals reuse the technician path.
 */
export type DeliveryTaskStatus = 'open' | 'accepted' | 'picked_up' | 'delivered' | 'cancelled';

export const DELIVERY_TASK_STATUS_LABEL: Record<DeliveryTaskStatus, string> = {
  open: 'ຫວ່າງ',
  accepted: 'ຮັບແລ້ວ',
  picked_up: 'ຮັບເຄື່ອງແລ້ວ',
  delivered: 'ສົ່ງຮອດແລ້ວ',
  cancelled: 'ຍົກເລີກ',
};

export interface RiderProfile {
  uid: string;
  name: string;
  phone?: string;
  vehicle?: string;
  zone?: string;
  // verification — admin approves after checking the licence
  licenseNo?: string;
  licenseImage?: string;
  plate?: string;
  approved?: boolean; // false/undefined = pending; true = verified rider
  active: boolean;
  createdAt: number;
}

export interface DeliveryTask {
  id: string;
  orderId: string;
  orderNumber?: string;
  customerId: string;
  shopId?: string;
  shopName?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  // coordinates for navigation + the measured trip distance the fee was priced on
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  distanceKm?: number;
  fee: number;
  codAmount?: number;
  customerPhone?: string;
  shopPhone?: string;
  status: DeliveryTaskStatus;
  assignedRiderId?: string;
  assignedRiderName?: string;
  // proof of delivery (defends a "never arrived" claim)
  proofImage?: string;
  recipientName?: string;
  handoverCode?: string; // 4-digit code the customer shows the rider
  handoverOk?: boolean; // rider confirmed the code matched
  // true = task is withheld from the open queue until the order's (non-COD)
  // payment is verified — so a rider can't be dispatched before a slip clears.
  heldForPayment?: boolean;
  // COD cash the rider physically collected, and its remittance state
  codCollected?: number;
  remitRequested?: boolean;
  remitRequestedAt?: number;
  remitProof?: string;
  remitMethod?: string;
  codRemitted?: boolean; // admin-confirmed cash received
  remittedAt?: number;
  // live location while the rider opts in to sharing (stops on delivery)
  riderLat?: number;
  riderLng?: number;
  locUpdatedAt?: number;
  /** customer tip — paid to the rider in full (no platform fee) */
  tip?: number;
  tipConfirmed?: boolean; // admin confirmed the tip money was received
  // delivery traceability snapshot (chain-of-custody for goods security / warranty)
  // — captured from the rider profile AT accept time, so it never changes later
  riderPlate?: string;
  riderPhone?: string;
  riderLicenseNo?: string;
  createdAt: number;
  acceptedAt?: number;
  pickedUpAt?: number;
  deliveredAt?: number;
}

const toMillis = (v: any): number =>
  v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;

function mapTask(id: string, d: any): DeliveryTask {
  return {
    id,
    ...d,
    createdAt: toMillis(d.createdAt),
    acceptedAt: d.acceptedAt ? toMillis(d.acceptedAt) : undefined,
    pickedUpAt: d.pickedUpAt ? toMillis(d.pickedUpAt) : undefined,
    deliveredAt: d.deliveredAt ? toMillis(d.deliveredAt) : undefined,
    // live-location stamp — needed by the buyer map to show "updated N sec ago"
    locUpdatedAt: d.locUpdatedAt ? toMillis(d.locUpdatedAt) : undefined,
    remitRequestedAt: d.remitRequestedAt ? toMillis(d.remitRequestedAt) : undefined,
    remittedAt: d.remittedAt ? toMillis(d.remittedAt) : undefined,
  } as DeliveryTask;
}

// ===== rider opt-in (any registered user) =====
export function watchMyRider(uid: string, cb: (r: RiderProfile | null) => void) {
  return onSnapshot(
    doc(db, 'riders', uid),
    (snap) => cb(snap.exists() ? ({ uid: snap.id, ...snap.data(), createdAt: toMillis((snap.data() as any).createdAt) } as RiderProfile) : null),
    (e) => { console.error('watchMyRider:', e); cb(null); },
  );
}

/** All rider profiles (for admin cross-visibility — e.g. a badge in the user list). */
export function watchRiders(cb: (r: RiderProfile[]) => void) {
  return onSnapshot(
    collection(db, 'riders'),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...d.data(), createdAt: toMillis((d.data() as any).createdAt) } as RiderProfile))),
    (e) => { console.error('watchRiders:', e); cb([]); },
  );
}

export async function becomeRider(
  uid: string,
  info: { name: string; phone?: string; vehicle?: string; zone?: string; licenseNo?: string; licenseImage?: string; plate?: string },
) {
  // registering (or re-submitting the profile) starts unapproved — admin verifies the licence
  await setDoc(doc(db, 'riders', uid), { ...info, active: true, approved: false, createdAt: serverTimestamp() }, { merge: true });
}

export async function setRiderActive(uid: string, active: boolean) {
  await updateDoc(doc(db, 'riders', uid), { active });
}

/** Admin verifies (or un-verifies) a rider after reviewing their licence. */
export async function setRiderApproved(uid: string, approved: boolean) {
  await updateDoc(doc(db, 'riders', uid), { approved });
  notify(uid, approved ? {
    type: 'rider_approved',
    title: '🎉 ອະນຸມັດ ໄຣເດີ້ ແລ້ວ — ຮັບ ງານ ໄດ້ ເລີຍ',
    body: 'ເປີດ ຄິວ ຈັດສົ່ງ ເພື່ອ ເລີ່ມ ຫາ ລາຍໄດ້',
    link: '/rider',
  } : {
    type: 'rider_unapproved',
    title: '⏸ ການ ຢືນຢັນ ໄຣເດີ້ ຖືກ ຖອນ',
    body: 'ຕິດຕໍ່ ທີມງານ ເພື່ອ ກວດ ຂໍ້ມູນ ຄືນ',
    link: '/rider',
  });
}

/** Rider edits their own profile fields (does NOT touch approval — admin re-checks if needed). */
export async function updateRiderProfile(
  uid: string,
  patch: { name?: string; phone?: string; vehicle?: string; zone?: string; licenseNo?: string; licenseImage?: string; plate?: string },
) {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;
  await updateDoc(doc(db, 'riders', uid), clean);
}

// ===== delivery tasks =====
export function watchOpenDeliveryTasks(cb: (t: DeliveryTask[]) => void) {
  return onSnapshot(
    query(collection(db, 'deliveryTasks'), where('status', '==', 'open')),
    (snap) => {
      const list = snap.docs
        .map((d) => mapTask(d.id, d.data()))
        // hide tasks still held for an unverified (non-COD) payment
        .filter((t) => !t.heldForPayment);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchOpenDeliveryTasks:', e); cb([]); },
  );
}

export function watchMyDeliveryTasks(riderId: string, cb: (t: DeliveryTask[]) => void) {
  return onSnapshot(
    query(collection(db, 'deliveryTasks'), where('assignedRiderId', '==', riderId)),
    (snap) => {
      const list = snap.docs.map((d) => mapTask(d.id, d.data()));
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchMyDeliveryTasks:', e); cb([]); },
  );
}

export function watchAllDeliveryTasks(cb: (t: DeliveryTask[]) => void) {
  return onSnapshot(
    collection(db, 'deliveryTasks'),
    (snap) => {
      const list = snap.docs.map((d) => mapTask(d.id, d.data()));
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchAllDeliveryTasks:', e); cb([]); },
  );
}

/**
 * Rider claims an open task (single-writer; rules also enforce open→self + that
 * the rider is approved). Snapshots the rider's plate/phone/licence FROM their
 * profile onto the task, so the delivery has an immutable chain-of-custody trace
 * (goods security / warranty) even if the rider later edits their profile.
 */
export async function acceptTask(taskId: string, riderId: string, riderName: string) {
  const patch: Record<string, unknown> = {
    status: 'accepted' as DeliveryTaskStatus,
    assignedRiderId: riderId,
    assignedRiderName: riderName,
    acceptedAt: serverTimestamp(),
  };
  try {
    const rs = await getDoc(doc(db, 'riders', riderId));
    if (rs.exists()) {
      const r = rs.data() as any;
      if (r.plate) patch.riderPlate = r.plate;
      if (r.phone) patch.riderPhone = r.phone;
      if (r.licenseNo) patch.riderLicenseNo = r.licenseNo;
    }
  } catch { /* snapshot best-effort */ }
  await updateDoc(doc(db, 'deliveryTasks', taskId), patch);

  // tell the buyer who is coming, and the shop that a rider is on the way
  try {
    const t = (await getDoc(doc(db, 'deliveryTasks', taskId))).data() as any;
    if (t) {
      const plate = patch.riderPlate ? ` (${patch.riderPlate})` : '';
      notify(t.customerId, {
        type: 'delivery_accepted',
        title: `🛵 ${riderName}${plate} ຮັບງານສົ່ງແລ້ວ`,
        body: t.orderNumber ? `ອໍເດີ #${t.orderNumber} — ກຳລັງໄປຮັບເຄື່ອງ` : undefined,
        link: t.orderId ? `/orders/${t.orderId}` : '/orders',
      });
      if (t.shopId) {
        const owner = (await getDoc(doc(db, 'shops', t.shopId))).data() as any;
        if (owner?.ownerId) notify(owner.ownerId, {
          type: 'delivery_pickup_inbound',
          title: `📦 ໄຣເດີ້ ກຳລັງມາຮັບເຄື່ອງ${t.orderNumber ? ` #${t.orderNumber}` : ''}`,
          body: `${riderName}${plate}`,
          link: '/shop/manage',
        });
      }
    }
  } catch (e) { console.error('acceptTask notify:', e); }
}

/** Live single delivery task (for the order-detail delivery-trace card). */
export function watchDeliveryTask(id: string, cb: (t: DeliveryTask | null) => void) {
  return onSnapshot(
    doc(db, 'deliveryTasks', id),
    (snap) => cb(snap.exists() ? mapTask(snap.id, snap.data()) : null),
    (e) => { console.error('watchDeliveryTask:', e); cb(null); },
  );
}

/**
 * Advance a task and keep the linked order status in sync. On 'delivered' the
 * caller passes the proof of delivery (photo / recipient / code-matched) and the
 * COD cash actually collected — that cash becomes a debt the rider must remit.
 */
export async function updateTaskStatus(
  taskId: string,
  status: DeliveryTaskStatus,
  orderId?: string,
  proof?: { proofImage?: string; recipientName?: string; handoverOk?: boolean },
) {
  const patch: Record<string, unknown> = { status };
  if (status === 'picked_up') patch.pickedUpAt = serverTimestamp();
  if (status === 'delivered') {
    patch.deliveredAt = serverTimestamp();
    if (proof?.proofImage) patch.proofImage = proof.proofImage;
    if (proof?.recipientName) patch.recipientName = proof.recipientName;
    if (proof?.handoverOk !== undefined) patch.handoverOk = proof.handoverOk;
  }
  await updateDoc(doc(db, 'deliveryTasks', taskId), patch);
  if (orderId) {
    const map: Partial<Record<DeliveryTaskStatus, OrderStatus>> = { picked_up: 'delivering', delivered: 'delivered' };
    const os = map[status];
    if (os) { try { await updateOrderStatus(orderId, os); } catch (e) { console.error('sync order status:', e); } }
  }
  // keep the buyer informed at each handover point
  try {
    if (status === 'picked_up' || status === 'delivered') {
      const t = (await getDoc(doc(db, 'deliveryTasks', taskId))).data() as any;
      if (t?.customerId) {
        notify(t.customerId, status === 'picked_up' ? {
          type: 'delivery_shipped',
          title: '🚚 ເຄື່ອງ ອອກ ຈາກ ຮ້ານ ແລ້ວ — ກຳລັງ ສົ່ງ',
          body: t.orderNumber ? `ອໍເດີ #${t.orderNumber}` : undefined,
          link: orderId ? `/orders/${orderId}` : '/orders',
        } : {
          type: 'delivery_delivered',
          title: '🏠 ສົ່ງ ຮອດ ແລ້ວ — ກົດ ຢືນຢັນ ຮັບ ເຄື່ອງ',
          body: t.orderNumber ? `ອໍເດີ #${t.orderNumber}` : undefined,
          link: orderId ? `/orders/${orderId}` : '/orders',
        });
      }
    }
  } catch (e) { console.error('updateTaskStatus notify:', e); }
}

/**
 * Push the rider's current position onto a task they are carrying, so the buyer
 * can watch it move. Opt-in and short-lived by design: the rider toggles it on,
 * and it stops when the task reaches 'delivered'.
 */
export async function updateRiderLocation(taskId: string, pos: { lat: number; lng: number }) {
  try {
    await updateDoc(doc(db, 'deliveryTasks', taskId), {
      riderLat: pos.lat,
      riderLng: pos.lng,
      locUpdatedAt: serverTimestamp(),
    });
  } catch (e) { console.error('updateRiderLocation:', e); }
}

/** Customer adds a tip to a completed delivery — paid to the rider in full. */
export async function tipRider(taskId: string, amount: number) {
  await updateDoc(doc(db, 'deliveryTasks', taskId), { tip: Math.max(0, Math.round(amount)) });
}

/** Rider hands an accepted task back to the open queue (clears the assignment). */
export async function releaseTask(taskId: string) {
  await updateDoc(doc(db, 'deliveryTasks', taskId), {
    status: 'open' as DeliveryTaskStatus,
    assignedRiderId: deleteField(),
    assignedRiderName: deleteField(),
    acceptedAt: deleteField(),
    riderPlate: deleteField(),
    riderPhone: deleteField(),
    riderLicenseNo: deleteField(),
  });
}

/** Admin/shop/customer cancels a delivery task outright. */
export async function cancelTask(taskId: string) {
  await updateDoc(doc(db, 'deliveryTasks', taskId), { status: 'cancelled' as DeliveryTaskStatus });
}

/** Admin re-opens a stalled/orphaned task (e.g. its rider was deactivated). */
export async function reopenTask(taskId: string) {
  await releaseTask(taskId);
}

/**
 * Admin assigns/reassigns a task to a specific rider — snapshots the same
 * chain-of-custody fields acceptTask does, so admin-assigned deliveries are
 * just as traceable.
 */
export async function assignTaskToRider(taskId: string, riderId: string) {
  const patch: Record<string, unknown> = {
    status: 'accepted' as DeliveryTaskStatus,
    assignedRiderId: riderId,
    acceptedAt: serverTimestamp(),
  };
  try {
    const rs = await getDoc(doc(db, 'riders', riderId));
    if (rs.exists()) {
      const r = rs.data() as any;
      patch.assignedRiderName = r.name ?? 'Rider';
      if (r.plate) patch.riderPlate = r.plate;
      if (r.phone) patch.riderPhone = r.phone;
      if (r.licenseNo) patch.riderLicenseNo = r.licenseNo;
    }
  } catch { /* best-effort snapshot */ }
  await updateDoc(doc(db, 'deliveryTasks', taskId), patch);
  // admin-assigned riders are not self-claiming, so they must be told they now
  // have a job — otherwise the task sits unworked in their "my tasks" list.
  try {
    const t = (await getDoc(doc(db, 'deliveryTasks', taskId))).data() as any;
    notify(riderId, {
      type: 'delivery_assigned',
      title: '🛵 ທ່ານຖືກມອບໝາຍ ງານສົ່ງໃໝ່',
      body: t?.dropoffAddress ? `ສົ່ງໄປ: ${t.dropoffAddress}` : (t?.orderNumber ? `ອໍເດີ #${t.orderNumber}` : undefined),
      link: '/rider',
    });
  } catch (e) { console.error('assignTaskToRider notify:', e); }
}

// ===== COD cash reconciliation =====

/** Rider declares they have handed the collected COD cash over (admin confirms). */
export async function requestCodRemit(taskIds: string[], info: { method?: string; proof?: string }) {
  await Promise.all(taskIds.map((id) => updateDoc(doc(db, 'deliveryTasks', id), {
    remitRequested: true,
    remitRequestedAt: serverTimestamp(),
    remitMethod: info.method ?? '',
    ...(info.proof ? { remitProof: info.proof } : {}),
  })));
}

/** Admin confirms a customer tip was actually funded, releasing it to the rider. */
export async function confirmTip(taskId: string, confirmed: boolean) {
  await updateDoc(doc(db, 'deliveryTasks', taskId), { tipConfirmed: confirmed });
  if (!confirmed) return;
  try {
    const t = (await getDoc(doc(db, 'deliveryTasks', taskId))).data() as any;
    if (t?.assignedRiderId && t?.tip) notify(t.assignedRiderId, {
      type: 'tip_confirmed',
      title: `💝 ໄດ້ຮັບ ທິບ ${Number(t.tip).toLocaleString()} ₭`,
      body: 'ທິບ ເຂົ້າ wallet ຂອງທ່ານແລ້ວ',
      link: '/wallet',
    });
  } catch (e) { console.error('confirmTip notify:', e); }
}

/** Admin confirms (or rejects) that the rider's COD cash actually arrived. */
export async function confirmCodRemit(taskId: string, received: boolean) {
  await updateDoc(doc(db, 'deliveryTasks', taskId), received
    ? { codRemitted: true, remittedAt: serverTimestamp() }
    : { remitRequested: false, remitProof: deleteField(), remitMethod: deleteField() });
}

// The "new delivery job" rider fan-out now runs server-side in the
// onDeliveryTaskCreated / onDeliveryTaskReleased Cloud Functions (admin SDK),
// so the client no longer reads the private `riders` collection. See functions.

/**
 * Quality stats for one rider, DERIVED from their delivery tasks (nothing is
 * stored twice). `released` counts hand-backs, which is the signal admin needs
 * to spot an unreliable rider.
 */
export interface RiderStats {
  delivered: number;
  cancelled: number;
  active: number;
  tips: number;
  avgMinutes?: number; // accepted → delivered
}
export function riderStats(tasks: DeliveryTask[]): RiderStats {
  const delivered = tasks.filter((t) => t.status === 'delivered');
  // explicit > 0 (not truthiness): a missing timestamp maps to 0, which is falsy
  // AND a valid epoch — comparing explicitly keeps the intent unambiguous.
  const durations = delivered
    .filter((t) => (t.acceptedAt ?? 0) > 0 && (t.deliveredAt ?? 0) > 0 && t.deliveredAt! > t.acceptedAt!)
    .map((t) => (t.deliveredAt! - t.acceptedAt!) / 60000);
  return {
    delivered: delivered.length,
    cancelled: tasks.filter((t) => t.status === 'cancelled').length,
    active: tasks.filter((t) => t.status === 'accepted' || t.status === 'picked_up').length,
    tips: delivered.reduce((s, t) => s + (t.tipConfirmed === true ? (t.tip ?? 0) : 0), 0),
    avgMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : undefined,
  };
}

/** Cash a rider has collected but not yet remitted (their outstanding float). */
export function codOutstanding(tasks: DeliveryTask[]): number {
  return tasks
    .filter((t) => t.status === 'delivered' && !t.codRemitted)
    // the ORDER's codAmount is authoritative (a rider cannot write codCollected
    // — the money-hole fix forbids it), so the debt is always the order amount.
    .reduce((s, t) => s + (t.codAmount ?? 0), 0);
}

// ===== rider earnings (derived, mirrors watchEarnings) =====
/**
 * Delivery earnings for a rider. Recognized only when the delivery is done AND
 * the linked order is actually paid (paymentVerified) or completed — mirroring
 * watchBrokerEarnings, so a refunded / never-paid order does not pay the rider.
 */
export function watchRiderEarnings(riderId: string, cb: (e: Earning[]) => void) {
  return onSnapshot(
    query(collection(db, 'deliveryTasks'), where('assignedRiderId', '==', riderId)),
    async (snap) => {
      const done = snap.docs
        .map((d) => mapTask(d.id, d.data()))
        .filter((t) => t.status === 'delivered' && typeof t.fee === 'number');
      // check each linked order is paid/completed (small N — a rider's own tasks)
      const paid = await Promise.all(done.map(async (t) => {
        if (!t.orderId) return true; // manual task with no order — trust it
        try {
          const o = (await getDoc(doc(db, 'orders', t.orderId))).data() as any;
          if (!o) return false;
          return o.status !== 'cancelled' && (o.paymentVerified === true || o.status === 'completed');
        } catch { return false; }
      }));
      const list: Earning[] = [];
      done.filter((_, i) => paid[i]).forEach((t) => {
        const gross = t.fee;
        const fee = Math.round(gross * PLATFORM_FEE_RATE);
        list.push({ jobId: t.id, title: `🛵 ຈັດສົ່ງ${t.orderNumber ? ' #' + t.orderNumber : ''}`, gross, fee, net: gross - fee, at: t.deliveredAt ?? t.createdAt });
        // a customer tip goes to the rider in FULL (no platform fee) — but only
        // once admin confirms the money actually arrived. HomeSang never holds
        // funds, so an unconfirmed tip must not become withdrawable balance.
        if (t.tip && t.tip > 0 && t.tipConfirmed === true) {
          list.push({ jobId: `tip-${t.id}`, title: `💝 ທິບ${t.orderNumber ? ' #' + t.orderNumber : ''}`, gross: t.tip, fee: 0, net: t.tip, at: t.deliveredAt ?? t.createdAt });
        }
      });
      list.sort((a, b) => b.at - a.at);
      cb(list);
    },
    (e) => { console.error('watchRiderEarnings:', e); cb([]); },
  );
}
