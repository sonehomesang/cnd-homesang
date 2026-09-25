import {
  addDoc, arrayUnion, collection, deleteDoc, doc, getDocs, onSnapshot, query,
  serverTimestamp, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_FLAG, stampMock } from './mock';

/**
 * B2B phase 3 — a company's preferred vendor pool + bulk RFQ (request for quote).
 *
 * • orgVendors/{id}  — a company's go-to techs/shops (its trusted supplier list).
 * • rfqs/{id}        — one request sent to several vendors at once; each vendor's
 *                      quote is recorded on the RFQ (in Laos vendors often quote by
 *                      phone/LINE, so quotes can be logged by the team), then the
 *                      company compares and awards. Both are org-scoped and visible
 *                      to the whole team (isOrgMember rule).
 */

// Vendor specialties — aligned to HomeSang service trades.
export const VENDOR_TRADES = ['ໄຟຟ້າ', 'ປະປາ', 'ແອຣ໌', 'ຊ່າງໄມ້', 'ທາສີ', 'ກໍ່ສ້າງ', 'ທຳ ຄວາມ ສະ ອາດ', 'ສວນ', 'ອື່ນໆ'] as const;

export interface OrgVendor {
  id: string;
  orgId: string;
  name: string;
  trade: string;
  phone?: string;
  note?: string;
  rating?: number;   // 0–5, optional
  techId?: string;   // link to a HomeSang technician profile, if any
  addedBy: string;
  createdAt: number;
  __mock?: boolean;
}

export interface RfqQuote {
  vendorId: string;
  vendorName: string;
  price: number;
  days?: number;     // lead time in days
  note?: string;
  at: number;
}
export type RfqStatus = 'open' | 'awarded' | 'closed';
export interface Rfq {
  id: string;
  orgId: string;
  title: string;
  category: string;
  siteId?: string;
  siteName?: string;
  description: string;
  budget?: number;
  status: RfqStatus;
  vendorIds: string[];      // vendors invited to quote
  quotes: RfqQuote[];
  awardedVendorId?: string;
  createdBy: string;
  createdAt: number;
  __mock?: boolean;
}

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }

// ── Vendor pool ──────────────────────────────────────────────────────────────
function mapVendor(id: string, d: any): OrgVendor {
  return { id, orgId: d.orgId ?? '', name: d.name ?? '', trade: d.trade ?? '', phone: d.phone, note: d.note, rating: d.rating, techId: d.techId, addedBy: d.addedBy ?? '', createdAt: ms(d.createdAt), __mock: !!d[MOCK_FLAG] };
}
export function watchVendors(orgId: string, cb: (v: OrgVendor[]) => void) {
  return onSnapshot(query(collection(db, 'orgVendors'), where('orgId', '==', orgId)),
    (s) => cb(s.docs.map((d) => mapVendor(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name))),
    (e) => { console.error('watchVendors:', e); cb([]); });
}
export async function addVendor(orgId: string, uid: string, v: { name: string; trade: string; phone?: string; note?: string }): Promise<string> {
  const ref = await addDoc(collection(db, 'orgVendors'), {
    orgId, addedBy: uid, name: v.name.trim(), trade: v.trade, phone: v.phone?.trim() || undefined, note: v.note?.trim() || undefined, createdAt: serverTimestamp(),
  });
  return ref.id;
}
export async function removeVendor(id: string) { await deleteDoc(doc(db, 'orgVendors', id)); }

