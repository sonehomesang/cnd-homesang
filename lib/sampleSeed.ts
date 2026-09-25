import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { getAppSettings, saveAppSettings } from './appSettings';
import { DEFAULT_PLATFORM_FEES, savePlatformFees } from './platformFees';

/**
 * Comprehensive sample-data seeder — populates EVERY built commerce feature with
 * editable, realistic example records so the owner can inspect / tweak / use them
 * as templates. Everything is tagged `sample: true` (and cross-referenced by
 * fixed `sample-*` ids so re-running is idempotent) and is removed by
 * purgeSampleData(). Seeds: a sample shop + products (incl. flash deals),
 * group-buy campaigns, reels, shoppable posts, the value-added fee components,
 * and a few of the admin's own orders (so loyalty / income / the order queue
 * show data). Also switches ON loyalty/referral/broker rates if still zero, so
 * those features become visible.
 */

const SHOP_ID = 'sample-shop-hs';
const SHOP_NAME = 'ຮ້ານ ຕົວຢ່າງ HomeSang';
const DAY = 86400000;
const img = (s: string) => `https://picsum.photos/seed/${s}/400/300`;

function strip<T extends Record<string, any>>(o: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

const PRODUCTS = [
  { id: 'sample-prod-1', name: 'ສີນ້ຳ TOA SuperShield 18.9L', category: 'materials', categoryLao: 'ວັດສະດຸ', price: 520000, unit: 'ຖັງ', stock: 40, salePrice: 416000, saleDays: 2, specs: 'ຍີ່ຫໍ້: TOA\nຂະໜາດ: 18.9L\nສີ: ຂາວ', featured: true, soldCount: 24 },
  { id: 'sample-prod-2', name: 'ປູນ ຊີມັງ TigerCem (50kg)', category: 'materials', categoryLao: 'ວັດສະດຸ', price: 68000, unit: 'ຖົງ', stock: 200, salePrice: 58000, saleDays: 1, soldCount: 60 },
  { id: 'sample-prod-3', name: 'ໂຄມໄຟ LED ຊຸດ 12W', category: 'electrical', categoryLao: 'ໄຟຟ້າ', price: 180000, unit: 'ຊຸດ', stock: 60, soldCount: 35 },
  { id: 'sample-prod-4', name: 'ກ໊ອກນ້ຳ ສະແຕນເລດ', category: 'plumbing', categoryLao: 'ປະປາ', price: 145000, unit: 'ອັນ', stock: 25, soldCount: 12 },
  { id: 'sample-prod-5', name: 'ກະເບື້ອງ ປູພື້ນ 60×60', category: 'materials', categoryLao: 'ວັດສະດຸ', price: 95000, unit: 'ກ່ອງ', stock: 120, soldCount: 80 },
  { id: 'sample-prod-6', name: 'ສະຫວ່ານ ໄຟຟ້າ Bosch', category: 'tools', categoryLao: 'ເຄື່ອງມື', price: 890000, unit: 'ອັນ', stock: 8, soldCount: 5, featured: true },
];

const GROUP_BUYS = [
  { id: 'sample-gb-1', pid: 'sample-prod-3', groupPrice: 126000, target: 10, joiners: 7, days: 2 },
  { id: 'sample-gb-2', pid: 'sample-prod-5', groupPrice: 78000, target: 10, joiners: 9, days: 1 },
];

const REELS = [
  { id: 'sample-reel-1', author: 'ຊ່າງ ທາສີ ຕົວຢ່າງ', vid: 'ScMzIvxBSi4', caption: '🎨 ວິທີ ທາ ສີ ບ້ານ ໃຫ້ ຄົງທົນ 5 ປີ', pid: 'sample-prod-1' },
  { id: 'sample-reel-2', author: 'ຊ່າງ ໄຟຟ້າ ຕົວຢ່າງ', vid: 'aqz-KE-bpKQ', caption: '💡 ຕິດ ໂຄມ LED ເອງ ງ່າຍໆ', pid: 'sample-prod-3' },
];

const POSTS = [
  { id: 'sample-post-1', author: 'ລູກຄ້າ ຕົວຢ່າງ A', content: 'ຫາກໍ່ ຕໍ່ເຕີມ ເຮືອນ ໃໝ່ — ໃຊ້ ສີ TOA ນີ້ ດີ ຫຼາຍ ຄຸ້ມ ຄ່າ! 🏠', pid: 'sample-prod-1' },
  { id: 'sample-post-2', author: 'ລູກຄ້າ ຕົວຢ່າງ B', content: 'ໂຄມ LED ຊຸດ ນີ້ ແສງ ສະຫວ່າງ ດີ ປະຢັດ ໄຟ 👍', pid: 'sample-prod-3' },
];

// admin's own sample orders (so loyalty / income / order-queue + escrow states populate)
const ORDERS = [
  { id: 'sample-ord-1', num: 'HS-SAMP-1', status: 'delivered', subtotal: 500000, fee: 20000, commission: 25000, fees: [{ key: 'escrow', label: '🔒 ຄ່າ Escrow', amount: 7500 }, { key: 'fulfillment', label: '🚚 ຄ່າ Fulfillment', amount: 10000 }], points: 0, ago: 2, tracking: 'ANS-88120945', provider: 'Anousith Express' },
  { id: 'sample-ord-2', num: 'HS-SAMP-2', status: 'completed', subtotal: 300000, fee: 20000, commission: 15000, fees: [{ key: 'escrow', label: '🔒 ຄ່າ Escrow', amount: 4500 }], points: 5000, ago: 5 },
  { id: 'sample-ord-3', num: 'HS-SAMP-3', status: 'pending', subtotal: 145000, fee: 20000, commission: 0, fees: [], points: 0, ago: 0 },
  { id: 'sample-ord-4', num: 'HS-SAMP-4', status: 'delivering', subtotal: 890000, fee: 25000, commission: 44500, fees: [{ key: 'escrow', label: '🔒 ຄ່າ Escrow', amount: 13350 }], points: 0, ago: 0, tracking: 'HAL-77219034', provider: 'HAL Express' },
  { id: 'sample-ord-5', num: 'HS-SAMP-5', status: 'delivered', subtotal: 190000, fee: 20000, commission: 9500, fees: [], points: 0, ago: 1, claim: true },
];

/** Seed all sample data. Returns per-collection counts. Idempotent. */
export async function seedAllSampleData(adminUid: string): Promise<Record<string, number>> {
  const now = Date.now();
  const counts: Record<string, number> = {};

  // 1 — sample shop (owned by the admin so it's manageable via shop/manage)
  await setDoc(doc(db, 'shops', SHOP_ID), strip({
    ownerId: adminUid, name: SHOP_NAME, image: img('hsshop'), description: 'ຮ້ານ ຕົວຢ່າງ ສຳລັບ ທົດສອບ ທຸກ ຟັງຊັນ.',
    phone: '020 5555 1234', address: 'ນະຄອນຫຼວງ ວຽງຈັນ', isPartner: true, isOpen: true,
    // shop-level member rule (layer 2) — this shop gives technicians a deeper 12%
    memberDiscountRules: [{ group: 'technician', pct: 12 }],
    sample: true, createdAt: serverTimestamp(),
  }), { merge: true });
  counts.shops = 1;

  // 2 — products (some with a live flash deal)
  const pb = writeBatch(db);
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    pb.set(doc(db, 'products', p.id), strip({
      shopId: SHOP_ID, shopName: SHOP_NAME, name: p.name, description: 'ສິນຄ້າ ຕົວຢ່າງ ສຳລັບ ທົດສອບ ລະບົບ — ແກ້ໄຂ ໄດ້.',
      specs: p.specs, price: p.price, unit: p.unit, stock: p.stock, images: [img('hsp' + i)],
      approved: true, active: true, featured: p.featured ?? false, soldCount: p.soldCount ?? 0,
      category: p.category, categoryLao: p.categoryLao,
      salePrice: p.salePrice, saleEndsAt: p.salePrice ? now + (p.saleDays ?? 1) * DAY : undefined,
      // per-product member override (layer 1) on the first product
      memberDiscounts: p.id === 'sample-prod-1' ? [{ group: 'general', pct: 8 }] : undefined,
      quotable: true, costPrice: Math.round(p.price * 0.7), commissionPct: 5, sample: true, createdAt: serverTimestamp(),
    }), { merge: true });
  }
  await pb.commit();
  counts.products = PRODUCTS.length;

  // 3 — group-buy campaigns
  const gb = writeBatch(db);
  for (const g of GROUP_BUYS) {
    const prod = PRODUCTS.find((p) => p.id === g.pid)!;
    const joinerIds = Array.from({ length: g.joiners }, (_, k) => `mock-joiner-${k + 1}`);
    gb.set(doc(db, 'groupBuys', g.id), strip({
      productId: g.pid, shopId: SHOP_ID, productName: prod.name, productImage: img('hsp' + PRODUCTS.indexOf(prod)),
      productUnit: prod.unit, origPrice: prod.price, groupPrice: g.groupPrice, target: g.target,
      endsAt: now + g.days * DAY, joinerIds, status: 'open', createdBy: adminUid, sample: true, createdAt: serverTimestamp(),
    }), { merge: true });
  }
  await gb.commit();
  counts.groupBuys = GROUP_BUYS.length;

  // 4 — reels (shoppable short videos)
  const rb = writeBatch(db);
  for (const r of REELS) {
    const prod = PRODUCTS.find((p) => p.id === r.pid);
    rb.set(doc(db, 'reels', r.id), strip({
      authorId: 'mock-creator-1', authorName: r.author, videoType: 'youtube',
      videoUrl: `https://www.youtube.com/watch?v=${r.vid}`, caption: r.caption,
      productId: r.pid, productName: prod?.name, productImage: prod ? img('hsp' + PRODUCTS.indexOf(prod)) : undefined,
      productPrice: prod?.price, productUnit: prod?.unit, shopId: SHOP_ID,
      likeCount: 0, viewCount: 0, active: true, sample: true, createdAt: serverTimestamp(),
    }), { merge: true });
  }
  await rb.commit();
  counts.reels = REELS.length;

  // 5 — shoppable community posts
  const ob = writeBatch(db);
  for (let i = 0; i < POSTS.length; i++) {
    const po = POSTS[i];
    const prod = PRODUCTS.find((p) => p.id === po.pid);
    ob.set(doc(db, 'posts', po.id), strip({
      authorId: `mock-cust-${i + 1}`, authorName: po.author, content: po.content, type: 'sell',
      productId: po.pid, productName: prod?.name, productImage: prod ? img('hsp' + PRODUCTS.indexOf(prod)) : undefined,
      productPrice: prod?.price, productUnit: prod?.unit, shopId: SHOP_ID,
      likeCount: 3 + i, commentCount: 0, sample: true, createdAt: serverTimestamp(),
    }), { merge: true });
  }
  await ob.commit();
  counts.posts = POSTS.length;

  // 5b — sample riders (one verified, one pending) for the admin approval flow
  const rb2 = writeBatch(db);
  rb2.set(doc(db, 'riders', 'sample-rider-1'), strip({
    name: 'ໄຊ ຈັດສົ່ງໄວ', phone: '020 5555 7001', vehicle: '🛵 ລົດຈັກ', zone: 'ນະຄອນຫຼວງ — ໄຊເສດຖາ',
    licenseNo: 'VTE-1122334', plate: 'ກຂ 8842', approved: true, active: true, sample: true, createdAt: serverTimestamp(),
  }), { merge: true });
  rb2.set(doc(db, 'riders', 'sample-rider-2'), strip({
    name: 'ບຸນ ສົ່ງດ່ວນ', phone: '020 5555 7002', vehicle: '🚗 ລົດເກງ', zone: 'ນະຄອນຫຼວງ — ສີໂຄດ',
    licenseNo: 'VTE-9988776', plate: 'ຄງ 1290', approved: false, active: true, sample: true, createdAt: serverTimestamp(),
  }), { merge: true });
  await rb2.commit();
  counts.riders = 2;

  // 6 — value-added fee components (enable a few so the engine is live)
  await savePlatformFees(DEFAULT_PLATFORM_FEES.map((c) => (['escrow', 'fulfillment', 'cod'].includes(c.key) ? { ...c, enabled: true } : c)));
  counts.platformFees = 3;

  // 7 — switch on loyalty / referral / broker rates if still zero (so those features show)
  const s = await getAppSettings();
  await saveAppSettings({
    loyaltyEarnPct: s.loyaltyEarnPct || 3,
    loyaltyMaxRedeemPct: s.loyaltyMaxRedeemPct || 50,
    referralRewardKip: s.referralRewardKip || 10000,
    brokerCommissionPct: s.brokerCommissionPct || 3,
    // global default member/group discounts (layer 3)
    memberDiscounts: s.memberDiscounts?.length ? s.memberDiscounts : [
      { group: 'technician', pct: 10 },
      { group: 'corporation', pct: 5 },
    ],
  });
  counts.settings = 1;

  // 8 — the admin's own sample orders + line items (loyalty / income / queue / escrow states)
  for (const o of ORDERS) {
    const vat = Math.round(((o.subtotal + o.fee) * 10) / 100);
    const grandTotal = o.subtotal + o.fee + vat - o.points;
    const feeTotal = o.fees.reduce((x, f) => x + f.amount, 0);
    const paid = o.status !== 'pending'; // payment verified once past pending
    const delivered = o.status === 'delivered' || o.status === 'completed';
    await setDoc(doc(db, 'orders', o.id), strip({
      orderNumber: o.num, customerId: adminUid, shopId: SHOP_ID, shopName: SHOP_NAME,
      status: o.status, paymentMethod: 'bank_transfer', paymentVerified: paid,
      deliveryMethod: 'delivery', deliveryAddress: 'ນະຄອນຫຼວງ ວຽງຈັນ',
      trackingNumber: (o as any).tracking, logisticsProviderName: (o as any).provider,
      subtotal: o.subtotal, deliveryFee: o.fee, vat, vatRate: 10, grandTotal,
      commission: o.commission || undefined,
      platformFees: feeTotal > 0 ? o.fees : undefined, platformFeeTotal: feeTotal > 0 ? feeTotal : undefined,
      pointsRedeemed: o.points > 0 ? o.points : undefined, pointsDiscount: o.points > 0 ? o.points : undefined,
      deliveredAt: delivered ? now - o.ago * DAY : undefined,
      sample: true, createdAt: serverTimestamp(),
    }), { merge: true });
    // one line item per order (fixed id → CF stock/soldCount adjusts only on first seed)
    const prod = PRODUCTS[ORDERS.indexOf(o) % PRODUCTS.length];
    await setDoc(doc(db, 'orderItems', `sample-oi-${o.id}`), strip({
      orderId: o.id, productId: prod.id, productName: prod.name, unitPrice: o.subtotal, unit: prod.unit,
      quantity: 1, total: o.subtotal, imageUrl: img('hsp' + PRODUCTS.indexOf(prod)), sample: true,
    }), { merge: true });
    // a disputed order carries an open refund claim (freezes escrow release)
    if ((o as any).claim) {
      await setDoc(doc(db, 'claims', `sample-claim-${o.id}`), strip({
        orderId: o.id, orderNumber: o.num, customerId: adminUid, shopId: SHOP_ID,
        type: 'defective', reason: 'ສິນຄ້າ ມາ ບໍ່ ຄົບ — ຂາດ 1 ລາຍການ', status: 'pending',
        refundAmount: 95000, sample: true, createdAt: serverTimestamp(),
      }), { merge: true });
    }
  }
  counts.orders = ORDERS.length;

  return counts;
}
