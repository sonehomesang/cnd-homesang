import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type Order, watchShopOrders } from '@/lib/orders';
import { useTT } from '@/lib/i18n';

type Period = 'today' | 'month' | 'all';

/**
 * Shop-owner income dashboard. Reads the SAME `watchShopOrders` stream the order
 * queue uses (single source → figures reconcile), and derives net-after-
 * commission, pending settlement, and COD-in-transit. Every figure and order row
 * is tappable to its detail, per the drill-down requirement.
 */
export default function ShopIncomeDashboard({ shopId }: { shopId: string }) {
  const tt = useTT();
  const [orders, setOrders] = useState<Order[]>([]);
  const [period, setPeriod] = useState<Period>('month');

  useEffect(() => (shopId ? watchShopOrders(shopId, setOrders) : undefined), [shopId]);

  const since = useMemo(() => {
    const d = new Date();
    if (period === 'today') { d.setHours(0, 0, 0, 0); return d.getTime(); }
    if (period === 'month') { d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); }
    return 0;
  }, [period]);

  const m = useMemo(() => {
    const inPeriod = orders.filter((o) => (o.createdAt ?? 0) >= since);
    // recognized = money actually due to the shop (non-cancelled AND paid/completed)
    const recognized = inPeriod.filter((o) => o.status !== 'cancelled' && (o.paymentVerified || o.status === 'completed'));
    const gross = recognized.reduce((s, o) => s + (o.grandTotal ?? 0), 0);
    const commission = recognized.reduce((s, o) => s + (o.commission ?? 0), 0);
    const net = gross - commission;
    // awaiting the shop's own slip verification (not yet recognized)
    const pendingVerify = inPeriod
      .filter((o) => o.status === 'pending' && o.paymentMethod === 'bank_transfer' && !o.paymentVerified)
      .reduce((s, o) => s + (o.grandTotal ?? 0), 0);
    // COD a rider is still out collecting for this shop
    const codInTransit = inPeriod
      .filter((o) => o.paymentMethod === 'cod' && (o.status === 'confirmed' || o.status === 'delivering'))
      .reduce((s, o) => s + (o.codAmount ?? o.grandTotal ?? 0), 0);
    // recent recognized orders, newest first, for the ledger
    const ledger = [...recognized].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 12);
    return { gross, commission, net, pendingVerify, codInTransit, ledger, count: recognized.length };
  }, [orders, since]);

  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <View>
      <Text style={styles.title}>💰 {tt('shopIncome', 'ລາຍຮັບ ຮ້ານ')}</Text>
      <Text style={styles.sub}>{tt('shopIncome', 'ຍອດ ສຸດທິ ຫຼັງ ຫັກ ຄ່າຄອມ · ກົດ ຕົວເລກ/ອໍເດີ ເພື່ອ ເບິ່ງ ລາຍລະອຽດ')}</Text>

      <View style={styles.seg}>
        {(['today', 'month', 'all'] as Period[]).map((p) => (
          <Pressable key={p} style={[styles.segBtn, period === p && styles.segOn]} onPress={() => setPeriod(p)}>
            <Text style={[styles.segText, period === p && styles.segTextOn]}>
              {tt('shopIncome', p === 'today' ? 'ມື້ນີ້' : p === 'month' ? 'ເດືອນນີ້' : 'ທັງໝົດ')}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.bigCard}>
        <Text style={styles.bigLabel}>💰 {tt('shopIncome', 'ຍອດຮັບ ສຸດທິ (ຫຼັງ ຫັກ ຄອມ)')}</Text>
        <Text style={styles.bigValue}>{fmt(m.net)} ₭</Text>
        <View style={styles.bigSub}>
          <Text style={styles.bigSubText}>{tt('shopIncome', 'ຂາຍ')} {fmt(m.gross)}</Text>
          <Text style={styles.bigSubText}>− {tt('shopIncome', 'ຄອມ')} {fmt(m.commission)}</Text>
          <Text style={styles.bigSubText}>· {m.count} {tt('shopIncome', 'ອໍເດີ')}</Text>
        </View>
      </View>

      <View style={styles.tiles}>
        <Tile label={tt('shopIncome', 'ຂາຍ ລວມ (gross)')} value={fmt(m.gross)} color="#16a34a" onPress={() => router.push('/orders' as any)} />
        <Tile label={tt('shopIncome', 'ຄ່າຄອມ HomeSang')} value={fmt(m.commission)} color="#f97316" />
        <Tile label={tt('shopIncome', 'ລໍ verify ໂອນ')} value={fmt(m.pendingVerify)} color="#0066CC" />
        <Tile label={tt('shopIncome', 'COD ກຳລັງເກັບ')} value={fmt(m.codInTransit)} color="#7c3aed" />
      </View>

      <Text style={styles.section}>{tt('shopIncome', 'ອໍເດີ ຫຼ້າສຸດ (net)')}</Text>
      {m.ledger.length === 0 ? (
        <Text style={styles.empty}>{tt('shopIncome', 'ຍັງ ບໍ່ ມີ ອໍເດີ ໃນ ຊ່ວງ ນີ້')}</Text>
      ) : (
        <View style={styles.card}>
          {m.ledger.map((o) => {
            const net = (o.grandTotal ?? 0) - (o.commission ?? 0);
            return (
              <Pressable key={o.id} style={styles.row} onPress={() => router.push(`/orders/${o.id}` as any)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rnum} numberOfLines={1}>#{o.orderNumber ?? o.id.slice(0, 6)} ›</Text>
                  <Text style={styles.rmeta} numberOfLines={1}>
                    {(o.grandTotal ?? 0).toLocaleString()} − {tt('shopIncome', 'ຄອມ')} {(o.commission ?? 0).toLocaleString()}
                  </Text>
                </View>
                <Text style={styles.rnet}>{fmt(net)} ₭</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={styles.note}>
        {tt('shopIncome', '🔮 ຕໍ່ໄປ: ຍອດ ສຸດທິ ຈະ ໂອນ ເຂົ້າ ບັນຊີ ທະນາຄານ ອັດຕະໂນມັດ. ຕົວເລກ ນີ້ ໃຊ້ ຂໍ້ມູນ ດຽວ ກັບ ຄິວ ອໍເດີ — ກົງ ກັນ ສະເໝີ.')}
      </Text>
    </View>
  );
}

function Tile({ label, value, color, onPress }: { label: string; value: string; color: string; onPress?: () => void }) {
  return (
    <Pressable style={[styles.tile, !!onPress && styles.tileClickable]} onPress={onPress} disabled={!onPress}>
      <Text style={styles.tileValue} numberOfLines={1}><Text style={{ color }}>{value}</Text></Text>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      {!!onPress && <Text style={styles.tileArrow}>↗</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12, lineHeight: 17 },
  seg: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  segOn: { backgroundColor: '#eef6ff', borderColor: '#0066CC' },
  segText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  segTextOn: { color: '#0066CC', fontWeight: '700' },
  bigCard: { backgroundColor: '#0066CC', borderRadius: 14, padding: 16, marginBottom: 10 },
  bigLabel: { color: '#dbeafe', fontSize: 12 },
  bigValue: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 2 },
  bigSub: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  bigSubText: { color: '#dbeafe', fontSize: 12 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, minWidth: 150, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 11, padding: 12 },
  tileClickable: { backgroundColor: '#fff', borderColor: '#dbe4f0' },
  tileValue: { fontSize: 15, fontWeight: '900' },
  tileLabel: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  tileArrow: { position: 'absolute', top: 8, right: 10, fontSize: 12, color: '#0066CC', opacity: 0.55, fontWeight: '700' },
  section: { fontSize: 13, fontWeight: '700', color: '#111', marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rnum: { fontSize: 13, color: '#0066CC', fontWeight: '700' },
  rmeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  rnet: { fontSize: 14, color: '#16a34a', fontWeight: '800' },
  empty: { fontSize: 13, color: '#9ca3af', paddingVertical: 16, textAlign: 'center' },
  note: { fontSize: 12, color: '#92400e', backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 9, padding: 10, marginTop: 14, lineHeight: 17 },
});
