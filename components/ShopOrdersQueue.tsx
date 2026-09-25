import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  type Order,
  ORDER_STATUS_LABEL,
  setOrderTracking,
  updateOrderStatus,
  verifyOrderPayment,
  watchShopOrders,
} from '@/lib/orders';
import { useTT } from '@/lib/i18n';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#fef3c7', fg: '#92400e' },
  confirmed: { bg: '#dbeafe', fg: '#1e40af' },
  delivering: { bg: '#ede9fe', fg: '#5b21b6' },
  delivered: { bg: '#d1fae5', fg: '#065f46' },
  completed: { bg: '#d1fae5', fg: '#065f46' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b' },
};

type Tab = '' | 'pending' | 'confirmed' | 'delivering' | 'completed';

/** Seller order queue — the shop's own orders, scoped by shopId (Slice 5). */
export default function ShopOrdersQueue({ shopId }: { shopId: string }) {
  const tt = useTT();
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<Tab>('');
  const [track, setTrack] = useState<Record<string, string>>({});

  useEffect(() => (shopId ? watchShopOrders(shopId, setOrders) : undefined), [shopId]);

  const counts = useMemo(() => ({
    pending: orders.filter((o) => o.status === 'pending').length,
    confirmed: orders.filter((o) => o.status === 'confirmed').length,
    delivering: orders.filter((o) => o.status === 'delivering').length,
    completed: orders.filter((o) => o.status === 'completed').length,
  }), [orders]);
  const revenue = useMemo(() => orders.filter((o) => o.status === 'completed').reduce((s, o) => s + (o.grandTotal ?? 0), 0), [orders]);

  const TABS: { v: Tab; l: string }[] = [
    { v: '', l: `${tt('shopOrders', 'ທັງໝົດ')} (${orders.length})` },
    { v: 'pending', l: `${tt('shopOrders', 'ຮໍ')} (${counts.pending})` },
    { v: 'confirmed', l: `${tt('shopOrders', 'ຢືນຢັນ')} (${counts.confirmed})` },
    { v: 'delivering', l: `${tt('shopOrders', 'ກຳລັງສົ່ງ')} (${counts.delivering})` },
    { v: 'completed', l: `${tt('shopOrders', 'ສຳເລັດ')} (${counts.completed})` },
  ];
  const shown = tab ? orders.filter((o) => o.status === tab) : orders;

  return (
    <View>
      {/* dashboard */}
      <View style={styles.stats}>
        <Stat v={counts.pending} l={tt('shopOrders', 'ຮໍ')} c="#b45309" />
        <Stat v={counts.confirmed} l={tt('shopOrders', 'ຢືນຢັນ')} c="#1e40af" />
        <Stat v={counts.delivering} l={tt('shopOrders', 'ກຳລັງສົ່ງ')} c="#5b21b6" />
        <Stat v={counts.completed} l={tt('shopOrders', 'ສຳເລັດ')} c="#059669" />
      </View>
      <View style={styles.rev}>
        <Text style={styles.revL}>💰 {tt('shopOrders', 'ລາຍຮັບ (ອໍເດີ ສຳເລັດ)')}</Text>
        <Text style={styles.revV}>{revenue.toLocaleString()} ₭</Text>
      </View>

      {/* filter chips */}
      <View style={styles.filters}>
        {TABS.map((t) => (
          <Pressable key={t.v} style={[styles.chip, tab === t.v && styles.chipOn]} onPress={() => setTab(t.v)}>
            <Text style={[styles.chipText, tab === t.v && styles.chipTextOn]}>{t.l}</Text>
          </Pressable>
        ))}
      </View>

      {shown.length === 0 ? (
        <Text style={styles.empty}>{tt('shopOrders', 'ຍັງບໍ່ມີ ອໍເດີ')}</Text>
      ) : shown.map((o) => {
        const c = STATUS_COLORS[o.status] ?? STATUS_COLORS.completed;
        const showTrack = o.status === 'confirmed' || o.status === 'delivering' || o.status === 'delivered';
        return (
          <View key={o.id} style={styles.order}>
            <View style={styles.orow}>
              <Text style={styles.onum}>#{o.orderNumber}</Text>
              <View style={[styles.pill, { backgroundColor: c.bg }]}><Text style={[styles.pillT, { color: c.fg }]}>{tt('orderStatus', ORDER_STATUS_LABEL[o.status])}</Text></View>
            </View>
            <Text style={styles.total}>{(o.grandTotal ?? 0).toLocaleString()} ₭</Text>
            {o.commission ? <Text style={styles.commission}>💰 {tt('shopOrders', 'ຄອມ')} HomeSang {o.commission.toLocaleString()} {tt('common', 'ກີບ')}</Text> : null}
            <Text style={styles.meta}>
              {o.paymentMethod === 'bank_transfer' ? `🏦 ${tt('shopOrders', 'ໂອນ')}` : `💵 ${tt('shopOrders', 'ປາຍທາງ')}`}
              {o.paymentVerified ? ` · ✅ ${tt('shopOrders', 'ຈ່າຍແລ້ວ')}` : ` · ⏳ ${tt('shopOrders', 'ລໍກວດ')}`}
              {o.logisticsProviderName ? ` · 🚚 ${o.logisticsProviderName}` : ''}
            </Text>
            {o.deliveryAddress ? <Text style={styles.addr}>📍 {o.deliveryAddress}</Text> : null}
            {o.codAmount ? <Text style={styles.cod}>💵 {tt('shopOrders', 'ເກັບ COD')} {o.codAmount.toLocaleString()} ₭</Text> : null}
            {o.slipUrl ? <Image source={{ uri: o.slipUrl }} style={styles.slip} /> : null}

            {showTrack && (
              <View style={styles.trackRow}>
                <TextInput
                  value={track[o.id] ?? o.trackingNumber ?? ''}
                  onChangeText={(x) => setTrack((p) => ({ ...p, [o.id]: x }))}
                  placeholder={tt('shopOrders', '📦 ເລກ tracking')}
                  placeholderTextColor="#999"
                  style={styles.trackInput}
                />
                <Pressable style={styles.trackSave} onPress={() => setOrderTracking(o.id, track[o.id] ?? o.trackingNumber ?? '', o.logisticsProviderName)}>
                  <Text style={styles.trackSaveT}>💾</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.acts}>
              {o.status === 'pending' && o.paymentMethod === 'bank_transfer' && !o.paymentVerified && (
                <Pressable style={[styles.btn, { backgroundColor: '#16a34a' }]} onPress={() => verifyOrderPayment(o.id, true)}>
                  <Text style={styles.btnT}>✓ {tt('shopOrders', 'ຢືນຢັນຈ່າຍ')}</Text>
                </Pressable>
              )}
              {o.status === 'pending' && o.paymentMethod === 'cod' && (
                <Pressable style={[styles.btn, { backgroundColor: '#0a84ff' }]} onPress={() => updateOrderStatus(o.id, 'confirmed')}>
                  <Text style={styles.btnT}>✓ {tt('shopOrders', 'ຮັບອໍເດີ')}</Text>
                </Pressable>
              )}
              {o.status === 'pending' && (
                <Pressable style={[styles.btn, { backgroundColor: '#dc2626' }]} onPress={() => updateOrderStatus(o.id, 'cancelled')}>
                  <Text style={styles.btnT}>✗ {tt('shopOrders', 'ປະຕິເສດ')}</Text>
                </Pressable>
              )}
              {o.status === 'confirmed' && (
                <Pressable style={[styles.btn, { backgroundColor: '#0a84ff' }]} onPress={() => updateOrderStatus(o.id, 'delivering')}>
                  <Text style={styles.btnT}>🚚 {tt('shopOrders', 'ກຳລັງສົ່ງ')}</Text>
                </Pressable>
              )}
              {o.status === 'delivering' && (
                <Pressable style={[styles.btn, { backgroundColor: '#16a34a' }]} onPress={() => updateOrderStatus(o.id, 'completed')}>
                  <Text style={styles.btnT}>✓ {tt('shopOrders', 'ສຳເລັດ')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Stat({ v, l, c }: { v: number; l: string; c: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statV, { color: c }]}>{v}</Text>
      <Text style={styles.statL}>{l}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  statV: { fontSize: 15, fontWeight: '800' },
  statL: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  rev: { backgroundColor: '#059669', borderRadius: 12, padding: 14, marginTop: 10, marginBottom: 14 },
  revL: { color: '#fff', fontSize: 12, opacity: 0.9 },
  revV: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 2 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#0a84ff', borderColor: '#0a84ff' },
  chipText: { fontSize: 12, color: '#6b7280' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  empty: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 24 },
  order: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 13, marginBottom: 10 },
  orow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  onum: { fontSize: 12, fontWeight: '700', color: '#0a84ff' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillT: { fontSize: 12, fontWeight: '700' },
  total: { fontSize: 15, fontWeight: '800', color: '#111', marginTop: 6 },
  commission: { fontSize: 12, color: '#dc2626', fontWeight: '700', marginTop: 2 },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  addr: { fontSize: 12, color: '#374151', marginTop: 4, fontWeight: '600' },
  cod: { fontSize: 12, color: '#991b1b', fontWeight: '700', marginTop: 4 },
  slip: { width: 90, height: 90, borderRadius: 8, marginTop: 8, backgroundColor: '#f3f4f6' },
  trackRow: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' },
  trackInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: '#111', backgroundColor: '#fff' },
  trackSave: { backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center' },
  trackSaveT: { color: '#fff', fontSize: 14 },
  acts: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnT: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
