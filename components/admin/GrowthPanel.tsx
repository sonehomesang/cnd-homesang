import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { getGrowthMetrics, type GrowthMetrics } from '@/lib/growth';
import { useTT } from '@/lib/i18n';

const P = 'admGrowth';
const CHART_H = 150;
function money(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return Math.round(n).toLocaleString('en-US');
}

export default function GrowthPanel() {
  const tt = useTT();
  const [m, setM] = useState<GrowthMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => { setLoading(true); getGrowthMetrics().then(setM).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  if (loading && !m) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0066CC" /><Text style={styles.loadingT}>{tt(P, 'ກຳລັງ ໂຫຼດ...')}</Text></View>;
  }
  if (!m) return null;

  const tiles = [
    { k: `👥 ${tt(P, 'ສະມາຊິກ ທັງ ໝົດ')}`, v: m.totalUsers.toLocaleString('en-US'), d: `▲ +${m.newUsersThisMonth} ${tt(P, 'ເດືອນ ນີ້')}`, up: true },
    { k: `🆕 ${tt(P, 'ໃໝ່ ເດືອນ ນີ້')}`, v: m.newUsersThisMonth.toLocaleString('en-US'), d: `${m.newUsersPct >= 0 ? '▲' : '▼'} ${Math.abs(m.newUsersPct)}% ${tt(P, 'ທຽບ 30 ວັນ ກ່ອນ')}`, up: m.newUsersPct >= 0 },
    { k: `🔥 ${tt(P, 'ຫ້າວ ຫັນ 30 ວັນ')}`, v: m.mau30d.toLocaleString('en-US'), d: `${m.totalUsers ? Math.round((m.mau30d / m.totalUsers) * 100) : 0}% ${tt(P, 'ຂອງ ສະມາຊິກ')}`, up: false },
    { k: `⬇️ ${tt(P, 'ດາວ ໂຫຼດ ແອັບ')}`, v: '—', d: tt(P, 'ຕ້ອງ ເຊື່ອມ Play/Store'), muted: true },
    { k: `🛒 ${tt(P, 'ອໍເດີ + ວຽກ ເດືອນ ນີ້')}`, v: m.ordersThisMonth.toLocaleString('en-US'), d: '', up: true },
    { k: `💰 ${tt(P, 'GMV ເດືອນ ນີ້')}`, v: money(m.gmvThisMonth), d: tt(P, 'ກີບ'), up: true },
    { k: `🏦 ${tt(P, 'ລາຍ ຮັບ ຄ່າ ຄอມ ເດືອນ ນີ້')}`, v: money(m.revenueThisMonth), d: tt(P, 'ກີບ'), up: true },
    { k: `🧑‍🔧 ${tt(P, 'ຊ່າງ')}`, v: m.technicians.toLocaleString('en-US'), d: '', up: false },
  ];

  const sMax = Math.max(1, ...m.signupSeries.map((s) => s.value));
  const gMax = Math.max(1, ...m.gmvSeries.map((s) => Math.max(s.hs, s.cnd)));
  const fMax = Math.max(1, m.funnel.members);
  const funnelRows = [
    { n: `👥 ${tt(P, 'ສະມາຊິກ')}`, v: m.funnel.members, c: '#0066CC' },
    { n: `🔥 ${tt(P, 'ຫ້າວ ຫັນ 30 ວັນ')}`, v: m.funnel.active, c: '#2a7fd0' },
    { n: `🛍️ ${tt(P, 'ຜູ້ ຊື້/ຈ້າງ ເດືອນ ນີ້')}`, v: m.funnel.buyers, c: '#4f9ae0' },
    { n: `🧾 ${tt(P, 'ອໍເດີ + ວຽກ')}`, v: m.funnel.orders, c: '#79b4ea' },
  ];

  return (
    <View>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📈 {tt(P, 'ການ ເຕີບ ໂຕ')} · Growth</Text>
          <Text style={styles.sub}>{tt(P, 'ວັດ funnel + ການ ເຕີບ ໂຕ — ແຍກ ໂຮມຊ່າງ ↔ CND')}</Text>
        </View>
        <Pressable style={styles.refresh} onPress={load}><Text style={styles.refreshT}>{loading ? '...' : `↻ ${tt(P, 'ໂຫຼດ ໃໝ່')}`}</Text></Pressable>
      </View>

      {/* stat tiles */}
      <View style={styles.tiles}>
        {tiles.map((t, i) => (
          <View key={i} style={[styles.tile, t.muted && styles.tileMuted]}>
            <Text style={styles.tileK}>{t.k}</Text>
            <Text style={[styles.tileV, t.muted && styles.tileVMuted]}>{t.v}</Text>
            {t.d !== '' && <Text style={[styles.tileD, t.up ? styles.up : styles.flat]}>{t.d}</Text>}
          </View>
        ))}
      </View>

      {/* signups chart */}
      <View style={styles.card}>
        <Text style={styles.cardH}>🆕 {tt(P, 'ສະມາຊິກ ໃໝ່ ຕໍ່ ເດືອນ')}</Text>
        <Text style={styles.cardCap}>{tt(P, '8 ເດືອນ ຫຼ້າ ສຸດ')}</Text>
        <View style={styles.bars}>
          {m.signupSeries.map((s, i) => (
            <View key={i} style={styles.bcol}>
              <Text style={styles.bval}>{s.value}</Text>
              <View style={styles.bstack}>
                <View style={[styles.bar, styles.barHS, { height: Math.max(2, (s.value / sMax) * (CHART_H - 24)) }]} />
              </View>
              <Text style={styles.blabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* GMV chart */}
      <View style={styles.card}>
        <Text style={styles.cardH}>💰 {tt(P, 'GMV ຕໍ່ ເດືອນ — ໂຮມຊ່າງ vs CND')}</Text>
        <Text style={styles.cardCap}>{tt(P, 'ມູນ ຄ່າ ຄຳ ສັ່ງ ຊື້ + ວຽກ ສຳເລັດ (ກີບ)')}</Text>
        <View style={styles.legend}>
          <View style={styles.legItem}><View style={[styles.dot, { backgroundColor: '#0066CC' }]} /><Text style={styles.legT}>{tt(P, 'ໂຮມຊ່າງ')}</Text></View>
          <View style={styles.legItem}><View style={[styles.dot, { backgroundColor: '#E8551E' }]} /><Text style={styles.legT}>CND</Text></View>
        </View>
        <View style={styles.bars}>
          {m.gmvSeries.map((s, i) => (
            <View key={i} style={styles.bcol}>
              <View style={styles.bstackRow}>
                <View style={[styles.barPair, styles.barHS, { height: Math.max(2, (s.hs / gMax) * (CHART_H - 24)) }]} />
                <View style={[styles.barPair, styles.barCND, { height: Math.max(2, (s.cnd / gMax) * (CHART_H - 24)) }]} />
              </View>
              <Text style={styles.blabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* funnel */}
      <View style={styles.card}>
        <Text style={styles.cardH}>🔻 {tt(P, 'Funnel ການ ນຳ ໃຊ້')}</Text>
        <Text style={styles.cardCap}>{tt(P, 'ຈາກ ສະມາຊິກ ຮອດ ອໍເດີ (+ ອັດຕາ ປ່ຽນ)')}</Text>
        {funnelRows.map((s, i) => (
          <View key={i} style={styles.frow}>
            <View style={[styles.fbar, { width: `${Math.max(12, (s.v / fMax) * 100)}%`, backgroundColor: s.c }]}>
              <Text style={styles.fbarT}>{s.v.toLocaleString('en-US')}</Text>
            </View>
            <Text style={styles.fmeta}>{s.n}{i > 0 && funnelRows[i - 1].v > 0 ? `  ${Math.round((s.v / funnelRows[i - 1].v) * 100)}%` : ''}</Text>
          </View>
        ))}
        <View style={styles.note}><Text style={styles.noteT}>💡 {tt(P, 'ຍອດ ເທິງ ສຸດ ໃຊ້ ສະມາຊິກ ແທນ ດາວ ໂຫຼດ (ຍັງ ບໍ່ ໄດ້ ເຊື່ອມ ຕົວ ນັບ ດາວ ໂຫຼດ ພາຍ ນອກ)')}</Text></View>
      </View>

      {/* CND section */}
      <View style={styles.card}>
        <Text style={styles.cardH}>🟠 {tt(P, 'ພາກ CND (cnd.homesang.pro)')}</Text>
        <Text style={styles.cardCap}>{tt(P, 'ຮ້ານ ຄູ່ ຮ່ວມ — ນັບ ຈາກ cndOrders')}</Text>
        <View style={styles.miniWrap}>
          <View style={styles.mini}><Text style={styles.miniK}>🛒 {tt(P, 'ອໍເດີ ເດືອນ ນີ້')}</Text><Text style={styles.miniV}>{m.cnd.ordersThisMonth.toLocaleString('en-US')}</Text></View>
          <View style={styles.mini}><Text style={styles.miniK}>💰 {tt(P, 'GMV ເດືອນ ນີ້')}</Text><Text style={styles.miniV}>{money(m.cnd.gmvThisMonth)} {tt(P, 'ກີບ')}</Text></View>
          <View style={styles.mini}><Text style={styles.miniK}>📦 {tt(P, 'ອໍເດີ ທັງ ໝົດ')}</Text><Text style={styles.miniV}>{m.cnd.ordersTotal.toLocaleString('en-US')}</Text></View>
          <View style={styles.mini}><Text style={styles.miniK}>🎟️ {tt(P, 'ໃຊ້ ລະຫັດ ສ່ວນ ຫຼຸດ')}</Text><Text style={styles.miniV}>{m.cnd.couponUses.toLocaleString('en-US')}</Text></View>
        </View>
      </View>

      <Text style={styles.foot}>{tt(P, 'ອັບເດດ')} {new Date(m.updatedAt).toLocaleString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 48, alignItems: 'center' },
  loadingT: { marginTop: 10, color: '#6b7280', fontSize: 13 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  refresh: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  refreshT: { fontSize: 12, fontWeight: '700', color: '#0066CC' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '46%', minWidth: 150, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 14, padding: 13 },
  tileMuted: { backgroundColor: '#f8fafc', borderStyle: 'dashed' },
  tileK: { fontSize: 12, color: '#556072', fontWeight: '700' },
  tileV: { fontSize: 15, fontWeight: '900', color: '#111', marginTop: 3 },
  tileVMuted: { fontSize: 15, color: '#8b95a5' },
  tileD: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  up: { color: '#1f9d57' },
  flat: { color: '#8b95a5' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 16, padding: 16, marginTop: 16 },
  cardH: { fontSize: 14, fontWeight: '900', color: '#111' },
  cardCap: { fontSize: 12, color: '#556072', marginTop: 2, marginBottom: 12 },
  legend: { flexDirection: 'row', gap: 14, marginBottom: 6 },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 3 },
  legT: { fontSize: 12, color: '#556072' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: CHART_H, paddingTop: 6 },
  bcol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bstack: { justifyContent: 'flex-end', alignItems: 'center', flex: 1 },
  bstackRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, flex: 1 },
  bar: { width: '64%', borderRadius: 5, minHeight: 2 },
  barPair: { width: 11, borderRadius: 4, minHeight: 2 },
  barHS: { backgroundColor: '#0066CC' },
  barCND: { backgroundColor: '#E8551E' },
  bval: { fontSize: 12, color: '#556072', fontWeight: '700' },
  blabel: { fontSize: 12, color: '#8b95a5' },
  frow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  fbar: { height: 36, borderRadius: 9, justifyContent: 'center', paddingHorizontal: 12, minWidth: 70 },
  fbarT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  fmeta: { fontSize: 12, color: '#556072', flexShrink: 1 },
  note: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#ffd9b0', borderLeftWidth: 4, borderLeftColor: '#E8551E', borderRadius: 10, padding: 10, marginTop: 8 },
  noteT: { fontSize: 12, color: '#7c4a1e' },
  miniWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mini: { flexGrow: 1, flexBasis: '46%', minWidth: 140, borderWidth: 1, borderColor: '#f6c9b3', backgroundColor: '#fff9f6', borderRadius: 12, padding: 12 },
  miniK: { fontSize: 12, color: '#556072', fontWeight: '700' },
  miniV: { fontSize: 15, fontWeight: '900', color: '#111', marginTop: 2 },
  foot: { fontSize: 12, color: '#8b95a5', textAlign: 'center', marginTop: 16 },
});
