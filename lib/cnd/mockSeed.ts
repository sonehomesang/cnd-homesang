import { collection, deleteDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { MOCK_FLAG, stampMock } from '../mock';
import { seedCndCatalog } from './catalog';
import { seedCndTechs } from './techs';
import { seedCndBranches } from './branches';
import { seedCndRoles, seedCndStaff } from './staff';
import { seedCndSuppliers } from './suppliers';
import { seedCndExpenses } from './expenses';
import { seedCndCoupons } from './coupons';
import { seedCndBanners } from './banners';
import { seedCndZones } from './zones';
import { seedCndBanks } from './banks';
import { clearCndPublicCards, rebuildCndPublicCards } from './publicCards';
import { clearCndAuditLogs } from './audit';

// Seed a LOT of CND demo data — catalog + techs (if empty) + many orders (online
// + POS) over the last two weeks + a few closed shifts with X/Z figures. All
// __mock so the go-live clear removes it.
const DAY = 86400000;
const CASHIER = 'ຄຳ ພອນ';
function rint(a: number, b: number) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pickOf<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

// why a customer used / declined the CND installer + before/after feedback
const INSTALL_REASONS = ['ບໍ່ ມີ ເຄື່ອງມື ເອງ', 'ຢາກ ໄດ້ ຊ່າງ ຮັບປະກັນ ວຽກ', 'ບໍ່ ມີ ເວລາ ຕິດ ເອງ', 'ວຽກ ຕ້ອງ ໃຊ້ ຊ່າງ ຊ່ຽວຊານ (ແອຣ໌/ໄຟ)', 'ຮ້ານ ແນະນຳ ໃຫ້ ໃຊ້ ຊ່າງ'];
const DECLINE_REASONS = ['ມີ ຊ່າງ ປະຈຳ ເອງ ແລ້ວ', 'ຕິດຕັ້ງ ເອງ ໄດ້', 'ຄ່າ ຕິດຕັ້ງ ແພງ ເກີນ', 'ໃຫ້ ຄົນ ຮູ້ຈັກ ຕິດ ໃຫ້', 'ຍັງ ບໍ່ ຟ້າວ ຕິດຕັ້ງ'];
const REVIEWS = ['ຊ່າງ ມາ ຕົງ ເວລາ, ວຽກ ລະອຽດ', 'ຕິດຕັ້ງ ໄວ ດີ, ເກັບ ບ່ອນ ສະອາດ', 'ພໍໃຈ ຫຼາຍ, ຈະ ໃຊ້ ອີກ', 'ວຽກ ດີ ແຕ່ ມາ ຊ້າ ໜ່ອຍ', 'ສຸພາບ ດີ, ອະທິບາຍ ຊັດເຈນ'];
const BEFORE_NOTES = ['ຈຸດ ຕິດຕັ້ງ ຍັງ ບໍ່ ໄດ້ ຕຽມ ໄຟ', 'ຝາ ເກົ່າ ຕ້ອງ ເຈາະ ໃໝ່', 'ຕ້ອງ ຮື້ ຂອງ ເກົ່າ ອອກ ກ່ອນ', 'ພື້ນ ທີ່ ແຄບ, ເຂົ້າ ຍາກ'];
const AFTER_NOTES = ['ຕິດຕັ້ງ ຮຽບຮ້ອຍ, ທົດ ສອບ ໃຊ້ ງານ ໄດ້', 'ເກັບ ສາຍ ຮຽບຮ້ອຍ, ສອນ ວິທີ ໃຊ້ ແລ້ວ', 'ຕິດ ແໜ້ນ ດີ, ບໍ່ ຮົ່ວ', 'ວຽກ ສຳ ເລັດ ຄົບ ຕາມ ນັດ'];
// a small fixed pool so orders accumulate per customer → varied loyalty tiers
const CUSTOMERS = [
  { name: 'ນາງ ດາວ ວົງ', phone: '020 5555 1001' },
  { name: 'ທ້າວ ສີ ພົມມະ', phone: '020 5555 1002' },
  { name: 'ນາງ ຄຳ ໄຊ', phone: '020 5555 1003' },
  { name: 'ທ້າວ ບຸນ ຈັນ', phone: '020 5555 1004' },
  { name: 'ບໍລິສັດ ກໍ່ສ້າງ ລາວ', phone: '020 5555 1005' },
];

export async function seedCndDemo(): Promise<{ orders: number; shifts: number }> {
  // ensure catalog + techs + branches exist
  if ((await getDocs(query(collection(db, 'cndProducts')))).empty) await seedCndCatalog(0, 0);
  if ((await getDocs(query(collection(db, 'cndTechs')))).empty) await seedCndTechs(0);
  if ((await getDocs(query(collection(db, 'cndBranches')))).empty) await seedCndBranches(0);
  if ((await getDocs(query(collection(db, 'cndRoles')))).empty) await seedCndRoles(0);
  if ((await getDocs(query(collection(db, 'cndStaff')))).empty) await seedCndStaff(0);
  if ((await getDocs(query(collection(db, 'cndSuppliers')))).empty) await seedCndSuppliers(0);
  if ((await getDocs(query(collection(db, 'cndExpenses')))).empty) await seedCndExpenses(0);
  if ((await getDocs(query(collection(db, 'cndCoupons')))).empty) await seedCndCoupons(0);
  if ((await getDocs(query(collection(db, 'cndBanners')))).empty) await seedCndBanners(0);
  if ((await getDocs(query(collection(db, 'cndZones')))).empty) await seedCndZones(0);
  if ((await getDocs(query(collection(db, 'cndBanks')))).empty) await seedCndBanks(0);
  const branches = (await getDocs(query(collection(db, 'cndBranches')))).docs.map((d) => d.id);
  const products = (await getDocs(query(collection(db, 'cndProducts')))).docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  // attribute each product's stock across branches (default branch gets it) if not split yet
  if (branches.length > 0) {
    const b = writeBatch(db);
    for (const p of products) { if (!p.stockByBranch) b.update(doc(db, 'cndProducts', p.id), { stockByBranch: { [branches[0]]: p.stock ?? 20 } }); }
    await b.commit();
  }
  const techs = (await getDocs(query(collection(db, 'cndTechs')))).docs.map((d) => ({ id: d.id, name: (d.data() as any).name }));
  const suppliers = (await getDocs(query(collection(db, 'cndSuppliers')))).docs.map((d) => ({ id: d.id, name: (d.data() as any).name }));
  if (products.length === 0) return { orders: 0, shifts: 0 };
  const pick = () => products[Math.floor(Math.random() * products.length)];
  const now = Date.now();

  // pre-generate 3 shift refs (last 3 days)
  const shiftRefs = [1, 2, 3].map(() => doc(collection(db, 'cndShifts')));
  const shiftAgg: Record<string, { cash: number; total: number; count: number; disc: number; qr: number }> = {};
  shiftRefs.forEach((r) => (shiftAgg[r.id] = { cash: 0, total: 0, count: 0, disc: 0, qr: 0 }));

  // ── orders ──
  const orderDocs: any[] = [];
  for (let i = 0; i < 30; i++) {
    const isPos = Math.random() < 0.55;
    const createdAt = now - rint(0, 13) * DAY - rint(0, 20) * 3600000;
    const items: any[] = [];
    for (let j = 0, n = rint(1, 4); j < n; j++) { const p = pick(); const qty = rint(1, 3); items.push({ productId: p.id, name: p.name, unit: p.unit || 'ໜ່ວຍ', price: p.price || 0, qty, install: false, feePct: 0, feeAmount: 0 }); }
    const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    if (isPos) {
      const discount = Math.random() < 0.3 ? rint(1, 8) * 5000 : 0;
      const total = subtotal - discount;
      const pm = Math.random() < 0.7 ? 'cash' : 'qr';
      const shiftId = shiftRefs[rint(0, shiftRefs.length - 1)].id;
      const a = shiftAgg[shiftId]; a.count++; a.total += total; a.disc += discount; if (pm === 'cash') a.cash += total; else a.qr += total;
      orderDocs.push(stampMock({ number: `CND-${rint(10000, 99999)}`, items, subtotal, installFeeTotal: 0, deliveryFee: 0, discount: discount || undefined, total, channel: 'pos', paymentMethod: pm, paidAmount: pm === 'cash' ? total + rint(0, 5) * 10000 : undefined, cashier: CASHIER, shiftId, status: 'done', createdAt }));
    } else {
      const inst = Math.random() < 0.45 ? items[0] : undefined;
      const status = ['new', 'confirmed', 'delivering', 'done'][rint(0, 3)];
      let installFeeTotal = 0; let install: any; let declineReason: string | undefined;
      if (inst) {
        inst.install = true; inst.feePct = 10; inst.feeAmount = Math.round(inst.price * inst.qty * 0.1); installFeeTotal = inst.feeAmount;
        const t = techs[rint(0, Math.max(0, techs.length - 1))];
        const done = status === 'done' || Math.random() < 0.55;
        const scheduledAt = createdAt + rint(1, 3) * DAY;
        const onTime = Math.random() < 0.8;
        install = {
          feeTotal: installFeeTotal, linkedToInvoice: Math.random() < 0.7,
          ...(t ? { techId: t.id, techName: t.name } : {}),
          reason: pickOf(INSTALL_REASONS), ratingBefore: rint(3, 5),
          stage: done ? 'done' : 'scheduled', scheduledAt,
          ...(done ? {
            completedAt: scheduledAt + (onTime ? -rint(0, 4) : rint(5, 30)) * 3600000, onTime,
            rating: rint(3, 5), review: pickOf(REVIEWS), beforeNote: pickOf(BEFORE_NOTES), afterNote: pickOf(AFTER_NOTES),
          } : {}),
        };
      } else {
        declineReason = pickOf(DECLINE_REASONS);
      }
      const deliveryFee = 50000; const total = subtotal + installFeeTotal + deliveryFee;
      const cust = pickOf(CUSTOMERS);
      orderDocs.push(stampMock({ number: `CND-${rint(10000, 99999)}`, items, subtotal, installFeeTotal, deliveryFee, total, install, declineReason, customerName: cust.name, phone: cust.phone, channel: 'online', status, createdAt }));
    }
  }

  // ── shift docs (with computed X/Z figures) ──
  const batch = writeBatch(db);
  shiftRefs.forEach((r, idx) => {
    const a = shiftAgg[r.id]; const opening = 500000; const expected = opening + a.cash;
    const counted = expected + (Math.random() < 0.5 ? 0 : rint(-2, 3) * 5000); // small over/short
    const openedAt = now - (idx + 1) * DAY - 8 * 3600000;
    batch.set(r, stampMock({ cashier: CASHIER, openingCash: opening, openedAt, closedAt: openedAt + 7 * 3600000, status: 'closed', closingCashCounted: counted, salesCount: a.count, salesTotal: a.total, cashSales: a.cash, qrSales: a.qr, discountTotal: a.disc, expectedCash: expected, overShort: counted - expected }));
  });
  for (const o of orderDocs) batch.set(doc(collection(db, 'cndOrders')), o);
  // ── purchase orders (2 received, 1 still ordered) ──
  for (let i = 0; i < 3; i++) {
    const sup = suppliers[i % Math.max(1, suppliers.length)];
    const lines: any[] = [];
    for (let j = 0, n = rint(1, 3); j < n; j++) { const p = pick(); const qty = rint(5, 20); const cost = Math.round((p.cost || (p.price || 0) * 0.7)); lines.push({ productId: p.id, name: p.name, unit: p.unit || 'ໜ່ວຍ', qty, cost, amount: qty * cost }); }
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const received = i > 0;
    const createdAt = now - rint(2, 12) * DAY;
    batch.set(doc(collection(db, 'cndPurchaseOrders')), stampMock({ number: `PO-${rint(10000, 99999)}`, supplierId: sup?.id, supplierName: sup?.name, lines, subtotal, status: received ? 'received' : 'ordered', paid: received && i === 2, branchId: branches[0], createdAt, receivedAt: received ? createdAt + rint(1, 4) * DAY : undefined }));
  }
  await batch.commit();
  await rebuildCndPublicCards().catch(() => {});   // publish reviews + tiers to storefront

  return { orders: orderDocs.length, shifts: shiftRefs.length };
}

/** Remove every __mock CND record (catalog + techs + orders + shifts). */
export async function clearCndDemo(): Promise<number> {
  let removed = 0;
  for (const col of ['cndOrders', 'cndShifts', 'cndTechs', 'cndProducts', 'cndCategories', 'cndBranches', 'cndRoles', 'cndStaff', 'cndReturns', 'cndSuppliers', 'cndPurchaseOrders', 'cndExpenses', 'cndCoupons', 'cndBanners', 'cndZones', 'cndBanks']) {
    const snap = await getDocs(query(collection(db, col), where(MOCK_FLAG, '==', true)));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    removed += snap.size;
  }
  removed += await clearCndPublicCards().catch(() => 0);  // projections aren't __mock-stamped
  await clearCndAuditLogs().catch(() => 0);
  return removed;
}
