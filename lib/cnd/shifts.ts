import { addDoc, collection, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, doc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG } from '../mock';
import type { CndOrder } from './orders';

/**
 * POS shift (cash session). A cashier opens a shift with an opening cash float,
 * rings sales, then closes it — counting cash → the X/Z report (expected vs
 * counted cash + sales by payment method). Sales carry shiftId.
 */
export interface CndShift {
  id: string;
  cashier?: string;
  openingCash: number;
  openedAt: number;
  closedAt?: number;
  closingCashCounted?: number;
  status: 'open' | 'closed';
  // Z-report snapshot stored at close:
  salesCount?: number;
  salesTotal?: number;
  cashSales?: number;
  qrSales?: number;
  discountTotal?: number;
  expectedCash?: number;
  overShort?: number;
  __mock?: boolean;
}
function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndShift {
  return {
    id, cashier: d.cashier, openingCash: Number(d.openingCash) || 0, openedAt: ms(d.openedAt), closedAt: d.closedAt ? ms(d.closedAt) : undefined,
    closingCashCounted: d.closingCashCounted, status: (d.status ?? 'open') as 'open' | 'closed',
    salesCount: d.salesCount, salesTotal: d.salesTotal, cashSales: d.cashSales, qrSales: d.qrSales, discountTotal: d.discountTotal,
    expectedCash: d.expectedCash, overShort: d.overShort, __mock: !!d[MOCK_FLAG],
  };
}

export interface PosReport { salesCount: number; salesTotal: number; cashSales: number; qrSales: number; discountTotal: number; }
/** Summarise a set of orders (POS only) into a report. */
export function posReport(orders: CndOrder[]): PosReport {
  const pos = orders.filter((o) => o.channel === 'pos' && o.status !== 'cancelled');
  return {
    salesCount: pos.length,
    salesTotal: pos.reduce((s, o) => s + o.total, 0),
    cashSales: pos.filter((o) => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0),
    qrSales: pos.filter((o) => o.paymentMethod === 'qr').reduce((s, o) => s + o.total, 0),
    discountTotal: pos.reduce((s, o) => s + (o.discount ?? 0), 0),
  };
}

export function watchCndOpenShift(cb: (s: CndShift | null) => void) {
  return onSnapshot(query(collection(db, 'cndShifts'), where('status', '==', 'open')),
    (snap) => cb(snap.empty ? null : map(snap.docs[0].id, snap.docs[0].data())),
    (e) => { console.error('watchCndOpenShift:', e); cb(null); });
}
export function watchCndShifts(cb: (s: CndShift[]) => void) {
  return onSnapshot(query(collection(db, 'cndShifts')),
    (snap) => cb(snap.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.openedAt - a.openedAt)),
    (e) => { console.error('watchCndShifts:', e); cb([]); });
}

export async function openCndShift(cashier: string | undefined, openingCash: number): Promise<string> {
  const ref = await addDoc(collection(db, 'cndShifts'), { cashier: cashier || undefined, openingCash: Math.round(openingCash) || 0, status: 'open', openedAt: serverTimestamp() });
  return ref.id;
}
/** Close a shift — computes the Z report from its POS orders + the counted cash. */
export async function closeCndShift(shift: CndShift, orders: CndOrder[], countedCash: number) {
  const r = posReport(orders.filter((o) => o.shiftId === shift.id));
  const expectedCash = shift.openingCash + r.cashSales;
  await updateDoc(doc(db, 'cndShifts', shift.id), {
    status: 'closed', closedAt: serverTimestamp(), closingCashCounted: Math.round(countedCash) || 0,
    salesCount: r.salesCount, salesTotal: r.salesTotal, cashSales: r.cashSales, qrSales: r.qrSales, discountTotal: r.discountTotal,
    expectedCash, overShort: (Math.round(countedCash) || 0) - expectedCash,
  });
}
