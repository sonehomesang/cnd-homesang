import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getDashboardMetrics, type CatStat, type DashboardMetrics, type MonthPoint } from '@/lib/admin';
import { ttStatic, useTT } from '@/lib/i18n';

// Nav-group labels the tiles jump into (admin section + its nav group).
const G_MANAGE = 'ຈັດການ', G_FIN = 'ການເງິນ';

const money = (n?: number) => `${(n ?? 0).toLocaleString()} ${ttStatic('common', 'ກີບ')}`;
const num = (n?: number) => (n === undefined ? '—' : n.toLocaleString());
const fmtM = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : `${Math.round(n)}`);

// tinted card palette — light background + matching border + strong number
const TINT: Record<string, { bg: string; border: string; fg: string }> = {
  blue: { bg: '#eef4fc', border: '#cbe0f7', fg: '#0066CC' },
  green: { bg: '#edf9f0', border: '#c4ebd1', fg: '#16a34a' },
  purple: { bg: '#f5effc', border: '#e0cff5', fg: '#7c3aed' },
  cyan: { bg: '#e9f7fa', border: '#c2e8f0', fg: '#0891b2' },
  amber: { bg: '#fef6e7', border: '#f6e0b0', fg: '#d97706' },
  sky: { bg: '#e9f6fd', border: '#c2e4f7', fg: '#0ea5e9' },
  red: { bg: '#fdeded', border: '#f5c9c9', fg: '#dc2626' },
  orange: { bg: '#fef1e8', border: '#f8d3ba', fg: '#ea580c' },
  gray: { bg: '#f4f5f7', border: '#e0e3e8', fg: '#4b5563' },
};
const DOTS = ['#f59e0b', '#0066CC', '#0891b2', '#7c3aed', '#16a34a', '#ea580c', '#9ca3af'];

