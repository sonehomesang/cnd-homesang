import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { confirmReceipt, type Order, ORDER_STATUS_LABEL, updateOrderStatus, watchMyOrders } from '@/lib/orders';
import AppFooter from '@/components/AppFooter';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#fef3c7', fg: '#92400e' },
  confirmed: { bg: '#dbeafe', fg: '#1e40af' },
  preparing: { bg: '#dbeafe', fg: '#1e40af' },
  delivering: { bg: '#dbeafe', fg: '#1e40af' },
  delivered: { bg: '#d1fae5', fg: '#065f46' },
  completed: { bg: '#d1fae5', fg: '#065f46' },
  cancelled: { bg: '#fee', fg: '#991b1b' },
};

export default function OrdersScreen() {
  const { fbUser, loading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const tt = useTT();

  useEffect(() => {
    if (!loading && !fbUser) router.replace('/sign-in');
  }, [fbUser, loading]);

  useEffect(() => {
    if (!fbUser) return;
    const unsub = watchMyOrders(fbUser.uid, setOrders);
    return unsub;
  }, [fbUser]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{tt('orders', '📦 ການສັ່ງຊື້ຂອງຂ້ອຍ')}</Text>
        {orders.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>📦</Text>
            <Text style={styles.emptyText}>{tt('orders', 'ຍັງບໍ່ມີການສັ່ງຊື້')}</Text>
          </View>
        ) : (
          orders.map((o) => {
            const c = STATUS_COLORS[o.status] ?? STATUS_COLORS.completed;
            return (
              <View key={o.id} style={styles.row}>
                <Pressable onPress={() => router.push(`/orders/${o.id}` as any)}>
                  <View style={styles.top}>
                    <Text style={styles.num}>#{o.orderNumber}</Text>
                    <View style={[styles.pill, { backgroundColor: c.bg }]}>
                      <Text style={[styles.pillText, { color: c.fg }]}>{tt('orderStatus', ORDER_STATUS_LABEL[o.status])}</Text>
                    </View>
                  </View>
                  <Text style={styles.total}>{(o.grandTotal ?? 0).toLocaleString()} LAK</Text>
                  {o.isBnpl && o.bnpl && (
                    <Text style={styles.bnplHint}>
                      💳 {tt('orders', 'ຜ່ອນ')} · {o.bnpl.status === 'completed' ? tt('orders', 'ຄົບ ແລ້ວ') : `${tt('orders', 'ຄ້າງ')} ${(o.bnplOutstanding ?? 0).toLocaleString()} · ${tt('orders', 'ຄົບ ງວດ ໜ້າ')} ${o.bnpl.nextDueAt ? new Date(o.bnpl.nextDueAt).toLocaleDateString() : '—'}`}
                    </Text>
                  )}
                  <Text style={styles.meta}>
                    {o.paymentMethod === 'wallet' ? tt('orders', '👛 ກະເປົາ ເງິນ') : o.paymentMethod === 'bank_transfer' ? tt('orders', '🏦 ໂອນທະນາຄານ') : tt('orders', '💵 ເກັບປາຍທາງ')}
                    {' · '}
                    {o.deliveryMethod === 'delivery' ? tt('orders', '🚚 ສົ່ງເຖິງບ້ານ') : tt('orders', '🏬 ມາຮັບ')}
                    {!o.paymentVerified && o.paymentMethod === 'bank_transfer' ? tt('orders', ' · ⏳ ລໍກວດສະລິບ') : ''}
                  </Text>
                </Pressable>
                {o.status === 'pending' && (
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => { if (typeof confirm !== 'function' || confirm(tt('orders', 'ຍົກເລີກ ຄຳສັ່ງຊື້ ນີ້?'))) updateOrderStatus(o.id, 'cancelled'); }}>
                    <Text style={styles.cancelText}>{tt('orders', '✕ ຍົກເລີກ ຄຳສັ່ງຊື້')}</Text>
                  </Pressable>
                )}
                {(o.status === 'delivering' || o.status === 'delivered') && (
                  <Pressable
                    style={styles.confirmBtn}
                    onPress={() => { if (typeof confirm !== 'function' || confirm(tt('orders', 'ຢືນຢັນ ວ່າ ໄດ້ຮັບ ສິນຄ້າ ຄົບ ແລ້ວ?'))) confirmReceipt(o.id); }}>
                    <Text style={styles.confirmText}>✓ {tt('orders', 'ຢືນຢັນຮັບຂອງ')}</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 8, alignItems: 'center', paddingBottom: 60 },
  wrap: { width: '100%', maxWidth: 640 },
  title: { fontSize: 15, fontWeight: 'bold', color: '#111', marginBottom: 12 },
  empty: { backgroundColor: '#fff', padding: 32, borderRadius: 12, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 14, color: '#6b7280' },
  row: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 14, marginBottom: 8, backgroundColor: '#fff' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: { fontSize: 12, fontWeight: '700', color: '#0066CC' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { fontSize: 12, fontWeight: '700' },
  total: { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 6 },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  bnplHint: { fontSize: 12, color: '#c2410c', fontWeight: '700', marginTop: 3 },
  cancelBtn: { borderWidth: 1, borderColor: '#dc2626', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 10 },
  cancelText: { color: '#dc2626', fontSize: 13, fontWeight: '600' },
  confirmBtn: { backgroundColor: '#059669', borderRadius: 8, paddingVertical: 9, alignItems: 'center', marginTop: 10 },
  confirmText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
