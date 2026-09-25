import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { CndConfig } from './config';

// ninesang booking helpers — slot availability + capacity math (config-driven).

export interface SlotAvail { bySlot: Record<string, number>; techCount: number; }

/** Ask the server how many bookings each slot already has for a day + the active
 *  tech count for the trade (customers can't read cndOrders directly). */
export async function cndSlotAvailability(dayStart: number, trade?: string): Promise<SlotAvail> {
  try {
    const res: any = await httpsCallable(functions, 'cndBookingSlots')({ dayStart, trade: trade || '' });
    const d = res?.data || {};
    return { bySlot: d.bySlot || {}, techCount: Number(d.techCount) || 0 };
  } catch { return { bySlot: {}, techCount: 0 }; }
}

/** Max bookings a slot accepts, per the configured capacity mode. */
export function slotCapacity(cfg: CndConfig, techCount: number): number {
  const mode = cfg.bookingCapacityMode || 'byTech';
  if (mode === 'unlimited') return Infinity;
  if (mode === 'fixed') return Math.max(1, cfg.bookingSlotCap || 3);
  // byTech: capacity = active techs of the trade. Fail-OPEN when the tech pool
  // is empty/untagged (0) so an unconfigured store doesn't lock out every slot —
  // CND still confirms/assigns. Once techs exist, real capacity applies.
  return techCount > 0 ? techCount : Infinity;
}
export function slotRemaining(cfg: CndConfig, techCount: number, booked: number): number {
  const cap = slotCapacity(cfg, techCount);
  return cap === Infinity ? Infinity : Math.max(0, cap - booked);
}

export interface DayOpt { ms: number; d: number; dow: string; label: string; }
const DOW = ['ອາ', 'ຈ', 'ອ', 'ພ', 'ພຫ', 'ສຸ', 'ສ'];

/** The next `days` calendar days (from today), each at 00:00 local, for the picker. */
export function bookingDays(days: number): DayOpt[] {
  const out: DayOpt[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < Math.max(1, days); i++) {
    const dt = new Date(base.getTime() + i * 24 * 3600 * 1000);
    out.push({ ms: dt.getTime(), d: dt.getDate(), dow: DOW[dt.getDay()], label: i === 0 ? 'ມື້ນີ້' : i === 1 ? 'ມື້ອື່ນ' : DOW[dt.getDay()] });
  }
  return out;
}

/** Combine a day (00:00 ms) + a slot label like "09:00–10:30" → scheduledAt ms. */
export function slotToMs(dayMs: number, slot: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(slot);
  if (!m) return dayMs + 9 * 3600 * 1000;
  return dayMs + (Number(m[1]) * 60 + Number(m[2])) * 60 * 1000;
}