export default function DashboardPanel({ onNavigate }: { onNavigate?: (section: string, group: string) => void }) {
  const [m, setM] = useState<DashboardMetrics | null>(null);
  const tt = useTT();
  useEffect(() => { getDashboardMetrics().then(setM).catch((e) => console.error('metrics:', e)); }, []);

  const go = (section: string, group: string) => (onNavigate ? () => onNavigate(section, group) : undefined);
  const users = go('users', G_MANAGE);
  const jobsNav = go('jobs', G_MANAGE);
  const catalog = go('catalog', G_MANAGE);
  const finance = go('finance', G_FIN);
  const disputes = go('disputes', G_MANAGE);

  const os = m?.ordersByStatus ?? {};
  const ordersNew = os.pending ?? 0;
  const ordersDelivering = (os.confirmed ?? 0) + (os.delivering ?? 0);
  const ordersDone = (os.completed ?? 0) + (os.delivered ?? 0);

  return (
    <View>
      <Text style={styles.title}>📊 Dashboard</Text>
      <Text style={styles.sub}>{tt('admDashboard', 'ສະຖິຕິລວມ · ກົດ ຕົວເລກ/ແຖວ ເພື່ອ ເບິ່ງ ລາຍລະອຽດ')}</Text>

      {/* users */}
      <Text style={styles.section}>👪 {tt('admDashboard', 'ຜູ້ໃຊ້ງານ')}</Text>
      <View style={styles.grid}>
        <Card tone="blue" value={num(m?.totalUsers)} label={tt('admDashboard', 'ຜູ້ໃຊ້ ທັງໝົດ')} onPress={users} />
        <Card tone="green" value={num(m?.usersTechRider)} label={tt('admDashboard', 'ຊ່າງ + ໄຣເດີ້')} onPress={users} />
        <Card tone="purple" value={num(m?.usersCorporate)} label={tt('admDashboard', 'ບໍລິສັດ / ຮ້ານ')} onPress={users} />
      </View>
      <Text style={styles.hint}>+ {tt('admDashboard', 'ໃໝ່ 30 ມື້')}: {num(m?.newUsers30d)} {tt('admDashboard', 'ຄົນ')}</Text>

      {/* products */}
      <Text style={styles.section}>🛍️ {tt('admDashboard', 'ສິນຄ້າ')}</Text>
      <View style={styles.grid}>
        <Card sm tone="cyan" value={num(m?.totalProducts)} label={tt('admDashboard', 'ສິນຄ້າ ທັງໝົດ')} onPress={catalog} />
        <Card sm tone="green" value={num(m?.productsSold)} label={tt('admDashboard', 'ຂາຍໄດ້ (ຫົວໜ່ວຍ)')} onPress={catalog} />
      </View>
      <Text style={styles.hint}>{tt('admDashboard', 'ແບ່ງຕາມ ປະເພດ · (ຈຳນວນ · ຍອດຂາຍ)')}</Text>
      <Breakdown rows={m?.productsByCategory} showSales onPress={catalog} />

      {/* jobs */}
      <Text style={styles.section}>🛠️ {tt('admDashboard', 'ວຽກ · Jobs')} ({Math.round((m?.completionRate ?? 0) * 100)}%)</Text>
      <View style={styles.grid}>
        <Card sm tone="amber" value={num(m?.openJobs)} label={tt('admDashboard', 'ຍັງເປີດ')} onPress={jobsNav} />
        <Card sm tone="sky" value={num(m?.inProgressJobs)} label={tt('admDashboard', 'ກຳລັງດຳເນີນ')} onPress={jobsNav} />
        <Card sm tone="green" value={num(m?.completedJobs)} label={tt('admDashboard', 'ສຳເລັດ')} onPress={jobsNav} />
      </View>
      <Text style={styles.hint}>{tt('admDashboard', 'ແບ່ງຕາມ ປະເພດ')}</Text>
      <Breakdown rows={m?.jobsByCategory} onPress={jobsNav} />

      {/* orders */}
      <Text style={styles.section}>📦 {tt('admDashboard', 'ອໍເດີ')}</Text>
      <View style={styles.grid}>
        <Card sm tone="amber" value={num(ordersNew)} label={tt('admDashboard', 'ໃໝ່ / ລໍ')} onPress={catalog} />
        <Card sm tone="purple" value={num(ordersDelivering)} label={tt('admDashboard', 'ກຳລັງສົ່ງ')} onPress={catalog} />
        <Card sm tone="green" value={num(ordersDone)} label={tt('admDashboard', 'ສຳເລັດ')} onPress={catalog} />
      </View>

      {/* finance overview */}
      <Text style={styles.section}>💰 {tt('admDashboard', 'ພາບລວມ ການເງິນ')}</Text>
      <View style={styles.finCard}>
        <Pressable onPress={finance}>
          <Text style={styles.finTotL}>{tt('admDashboard', 'ມູນຄ່າ ໝູນວຽນ ລວມ · GMV')}</Text>
          <Text style={styles.finTotV}>{money(m?.gmvTotal)}</Text>
        </Pressable>
        <LineChart months={m?.monthly} />
        <View style={styles.chartLeg}>
          <View style={styles.clItem}><View style={[styles.clBar, { backgroundColor: '#16a34a' }]} /><Text style={styles.clText}>{tt('admDashboard', 'ລາຍຮັບ')}</Text></View>
          <View style={styles.clItem}><View style={[styles.clBar, { backgroundColor: '#dc2626' }]} /><Text style={styles.clText}>{tt('admDashboard', 'ຈ່າຍອອກ')}</Text></View>
        </View>

        <View style={styles.finGrid}>
          <FinBox title={`🟢 ${tt('admDashboard', 'ລາຍຮັບ')}`} tone="#16a34a" onPress={finance}
            lines={[[tt('admDashboard', 'ຄອມ ງານ'), m?.income.jobCommission], [tt('admDashboard', 'ຄອມ ອໍເດີ'), m?.income.orderCommission], [tt('admDashboard', 'ຄ່າ VA'), m?.income.vaFees]]}
            sum={m?.income.total} />
          <FinBox title={`🔴 ${tt('admDashboard', 'ລາຍຈ່າຍ')}`} tone="#dc2626" onPress={finance}
            lines={[[tt('admDashboard', 'ຄອມ broker'), m?.expense.broker], [tt('admDashboard', 'referral'), m?.expense.referral], [tt('admDashboard', 'loyalty ໃຊ້'), m?.expense.loyalty]]}
            sum={m?.expense.total} />
          <FinBox title={`📥 ${tt('admDashboard', 'ໜີ້ ຄ້າງຮັບ')}`} tone="#0891b2" onPress={finance}
            lines={[[tt('admDashboard', 'COD ໄຣເດີ້ຖື'), m?.receivable.codHeld], [tt('admDashboard', 'ລໍ verify ໂອນ'), m?.receivable.pendingVerify]]}
            sum={m?.receivable.total} />
          <FinBox title={`📤 ${tt('admDashboard', 'ໜີ້ ຄ້າງຈ່າຍ')}`} tone="#ea580c" onPress={finance}
            lines={[[tt('admDashboard', 'ລໍ ຖອນ'), m?.payable.pendingWithdraw], [tt('admDashboard', 'tip ລໍ ຢືນຢັນ'), m?.payable.unconfirmedTips]]}
            sum={m?.payable.total} />
        </View>

        <View style={styles.track}>
          <Text style={styles.trackHd}>⚠️ {tt('admDashboard', 'ລາຍການ ຕ້ອງ ຕິດຕາມ')}</Text>
          <TrackRow label={`⏳ ${tt('admDashboard', 'ອໍເດີ ລໍ verify ຈ່າຍ')}`} n={m?.track.pendingVerify} onPress={finance} />
          <TrackRow label={`💵 ${tt('admDashboard', 'COD ລໍ ໄຣເດີ້ ນຳສົ່ງ')}`} n={m?.track.codToRemit} onPress={finance} />
          <TrackRow label={`💰 ${tt('admDashboard', 'ຄຳຮ້ອງ ຖອນເງິນ ລໍ ອະນຸມັດ')}`} n={m?.track.pendingWithdraw} onPress={finance} />
          <TrackRow label={`⚖️ ${tt('admDashboard', 'ຂໍ້ຂັດແຍ່ງ / ຄືນເງິນ')}`} n={m?.track.disputes} onPress={disputes} />
        </View>
      </View>

      {/* content / system */}
      <Text style={styles.section}>📚 {tt('admDashboard', 'ເນື້ອຫາ & ລະບົບ')}</Text>
      <View style={styles.grid}>
        <Card sm tone="orange" value={num(m?.content.banners)} label={`📣 ${tt('admDashboard', 'ປ້າຍ')}`} onPress={catalog} />
        <Card sm tone="cyan" value={num(m?.content.learn)} label={`📖 ${tt('admDashboard', 'ຄວາມຮູ້')}`} onPress={catalog} />
        <Card sm tone="red" value={num(m?.content.reels)} label={`🎬 ${tt('admDashboard', 'ວິດີໂອ')}`} onPress={catalog} />
        <Card sm tone="purple" value={num(m?.content.posts)} label={`📝 ${tt('admDashboard', 'ໂພສ')}`} onPress={catalog} />
      </View>
      <Text style={styles.hint}>
        + {tt('admDashboard', 'ໝວດໝູ່')} {num(m?.content.categories)} · {tt('admDashboard', 'ຮ້ານ')} {num(m?.content.shops)} · {tt('admDashboard', 'ຣີວິວ')} {num(m?.content.reviews)}
      </Text>
    </View>
  );
}

