import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { cnd, kip } from '@/lib/cnd/theme';
import { watchCndOrder, type CndOrder } from '@/lib/cnd/orders';
import { formatWarrantyDays } from '@/lib/ninesang';
import OrderChat from '@/components/cnd/OrderChat';
import { useTT } from '@/lib/i18n';

const STEPS = [
  { key: 'new', lao: 'ຮັບ ອໍເດີ' },
  { key: 'confirmed', lao: 'ຢືນຢັນ' },
  { key: 'packing', lao: 'ຈັດ ເຄື່ອງ' },
  { key: 'delivering', lao: 'ຈັດ ສົ່ງ' },
  { key: 'done', lao: 'ສຳ ເລັດ' },
];

export default function CndTrackOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fbUser, loading } = useAuth();
  const tt = useTT();
  const [o, setO] = useState<CndOrder | null | undefined>(undefined);

  useEffect(() => { if (id) return watchCndOrder(id, setO); }, [id]);

  useEffect(() => { if (!loading && !fbUser) router.replace('/cnd/my' as any); }, [loading, fbUser]);

  if (loading || o === undefined) return <Shell tt={tt}><View style={styles.center}><ActivityIndicator color={cnd.brand} /></View></Shell>;
  if (o === null) return <Shell tt={tt}><View style={styles.center}><Text style={styles.err}>{tt('cndOrder', 'ບໍ່ ພົບ ອໍເດີ ນີ້ (ຫຼື ບໍ່ ມີ ສິດ ເບິ່ງ)')}</Text></View></Shell>;

  const stepIdx = Math.max(0, STEPS.findIndex((s) => s.key === o.status));
  const cancelled = o.status === 'cancelled';
  const inst = o.install;

  return (
    <Shell tt={tt} num={o.number}>
      <ScrollView contentContainerStyle={{ padding: 10, gap: 10 }}>
        {/* progress */}
        <View style={styles.card}>
          {cancelled ? (
            <Text style={styles.cancelTx}>{tt('cndOrder', '✕ ອໍເດີ ຖືກ ຍົກ ເລີກ')}</Text>
          ) : (
            <View style={styles.steps}>
              {STEPS.map((s, i) => (
                <View key={s.key} style={styles.step}>
                  <View style={[styles.dot, i <= stepIdx && styles.dotOn]}><Text style={[styles.dotTx, i <= stepIdx && styles.dotTxOn]}>{i < stepIdx ? '✓' : i + 1}</Text></View>
                  <Text style={[styles.stepTx, i <= stepIdx && styles.stepTxOn]}>{tt('cndOrder', s.lao)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* items */}
        <View style={styles.card}>
          <Text style={styles.h}>{tt('cndOrder', 'ລາຍການ')}</Text>
          {o.items.map((it, i) => (
            <View key={i} style={styles.itRow}>
              <Text style={styles.itName} numberOfLines={1}>{it.name} × {it.qty}{it.install ? tt('cndOrder', '  · 🔧 ຕິດຕັ້ງ') : ''}</Text>
              <Text style={styles.itPrice}>{kip(it.price * it.qty)}</Text>
            </View>
          ))}
          <View style={styles.totRow}><Text style={styles.totL}>{tt('cndOrder', 'ລວມ')}</Text><Text style={styles.totV}>{kip(o.total)}</Text></View>
          <Text style={styles.pay}>{o.paymentStatus === 'paid' ? tt('cndOrder', '✓ ຊຳລະ ແລ້ວ') : tt('cndOrder', '● ຍັງ ບໍ່ ຊຳລະ')} · {o.paymentMethod === 'qr' ? tt('cndOrder', 'ໂອນ QR') : tt('cndOrder', 'ເກັບ ເງິນ ປາຍ ທາງ')}</Text>
        </View>

        {/* install / warranty */}
        {!!inst && (
          <View style={styles.card}>
            <Text style={styles.h}>{tt('cndOrder', '🔧 ບໍລິການ ຊ່າງ CND')}</Text>
            <Row l={tt('cndOrder', 'ຊ່າງ')} v={inst.techName || tt('cndOrder', 'ຮ້ານ ກຳລັງ ຈັດ ຊ່າງ')} />
            {!!inst.scheduledAt && <Row l={tt('cndOrder', 'ນັດ ຕິດຕັ້ງ')} v={fmt(inst.scheduledAt)} />}
            {inst.stage === 'done' && <Row l={tt('cndOrder', 'ສະຖານະ')} v={tt('cndOrder', 'ຕິດຕັ້ງ ສຳ ເລັດ')} />}
            {!!inst.warrantyUntil && <View style={styles.warBox}><Text style={styles.warTx}>🛡️ {tt('cndOrder', 'ຮັບປະກັນ ຮອດ')} {fmt(inst.warrantyUntil)}</Text></View>}
            {!inst.warrantyUntil && !!inst.warrantyDays && <Text style={styles.warHint}>{tt('cndOrder', 'ຮັບປະກັນ')} {formatWarrantyDays(inst.warrantyDays)} {tt('cndOrder', '(ເລີ່ມ ນັບ ຫຼັງ ຮັບ ງານ)')}</Text>}
          </View>
        )}

        {/* chat */}
        {!!id && <OrderChat orderId={id} as="customer" senderName={o.customerName} title={tt('cndOrder', '💬 ແຊັດ ກັບ ຮ້ານ / ຊ່າງ')} />}
      </ScrollView>
    </Shell>
  );
}

function Shell({ children, tt, num }: { children: React.ReactNode; tt: (m: string, s: string) => string; num?: string }) {
  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()}><Text style={styles.topBack}>‹</Text></Pressable>
        <Text style={styles.topT}>{num ? `#${num}` : tt('cndOrder', 'ຕິດຕາມ ອໍເດີ')}</Text>
        <View style={{ width: 24 }} />
      </View>
      {children}
    </View>
  );
}
function Row({ l, v }: { l: string; v: string }) {
  return <View style={styles.row}><Text style={styles.rowL}>{l}</Text><Text style={styles.rowV}>{v}</Text></View>;
}
function fmt(ms?: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.surface2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cnd.brand, paddingTop: 46, paddingBottom: 12, paddingHorizontal: 12 },
  topT: { color: '#fff', fontWeight: '900', fontSize: 15 },
  topBack: { color: '#fff', fontSize: 30, lineHeight: 30, fontWeight: '900', width: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  err: { color: cnd.ink3, fontSize: 14, textAlign: 'center' },
  card: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 12, gap: 6 },
  h: { fontSize: 15, fontWeight: '900', color: cnd.ink, marginBottom: 2 },
  steps: { flexDirection: 'row', justifyContent: 'space-between' },
  step: { alignItems: 'center', flex: 1, gap: 4 },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: cnd.surface2, borderWidth: 1, borderColor: cnd.line2, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: cnd.brand, borderColor: cnd.brand },
  dotTx: { fontSize: 12, fontWeight: '800', color: cnd.ink3 },
  dotTxOn: { color: '#fff' },
  stepTx: { fontSize: 12, color: cnd.ink3, textAlign: 'center' },
  stepTxOn: { color: cnd.ink, fontWeight: '700' },
  cancelTx: { color: '#B23A3A', fontWeight: '800', textAlign: 'center', paddingVertical: 6 },
  itRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  itName: { flex: 1, color: cnd.ink2, fontSize: 13 },
  itPrice: { color: cnd.ink, fontSize: 13, fontWeight: '600' },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: cnd.line, marginTop: 4, paddingTop: 6 },
  totL: { fontWeight: '900', color: cnd.ink },
  totV: { fontWeight: '900', color: cnd.brand, fontSize: 15 },
  pay: { fontSize: 12, color: cnd.ink3, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  rowL: { color: cnd.ink3, fontSize: 13 },
  rowV: { color: cnd.ink, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  warBox: { backgroundColor: cnd.blueSoft, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, marginTop: 4 },
  warTx: { color: cnd.blue, fontWeight: '800', fontSize: 13 },
  warHint: { color: cnd.ink3, fontSize: 12, marginTop: 2 },
});
