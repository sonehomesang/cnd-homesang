import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { getProduct, type Product, saleInfo } from '@/lib/shop';
import { watchAppSettings } from '@/lib/appSettings';
import { watchMyOrders } from '@/lib/orders';
import { customerBalance, watchMySpends, watchMyTopups, type WalletSpend, type WalletTopup } from '@/lib/customerWallet';
import {
  BNPL_MODE_LABEL, type BnplConfig, type BnplMode, DEFAULT_BNPL,
  bnplEligibility, computeQuote, startBnpl,
} from '@/lib/bnpl';

export default function BnplPlanScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { fbUser, profile } = useAuth();
  const tt = useTT();

  const [product, setProduct] = useState<Product | null>(null);
  const [cfg, setCfg] = useState<BnplConfig>(DEFAULT_BNPL);
  const [topups, setTopups] = useState<WalletTopup[]>([]);
  const [spends, setSpends] = useState<WalletSpend[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [mode, setMode] = useState<BnplMode | null>(null);
  const [tenor, setTenor] = useState<number | null>(null);
  const [autopay, setAutopay] = useState(true);
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
  const [address, setAddress] = useState(profile?.address ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (id) getProduct(String(id)).then(setProduct).catch(() => setProduct(null)); }, [id]);
  useEffect(() => watchAppSettings((s) => setCfg(s.bnpl)), []);
  useEffect(() => {
    if (!fbUser) return;
    const a = watchMyTopups(fbUser.uid, setTopups);
    const b = watchMySpends(fbUser.uid, setSpends);
    const c = watchMyOrders(fbUser.uid, setOrders);
    return () => { a(); b(); c(); };
  }, [fbUser]);

  const plans = useMemo(() => cfg.plans.filter((p) => p.enabled !== false), [cfg.plans]);
  useEffect(() => { if (!mode && cfg.modes.length) setMode(cfg.modes.includes(cfg.defaultMode) ? cfg.defaultMode : cfg.modes[0]); }, [cfg, mode]);
  useEffect(() => { if (tenor == null && plans.length) setTenor(plans[0].tenor); }, [plans, tenor]);

  const cwBalance = customerBalance(topups, spends);
  // effective price — honours an active flash-sale (matches the server)
  const price = product ? Math.round(saleInfo(product).price) : 0;
  const plan = plans.find((p) => p.tenor === tenor) ?? null;
  const quote = product && plan && mode ? computeQuote(price, plan, cfg, mode) : null;

  // eligibility preview (server re-checks authoritatively on confirm)
  const summary = useMemo(() => {
    let completed = 0, outstanding = 0, hasOverdue = false;
    for (const o of orders) {
      if (o.status === 'completed' || o.status === 'delivered') completed++;
      if (o.isBnpl && o.bnpl?.status === 'active') outstanding += o.bnplOutstanding ?? 0;
      if (o.isBnpl && o.bnpl?.status === 'overdue') hasOverdue = true;
    }
    return { completed, outstanding, hasOverdue };
  }, [orders]);
  const acctCreated = fbUser?.metadata?.creationTime ? Date.parse(fbUser.metadata.creationTime) : undefined;
  const elig = mode
    ? bnplEligibility(cfg, { accountCreatedAt: acctCreated, completedOrders: summary.completed, outstandingKip: summary.outstanding, hasOverdue: summary.hasOverdue, orderAmount: price, mode }, Date.now())
    : { ok: false, reasons: [] as string[] };

  const insufficientDown = !!quote && cwBalance < quote.down;

  // idempotency key — stable for a given selection, so a double-tap or retry of
  // the SAME purchase won't create two orders / two down-payment debits, but
  // changing the plan/mode/qty yields a fresh key (a genuinely different order).
  const requestId = useMemo(
    () => `${fbUser?.uid ?? 'x'}-${product?.id ?? 'p'}-${mode}-${tenor}-${Math.floor(Date.now() / 1000)}`,
    [fbUser?.uid, product?.id, mode, tenor], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const confirm = async () => {
    if (!fbUser || !product || !plan || !mode) return;
    if (deliveryMethod === 'delivery' && !address.trim()) { setErr(tt('bnpl', 'ກະລຸນາ ໃສ່ ທີ່ຢູ່ ສົ່ງ')); return; }
    if (!elig.ok) { setErr(elig.reasons.join(' · ')); return; }
    if (insufficientDown) { setErr(tt('bnpl', 'ຍອດ ກະເປົາ ບໍ່ ພຽງພໍ ສຳລັບ ດາວນ໌ — ໄປ ເຕີມ ເງິນ ກ່ອນ')); return; }
    setSubmitting(true); setErr('');
    try {
      const { orderId } = await startBnpl({
        productId: product.id, qty: 1, tenor: plan.tenor, mode, autopay,
        deliveryMethod, deliveryAddress: deliveryMethod === 'delivery' ? address.trim() : undefined,
        customerPhone: (profile as any)?.phone || undefined,
        requestId,
      });
      router.replace(`/orders/${orderId}` as any);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setSubmitting(false);
    }
  };

  if (!cfg.enabled) {
    return (
      <View style={styles.center}><Text style={styles.muted}>{tt('bnpl', 'ຜ່ອນ ສິນຄ້າ ຍັງ ບໍ່ ເປີດ ໃຫ້ ບໍລິການ')}</Text></View>
    );
  }
  if (!product) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('bnpl', 'ກຳລັງ ໂຫຼດ...')}</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 8, paddingBottom: 40 }}>
      <View style={styles.nav}><Pressable onPress={() => router.back()}><Text style={styles.back}>‹ {tt('bnpl', 'ກັບ')}</Text></Pressable><Text style={styles.navT}>{tt('bnpl', 'ຜ່ອນ ສິນຄ້າ')}</Text></View>

      {/* product summary */}
      <View style={styles.card}>
        <Text style={styles.pname}>{product.name}</Text>
        <Text style={styles.pprice}>{price.toLocaleString()} <Text style={styles.unit}>LAK</Text></Text>
      </View>

      {/* mode */}
      {cfg.modes.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cap}>{tt('bnpl', 'ຮູບແບບ ຜ່ອນ')}</Text>
          <View style={styles.segRow}>
            {cfg.modes.map((m) => (
              <Pressable key={m} style={[styles.seg, mode === m && styles.segOn]} onPress={() => setMode(m)}>
                <Text style={[styles.segTxt, mode === m && styles.segTxtOn]}>{tt('bnpl', BNPL_MODE_LABEL[m])}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>{mode === 'layaway'
            ? tt('bnpl', 'ຈ່າຍ ຄົບ ທຸກ ງວດ ກ່ອນ → ຈຶ່ງ ໄດ້ ຮັບ ສິນຄ້າ (ບໍ່ ຕ້ອງ ວາງ ດາວນ໌)')
            : tt('bnpl', 'ວາງ ດາວນ໌ → ຮັບ ສິນຄ້າ ເລີຍ → ຜ່ອນ ສ່ວນ ທີ່ ເຫຼືອ')}</Text>
        </View>
      )}

      {/* tenor plans */}
      <View style={styles.card}>
        <Text style={styles.cap}>{tt('bnpl', 'ໄລຍະ ຜ່ອນ')}</Text>
        {plans.map((pl) => {
          const q = mode ? computeQuote(price, pl, cfg, mode) : null;
          const on = tenor === pl.tenor;
          return (
            <Pressable key={pl.tenor} style={[styles.plan, on && styles.planOn]} onPress={() => setTenor(pl.tenor)}>
              <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.planTen}>{pl.tenor} {tt('bnpl', 'ງວດ')} {pl.feePct === 0 ? <Text style={styles.tag0}>{tt('bnpl', 'ດອກ 0%')}</Text> : null}</Text>
                <Text style={styles.planMeta}>{mode === 'bnpl' ? `${tt('bnpl', 'ດາວນ໌')} ${cfg.downPct}% · ` : ''}{tt('bnpl', 'ຄ່າ ບໍລິການ')} {cfg.feePayer === 'merchant' ? '0' : pl.feePct}%</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.permo}>{(q?.perMonth ?? 0).toLocaleString()}</Text>
                <Text style={styles.planMeta}>/{tt('bnpl', 'ເດືອນ')}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* breakdown */}
      {quote && (
        <View style={styles.card}>
          <Text style={styles.cap}>{tt('bnpl', 'ສະຫຼຸບ')} ({quote.tenor} {tt('bnpl', 'ງວດ')})</Text>
          <Row k={tt('bnpl', 'ລາຄາ ສິນຄ້າ')} v={quote.price} />
          {quote.down > 0 && <Row k={tt('bnpl', 'ດາວນ໌ ຈ່າຍ ດຽວນີ້')} v={quote.down} hi />}
          {quote.feeTotal > 0 && <Row k={tt('bnpl', 'ຄ່າ ບໍລິການ ຜ່ອນ')} v={quote.feeTotal} />}
          <Row k={`${tt('bnpl', 'ຜ່ອນ')} ${quote.tenor} ${tt('bnpl', 'ງວດ')}`} v={quote.financed} />
          <Row k={tt('bnpl', 'ລວມ ທັງ ໝົດ')} v={quote.total} bold />
        </View>
      )}

      {/* autopay + wallet */}
      <View style={styles.card}>
        <Pressable style={styles.toggleRow} onPress={() => setAutopay((v) => !v)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.tglT}>🔁 {tt('bnpl', 'ຫັກ ອັຕໂນມັຕ ຈາກ ກະເປົາ')}</Text>
            <Text style={styles.tglS}>{tt('bnpl', 'ຕັດ ອັຕໂນມັຕ ທຸກ ວັນ ຄົບ ງວດ (ຖ້າ ຍອດ ພຽງພໍ)')}</Text>
          </View>
          <View style={[styles.sw, autopay ? styles.swOn : styles.swOff]}><View style={[styles.swDot, autopay ? styles.swDotOn : styles.swDotOff]} /></View>
        </Pressable>
        <Text style={[styles.wallet, insufficientDown && styles.walletBad]}>
          👛 {tt('bnpl', 'ຍອດ ກະເປົາ')}: {cwBalance.toLocaleString()} {tt('bnpl', 'ກີບ')}
          {insufficientDown ? ` · ${tt('bnpl', 'ບໍ່ ພໍ ສຳລັບ ດາວນ໌')}` : ''}
        </Text>
        {insufficientDown && (
          <Pressable onPress={() => router.push('/wallet' as any)}><Text style={styles.topupLink}>⚠️ {tt('bnpl', 'ແຕະ ເພື່ອ ເຕີມ ເງິນ')}</Text></Pressable>
        )}
      </View>

      {/* delivery */}
      <View style={styles.card}>
        <Text style={styles.cap}>{tt('bnpl', 'ການ ຮັບ ສິນຄ້າ')}</Text>
        <View style={styles.segRow}>
          {(['delivery', 'pickup'] as const).map((m) => (
            <Pressable key={m} style={[styles.seg, deliveryMethod === m && styles.segOn]} onPress={() => setDeliveryMethod(m)}>
              <Text style={[styles.segTxt, deliveryMethod === m && styles.segTxtOn]}>{m === 'delivery' ? tt('bnpl', '🚚 ສົ່ງ ເຖິງ ບ້ານ') : tt('bnpl', '🏬 ມາ ຮັບ ເອງ')}</Text>
            </Pressable>
          ))}
        </View>
        {deliveryMethod === 'delivery' && (
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder={tt('bnpl', 'ທີ່ຢູ່ ສົ່ງ')} placeholderTextColor="#9ca3af" multiline />
        )}
      </View>

      {/* eligibility / errors */}
      {!elig.ok && elig.reasons.length > 0 && (
        <View style={styles.warnBox}>
          <Text style={styles.warnT}>{tt('bnpl', 'ຍັງ ຜ່ອນ ບໍ່ ໄດ້:')}</Text>
          {elig.reasons.map((r, i) => <Text key={i} style={styles.warnR}>• {r}</Text>)}
        </View>
      )}
      {!!err && <Text style={styles.err}>{err}</Text>}

      <Pressable style={[styles.cta, (submitting || !elig.ok || insufficientDown) && styles.ctaOff]} disabled={submitting || !elig.ok || insufficientDown} onPress={confirm}>
        <Text style={styles.ctaTxt}>
          {submitting ? tt('bnpl', 'ກຳລັງ ດຳເນີນ...')
            : quote && quote.down > 0 ? `${tt('bnpl', 'ຢືນຢັນ — ວາງ ດາວນ໌')} ${quote.down.toLocaleString()} → ${tt('bnpl', 'ຮັບ ຂອງ')}`
            : tt('bnpl', 'ຢືນຢັນ — ເລີ່ມ ຜ່ອນ')}
        </Text>
      </Pressable>
      <Text style={styles.terms}>{tt('bnpl', 'ໂດຍ ການ ຢືນຢັນ ຖື ວ່າ ຍອມຮັບ ຂໍ້ຕົກລົງ ຜ່ອນ ຊຳລະ')}</Text>
    </ScrollView>
  );
}

