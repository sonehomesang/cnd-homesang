import { addDoc, collection, getDocs, onSnapshot, query, serverTimestamp, Timestamp, where, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG } from '../mock';
import { returnStock } from './inventory';

/**
 * CND returns / refunds — each return is tied to an existing sale (bill/POS),
 * lists the returned lines + reason + refund method, and restocks the items
 * back into the branch's inventory (a 'return' stock move).
 */
export interface CndReturnLine { productId: string; name: string; unit: string; qty: number; price: number; amount: number; }
export interface CndReturn {
  id: string;
  number: string;
  orderId?: string;
  orderNumber?: string;
  lines: CndReturnLine[];
  reason: string;
  refundMethod: 'cash' | 'qr';
  total: number;
  staff?: string;
  branchId?: string;
  createdAt: number;
  __mock?: boolean;
}
function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndReturn {
  return {
    id, number: d.number ?? '', orderId: d.orderId, orderNumber: d.orderNumber,
    lines: Array.isArray(d.lines) ? d.lines : [], reason: d.reason ?? '',
    refundMethod: d.refundMethod ?? 'cash', total: Number(d.total) || 0,
    staff: d.staff, branchId: d.branchId, createdAt: ms(d.createdAt), __mock: !!d[MOCK_FLAG],
  };
}
function num(): string { return `RET-${(Date.now() % 100000).toString().padStart(5, '0')}`; }

export function watchCndReturns(cb: (r: CndReturn[]) => void) {
  return onSnapshot(query(collection(db, 'cndReturns')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchCndReturns:', e); cb([]); });
}

/** Record a return: write the return doc + restock the returned lines. */
export async function createCndReturn(input: {
  orderId?: string; orderNumber?: string; lines: CndReturnLine[]; reason: string;
  refundMethod: 'cash' | 'qr'; staff?: string; branchId?: string | null;
}): Promise<string> {
  const lines = input.lines.filter((l) => l.qty > 0);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const ref = await addDoc(collection(db, 'cndReturns'), {
    number: num(), orderId: input.orderId, orderNumber: input.orderNumber,
    lines, reason: input.reason, refundMethod: input.refundMethod, total,
    staff: input.staff, branchId: input.branchId, createdAt: serverTimestamp(),
  });
  await returnStock(lines.map((l) => ({ productId: l.productId, name: l.name, qty: l.qty })), input.branchId ?? null);
  return ref.id;
}

export async function clearCndReturns(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndReturns'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}