function Card({ tone, value, label, onPress, sm }: { tone: string; value: string; label: string; onPress?: () => void; sm?: boolean }) {
  const t = TINT[tone] ?? TINT.gray;
  return (
    <Pressable style={[styles.card, { backgroundColor: t.bg, borderColor: t.border }]} onPress={onPress} disabled={!onPress}>
      <Text style={[styles.cardV, sm && styles.cardVSm, { color: t.fg }]}>{value}</Text>
      <Text style={styles.cardL} numberOfLines={1}>{label}</Text>
      {!!onPress && <Text style={[styles.cardArrow, { color: t.fg }]}>↗</Text>}
    </Pressable>
  );
}

function Breakdown({ rows, showSales, onPress }: { rows?: CatStat[]; showSales?: boolean; onPress?: () => void }) {
  if (!rows) return <Text style={styles.loading}>...</Text>;
  if (rows.length === 0) return <Text style={styles.loading}>{ttStatic('admDashboard', 'ບໍ່ມີ ຂໍ້ມູນ')}</Text>;
  return (
    <View style={styles.panel}>
      {rows.map((r, i) => (
        <Pressable key={r.key + i} style={[styles.brow, i === 0 && styles.browFirst]} onPress={onPress} disabled={!onPress}>
          <View style={[styles.bdot, { backgroundColor: DOTS[i % DOTS.length] }]} />
          <Text style={styles.blab} numberOfLines={1}>{r.key}</Text>
          <Text style={styles.bcount}>{r.count}</Text>
          {showSales && <Text style={styles.bsales}>{fmtM(r.sales ?? 0)} ₭</Text>}
          {!!onPress && <Text style={styles.chev}>›</Text>}
        </Pressable>
      ))}
    </View>
  );
}

function FinBox({ title, tone, lines, sum, onPress }: { title: string; tone: string; lines: [string, number | undefined][]; sum?: number; onPress?: () => void }) {
  return (
    <Pressable style={styles.finBox} onPress={onPress} disabled={!onPress}>
      <Text style={[styles.fbTitle, { color: tone }]}>{title}</Text>
      {lines.map(([l, v]) => (
        <View key={l} style={styles.fbLine}><Text style={styles.fbL}>{l}</Text><Text style={styles.fbV}>{(v ?? 0).toLocaleString()}</Text></View>
      ))}
      <View style={styles.fbSum}><Text style={[styles.fbSumT, { color: tone }]}>{ttStatic('admDashboard', 'ລວມ')}</Text><Text style={[styles.fbSumT, { color: tone }]}>{(sum ?? 0).toLocaleString()} ₭</Text></View>
    </Pressable>
  );
}

