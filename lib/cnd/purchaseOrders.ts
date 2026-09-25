import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG } from '../mock';
import { receiveStock } from './inventory';

/**
 * CND purchase orders — buying stock from suppliers. On "receive" the ordered
 * lines are added to inventory (receiveStock: +stock at branch + unit cost) and
 * the PO becomes a payable (money owed to the supplier until marked paid).
 */
export type CndPoStatus = 'ordered' | 'received' | 'cancelled';
export const PO_STATUS: Record<CndPoStatus, { lao: string; bg: string; fg: string }> = {
  ordered: { lao: 'ສັ່ງ ແລ້ວ', bg: '#E4EEFB', fg: '#0066CC' },
  received: { lao: 'ຮັບ ເຂົ້າ ແລ້ວ', bg: '#E2F5EA', fg: '#1F9D57' },
  cancelled: { lao: 'ຍົກເລີກ', bg: '#EEF1F5', fg: '#8B95A5' },
};
export interface CndPoLine { productId: string; name: string; unit: string; qty: number; cost: number; amount: number; }
export interface CndPurchaseOrder {
  id: string;
  number: string;
  supplierId?: string;
  supplierName?: string;
  lines: CndPoLine[];
  subtotal: number;
  status: CndPoStatus;
  branchId?: string;
  note?: string;
  paid?: boolean;
  createdAt: number;
  receivedAt?: number;
  __mock?: boolean;
}
function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndPurchaseOrder {
  return {
    id, number: d.number ?? '', supplierId: d.supplierId, supplierName: d.supplierName,
    lines: Array.isArray(d.lines) ? d.lines : [], subtotal: Number(d.subtotal) || 0,
    status: (d.status ?? 'ordered') as CndPoStatus, branchId: d.branchId, note: d.note,
    paid: !!d.paid, createdAt: ms(d.createdAt), receivedAt: ms(d.receivedAt), __mock: !!d[MOCK_FLAG],
  };
}
function num(): string { return `PO-${(Date.now() % 100000).toString().padStart(5, '0')}`; }

export function watchCndPurchaseOrders(cb: (p: CndPurchaseOrder[]) => void) {
  return onSnapshot(query(collection(db, 'cndPurchaseOrders')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchCndPurchaseOrders:', e); cb([]); });
}

export async function createCndPO(input: {
  supplierId?: string; supplierName?: string; lines: CndPoLine[]; branchId?: string | null; note?: string;
}): Promise<string> {
  const lines = input.lines.filter((l) => l.qty > 0);
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const ref = await addDoc(collection(db, 'cndPurchaseOrders'), {
    number: num(), supplierId: input.supplierId, supplierName: input.supplierName,
    lines, subtotal, status: 'ordered', branchId: input.branchId, note: input.note, paid: false, createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Receive a PO into stock: add each line + set status received. */
export async function receiveCndPO(po: CndPurchaseOrder): Promise<void> {
  for (const l of po.lines) {
    await receiveStock({ id: l.productId, name: l.name }, po.branchId ?? null, l.qty, l.cost, `PO ${po.number}`);
  }
  await updateDoc(doc(db, 'cndPurchaseOrders', po.id), { status: 'received', receivedAt: serverTimestamp() });
}
export async function setCndPoPaid(id: string, paid: boolean) { await updateDoc(doc(db, 'cndPurchaseOrders', id), { paid }); }
export async function cancelCndPO(id: string) { await updateDoc(doc(db, 'cndPurchaseOrders', id), { status: 'cancelled' }); }

export async function clearCndPurchaseOrders(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'cndPurchaseOrders'), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}
