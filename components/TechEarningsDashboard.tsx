import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Earning } from '@/lib/wallet';
import { useTT } from '@/lib/i18n';

type Period = 'month' | 'all';

/**
 * Technician service-earnings dashboard. Derives from the SAME `earnings`
 * (watchEarnings — completed jobs at 10% fee) the wallet balance already pools,
 * so figures reconcile. Adds the summary + per-job ledger the technician lacked,
 * with each job row drilling through to its detail.
 */
export default function TechEarningsDashboard({ earnings, rating, reviewCount }: {
  earnings: Earning[];
  rating?: number;
  reviewCount?: number;
}) {
  const tt = useTT();
  const [period, setPeriod] = useState<Period>('month');

  const since = useMemo(() => {
    if (period === 'all') return 0;
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime();
  }, [period]);

  const m = useMemo(() => {
    const rows = earnings.filter((e) => e.at >= since).sort((a, b) => b.at - a.at);
    const gross = rows.reduce((s, e) => s + e.gross, 0);
    const fee = rows.reduce((s, e) => s + e.fee, 0);
    const net = rows.reduce((s, e) => s + e.net, 0);
    return { rows, gross, fee, net, count: rows.length };
  }, [earnings, since]);

  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>🔧 {tt('techEarn', 'ລາຍໄດ້ ຈາກ ງານ')}</Text>
        <View style={styles.seg}>
          {(['month', 'all'] as Period[]).map((p) => (
            <Pressable key={p} style={[styles.segBtn, period === p && styles.segOn]} onPress={() => setPeriod(p)}>
              <Text style={[styles.segText, period === p && styles.segTextOn]}>{tt('techEarn', p === 'month' ? 'ເດືອນນີ້' : 'ທັງໝົດ')}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.bigCard}>
        <Text style={styles.bigLabel}>💵 {tt('techEarn', 'ລາຍໄດ້ ສຸດທິ (net)')}</Text>
        <Text style={styles.bigValue}>{fmt(m.net)} ₭</Text>
        <View style={styles.bigSub}>
          <Text style={styles.bigSubText}>{tt('techEarn', 'gross')} {fmt(m.gross)}</Text>
          <Text style={styles.bigSubText}>− {tt('techEarn', 'ຄ່າຄອມ 10%')} {fmt(m.fee)}</Text>
        </View>
      </View>

      <View style={styles.tiles}>
        <View style={styles.tile}><Text style={[styles.tv, { color: '#16a34a' }]}>{m.count}</Text><Text style={styles.tl}>{tt('techEarn', 'ງານສຳເລັດ')}</Text></View>
        <View style={styles.tile}><Text style={[styles.tv, { color: '#f97316' }]}>{fmt(m.fee)}</Text><Text style={styles.tl}>{tt('techEarn', 'ຄ່າຄອມ ຈ່າຍ')}</Text></View>
        <View style={styles.tile}><Text style={[styles.tv, { color: '#eab308' }]}>{rating ? `⭐${rating.toFixed(1)}` : '—'}</Text><Text style={styles.tl}>{tt('techEarn', 'ຄະແນນ')} ({reviewCount ?? 0})</Text></View>
      </View>

      {m.rows.length > 0 && (
        <>
          <Text style={styles.section}>{tt('techEarn', 'ງານ ຫຼ້າສຸດ (ກົດ → ລາຍລະອຽດ)')}</Text>
          <View style={styles.ledger}>
            {m.rows.slice(0, 8).map((e) => (
              <Pressable key={e.jobId} style={styles.row} onPress={() => router.push(`/jobs/${e.jobId}` as any)}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rtitle} numberOfLines={1}>{e.title} ›</Text>
                  <Text style={styles.rmeta}>{e.gross.toLocaleString()} − {tt('techEarn', 'ຄອມ')} {e.fee.toLocaleString()}</Text>
                </View>
                <Text style={styles.rnet}>+{fmt(e.net)} ₭</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#e9d5ff', borderRadius: 14, padding: 12, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: '#111' },
  seg: { flexDirection: 'row', gap: 6 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  segOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  segText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  segTextOn: { color: '#fff', fontWeight: '700' },
  bigCard: { backgroundColor: '#7c3aed', borderRadius: 12, padding: 14 },
  bigLabel: { color: '#ede9fe', fontSize: 12 },
  bigValue: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 2 },
  bigSub: { flexDirection: 'row', gap: 12, marginTop: 6 },
  bigSubText: { color: '#ede9fe', fontSize: 12 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 8 },
  tile: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10, alignItems: 'center' },
  tv: { fontSize: 15, fontWeight: '900' },
  tl: { fontSize: 12, color: '#6b7280', marginTop: 2, textAlign: 'center' },
  section: { fontSize: 12, fontWeight: '700', color: '#4b5563', marginTop: 14, marginBottom: 6 },
  ledger: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rtitle: { fontSize: 13, color: '#7c3aed', fontWeight: '700' },
  rmeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  rnet: { fontSize: 14, color: '#16a34a', fontWeight: '800' },
});
