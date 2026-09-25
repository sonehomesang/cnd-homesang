import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Order, ORDER_STATUS_LABEL, verifyOrderPayment, watchAllOrders } from '@/lib/orders';
import { type AdminUser, watchAllUsers } from '@/lib/admin';
import { ttStatic, useTT } from '@/lib/i18n';
import { usePaged } from './Paginator';

type Tab = 'await' | 'verified' | 'cod';
const money = (n: number) => `${(n ?? 0).toLocaleString()} ${ttStatic('common','ກີບ')}`;
function fmt(ts: number) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function PaymentsPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tab, setTab] = useState<Tab>('await');
  const tt = useTT();

  useEffect(() => watchAllOrders(setOrders), []);
  useEffect(() => watchAllUsers(setUsers), []);

  const nameOf = useMemo(() => {
    const m: Record<string, string> = {};
    users.forEach((u) => { m[u.uid] = u.name || u.firstName || u.phone || u.uid; });
    return m;
  }, [users]);

  const isBank = (o: Order) => o.paymentMethod === 'bank_transfer';
  const awaiting = orders.filter((o) => isBank(o) && !o.paymentVerified && o.status !== 'cancelled');
  const verified = orders.filter((o) => isBank(o) && o.paymentVerified);
  const cod = orders.filter((o) => o.paymentMethod === 'cod');

  const list = tab === 'await' ? awaiting : tab === 'verified' ? verified : cod;
  const pg = usePaged(list, 12);

  // orders store the payable amount as `grandTotal` (`total` only exists on
  // orderItems) — reading `.total` here showed every slip as 0 ກີບ, so payments
  // were approved without any amount to check the slip against
  const pendingSum = awaiting.reduce((s, o) => s + (o.grandTotal ?? 0), 0);

  const TABS: { v: Tab; l: string }[] = [
    { v: 'await', l: `${tt('admPayments','ລໍຖ້າ')} verify (${awaiting.length})` },
    { v: 'verified', l: `verify ${tt('admPayments','ແລ້ວ')} (${verified.length})` },
    { v: 'cod', l: ` COD (${cod.length})` },
  ];

  return (
    <View>
      <Text style={styles.title}>💳 {tt('admPayments','ການຈ່າຍເງິນ')} · Payments</Text>
      <Text style={styles.sub}>{tt('admPayments','ກວດ ແລະ ຢືນຢັນ ການໂອນເງິນ (bank transfer) ຂອງ ອໍເດີ')}</Text>

      <View style={styles.cards}>
        <View style={styles.card}><Text style={styles.cLabel}>{tt('admPayments','ລໍຖ້າ')} verify</Text><Text style={[styles.cVal, { color: '#b45309' }]}>{awaiting.length}</Text></View>
        <View style={styles.card}><Text style={styles.cLabel}>{tt('admPayments','ມູນຄ່າ ລໍຖ້າ')}</Text><Text style={styles.cVal}>{money(pendingSum)}</Text></View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.v} onPress={() => setTab(t.v)} style={styles.tab}>
            <Text style={[styles.tabText, tab === t.v && styles.tabOn]}>{t.l}</Text>
            {tab === t.v && <View style={styles.bar} />}
          </Pressable>
        ))}
      </View>

      {pg.items.map((o) => (
        <View key={o.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.who}>#{(o as any).orderNumber ?? o.id.slice(0, 6)} · 👤 {nameOf[(o as any).customerId] ?? '—'}</Text>
            <Text style={styles.amount}>{money(o.grandTotal ?? 0)} · {o.paymentMethod === 'cod' ? 'COD' : `🏦 ${tt('admPayments','ໂອນ')}`}</Text>
            <Text style={styles.date}>{tt('orderStatus', ORDER_STATUS_LABEL[o.status])} · {fmt((o as any).createdAt)}</Text>
            {/* the slip is the whole point of this screen — show it so the
                admin can compare the transferred amount before approving */}
            {!!o.slipUrl && (
              <Pressable onPress={() => { if (typeof window !== 'undefined') window.open(o.slipUrl!, '_blank'); }}>
                <Text style={styles.slipLink}>🧾 {tt('admPayments','ເບິ່ງ ໃບ ໂອນເງິນ')}</Text>
              </Pressable>
            )}
          </View>
          {tab === 'await' ? (
            <View style={styles.actions}>
              <Pressable style={[styles.mini, { backgroundColor: '#16a34a' }]} onPress={() => verifyOrderPayment(o.id, true)}><Text style={styles.miniText}>✅ {tt('admPayments','ຢືນຢັນ')}</Text></Pressable>
              <Pressable style={[styles.mini, { backgroundColor: '#dc2626' }]} onPress={() => verifyOrderPayment(o.id, false)}><Text style={styles.miniText}>❌ {tt('admPayments','ປະຕິເສດ')}</Text></Pressable>
            </View>
          ) : (
            <Text style={[styles.badge, o.paymentVerified ? styles.ok : styles.pend]}>{o.paymentVerified ? '✅ verify' : 'COD'}</Text>
          )}
        </View>
      ))}
      {list.length === 0 && <Text style={styles.empty}>{tt('admPayments','ບໍ່ມີ ລາຍການ')}</Text>}
      {pg.bar}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  cards: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  card: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 10, padding: 12 },
  cLabel: { fontSize: 12, color: '#6b7280' },
  cVal: { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 2, borderBottomColor: '#f0f0f0', marginBottom: 12 },
  tab: { paddingHorizontal: 12, paddingVertical: 8 },
  tabText: { fontSize: 12, color: '#6b7280' },
  tabOn: { color: '#0066CC', fontWeight: '700' },
  bar: { height: 2, backgroundColor: '#0066CC', marginTop: 6, marginHorizontal: -12, marginBottom: -10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 6 },
  who: { fontSize: 13, fontWeight: '600', color: '#111' },
  amount: { fontSize: 15, fontWeight: '700', color: '#0066CC', marginTop: 2 },
  slipLink: { fontSize: 12, color: '#0066CC', fontWeight: '600', marginTop: 3, textDecorationLine: 'underline' },
  date: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  actions: { gap: 4, alignItems: 'flex-end' },
  mini: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  miniText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  badge: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  ok: { backgroundColor: '#dcfce7', color: '#166534' },
  pend: { backgroundColor: '#f3f4f6', color: '#374151' },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', padding: 24 },
});
