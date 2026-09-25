import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query,
  serverTimestamp, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_FLAG, stampMock } from './mock';

/**
 * B2B phase 4 — business invoicing + credit terms + spend reporting.
 *
 * A company is billed for work (an awarded RFQ, a job, a maintenance visit, or a
 * manual line), on payment terms (prepay / net-15/30/60). Invoices accrue against
 * the company's credit limit (set on the org doc). Spend rolls up per building so
 * a facility manager sees where the money goes.  orgInvoices/{id} is org-scoped
 * (isOrgMember). "Overdue" is derived from dueAt, not stored.
 */

export type Terms = 'prepay' | 'net15' | 'net30' | 'net60';
export const TERMS: { key: Terms; lao: string; days: number }[] = [
  { key: 'prepay', lao: 'ຈ່າຍ ກ່ອນ', days: 0 },
  { key: 'net15', lao: 'ເຄຣດິຕ 15 ວັນ', days: 15 },
  { key: 'net30', lao: 'ເຄຣດິຕ 30 ວັນ', days: 30 },
  { key: 'net60', lao: 'ເຄຣດິຕ 60 ວັນ', days: 60 },
];
export const termsLabel = (t?: string) => TERMS.find((x) => x.key === t)?.lao ?? 'ເຄຣດິຕ 30 ວັນ';
const termsDays = (t?: string) => TERMS.find((x) => x.key === t)?.days ?? 30;
const DAY = 86400000;

export type InvStatus = 'sent' | 'paid' | 'void';
export type InvSource = 'rfq' | 'job' | 'maintenance' | 'manual';
export interface OrgInvoice {
  id: string;
  orgId: string;
  number: string;          // human-readable, e.g. INV-04821
  title: string;
  amount: number;
  category?: string;
  siteId?: string;
  siteName?: string;
  terms: Terms;
  status: InvStatus;
  issuedAt: number;
  dueAt: number;
  paidAt?: number;
  note?: string;
  sourceType?: InvSource;
  sourceId?: string;       // e.g. the awarded RFQ id (dedupe)
  createdBy: string;
  createdAt: number;
  __mock?: boolean;
}

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function mapInv(id: string, d: any): OrgInvoice {
  return {
    id, orgId: d.orgId ?? '', number: d.number ?? '', title: d.title ?? '', amount: typeof d.amount === 'number' ? d.amount : 0,
    category: d.category, siteId: d.siteId, siteName: d.siteName, terms: (d.terms ?? 'net30') as Terms, status: (d.status ?? 'sent') as InvStatus,
    issuedAt: ms(d.issuedAt), dueAt: ms(d.dueAt), paidAt: d.paidAt ? ms(d.paidAt) : undefined, note: d.note,
    sourceType: d.sourceType, sourceId: d.sourceId, createdBy: d.createdBy ?? '', createdAt: ms(d.createdAt), __mock: !!d[MOCK_FLAG],
  };
}

/** Derived display status — a sent invoice past its due date reads as overdue. */
export function isOverdue(inv: OrgInvoice, now = Date.now()): boolean { return inv.status === 'sent' && inv.dueAt > 0 && inv.dueAt < now; }

function genNumber(): string { return `INV-${(Date.now() % 100000).toString().padStart(5, '0')}`; }

export function watchInvoices(orgId: string, cb: (inv: OrgInvoice[]) => void) {
  return onSnapshot(query(collection(db, 'orgInvoices'), where('orgId', '==', orgId)),
    (s) => cb(s.docs.map((d) => mapInv(d.id, d.data())).sort((a, b) => b.issuedAt - a.issuedAt)),
    (e) => { console.error('watchInvoices:', e); cb([]); });
}

