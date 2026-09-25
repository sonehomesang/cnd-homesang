import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { isAnyAdmin } from '@/lib/adminTier';
import { cnd, kip, kipT, unitT } from '@/lib/cnd/theme';
import { watchCndProducts, type CndProduct } from '@/lib/cnd/catalog';
import { recordSaleStock } from '@/lib/cnd/inventory';
import { getActiveBranchId, pickActiveBranch, setActiveBranchId, watchCndBranches, type CndBranch } from '@/lib/cnd/branches';
import { createCndPosSale, watchCndOrders, type CndOrder, type CndPayMethod, type CndPosResult } from '@/lib/cnd/orders';
import { closeCndShift, openCndShift, posReport, watchCndOpenShift, type CndShift } from '@/lib/cnd/shifts';
import { useCndConfig } from '@/lib/cnd/config';
import { ttStatic, useTT } from '@/lib/i18n';
import { groupThousands } from '@/lib/format';

interface Line { productId: string; name: string; unit: string; price: number; qty: number; tracked: boolean; }

// CND POS terminal (phase 1a) — web/tablet counter sale. No special hardware:
// barcode scanner types into the search box; receipt prints via the browser.
export default function CndPos() {
  const { profile, loading } = useAuth();
  const tt = useTT();
  const isAdmin = isAnyAdmin(profile);
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const config = useCndConfig();
  const [products, setProducts] = useState<CndProduct[]>([]);
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState('');
  const [pay, setPay] = useState<CndPayMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<(CndPosResult & { lines: Line[]; pay: CndPayMethod }) | null>(null);
  const [shift, setShift] = useState<CndShift | null>(null);
  const [shiftLoaded, setShiftLoaded] = useState(false);
  const [orders, setOrders] = useState<CndOrder[]>([]);
  const [openingCash, setOpeningCash] = useState('500000');
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState('');
  const [zReport, setZReport] = useState<CndShift | null>(null);
  const [branches, setBranches] = useState<CndBranch[]>([]);
  const [brId, setBrId] = useState<string | null>(() => getActiveBranchId());
  const cashierName = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'ແຄັດເຊຍ';
  useEffect(() => watchCndBranches(setBranches), []);
  const activeBranch = branches.find((b) => b.id === brId && b.active) ?? pickActiveBranch(branches);
  const cycleBranch = () => { if (branches.length < 2 || !activeBranch) return; const i = branches.findIndex((b) => b.id === activeBranch.id); const nx = branches[(i + 1) % branches.length]; setActiveBranchId(nx.id); setBrId(nx.id); };

  useEffect(() => { if (!loading && !isAdmin) router.replace('/cnd' as any); }, [loading, isAdmin]);
  useEffect(() => watchCndProducts(setProducts), []);
  useEffect(() => watchCndOpenShift((s) => { setShift(s); setShiftLoaded(true); }), []);
  useEffect(() => watchCndOrders(setOrders), []);

  const doOpenShift = async () => { setBusy(true); try { await openCndShift(cashierName, Number(openingCash.replace(/\D/g, '')) || 0); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const doCloseShift = async () => {
    if (!shift) return; setBusy(true);
    try { await closeCndShift(shift, orders, Number(counted.replace(/\D/g, '')) || 0); const rep = posReport(orders.filter((o) => o.shiftId === shift.id)); const exp = shift.openingCash + rep.cashSales; setZReport({ ...shift, ...rep, closingCashCounted: Number(counted.replace(/\D/g, '')) || 0, expectedCash: exp, overShort: (Number(counted.replace(/\D/g, '')) || 0) - exp, status: 'closed' }); setClosing(false); setCounted(''); }
    catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products.slice(0, 40);
    return products.filter((p) => p.name.toLowerCase().includes(t) || (p.brand ?? '').toLowerCase().includes(t) || (p.sku ?? '').toLowerCase().includes(t)).slice(0, 40);
  }, [products, q]);

  const add = (p: CndProduct) => {
    setLines((ls) => {
      const ex = ls.find((l) => l.productId === p.id);
      if (ex) return ls.map((l) => l.productId === p.id ? { ...l, qty: l.qty + 1 } : l);
      return [...ls, { productId: p.id, name: p.name, unit: p.unit, price: p.price, qty: 1, tracked: typeof p.stock === 'number' }];
    });
  };
  const setQty = (id: string, qty: number) => setLines((ls) => qty <= 0 ? ls.filter((l) => l.productId !== id) : ls.map((l) => l.productId === id ? { ...l, qty } : l));
  const onSearchSubmit = () => {
    const t = q.trim().toLowerCase();
    const hit = products.find((p) => (p.sku ?? '').toLowerCase() === t);
    if (hit) { add(hit); setQ(''); }
  };

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const disc = Math.min(Math.max(0, Number(discount.replace(/\D/g, '')) || 0), subtotal);
  const taxPct = Math.max(0, config.taxPct || 0);
  const taxAmount = Math.round(((subtotal - disc) * taxPct) / 100);
  const total = subtotal - disc + taxAmount;
  const tend = Number(tendered.replace(/\D/g, '')) || 0;
  const change = pay === 'cash' ? Math.max(0, tend - total) : 0;
  const canCharge = lines.length > 0 && (pay === 'qr' || tend >= total);

  const charge = async () => {
    if (!canCharge) return; setBusy(true);
    try {
      const r = await createCndPosSale({ items: lines.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, price: l.price, qty: l.qty })), discount: disc, taxPct, paymentMethod: pay, paidAmount: tend, cashier: cashierName, shiftId: shift?.id });
      recordSaleStock(lines.filter((l) => l.tracked).map((l) => ({ productId: l.productId, name: l.name, qty: l.qty })), activeBranch?.id).catch(() => {});
      setReceipt({ ...r, lines, pay });
      setLines([]); setDiscount(''); setTendered(''); setPay('cash'); setQ('');
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  if (!isAdmin) return <View style={styles.root} />;

  // no open shift → open-shift screen (+ Z report overlay if just closed)
  if (shiftLoaded && !shift) {
    return (
      <View style={styles.root}>
        <View style={styles.top}>
          <Pressable onPress={() => router.push('/cnd/admin' as any)}><Text style={styles.back}>‹ Admin</Text></Pressable>
          <Text style={styles.title}>🏬 CND POS</Text>
          <Text style={styles.cashier}>{cashierName}</Text>
        </View>
        <View style={styles.openWrap}>
          <Text style={{ fontSize: 46 }}>🧾</Text>
          <Text style={styles.openT}>{tt('cndPos', 'ເປີດ ກະ ເພື່ອ ເລີ່ມ ຂາຍ')}</Text>
          <Text style={styles.openL}>{tt('cndPos', 'ເງິນ ຕັ້ງ ຕົ້ນ ໃນ ລິ້ນຊັກ (ກີບ)')}</Text>
          <TextInput style={styles.openIn} value={groupThousands(openingCash)} onChangeText={(t) => setOpeningCash(t.replace(/\D/g, ''))} keyboardType="number-pad" />
          <Pressable style={[styles.openBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={doOpenShift}><Text style={styles.openBtnTx}>{busy ? tt('cndPos', 'ກຳລັງ...') : tt('cndPos', 'ເປີດ ກະ')}</Text></Pressable>
        </View>
        {zReport && <ZReport s={zReport} onClose={() => setZReport(null)} />}
      </View>
    );
  }

  const Catalog = (
    <View style={[styles.pane, wide && { flex: 1.2 }]}>
      <TextInput style={styles.search} value={q} onChangeText={setQ} onSubmitEditing={onSearchSubmit} placeholder={tt('cndPos', '🔍 ຄົ້ນ / ສະແກນ ບາໂຄດ...')} placeholderTextColor={cnd.ink3} autoFocus={wide} returnKeyType="search" />
      <ScrollView contentContainerStyle={styles.plist}>
        {shown.map((p) => (
          <Pressable key={p.id} style={styles.pitem} onPress={() => add(p)}>
            <View style={{ flex: 1 }}><Text style={styles.pname} numberOfLines={1}>{p.name}</Text><Text style={styles.pmeta}>{kipT(p.price)}/{unitT(p.unit)}{p.sku ? ` · ${p.sku}` : ''}</Text></View>
            <Text style={styles.padd}>＋</Text>
          </Pressable>
        ))}
        {shown.length === 0 && <Text style={styles.none}>{tt('cndPos', 'ບໍ່ ພົບ — ໃສ່ ຂໍ້ມູນ ສິນຄ້າ ໃນ admin ກ່ອນ')}</Text>}
      </ScrollView>
    </View>
  );

  const Cart = (
    <View style={[styles.pane, styles.cartPane, wide && { flex: 1 }]}>
      <ScrollView contentContainerStyle={{ gap: 8 }} style={{ flex: 1 }}>
        {lines.length === 0 ? <Text style={styles.emptyCart}>{tt('cndPos', 'ແຕະ ສິນຄ້າ ເພື່ອ ເພີ່ມ')}</Text> : lines.map((l) => (
          <View key={l.productId} style={styles.line}>
            <View style={{ flex: 1 }}><Text style={styles.lname} numberOfLines={1}>{l.name}</Text><Text style={styles.lprice}>{kip(l.price)} × {l.qty} = {kip(l.price * l.qty)}</Text></View>
            <View style={styles.qty}>
              <Pressable style={styles.qBtn} onPress={() => setQty(l.productId, l.qty - 1)}><Text style={styles.qBtnTx}>−</Text></Pressable>
              <Text style={styles.qN}>{l.qty}</Text>
              <Pressable style={styles.qBtn} onPress={() => setQty(l.productId, l.qty + 1)}><Text style={styles.qBtnTx}>＋</Text></Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.pay}>
        <View style={styles.discRow}><Text style={styles.discL}>{tt('cndPos', 'ຫຼຸດ (ກີບ)')}</Text><TextInput style={styles.discIn} value={groupThousands(discount)} onChangeText={(t) => setDiscount(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={cnd.ink3} /></View>
        {taxAmount > 0 && <View style={styles.discRow}><Text style={styles.discL}>VAT {taxPct}%</Text><Text style={styles.discL}>{kipT(taxAmount)}</Text></View>}
        <View style={styles.trow}><Text style={styles.tL}>{tt('cndPos', 'ລວມ')}</Text><Text style={styles.tV}>{kip(total)} {tt('cndPos', 'ກີບ')}</Text></View>
        <View style={styles.payChips}>
          <Pressable style={[styles.payChip, pay === 'cash' && styles.payOn]} onPress={() => setPay('cash')}><Text style={[styles.payTx, pay === 'cash' && styles.payTxOn]}>{tt('cndPos', '💵 ເງິນ ສົດ')}</Text></Pressable>
          <Pressable style={[styles.payChip, pay === 'qr' && styles.payOn]} onPress={() => setPay('qr')}><Text style={[styles.payTx, pay === 'qr' && styles.payTxOn]}>{tt('cndPos', '📱 QR')}</Text></Pressable>
        </View>
        {pay === 'cash' && (
          <>
            <TextInput style={styles.tendIn} value={groupThousands(tendered)} onChangeText={(t) => setTendered(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={tt('cndPos', 'ຮັບ ເງິນ ມາ (ກີບ)')} placeholderTextColor={cnd.ink3} />
            <View style={styles.quicks}>{[total, 50000, 100000, 200000, 500000].map((a, i) => <Pressable key={i} style={styles.quick} onPress={() => setTendered(String(a))}><Text style={styles.quickTx}>{i === 0 ? tt('cndPos', 'ພໍ ດີ') : kip(a)}</Text></Pressable>)}</View>
            {tend > 0 && <View style={styles.trow}><Text style={styles.tL}>{tt('cndPos', 'ເງິນ ທອນ')}</Text><Text style={[styles.tV, { color: cnd.green }]}>{kip(change)} {tt('cndPos', 'ກີບ')}</Text></View>}
          </>
        )}
        {pay === 'qr' && <Text style={styles.qrNote}>{tt('cndPos', 'ໃຫ້ ລູກຄ້າ ສະແກນ QR ຄົງທີ່ ຂອງ ຮ້ານ → ຢືນຢັນ ຮັບ ເງິນ ແລ້ວ ກົດ ຂາຍ')}</Text>}
        <Pressable style={[styles.charge, !canCharge && { opacity: 0.4 }]} disabled={!canCharge || busy} onPress={charge}><Text style={styles.chargeTx}>{busy ? tt('cndPos', 'ກຳລັງ...') : `${tt('cndPos', '✓ ຂາຍ')} · ${kip(total)} ${tt('cndPos', 'ກີບ')}`}</Text></Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => router.push('/cnd/admin' as any)}><Text style={styles.back}>‹ Admin</Text></Pressable>
        <Text style={styles.title}>🏬 CND POS</Text>
        {activeBranch && <Pressable style={styles.branchChip} onPress={cycleBranch}><Text style={styles.branchTx} numberOfLines={1}>📍 {activeBranch.name}{branches.length > 1 ? ' ⇄' : ''}</Text></Pressable>}
        <Pressable style={styles.closeShiftBtn} onPress={() => setClosing(true)}><Text style={styles.closeShiftTx}>{tt('cndPos', 'ປິດ ກະ')}</Text></Pressable>
      </View>
      <View style={[styles.main, wide && { flexDirection: 'row' }]}>{Catalog}{Cart}</View>

      {/* close-shift: count cash → Z report */}
      {closing && (() => {
        const rep = posReport(orders.filter((o) => o.shiftId === shift?.id));
        const exp = (shift?.openingCash ?? 0) + rep.cashSales;
        return (
          <View style={styles.rBack}>
            <View style={styles.closeCard}>
              <Text style={styles.closeH}>{tt('cndPos', 'ປິດ ກະ — ນັບ ເງິນ')}</Text>
              <View style={styles.trow}><Text style={styles.tL}>{tt('cndPos', 'ຂາຍ POS')}</Text><Text style={styles.tV2}>{rep.salesCount} {tt('cndPos', 'ບິນ')} · {kip(rep.salesTotal)}</Text></View>
              <View style={styles.trow}><Text style={styles.tL}>{tt('cndPos', 'ຄາດ ຫວັງ ເງິນ ສົດ')}</Text><Text style={styles.tV2}>{kip(exp)} {tt('cndPos', 'ກີບ')}</Text></View>
              <Text style={styles.openL}>{tt('cndPos', 'ນັບ ເງິນ ຈິງ ໃນ ລິ້ນຊັກ (ກີບ)')}</Text>
              <TextInput style={styles.openIn} value={groupThousands(counted)} onChangeText={(t) => setCounted(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={cnd.ink3} autoFocus />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Pressable style={[styles.rBtn]} onPress={() => setClosing(false)}><Text style={styles.rNewTx}>{tt('cndPos', 'ຍົກເລີກ')}</Text></Pressable>
                <Pressable style={[styles.rBtn, styles.rPrint, busy && { opacity: 0.5 }]} disabled={busy} onPress={doCloseShift}><Text style={styles.rPrintTx}>{tt('cndPos', 'ປິດ ກະ + ອອກ report')}</Text></Pressable>
              </View>
            </View>
          </View>
        );
      })()}
      {zReport && <ZReport s={zReport} onClose={() => setZReport(null)} />}

      {receipt && (
        <View style={styles.rBack}>
          <View style={styles.rSheet} nativeID="cnd-receipt">
            <Text style={styles.rBrand}>CND</Text>
            <Text style={styles.rSub}>{tt('cndPos', 'ໃບ ຮັບ ເງິນ')} · {receipt.number}</Text>
            <View style={styles.rLine} />
            {receipt.lines.map((l) => (
              <View key={l.productId} style={styles.rItem}><Text style={styles.rItemN} numberOfLines={1}>{l.name} ×{l.qty}</Text><Text style={styles.rItemV}>{kip(l.price * l.qty)}</Text></View>
            ))}
            <View style={styles.rLine} />
            <View style={styles.rItem}><Text style={styles.rItemN}>{tt('cndPos', 'ລວມ ຍ່ອຍ')}</Text><Text style={styles.rItemV}>{kip(receipt.subtotal)}</Text></View>
            {receipt.discount > 0 && <View style={styles.rItem}><Text style={styles.rItemN}>{tt('cndPos', 'ຫຼຸດ')}</Text><Text style={styles.rItemV}>-{kip(receipt.discount)}</Text></View>}
            {receipt.taxAmount > 0 && <View style={styles.rItem}><Text style={styles.rItemN}>VAT</Text><Text style={styles.rItemV}>{kip(receipt.taxAmount)}</Text></View>}
            <View style={styles.rItem}><Text style={styles.rTotN}>{tt('cndPos', 'ລວມ')}</Text><Text style={styles.rTotV}>{kip(receipt.total)} {tt('cndPos', 'ກີບ')}</Text></View>
            <Text style={styles.rPay}>{receipt.pay === 'cash' ? `${tt('cndPos', 'ເງິນ ສົດ · ທອນ')} ${kip(receipt.change)}` : tt('cndPos', 'ຈ່າຍ ຜ່ານ QR')}</Text>
            <Text style={styles.rThanks}>{tt('cndPos', 'ຂອບ ໃຈ 🙏')}</Text>
            <View style={styles.rBtns}>
              {Platform.OS === 'web' && <Pressable style={[styles.rBtn, styles.rPrint]} onPress={() => { try { (window as any).print(); } catch {} }}><Text style={styles.rPrintTx}>{tt('cndPos', '🖨️ ພິມ')}</Text></Pressable>}
              <Pressable style={styles.rBtn} onPress={() => setReceipt(null)}><Text style={styles.rNewTx}>{tt('cndPos', 'ຂາຍ ໃໝ່')}</Text></Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function ZRow({ l, v, c }: { l: string; v: string; c?: string }) {
  return <View style={styles.rItem}><Text style={styles.rItemN}>{ttStatic('cndPos', l)}</Text><Text style={[styles.rItemV, c ? { color: c } : null]}>{v}</Text></View>;
}
function ZReport({ s, onClose }: { s: CndShift; onClose: () => void }) {
  const tt = useTT();
  const over = s.overShort ?? 0;
  return (
    <View style={styles.rBack}>
      <View style={styles.rSheet} nativeID="cnd-zreport">
        <Text style={styles.rBrand}>CND</Text>
        <Text style={styles.rSub}>{tt('cndPos', 'ລາຍງານ ປິດ ກະ (Z)')}</Text>
        <View style={styles.rLine} />
        <ZRow l="ແຄັດເຊຍ" v={s.cashier ?? '—'} />
        <ZRow l="ຂາຍ" v={`${s.salesCount ?? 0} ${ttStatic('cndCommon', 'ບິນ')}`} />
        <ZRow l="ຍອດ ຂາຍ" v={`${kipT(s.salesTotal ?? 0)}`} />
        <ZRow l="💵 ເງິນ ສົດ" v={kip(s.cashSales ?? 0)} />
        <ZRow l="📱 QR" v={kip(s.qrSales ?? 0)} />
        <ZRow l="ຫຼຸດ ລວມ" v={kip(s.discountTotal ?? 0)} />
        <View style={styles.rLine} />
        <ZRow l="ເງິນ ຕັ້ງ ຕົ້ນ" v={kip(s.openingCash)} />
        <ZRow l="ຄາດ ຫວັງ ເງິນ ສົດ" v={kip(s.expectedCash ?? 0)} />
        <ZRow l="ນັບ ໄດ້ ຈິງ" v={kip(s.closingCashCounted ?? 0)} />
        <View style={styles.rItem}><Text style={styles.rTotN}>{over === 0 ? tt('cndPos', '✓ ພໍ ດີ') : over > 0 ? tt('cndPos', 'ເກີນ') : tt('cndPos', 'ຂາດ')}</Text><Text style={[styles.rTotV, { color: over < 0 ? cnd.error : cnd.green }]}>{over > 0 ? '+' : ''}{kip(over)} {tt('cndPos', 'ກີບ')}</Text></View>
        <View style={styles.rBtns}>
          {Platform.OS === 'web' && <Pressable style={[styles.rBtn, styles.rPrint]} onPress={() => { try { (window as any).print(); } catch {} }}><Text style={styles.rPrintTx}>{tt('cndPos', '🖨️ ພິມ')}</Text></Pressable>}
          <Pressable style={styles.rBtn} onPress={onClose}><Text style={styles.rNewTx}>{tt('cndPos', 'ປິດ')}</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.bg },
  openWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
  openT: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  openL: { fontSize: 12.5, fontWeight: '700', color: cnd.ink2, marginTop: 6 },
  openIn: { borderWidth: 1.5, borderColor: cnd.brand, borderRadius: 10, padding: 13, fontSize: 20, fontWeight: '900', color: cnd.brandDark, textAlign: 'center', minWidth: 200, backgroundColor: cnd.surface },
  openBtn: { backgroundColor: cnd.brand, borderRadius: 11, paddingVertical: 14, paddingHorizontal: 40, marginTop: 8 },
  openBtnTx: { color: cnd.white, fontWeight: '900', fontSize: 15 },
  closeShiftBtn: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  closeShiftTx: { color: cnd.white, fontWeight: '800', fontSize: 12.5 },
  branchChip: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, maxWidth: 160 },
  branchTx: { color: '#ffd9c4', fontWeight: '800', fontSize: 12 },
  closeCard: { width: '100%', maxWidth: 360, backgroundColor: cnd.surface, borderRadius: 14, padding: 18, gap: 6 },
  closeH: { fontSize: 15, fontWeight: '900', color: cnd.ink, marginBottom: 6 },
  tV2: { fontSize: 13, fontWeight: '800', color: cnd.ink },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: cnd.steel },
  back: { color: cnd.white, fontSize: 14, fontWeight: '700' },
  title: { flex: 1, color: cnd.white, fontSize: 15, fontWeight: '900', textAlign: 'center' },
  cashier: { color: '#ffd9c4', fontSize: 12, fontWeight: '700' },
  main: { flex: 1, gap: 10, padding: 10 },
  pane: { flex: 1, gap: 8 },
  cartPane: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 10 },
  search: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line2, borderRadius: 10, padding: 12, fontSize: 15, color: cnd.ink },
  plist: { gap: 6 },
  pitem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 10, padding: 11 },
  pname: { fontSize: 13, fontWeight: '700', color: cnd.ink },
  pmeta: { fontSize: 12, color: cnd.ink3, marginTop: 1 },
  padd: { fontSize: 22, fontWeight: '900', color: cnd.brand, width: 28, textAlign: 'center' },
  none: { fontSize: 13, color: cnd.ink3, textAlign: 'center', paddingVertical: 24 },
  emptyCart: { fontSize: 13, color: cnd.ink3, textAlign: 'center', paddingVertical: 30 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: cnd.line, paddingBottom: 8 },
  lname: { fontSize: 13, fontWeight: '700', color: cnd.ink },
  lprice: { fontSize: 12, color: cnd.ink3, marginTop: 1 },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: cnd.surface2, borderRadius: 8, paddingHorizontal: 4 },
  qBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  qBtnTx: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  qN: { fontSize: 14, fontWeight: '800', minWidth: 20, textAlign: 'center' },
  pay: { borderTopWidth: 1, borderTopColor: cnd.line, paddingTop: 10, gap: 8 },
  discRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discL: { flex: 1, fontSize: 13, fontWeight: '700', color: cnd.ink2 },
  discIn: { borderWidth: 1, borderColor: cnd.line, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, fontSize: 14, fontWeight: '700', color: cnd.ink, minWidth: 110, textAlign: 'right' },
  trow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tL: { fontSize: 15, fontWeight: '800', color: cnd.ink },
  tV: { fontSize: 15, fontWeight: '900', color: cnd.brandDark },
  payChips: { flexDirection: 'row', gap: 8 },
  payChip: { flex: 1, borderWidth: 1, borderColor: cnd.line, borderRadius: 9, paddingVertical: 10, alignItems: 'center', backgroundColor: cnd.surface },
  payOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  payTx: { fontSize: 13, fontWeight: '800', color: cnd.ink2 },
  payTxOn: { color: cnd.white },
  tendIn: { borderWidth: 1, borderColor: cnd.line2, borderRadius: 9, padding: 11, fontSize: 15, fontWeight: '700', color: cnd.ink, backgroundColor: cnd.surface },
  quicks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quick: { borderWidth: 1, borderColor: cnd.line, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 11, backgroundColor: cnd.surface2 },
  quickTx: { fontSize: 12, fontWeight: '800', color: cnd.ink2 },
  qrNote: { fontSize: 12, color: cnd.ink2, backgroundColor: cnd.blueSoft, borderRadius: 8, padding: 9 },
  charge: { backgroundColor: cnd.brand, borderRadius: 11, paddingVertical: 15, alignItems: 'center', marginTop: 2 },
  chargeTx: { color: cnd.white, fontWeight: '900', fontSize: 15 },
  // receipt
  rBack: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  rSheet: { width: '100%', maxWidth: 320, backgroundColor: cnd.white, borderRadius: 12, padding: 20 },
  rBrand: { fontSize: 24, fontWeight: '900', color: cnd.ink, textAlign: 'center', letterSpacing: 2 },
  rSub: { fontSize: 12, color: cnd.ink3, textAlign: 'center', marginTop: 2 },
  rLine: { height: 1, backgroundColor: cnd.line2, marginVertical: 10, borderStyle: 'dashed', borderTopWidth: 1, borderColor: cnd.line2 },
  rItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  rItemN: { fontSize: 12.5, color: cnd.ink, flex: 1 },
  rItemV: { fontSize: 12.5, color: cnd.ink, fontWeight: '700' },
  rTotN: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  rTotV: { fontSize: 15, fontWeight: '900', color: cnd.brandDark },
  rPay: { fontSize: 12, color: cnd.ink2, textAlign: 'center', marginTop: 8 },
  rThanks: { fontSize: 13, color: cnd.ink2, textAlign: 'center', marginTop: 6 },
  rBtns: { flexDirection: 'row', gap: 8, marginTop: 16 },
  rBtn: { flex: 1, borderRadius: 9, paddingVertical: 11, alignItems: 'center', backgroundColor: cnd.surface2, borderWidth: 1, borderColor: cnd.line },
  rPrint: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  rPrintTx: { color: cnd.white, fontWeight: '800', fontSize: 13 },
  rNewTx: { color: cnd.brand, fontWeight: '800', fontSize: 13 },
});