function TrackRow({ label, n, onPress }: { label: string; n?: number; onPress?: () => void }) {
  return (
    <Pressable style={styles.trow} onPress={onPress} disabled={!onPress}>
      <Text style={styles.trowL}>{label}</Text>
      <Text style={styles.badge}>{n ?? 0} ›</Text>
    </Pressable>
  );
}

// Monthly income vs expense — a 2-line SVG chart (web). Native falls back to the
// numeric boxes below, so no data is lost off-web.
function LineChart({ months }: { months?: MonthPoint[] }) {
  if (Platform.OS !== 'web' || !months || months.length < 2) return null;
  const W = 320, H = 120, pad = 12;
  const maxV = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  const px = (i: number) => pad + (i / (months.length - 1)) * (W - pad * 2);
  const py = (v: number) => H - pad - (v / maxV) * (H - pad * 2 - 6);
  const pts = (k: 'income' | 'expense') => months.map((m, i) => `${px(i).toFixed(1)},${py(m[k]).toFixed(1)}`).join(' ');
  const dots = months.map((m, i) => `<circle cx="${px(i).toFixed(1)}" cy="${py(m.income).toFixed(1)}" r="3" fill="#16a34a"/>`).join('');
  const labels = months.map((m, i) => `<text x="${px(i).toFixed(1)}" y="${H - 1}" font-size="8" fill="#9ca3af" text-anchor="middle">${m.label}</text>`).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" style="overflow:visible">
    <line x1="0" y1="${H - pad}" x2="${W}" y2="${H - pad}" stroke="#eef0f3"/>
    <polyline fill="none" stroke="#dc2626" stroke-width="2.5" stroke-dasharray="4 3" points="${pts('expense')}"/>
    <polyline fill="none" stroke="#16a34a" stroke-width="2.5" points="${pts('income')}"/>
    ${dots}${labels}
  </svg>`;
  return <div style={{ width: '100%', marginTop: 6 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 6 },
  section: { fontSize: 13, fontWeight: '800', color: '#0066CC', marginTop: 20, marginBottom: 10 },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 6, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { flexGrow: 1, flexBasis: '28%', minWidth: 96, borderWidth: 1, borderRadius: 11, padding: 11 },
  cardV: { fontSize: 15, fontWeight: '900' },
  cardVSm: { fontSize: 15 },
  cardL: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cardArrow: { position: 'absolute', top: 8, right: 9, fontSize: 12, fontWeight: '700', opacity: 0.55 },
  panel: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, paddingHorizontal: 12 },
  brow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  browFirst: { borderTopWidth: 0 },
  bdot: { width: 9, height: 9, borderRadius: 3 },
  blab: { flex: 1, fontSize: 13, color: '#374151' },
  bcount: { fontSize: 13, fontWeight: '800', color: '#111' },
  bsales: { fontSize: 12, color: '#16a34a', fontWeight: '700', width: 84, textAlign: 'right' },
  chev: { fontSize: 15, color: '#c9d2de' },
  // finance
  finCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 14, padding: 14 },
  finTotL: { fontSize: 12, color: '#6b7280', textAlign: 'center' },
  finTotV: { fontSize: 15, fontWeight: '900', color: '#0066CC', textAlign: 'center', marginTop: 2 },
  chartLeg: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 4 },
  clItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clBar: { width: 14, height: 3, borderRadius: 2 },
  clText: { fontSize: 12, color: '#6b7280' },
  finGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  finBox: { flexGrow: 1, flexBasis: '46%', minWidth: 150, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10 },
  fbTitle: { fontSize: 12, fontWeight: '800', marginBottom: 6 },
  fbLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  fbL: { fontSize: 12, color: '#6b7280' },
  fbV: { fontSize: 12, color: '#111', fontWeight: '700' },
  fbSum: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 5, paddingTop: 5 },
  fbSumT: { fontSize: 13, fontWeight: '800' },
  track: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 10, marginTop: 10 },
  trackHd: { fontSize: 12, fontWeight: '800', color: '#92400e', marginBottom: 4 },
  trow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  trowL: { fontSize: 12, color: '#92400e', flex: 1 },
  badge: { fontSize: 12, fontWeight: '800', color: '#fff', backgroundColor: '#f59e0b', paddingHorizontal: 8, paddingVertical: 1, borderRadius: 9, overflow: 'hidden' },
  loading: { fontSize: 12, color: '#9ca3af', padding: 8 },
});
