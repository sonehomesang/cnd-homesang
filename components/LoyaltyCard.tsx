import { StyleSheet, Text, View } from 'react-native';
import { useLoyalty } from '@/lib/loyalty';
import { useTT } from '@/lib/i18n';

function fmt(n: number) { return (n || 0).toLocaleString('en-US'); }
function shortDate(ms: number) { return new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit' }); }

/**
 * Wallet "💎 ແຕ້ມສະສົມ" card + history — the buyer's derived store-credit
 * (earned on delivered orders, spent at checkout). Renders nothing when the
 * feature is off (loyaltyEarnPct = 0) or the user has never earned/spent.
 */
export default function LoyaltyCard({ uid }: { uid: string }) {
  const tt = useTT();
  const { summary, enabled } = useLoyalty(uid);
  if (!enabled || (summary.earned === 0 && summary.redeemed === 0)) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.lab}>💎 {tt('loyalty', 'ແຕ້ມສະສົມ ຂອງຂ້ອຍ')} ({tt('loyalty', '1 ແຕ້ມ = 1 ກີບ')})</Text>
        <Text style={styles.bal}>{fmt(summary.balance)} <Text style={styles.balUnit}>{tt('loyalty', 'ແຕ້ມ')}</Text></Text>
        <View style={styles.split}>
          <View><Text style={styles.splitLab}>{tt('loyalty', 'ໄດ້ທັງໝົດ')}</Text><Text style={styles.plus}>+{fmt(summary.earned)}</Text></View>
          <View><Text style={styles.splitLab}>{tt('loyalty', 'ໃຊ້ໄປແລ້ວ')}</Text><Text style={styles.minus}>−{fmt(summary.redeemed)}</Text></View>
        </View>
      </View>
      {summary.entries.slice(0, 8).map((e) => (
        <View key={e.key} style={styles.row}>
          <View style={styles.ic}><Text>{e.type === 'earn' ? '🛍️' : '🎟️'}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {e.type === 'earn' ? tt('loyalty', 'ໄດ້ແຕ້ມ') : tt('loyalty', 'ໃຊ້ແຕ້ມ')} — #{e.orderNumber}
            </Text>
            <Text style={styles.rowSub}>{shortDate(e.at)}</Text>
          </View>
          <Text style={e.type === 'earn' ? styles.plus : styles.minus}>{e.type === 'earn' ? '+' : '−'}{fmt(e.points)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  card: { borderRadius: 14, padding: 16, backgroundColor: '#0891b2' },
  lab: { color: '#fff', fontSize: 12, opacity: 0.9 },
  bal: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 2 },
  balUnit: { fontSize: 14, fontWeight: '600', opacity: 0.9 },
  split: { flexDirection: 'row', gap: 24, marginTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)', paddingTop: 10 },
  splitLab: { color: '#fff', fontSize: 12, opacity: 0.85 },
  plus: { color: '#a7f3d0', fontSize: 15, fontWeight: '800' },
  minus: { color: '#fecaca', fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10, marginTop: 8 },
  ic: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#ecfeff', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13, fontWeight: '600', color: '#111' },
  rowSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
});