function Row({ k, v, hi, bold }: { k: string; v: number; hi?: boolean; bold?: boolean }) {
  return (
    <View style={[styles.row, bold && styles.rowB]}>
      <Text style={[styles.rowK, bold && styles.rowKB]}>{k}</Text>
      <Text style={[styles.rowV, hi && styles.rowVhi, bold && styles.rowKB]}>{v.toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef1f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: '#6b7280', fontSize: 14 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6 },
  back: { color: '#0066CC', fontSize: 15, fontWeight: '800' },
  navT: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#eef0f3' },
  pname: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  pprice: { fontSize: 15, fontWeight: '900', color: '#0066CC', marginTop: 4 },
  unit: { fontSize: 12, color: '#6b7280', fontWeight: '400' },
  cap: { fontSize: 12, fontWeight: '800', color: '#0066CC', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.3 },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 8, lineHeight: 17 },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  segOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  segTxt: { fontSize: 12, fontWeight: '800', color: '#4b5563' },
  segTxtOn: { color: '#fff' },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 8 },
  planOn: { borderColor: '#0066CC', backgroundColor: '#f5f9ff' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: '#0066CC' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0066CC' },
  planTen: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  tag0: { fontSize: 12, fontWeight: '800', color: '#7c3aed' },
  planMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  permo: { fontSize: 15, fontWeight: '900', color: '#0066CC' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  rowB: { borderTopWidth: 1, borderTopColor: '#e5e7eb', borderStyle: 'dashed', marginTop: 4, paddingTop: 9 },
  rowK: { fontSize: 13, color: '#374151' },
  rowKB: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  rowV: { fontSize: 13, color: '#111', fontWeight: '600' },
  rowVhi: { color: '#0066CC', fontWeight: '800' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tglT: { fontSize: 13, fontWeight: '800', color: '#166534' },
  tglS: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  sw: { width: 44, height: 26, borderRadius: 13, padding: 3 },
  swOn: { backgroundColor: '#22c55e', alignItems: 'flex-end' },
  swOff: { backgroundColor: '#cbd5e1', alignItems: 'flex-start' },
  swDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  swDotOn: {}, swDotOff: {},
  wallet: { fontSize: 12.5, fontWeight: '700', color: '#0f172a', marginTop: 12 },
  walletBad: { color: '#c0392b' },
  topupLink: { fontSize: 12.5, fontWeight: '800', color: '#c0392b', marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 10, fontSize: 13, marginTop: 8, minHeight: 44, color: '#111' },
  warnBox: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 12, padding: 12, marginBottom: 10 },
  warnT: { fontSize: 12.5, fontWeight: '800', color: '#9a3412', marginBottom: 4 },
  warnR: { fontSize: 12, color: '#b45309', lineHeight: 18 },
  err: { color: '#dc2626', fontSize: 12.5, fontWeight: '700', marginBottom: 10, paddingHorizontal: 4 },
  cta: { backgroundColor: '#f97316', borderRadius: 13, paddingVertical: 15, alignItems: 'center' },
  ctaOff: { backgroundColor: '#fdba74' },
  ctaTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  terms: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 8 },
});
