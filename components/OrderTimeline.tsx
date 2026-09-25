import { StyleSheet, Text, View } from 'react-native';
import type { Order } from '@/lib/orders';
import { TIMELINE_STEPS, timelineIndex } from '@/lib/escrow';
import { useTT } from '@/lib/i18n';

function stamp(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit' }) + ' · ' + d.toLocaleTimeString('lo-LA', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Delivery tracking timeline — a vertical stepper over the order lifecycle.
 * Steps up to (and including) the current status are marked done; the current
 * one pulses. Timestamps are shown where known (created / delivered) and the
 * courier tracking number sits on the "delivering" step. Cancelled orders show
 * a single cancelled row instead of the stepper.
 */
export default function OrderTimeline({ order }: { order: Order }) {
  const tt = useTT();
  if (order.status === 'cancelled') {
    return (
      <View style={styles.wrap}>
        <View style={styles.cancelledRow}>
          <View style={styles.cancelDot}><Text style={styles.cancelDotText}>✕</Text></View>
          <View>
            <Text style={styles.cancelName}>{tt('orderTimeline', 'ຍົກເລີກ ແລ້ວ')}</Text>
            <Text style={styles.ts}>{stamp(order.createdAt)}</Text>
          </View>
        </View>
      </View>
    );
  }

  const cur = timelineIndex(order.status);
  return (
    <View style={styles.wrap}>
      {TIMELINE_STEPS.map((s, i) => {
        const done = i < cur;
        const now = i === cur;
        const last = i === TIMELINE_STEPS.length - 1;
        const ts = s.key === 'pending' ? order.createdAt
          : s.key === 'confirmed' ? (order.confirmedAt ?? order.paymentVerifiedAt)
          : s.key === 'delivering' ? order.deliveringAt
          : s.key === 'delivered' ? order.deliveredAt
          : s.key === 'completed' ? (order.completedAt ?? order.deliveredAt)
          : undefined;
        return (
          <View key={s.key} style={[styles.step, last && { paddingBottom: 0 }]}>
            <View style={styles.dotCol}>
              <View style={[styles.dot, done ? styles.dotDone : now ? styles.dotNow : styles.dotTodo]}>
                <Text style={[styles.dotText, (done || now) && styles.dotTextOn]}>{done ? '✓' : now ? s.icon : String(i + 1)}</Text>
              </View>
              {!last && <View style={[styles.bar, done && styles.barOn]} />}
            </View>
            <View style={styles.body}>
              <Text style={[styles.name, !done && !now && styles.nameTodo]}>{s.label}</Text>
              {now && s.key !== 'pending' && ts === undefined && <Text style={styles.ts}>{tt('orderTimeline', 'ກຳລັງ ດຳເນີນການ')}</Text>}
              {!!ts && <Text style={styles.ts}>{stamp(ts)}</Text>}
              {s.key === 'confirmed' && order.paymentVerified && (done || now) && (
                <Text style={styles.payOk}>{tt('orderTimeline', '✅ ຈ່າຍ ຢືນຢັນ ແລ້ວ')}</Text>
              )}
              {s.key === 'delivering' && !!order.trackingNumber && (
                <Text style={styles.track}>📦 {order.trackingNumber}{order.logisticsProviderName ? ` · ${order.logisticsProviderName}` : ''}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 16, backgroundColor: '#fff', marginTop: 10 },
  step: { flexDirection: 'row', gap: 12, paddingBottom: 16 },
  dotCol: { alignItems: 'center' },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: '#059669' },
  dotNow: { backgroundColor: '#059669' },
  dotTodo: { backgroundColor: '#e5e7eb' },
  dotText: { fontSize: 12, fontWeight: '700', color: '#9ca3af' },
  dotTextOn: { color: '#fff' },
  bar: { width: 2, flex: 1, backgroundColor: '#e5e7eb', marginTop: 2 },
  barOn: { backgroundColor: '#059669' },
  body: { flex: 1, paddingTop: 3 },
  name: { fontSize: 14, fontWeight: '700', color: '#111' },
  nameTodo: { color: '#9ca3af', fontWeight: '600' },
  ts: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  track: { fontSize: 12, color: '#5b21b6', fontWeight: '700', backgroundColor: '#f5f3ff', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4, overflow: 'hidden' },
  payOk: { fontSize: 12, color: '#15803d', fontWeight: '700', backgroundColor: '#f0fdf4', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4, overflow: 'hidden' },
  cancelledRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cancelDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fecaca', alignItems: 'center', justifyContent: 'center' },
  cancelDotText: { color: '#991b1b', fontWeight: '700' },
  cancelName: { fontSize: 14, fontWeight: '700', color: '#991b1b' },
});
