import type { Claim } from './claims';
import type { Order, OrderStatus } from './orders';

/**
 * Y3 Slice D — escrow-lite state + auto-release. HomeSang never custodies funds
 * (QR/COD flow directly), so "held/released" is a TRUST state derived from the
 * order + its claims, reusing the confirm-receipt 2-step:
 *   unpaid   — bank transfer not yet payment-verified (money not secured)
 *   held     — paid/in-progress, released to the shop when the buyer confirms
 *   released — buyer confirmed receipt (order completed)
 *   disputed — an open refund/return claim freezes the release
 *   refunded — a claim was resolved with a refund
 *   cancelled
 */
export type EscrowState = 'unpaid' | 'held' | 'released' | 'disputed' | 'refunded' | 'cancelled';

const OPEN_CLAIM: string[] = ['pending', 'reviewing', 'approved'];

export function hasOpenClaim(claims: Claim[]): boolean {
  return claims.some((c) => OPEN_CLAIM.includes(c.status));
}

export function escrowState(order: Pick<Order, 'status' | 'paymentMethod' | 'paymentVerified'>, claims: Claim[]): EscrowState {
  if (order.status === 'cancelled') return 'cancelled';
  if (hasOpenClaim(claims)) return 'disputed';
  if (claims.some((c) => c.status === 'resolved' && (c.refundAmount ?? 0) > 0)) return 'refunded';
  if (order.status === 'completed') return 'released';
  if (order.paymentMethod === 'bank_transfer' && !order.paymentVerified) return 'unpaid';
  return 'held';
}

export interface EscrowMeta {
  state: EscrowState;
  emoji: string;
  tone: 'held' | 'paid' | 'done' | 'disp';
  title: string;
  body: string;
}

/** Buyer-facing copy for each escrow state (COD vs bank tweaks the "held" body). */
export function escrowMeta(state: EscrowState, isCod: boolean): EscrowMeta {
  switch (state) {
    case 'unpaid':
      return { state, emoji: '⏳', tone: 'paid', title: 'ລໍ ຢືນຢັນ ການຈ່າຍ', body: 'ໂອນ ແລ້ວ ອັບ ສະລິບ — ລໍ ຮ້ານ/admin ກວດ. ເງິນ ຍັງ ບໍ່ ຖືກ ປ່ອຍ ໃຫ້ ຮ້ານ.' };
    case 'released':
      return { state, emoji: '✅', tone: 'done', title: 'ສຳເລັດ — ເງິນ ຖືກ ປ່ອຍ ໃຫ້ ຮ້ານ ແລ້ວ', body: 'ຂອບໃຈ! ຖ້າ ພໍໃຈ ໃຫ້ ຄະແນນ ສິນຄ້າ ໄດ້.' };
    case 'disputed':
      return { state, emoji: '⚠️', tone: 'disp', title: 'ກຳລັງ ໄກ່ເກ່ຍ ຂໍ້ຂັດແຍ່ງ', body: 'ມີ ຄຳຮ້ອງ ຄືນເງິນ — ການ ປ່ອຍ ເງິນ ຖືກ ລະງັບ ຈົນກວ່າ admin ຕັດສິນ.' };
    case 'refunded':
      return { state, emoji: '↩️', tone: 'disp', title: 'ຄືນເງິນ ແລ້ວ', body: 'ຄຳຮ້ອງ ຄືນເງິນ ຖືກ ອະນຸມັດ ແລະ ດຳເນີນການ ແລ້ວ.' };
    case 'cancelled':
      return { state, emoji: '✕', tone: 'disp', title: 'ຍົກເລີກ ແລ້ວ', body: 'ຄຳສັ່ງຊື້ ນີ້ ຖືກ ຍົກເລີກ.' };
    default: // held
      return {
        state, emoji: '🔒', tone: 'held', title: 'ເງິນ ຂອງ ທ່ານ ຖືກ ປົກປ້ອງ',
        body: isCod
          ? 'ຈ່າຍ ຕອນ ຮັບ (COD). ກົດ ຢືນຢັນ ຮັບ ຂອງ ເມື່ອ ໄດ້ຮັບ ຄົບ ເພື່ອ ໃຫ້ ອໍເດີ ສຳເລັດ. ມີ ບັນຫາ? ແຈ້ງ ຄືນເງິນ ໄດ້.'
          : 'HomeSang ຮັບຮູ້ ການຈ່າຍ ແລ້ວ. ເງິນ ຈະ ປ່ອຍ ໃຫ້ ຮ້ານ ເມື່ອ ທ່ານ ກົດ ຢືນຢັນ ຮັບ ຂອງ. ມີ ບັນຫາ? ແຈ້ງ ຄືນເງິນ ໄດ້.',
      };
  }
}

const DAY = 86400000;

export interface AutoReleaseInfo {
  active: boolean; // a countdown is running (delivered + a window is set)
  dueAt: number;
  remainingMs: number;
  overdue: boolean;
}

/** Auto-release countdown for a delivered order (0 days / no deliveredAt → inactive). */
export function autoReleaseInfo(order: Pick<Order, 'status' | 'deliveredAt'>, days: number, now = Date.now()): AutoReleaseInfo {
  if (order.status !== 'delivered' || !(days > 0) || !order.deliveredAt) {
    return { active: false, dueAt: 0, remainingMs: 0, overdue: false };
  }
  const dueAt = order.deliveredAt + days * DAY;
  return { active: true, dueAt, remainingMs: Math.max(0, dueAt - now), overdue: now >= dueAt };
}

/** Should this delivered order auto-confirm now? (window elapsed + no open claim). */
export function autoReleaseEligible(order: Pick<Order, 'status' | 'deliveredAt'>, claims: Claim[], days: number, now = Date.now()): boolean {
  const info = autoReleaseInfo(order, days, now);
  return info.active && info.overdue && !hasOpenClaim(claims);
}

/** "N ມື້ hh:mm:ss" / "hh:mm:ss" remaining (empty when past). */
export function releaseCountdown(remainingMs: number): string {
  let sec = Math.floor(remainingMs / 1000);
  if (sec <= 0) return '';
  const days = Math.floor(sec / 86400); sec -= days * 86400;
  const h = Math.floor(sec / 3600); sec -= h * 3600;
  const m = Math.floor(sec / 60); sec -= m * 60;
  const p = (x: number) => String(x).padStart(2, '0');
  const hms = `${p(h)}:${p(m)}:${p(sec)}`;
  return days >= 1 ? `${days} ມື້ ${hms}` : hms;
}

// timeline ------------------------------------------------------------------

export interface TimelineStep {
  key: OrderStatus;
  label: string;
  icon: string;
}

/** Ordered lifecycle steps (cancelled is handled separately). */
export const TIMELINE_STEPS: TimelineStep[] = [
  { key: 'pending', label: 'ສັ່ງຊື້ ແລ້ວ', icon: '🛒' },
  { key: 'confirmed', label: 'ຢືນຢັນ ການຈ່າຍ', icon: '✓' },
  { key: 'preparing', label: 'ກຳລັງ ແພັກ', icon: '📦' },
  { key: 'delivering', label: 'ກຳລັງ ສົ່ງ', icon: '🚚' },
  { key: 'delivered', label: 'ສົ່ງ ເຖິງ', icon: '📍' },
  { key: 'completed', label: 'ສຳເລັດ', icon: '🎉' },
];

/** Index of the order's current status within TIMELINE_STEPS (−1 if none/cancelled). */
export function timelineIndex(status: OrderStatus): number {
  return TIMELINE_STEPS.findIndex((s) => s.key === status);
}