// ── RFQ ──────────────────────────────────────────────────────────────────────
function mapRfq(id: string, d: any): Rfq {
  return {
    id, orgId: d.orgId ?? '', title: d.title ?? '', category: d.category ?? '', siteId: d.siteId, siteName: d.siteName,
    description: d.description ?? '', budget: d.budget, status: (d.status ?? 'open') as RfqStatus,
    vendorIds: Array.isArray(d.vendorIds) ? d.vendorIds : [], quotes: Array.isArray(d.quotes) ? d.quotes : [],
    awardedVendorId: d.awardedVendorId, createdBy: d.createdBy ?? '', createdAt: ms(d.createdAt), __mock: !!d[MOCK_FLAG],
  };
}
export function watchRfqs(orgId: string, cb: (r: Rfq[]) => void) {
  return onSnapshot(query(collection(db, 'rfqs'), where('orgId', '==', orgId)),
    (s) => cb(s.docs.map((d) => mapRfq(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchRfqs:', e); cb([]); });
}
export async function createRfq(orgId: string, uid: string, r: { title: string; category: string; description?: string; budget?: number; siteId?: string; siteName?: string; vendorIds: string[] }): Promise<string> {
  const ref = await addDoc(collection(db, 'rfqs'), {
    orgId, createdBy: uid, title: r.title.trim(), category: r.category, description: (r.description ?? '').trim(),
    budget: r.budget || undefined, siteId: r.siteId || undefined, siteName: r.siteName || undefined,
    vendorIds: r.vendorIds, quotes: [], status: 'open', createdAt: serverTimestamp(),
  });
  return ref.id;
}
/** Log a vendor's quote against an RFQ (team records a phone/LINE quote, or a
 *  vendor responds). Client timestamp is fine here (app code, not a function). */
export async function addQuote(rfqId: string, q: { vendorId: string; vendorName: string; price: number; days?: number; note?: string }) {
  const quote: RfqQuote = { vendorId: q.vendorId, vendorName: q.vendorName, price: q.price, days: q.days, note: q.note?.trim() || undefined, at: Date.now() };
  await updateDoc(doc(db, 'rfqs', rfqId), { quotes: arrayUnion(quote) });
}
export async function awardRfq(rfqId: string, vendorId: string) { await updateDoc(doc(db, 'rfqs', rfqId), { status: 'awarded', awardedVendorId: vendorId }); }
export async function closeRfq(rfqId: string) { await updateDoc(doc(db, 'rfqs', rfqId), { status: 'closed' }); }
export async function deleteRfq(id: string) { await deleteDoc(doc(db, 'rfqs', id)); }

// ── Sample / mock data ───────────────────────────────────────────────────────
// Populates a company's vendor pool + a couple of RFQs so the screen isn't empty
// on first visit. Everything is stamped __mock (see lib/mock.ts) → shows the
// 🧪 ຕົວຢ່າງ badge and is removed by clearMockVendorData().
export async function seedMockVendorData(orgId: string, uid: string) {
  const vendors = [
    { name: 'ທ້າວ ສົມພອນ ໄຟຟ້າ', trade: 'ໄຟຟ້າ', phone: '020 5555 1234', rating: 4.8, note: 'ວຽກ ໄຟຟ້າ ອາຄານ · ຕູ້ ໄຟ · ຮັບ ດ່ວນ' },
    { name: 'ຮ້ານ ນ້ຳ ໃສ ປະປາ', trade: 'ປະປາ', phone: '020 5555 2345', rating: 4.5, note: 'ລະບົບ ນ້ຳ · ປໍ້າ · ທໍ່ ຮົ່ວ' },
    { name: 'ໄຊ ແອຣ໌ ເຢັນ (Sai Air)', trade: 'ແອຣ໌', phone: '020 5555 3456', rating: 4.9, note: 'ຕິດຕັ້ງ · ລ້າງ · ຕື່ມ ນ້ຳຢາ ແອຣ໌' },
    { name: 'ຊ່າງ ບຸນມີ ກໍ່ສ້າງ', trade: 'ກໍ່ສ້າງ', phone: '020 5555 4567', rating: 4.2, note: 'ຕໍ່ ເຕີມ · ປູນ · ໂຄງ ສ້າງ' },
    { name: 'ຄລີນ ໂປຣ ທຳ ຄວາມ ສະ ອາດ', trade: 'ທຳ ຄວາມ ສະ ອາດ', phone: '020 5555 5678', rating: 4.7, note: 'ທຳ ຄວາມ ສະ ອາດ ອາຄານ ປະຈຳ ເດືອນ' },
  ];
  const ids: { id: string; name: string }[] = [];
  for (const v of vendors) {
    const ref = await addDoc(collection(db, 'orgVendors'), stampMock({ orgId, addedBy: uid, ...v, createdAt: serverTimestamp() }));
    ids.push({ id: ref.id, name: v.name });
  }
  const [elec, plumb, air] = ids;
  // RFQ 1 — open, two quotes to compare
  await addDoc(collection(db, 'rfqs'), stampMock({
    orgId, createdBy: uid, title: 'ປ່ຽນ ແອຣ໌ 3 ໜ່ວຍ ຫ້ອງ ປະຊຸມ', category: 'ແອຣ໌',
    description: 'ຫ້ອງ ປະຊຸມ ຊັ້ນ 2 — ຖອດ ຂອງ ເກົ່າ + ຕິດຕັ້ງ ແອຣ໌ ໃໝ່ 3 ໜ່ວຍ (18000 BTU). ຕ້ອງການ ໃບ ຮັບປະກັນ.',
    budget: 15000000, siteId: undefined, siteName: undefined, vendorIds: [air.id, elec.id], status: 'open',
    quotes: [
      { vendorId: air.id, vendorName: air.name, price: 13500000, days: 3, note: 'ລວມ ຕິດຕັ້ງ + ຮັບປະກັນ 1 ປີ', at: 0 },
      { vendorId: elec.id, vendorName: elec.name, price: 14200000, days: 5, note: 'ລວມ ເດິນສາຢ ໄຟ ໃໝ່', at: 0 },
    ],
    createdAt: serverTimestamp(),
  }));
  // RFQ 2 — awarded
  await addDoc(collection(db, 'rfqs'), stampMock({
    orgId, createdBy: uid, title: 'ກວດ ລະບົບ ໄຟຟ້າ ອາຄານ ປະຈຳ ປີ', category: 'ໄຟຟ້າ',
    description: 'ກວດ ຕູ້ ໄຟ · ສາຍ ດິນ · ໂຫລດ ທັງ ອາຄານ. ອອກ ໃບ ຮັບຮອງ.',
    budget: 3000000, vendorIds: [elec.id], status: 'awarded', awardedVendorId: elec.id,
    quotes: [{ vendorId: elec.id, vendorName: elec.name, price: 2600000, days: 2, note: 'ລວມ ໃບ ຮັບຮອງ ຄວາມ ປອດໄພ', at: 0 }],
    createdAt: serverTimestamp(),
  }));
}
/** Remove every sample record for this company (vendors + RFQs where __mock). */
export async function clearMockVendorData(orgId: string) {
  for (const col of ['orgVendors', 'rfqs']) {
    const snap = await getDocs(query(collection(db, col), where('orgId', '==', orgId), where(MOCK_FLAG, '==', true)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
}

export async function hasMockVendorData(orgId: string): Promise<boolean> {
  const snap = await getDocs(query(collection(db, 'orgVendors'), where('orgId', '==', orgId), where(MOCK_FLAG, '==', true)));
  return !snap.empty;
}