export async function createInvoice(orgId: string, uid: string, v: {
  title: string; amount: number; terms: Terms; category?: string; siteId?: string; siteName?: string; note?: string; sourceType?: InvSource; sourceId?: string;
}): Promise<string> {
  const issued = Date.now();
  const ref = await addDoc(collection(db, 'orgInvoices'), {
    orgId, createdBy: uid, number: genNumber(), title: v.title.trim(), amount: v.amount, terms: v.terms,
    category: v.category || undefined, siteId: v.siteId || undefined, siteName: v.siteName || undefined, note: v.note?.trim() || undefined,
    sourceType: v.sourceType || 'manual', sourceId: v.sourceId || undefined,
    status: 'sent', issuedAt: issued, dueAt: issued + termsDays(v.terms) * DAY, createdAt: serverTimestamp(),
  });
  return ref.id;
}
export async function markPaid(id: string) { await updateDoc(doc(db, 'orgInvoices', id), { status: 'paid', paidAt: Date.now() }); }
export async function reopenInvoice(id: string) { await updateDoc(doc(db, 'orgInvoices', id), { status: 'sent', paidAt: null }); }
export async function voidInvoice(id: string) { await updateDoc(doc(db, 'orgInvoices', id), { status: 'void' }); }
export async function deleteInvoice(id: string) { await deleteDoc(doc(db, 'orgInvoices', id)); }

// ── Aggregates ───────────────────────────────────────────────────────────────
export interface CreditSummary { outstanding: number; overdue: number; paid: number; limit: number; available: number; }
export function summarize(inv: OrgInvoice[], creditLimit = 0, now = Date.now()): CreditSummary {
  let outstanding = 0, overdue = 0, paid = 0;
  for (const i of inv) {
    if (i.status === 'sent') { outstanding += i.amount; if (isOverdue(i, now)) overdue += i.amount; }
    else if (i.status === 'paid') paid += i.amount;
  }
  return { outstanding, overdue, paid, limit: creditLimit, available: Math.max(0, creditLimit - outstanding) };
}

export interface SiteSpend { key: string; name: string; total: number; outstanding: number; paid: number; count: number; }
/** Spend rolled up per building (void excluded). */
export function spendBySite(inv: OrgInvoice[]): SiteSpend[] {
  const map = new Map<string, SiteSpend>();
  for (const i of inv) {
    if (i.status === 'void') continue;
    const key = i.siteId || '__none';
    const name = i.siteName || 'ບໍ່ ລະບຸ ອາຄານ';
    const cur = map.get(key) ?? { key, name, total: 0, outstanding: 0, paid: 0, count: 0 };
    cur.total += i.amount; cur.count += 1;
    if (i.status === 'paid') cur.paid += i.amount; else cur.outstanding += i.amount;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

// ── Sample / mock data ───────────────────────────────────────────────────────
export async function seedMockInvoices(orgId: string, uid: string) {
  const now = Date.now();
  const rows = [
    { title: 'ຕິດຕັ້ງ ແອຣ໌ 3 ໜ່ວຍ ຫ້ອງ ປະຊຸມ', amount: 13500000, category: 'ແອຣ໌', terms: 'net30' as Terms, status: 'sent', ageDays: 5, siteName: 'ອາຄານ ສຳ ນັກງານ A' },
    { title: 'ກວດ ລະບົບ ໄຟຟ້າ ປະຈຳ ປີ', amount: 2600000, category: 'ໄຟຟ້າ', terms: 'net15' as Terms, status: 'paid', ageDays: 40, siteName: 'ອາຄານ ສຳ ນັກງານ A' },
    { title: 'ທຳ ຄວາມ ສະ ອາດ ປະຈຳ ເດືອນ', amount: 4200000, category: 'ທຳ ຄວາມ ສະ ອາດ', terms: 'net30' as Terms, status: 'sent', ageDays: 45, siteName: 'ອາພາຣ໌ຕເມນຕ໌ B' }, // overdue
    { title: 'ສ້ອມ ລະບົບ ນ້ຳ ປໍ້າ', amount: 1800000, category: 'ປະປາ', terms: 'net30' as Terms, status: 'paid', ageDays: 20, siteName: 'ອາພາຣ໌ຕເມນຕ໌ B' },
  ];
  for (const r of rows) {
    const issued = now - r.ageDays * DAY;
    await addDoc(collection(db, 'orgInvoices'), stampMock({
      orgId, createdBy: uid, number: genNumber(), title: r.title, amount: r.amount, category: r.category, terms: r.terms,
      siteName: r.siteName, status: r.status, sourceType: 'manual', issuedAt: issued, dueAt: issued + termsDays(r.terms) * DAY,
      paidAt: r.status === 'paid' ? issued + 3 * DAY : null, createdAt: serverTimestamp(),
    }));
  }
}
export async function clearMockInvoices(orgId: string) {
  const snap = await getDocs(query(collection(db, 'orgInvoices'), where('orgId', '==', orgId), where(MOCK_FLAG, '==', true)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
