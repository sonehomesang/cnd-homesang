import {
  addDoc, collection, doc, increment, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG } from '../mock';

/**
 * CND inventory — a stock ledger. Stock is tracked PER BRANCH
 * (product.stockByBranch[branchId]); product.stock mirrors the total. Moves:
 * in (goods-in), adjust (count), sale, return, transfer (between branches).
 */
export type CndMoveType = 'in' | 'adjust' | 'sale' | 'return' | 'transfer';
export const MOVE_LABEL: Record<CndMoveType, string> = { in: 'ຮັບ ເຂົ້າ', adjust: 'ປັບ/ນັບ', sale: 'ຂາຍ', return: 'ຄືນ', transfer: 'ໂອນ' };
export interface CndStockMove {
  id: string;
  productId: string;
  productName: string;
  type: CndMoveType;
  qty: number;          // signed delta
  branchId?: string;
  cost?: number;
  note?: string;
  at: number;
  __mock?: boolean;
}
function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): CndStockMove {
  return { id, productId: d.productId ?? '', productName: d.productName ?? '', type: (d.type ?? 'adjust') as CndMoveType, qty: Number(d.qty) || 0, branchId: d.branchId, cost: d.cost, note: d.note, at: ms(d.at), __mock: !!d[MOCK_FLAG] };
}

export function watchCndStockMoves(cb: (m: CndStockMove[]) => void) {
  return onSnapshot(query(collection(db, 'cndStockMoves')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.at - a.at).slice(0, 100)),
    (e) => { console.error('watchCndStockMoves:', e); cb([]); });
}

/** Goods-in: add stock at a branch + record the move (+ unit cost if given). */
export async function receiveStock(p: { id: string; name: string }, branchId: string | null, qty: number, cost?: number, note?: string) {
  const q = Math.abs(Math.round(qty)); if (q === 0) return;
  const patch: any = { stock: increment(q) };
  if (branchId) patch[`stockByBranch.${branchId}`] = increment(q);
  if (typeof cost === 'number' && cost > 0) patch.cost = Math.round(cost);
  await updateDoc(doc(db, 'cndProducts', p.id), patch);
  await addDoc(collection(db, 'cndStockMoves'), { productId: p.id, productName: p.name, type: 'in', qty: q, branchId: branchId || undefined, cost: cost ? Math.round(cost) : undefined, note: note || undefined, at: serverTimestamp() });
}

/** Count/correct a branch's stock to an absolute value + record the delta. */
export async function adjustStock(p: { id: string; name: string }, branchId: string | null, currentQty: number, newQty: number, note?: string) {
  const target = Math.max(0, Math.round(newQty));
  const delta = target - (currentQty || 0);
  if (delta === 0) return;
  const patch: any = { stock: increment(delta) };
  if (branchId) patch[`stockByBranch.${branchId}`] = target; else patch.stock = target;
  await updateDoc(doc(db, 'cndProducts', p.id), patch);
  await addDoc(collection(db, 'cndStockMoves'), { productId: p.id, productName: p.name, type: 'adjust', qty: delta, branchId: branchId || undefined, note: note || undefined, at: serverTimestamp() });
}

/** POS / online sale — decrement a branch's stock + log 'sale' moves. */
export async function recordSaleStock(lines: { productId: string; name: string; qty: number }[], branchId?: string | null) {
  if (lines.length === 0) return;
  const batch = writeBatch(db);
  for (const l of lines) {
    const q = Math.abs(Math.round(l.qty)); if (q === 0) continue;
    const patch: any = { stock: increment(-q) };
    if (branchId) patch[`stockByBranch.${branchId}`] = increment(-q);
    batch.update(doc(db, 'cndProducts', l.productId), patch);
    batch.set(doc(collection(db, 'cndStockMoves')), { productId: l.productId, productName: l.name, type: 'sale', qty: -q, branchId: branchId || undefined, at: serverTimestamp() });
  }
  await batch.commit();
}

/** Return: add returned qty back to a branch's stock + log 'return' moves. */
export async function returnStock(lines: { productId: string; name: string; qty: number }[], branchId?: string | null) {
  const items = lines.filter((l) => Math.round(l.qty) > 0);
  if (items.length === 0) return;
  const batch = writeBatch(db);
  for (const l of items) {
    const q = Math.abs(Math.round(l.qty));
    const patch: any = { stock: increment(q) };
    if (branchId) patch[`stockByBranch.${branchId}`] = increment(q);
    batch.update(doc(db, 'cndProducts', l.productId), patch);
    batch.set(doc(collection(db, 'cndStockMoves')), { productId: l.productId, productName: l.name, type: 'return', qty: q, branchId: branchId || undefined, at: serverTimestamp() });
  }
  await batch.commit();
}

/** Transfer stock between branches (total unchanged) + 2 ledger moves. */
export async function transferStock(p: { id: string; name: string }, from: { id: string; name: string }, to: { id: string; name: string }, qty: number) {
  const q = Math.abs(Math.round(qty)); if (q === 0 || from.id === to.id) return;
  await updateDoc(doc(db, 'cndProducts', p.id), { [`stockByBranch.${from.id}`]: increment(-q), [`stockByBranch.${to.id}`]: increment(q) });
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'cndStockMoves')), { productId: p.id, productName: p.name, type: 'transfer', qty: -q, branchId: from.id, note: `→ ${to.name}`, at: serverTimestamp() });
  batch.set(doc(collection(db, 'cndStockMoves')), { productId: p.id, productName: p.name, type: 'transfer', qty: q, branchId: to.id, note: `← ${from.name}`, at: serverTimestamp() });
  await batch.commit();
}
