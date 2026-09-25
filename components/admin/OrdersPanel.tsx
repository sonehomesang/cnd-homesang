import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  deleteOrder,
  type Order,
  ORDER_STATUS_LABEL,
  setOrderTracking,
  updateOrderStatus,
  verifyOrderPayment,
  watchAllOrders,
} from '@/lib/orders';
import { type AdminUser, watchAllUsers } from '@/lib/admin';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';
import { usePaged } from './Paginator';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#fef3c7', fg: '#92400e' },
  confirmed: { bg: '#dbeafe', fg: '#1e40af' },
  delivering: { bg: '#dbeafe', fg: '#1e40af' },
  delivered: { bg: '#d1fae5', fg: '#065f46' },
  completed: { bg: '#d1fae5', fg: '#065f46' },
  cancelled: { bg: '#fee', fg: '#991b1b' },
};

type Tab = '' | 'pending' | 'confirmed' | 'completed';

export default function OrdersPanel() {
  const { canEdit, canDelete } = useSectionPerms('catalog');
  const tt = useTT();
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tab, setTab] = useState<Tab>('');
  const [trackDrafts, setTrackDrafts] = useState<Record<string, string>>({});

  useEffect(() => watchAllOrders(setOrders), []);
  useEffect(() => watchAllUsers(setUsers), []);
  const nameOf = (uid: string) => {
    const u = users.find((x) => x.uid === uid);
    return u ? u.name || u.firstName || u.phone || uid : uid;
  };

  const TABS: { value: Tab; label: string }[] = [
    { value: '', label: `${tt('admOrders','ທັງໝົດ')} (${orders.length})` },
    { value: 'pending', label: `${tt('admOrders','ຮໍ')} (${orders.filter((o) => o.status === 'pending').length})` },
    { value: 'confirmed', label: `${tt('admOrders','ຢືນຢັນ')} (${orders.filter((o) => o.status === 'confirmed').length})` },
    { value: 'completed', label: `${tt('admOrders','ສຳເລັດ')} (${orders.filter((o) => o.status === 'completed').length})` },
  ];
  const shown = tab ? orders.filter((o) => o.status === tab) : orders;
  const pg = usePaged(shown, 8);

  return (
    <View>
      <Text style={styles.title}>📦 {tt('admOrders','ການສັ່ງຊື້')}</Text>
      <Text style={styles.sub}>{tt('admOrders','ກວດສະລິບ · ຢືນຢັນ/ປະຕິເສດ · ປ່ຽນສະຖານະ (ຜູ້ສັ່ງຊື້ = ບັນຊີ login)')}</Text>

      <View style={styles.subtabs}>
        {TABS.map((t) => (
          <Pressable key={t.value} onPress={() => setTab(t.value)} style={styles.subtab}>
            <Text style={[styles.subtabText, tab === t.value && styles.subtabActive]}>{t.label}</Text>
            {tab === t.value && <View style={styles.bar} />}
          </Pressable>
        ))}
      </View>

      {pg.items.map((o) => {
        const c = STATUS_COLORS[o.status] ?? STATUS_COLORS.completed;
        return (
          <View key={o.id} style={styles.row}>
            <View style={styles.top}>
              <Text style={styles.num}>#{o.orderNumber}</Text>
              <View style={[styles.pill, { backgroundColor: c.bg }]}>
                <Text style={[styles.pillText, { color: c.fg }]}>{tt('orderStatus', ORDER_STATUS_LABEL[o.status])}</Text>
              </View>
            </View>
            <Text style={styles.buyer} numberOfLines={1}>👤 {nameOf(o.customerId)}{o.shopName ? ` · 🏬 ${o.shopName}` : ''}</Text>
            <Text style={styles.total}>{(o.grandTotal ?? 0).toLocaleString()} LAK</Text>
            {o.commission ? <Text style={styles.commission}>💰 {tt('admOrders','ຄອມ')} HomeSang {o.commission.toLocaleString()} {tt('common','ກີບ')}</Text> : null}
            <Text style={styles.meta}>
              {o.paymentMethod === 'bank_transfer' ? `🏦 ${tt('admOrders','ໂອນ')}` : `💵 ${tt('admOrders','ປາຍທາງ')}`}
              {' · '}{o.deliveryMethod === 'delivery' ? `🚚 ${tt('admOrders','ສົ່ງ')}` : `🏬 ${tt('admOrders','ຮັບ')}`}
              {o.paymentVerified ? ` · ✅ ${tt('admOrders','ຈ່າຍແລ້ວ')}` : ` · ⏳ ${tt('admOrders','ລໍກວດ')}`}
            </Text>
            {o.slipUrl ? <Image source={{ uri: o.slipUrl }} style={styles.slip} /> : null}

            {(o.logisticsProviderName || o.codAmount) ? (
              <Text style={styles.meta}>
                {o.logisticsProviderName ? `🚚 ${o.logisticsProviderName}` : ''}
                {o.codAmount ? `${o.logisticsProviderName ? ' · ' : ''}💵 COD ${o.codAmount.toLocaleString()} ${tt('common','ກີບ')}` : ''}
              </Text>
            ) : null}

            {/* courier tracking — admin enters after booking (delivering onward) */}
            {canEdit && (o.status === 'confirmed' || o.status === 'delivering' || o.status === 'delivered') && (
              <View style={styles.trackRow}>
                <TextInput
                  value={trackDrafts[o.id] ?? o.trackingNumber ?? ''}
                  onChangeText={(x) => setTrackDrafts((p) => ({ ...p, [o.id]: x }))}
                  placeholder={tt('admOrders', '📦 ເລກ tracking')}
                  placeholderTextColor="#999"
                  style={styles.trackInput}
                />
                <Pressable
                  style={styles.trackSave}
                  onPress={() => setOrderTracking(o.id, trackDrafts[o.id] ?? o.trackingNumber ?? '', o.logisticsProviderName)}>
                  <Text style={styles.trackSaveText}>💾</Text>
                </Pressable>
              </View>
            )}
            {o.trackingNumber ? <Text style={styles.trackShow}>📦 {o.trackingNumber}</Text> : null}

            <View style={styles.actions}>
              {canEdit && o.status === 'pending' && (
                <>
                  {o.paymentMethod === 'bank_transfer' && !o.paymentVerified && (
                    <Pressable style={[styles.btn, { backgroundColor: '#16a34a' }]} onPress={() => verifyOrderPayment(o.id, true)}>
                      <Text style={styles.btnText}>✓ {tt('admOrders','ຢືນຢັນຈ່າຍ')}</Text>
                    </Pressable>
                  )}
                  {/* COD has no pre-paid slip to verify — accept the order to start fulfilment (mirrors ShopOrdersQueue) */}
                  {o.paymentMethod === 'cod' && (
                    <Pressable style={[styles.btn, { backgroundColor: '#0a84ff' }]} onPress={() => updateOrderStatus(o.id, 'confirmed')}>
                      <Text style={styles.btnText}>✓ {tt('admOrders','ຮັບ ອໍເດີ (COD)')}</Text>
                    </Pressable>
                  )}
                  <Pressable style={[styles.btn, { backgroundColor: '#dc2626' }]} onPress={() => updateOrderStatus(o.id, 'cancelled')}>
                    <Text style={styles.btnText}>✗ {tt('admOrders','ປະຕິເສດ / ບໍ່ອະນຸມັດ')}</Text>
                  </Pressable>
                </>
              )}
              {canEdit && o.status === 'confirmed' && (
                <Pressable style={[styles.btn, { backgroundColor: '#0066CC' }]} onPress={() => updateOrderStatus(o.id, 'delivering')}>
                  <Text style={styles.btnText}>🚚 {tt('admOrders','ກຳລັງສົ່ງ')}</Text>
                </Pressable>
              )}
              {canEdit && o.status === 'delivering' && (
                <Pressable style={[styles.btn, { backgroundColor: '#16a34a' }]} onPress={() => updateOrderStatus(o.id, 'completed')}>
                  <Text style={styles.btnText}>✓ {tt('admOrders','ສຳເລັດ')}</Text>
                </Pressable>
              )}
              {canDelete && (
                <Pressable style={[styles.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dc2626' }]} onPress={() => { if (confirm(tt('admOrders','ລຶບ ອໍເດີ ນີ້ + ລາຍການ? ບໍ່ ສາມາດ ກູ້ ຄືນ.'))) deleteOrder(o.id); }}>
                  <Text style={[styles.btnText, { color: '#dc2626' }]}>🗑️ {tt('admOrders','ລຶບ')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
      {shown.length === 0 && <Text style={styles.empty}>{tt('admOrders','ບໍ່ມີການສັ່ງຊື້')}</Text>}

      {pg.bar}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  createBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  buyer: { fontSize: 13, color: '#111', fontWeight: '600', marginTop: 6 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: { backgroundColor: '#0066CC', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  editBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  subtabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderBottomWidth: 2, borderBottomColor: '#f0f0f0', marginBottom: 14 },
  subtab: { paddingHorizontal: 12, paddingVertical: 8 },
  subtabText: { fontSize: 12, color: '#6b7280' },
  subtabActive: { color: '#0066CC', fontWeight: '700' },
  bar: { height: 2, backgroundColor: '#0066CC', marginTop: 6, marginHorizontal: -12, marginBottom: -10 },
  row: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 14, marginBottom: 8 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  num: { fontSize: 12, fontWeight: '700', color: '#0066CC' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { fontSize: 12, fontWeight: '700' },
  total: { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 6 },
  commission: { fontSize: 12, color: '#16a34a', fontWeight: '700', marginTop: 2 },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  slip: { width: 120, height: 120, borderRadius: 8, marginTop: 8, backgroundColor: '#f3f4f6' },
  trackRow: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' },
  trackInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: '#111', backgroundColor: '#fff' },
  trackSave: { backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center' },
  trackSaveText: { color: '#fff', fontSize: 14 },
  trackShow: { fontSize: 12, color: '#5b21b6', fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#9ca3af', padding: 24 },
});
