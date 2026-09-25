import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Order, watchAllOrders } from '@/lib/orders';
import { type Job, watchAllJobs } from '@/lib/jobs';
import { PLATFORM_FEE_RATE } from '@/lib/wallet';
import { useTT } from '@/lib/i18n';
import { usePaged } from './Paginator';

function fmt(n: number): string {
  return Math.round(n || 0).toLocaleString('en-US');
}
function shortDate(ms: number): string {
  return ms ? new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
}

interface Row {
  id: string;
  kind: 'order' | 'job';
  label: string;
  amount: number;
  at: number;
}

export default function CommissionsPanel() {
  const tt = useTT();
  const [orders, setOrders] = useState<Order[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => watchAllOrders(setOrders), []);
  useEffect(() => watchAllJobs(setJobs), []);

  const rows: Row[] = useMemo(() => {
    const list: Row[] = [];
    for (const o of orders) {
      // recognize commission only once the order is actually paid (verified) or
      // completed — not on pending/unpaid orders (which may never be paid).
      if (o.commission && o.status !== 'cancelled' && (o.paymentVerified || o.status === 'completed')) {
        list.push({ id: 'o-' + o.id, kind: 'order', label: `📦 #${o.orderNumber}`, amount: o.commission, at: o.createdAt });
      }
    }
    for (const j of jobs) {
      if (j.status === 'completed' && typeof j.finalPrice === 'number') {
        list.push({ id: 'j-' + j.id, kind: 'job', label: `🛠️ ${j.title}`, amount: Math.round(j.finalPrice * PLATFORM_FEE_RATE), at: j.completedAt ?? j.createdAt });
      }
    }
    list.sort((a, b) => b.at - a.at);
    return list;
  }, [orders, jobs]);

  const fromOrders = rows.filter((r) => r.kind === 'order').reduce((s, r) => s + r.amount, 0);
  const fromJobs = rows.filter((r) => r.kind === 'job').reduce((s, r) => s + r.amount, 0);

  // Y3 Slice C — value-added platform fees, recognized on the same paid/completed
  // orders, broken down by component.
  const va = useMemo(() => {
    let total = 0;
    const byKey = new Map<string, { label: string; amount: number }>();
    for (const o of orders) {
      if (o.status === 'cancelled' || !(o.paymentVerified || o.status === 'completed')) continue;
      for (const f of o.platformFees ?? []) {
        total += f.amount;
        const cur = byKey.get(f.key);
        byKey.set(f.key, { label: f.label, amount: (cur?.amount ?? 0) + f.amount });
      }
    }
    const components = [...byKey.values()].sort((a, b) => b.amount - a.amount);
    return { total, components, max: components[0]?.amount ?? 1 };
  }, [orders]);

  const total = fromOrders + fromJobs + va.total;
  const pg = usePaged(rows, 12);

  return (
    <View>
      <Text style={styles.title}>💵 {tt('admIncome', 'ຄອມມິຊັ່ນ ເຂົ້າ HomeSang')}</Text>
      <Text style={styles.sub}>{tt('admIncome', 'ລວມ ຄອມ ຈາກ ຄຳສັ່ງຊື້ (ຮ້ານ→ເຮົາ) + ຄ່າທຳນຽມ ງານ')} ({Math.round(PLATFORM_FEE_RATE * 100)}%)</Text>

      <View style={styles.cards}>
        <View style={styles.metric}><Text style={styles.mLabel}>{tt('admIncome', 'ລວມ ທັງໝົດ')}</Text><Text style={styles.mBig}>{fmt(total)}</Text></View>
        <View style={styles.metric}><Text style={styles.mLabel}>{tt('admIncome', 'ຄອມມິຊັ່ນ')}</Text><Text style={styles.mVal}>{fmt(fromOrders)}</Text></View>
        <View style={styles.metric}><Text style={styles.mLabel}>{tt('admIncome', 'ຄ່າບໍລິການ VA')}</Text><Text style={styles.mVal}>{fmt(va.total)}</Text></View>
        <View style={styles.metric}><Text style={styles.mLabel}>{tt('admIncome', 'ຈາກ ງານ')}</Text><Text style={styles.mVal}>{fmt(fromJobs)}</Text></View>
      </View>

      {va.components.length > 0 && (
        <View style={styles.brk}>
          <Text style={styles.brkTitle}>🧾 {tt('admIncome', 'ຄ່າບໍລິການ ຕາມ ປະເພດ')}</Text>
          {va.components.map((c) => (
            <View key={c.label} style={styles.brow}>
              <Text style={styles.brLabel} numberOfLines={1}>{c.label}</Text>
              <View style={styles.brBar}><View style={[styles.brBarFill, { width: `${Math.round((c.amount / va.max) * 100)}%` }]} /></View>
              <Text style={styles.brAmt}>{fmt(c.amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {rows.length === 0 ? (
        <Text style={styles.empty}>{tt('admIncome', 'ຍັງບໍ່ມີ ຄອມມິຊັ່ນ — ເປີດ «ຄອມມິຊັ່ນ %» ໃນ ແທັບ ຄອມມິຊັ່ນ ເພື່ອ ຄິດ ຕອນ ຂາຍ')}</Text>
      ) : (
        pg.items.map((r) => (
          <View key={r.id} style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rLabel} numberOfLines={1}>{r.label}</Text>
              <Text style={styles.rDate}>{shortDate(r.at)}</Text>
            </View>
            <Text style={styles.plus}>+{fmt(r.amount)}</Text>
          </View>
        ))
      )}
      {pg.bar}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  cards: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metric: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 10, padding: 12 },
  mLabel: { fontSize: 12, color: '#6b7280' },
  mBig: { fontSize: 15, fontWeight: '800', color: '#16a34a', marginTop: 4 },
  mVal: { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 4 },
  brk: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 14, marginBottom: 16 },
  brkTitle: { fontSize: 13, fontWeight: '700', color: '#111', marginBottom: 10 },
  brow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  brLabel: { fontSize: 13, color: '#374151', width: 130 },
  brBar: { flex: 1, height: 8, backgroundColor: '#f1f5f9', borderRadius: 5, overflow: 'hidden' },
  brBarFill: { height: '100%', backgroundColor: '#16a34a' },
  brAmt: { fontSize: 13, fontWeight: '800', color: '#16a34a', width: 84, textAlign: 'right' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 11, marginBottom: 6 },
  rLabel: { fontSize: 13, fontWeight: '600', color: '#111' },
  rDate: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  plus: { fontSize: 14, fontWeight: '700', color: '#16a34a' },
});
