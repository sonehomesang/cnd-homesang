import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type Withdrawal, type WithdrawalStatus, setWithdrawalStatus, watchAllWithdrawals } from '@/lib/wallet';
import { adminCreditWallet, setTopupStatus, type WalletTopup, watchPendingTopups } from '@/lib/customerWallet';
import { type AdminUser, getDashboardMetrics, watchAllUsers } from '@/lib/admin';
import { ttStatic, useTT } from '@/lib/i18n';
import { groupThousands } from '@/lib/format';
import { usePaged } from './Paginator';

type Tab = 'pending' | 'completed' | 'rejected';

const STATUS: Record<WithdrawalStatus, { bg: string; fg: string; lao: string }> = {
  pending: { bg: '#fef3c7', fg: '#92400e', lao: ttStatic('admWallet', 'ລໍຖ້າ') },
  completed: { bg: '#dcfce7', fg: '#166534', lao: ttStatic('admWallet', 'ຈ່າຍແລ້ວ') },
  rejected: { bg: '#fee2e2', fg: '#991b1b', lao: ttStatic('admWallet', 'ປະຕິເສດ') },
};

function fmt(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
const money = (n: number) => `${(n ?? 0).toLocaleString()} ${ttStatic('common', 'ກີບ')}`;

export default function WalletPanel() {
  const tt = useTT();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [commission, setCommission] = useState(0);
  const [tab, setTab] = useState<Tab>('pending');

  const [pendingTopups, setPendingTopups] = useState<WalletTopup[]>([]);
  const [creditSearch, setCreditSearch] = useState('');
  const [creditUid, setCreditUid] = useState('');
  const [creditAmt, setCreditAmt] = useState('');

  useEffect(() => watchAllWithdrawals(setWithdrawals), []);
  useEffect(() => watchPendingTopups(setPendingTopups), []);
  useEffect(() => watchAllUsers(setUsers), []);
  useEffect(() => { getDashboardMetrics().then((m) => setCommission(m.commission)).catch(() => {}); }, []);

  const nameOf = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => { map[u.uid] = u.name || u.firstName || u.phone || u.uid; });
    return map;
  }, [users]);

  const paidOut = withdrawals.filter((w) => w.status === 'completed').reduce((s, w) => s + w.amount, 0);
  const pendingSum = withdrawals.filter((w) => w.status === 'pending').reduce((s, w) => s + w.amount, 0);

  const counts = {
    pending: withdrawals.filter((w) => w.status === 'pending').length,
    completed: withdrawals.filter((w) => w.status === 'completed').length,
    rejected: withdrawals.filter((w) => w.status === 'rejected').length,
  };
  const shown = withdrawals.filter((w) => w.status === tab);
  const pg = usePaged(shown, 12);

  const TABS: { v: Tab; l: string }[] = [
    { v: 'pending', l: `${tt('admWallet', 'ລໍຖ້າ')} (${counts.pending})` },
    { v: 'completed', l: `${tt('admWallet', 'ຈ່າຍແລ້ວ')} (${counts.completed})` },
    { v: 'rejected', l: `${tt('admWallet', 'ປະຕິເສດ')} (${counts.rejected})` },
  ];

  return (
    <View>
      <Text style={styles.title}>💰 {tt('admWallet','ກະເປົາ')} admin · {tt('admWallet','ການເງິນ')}</Text>
      <Text style={styles.sub}>{tt('admWallet','ຄອມມິຊັ່ນ ແພລດຟອມ + ອະນຸມັດ ການຖອນເງິນ ຂອງຊ່າງ')}</Text>

      <View style={styles.cwSec}>
        <Text style={styles.cwTitle}>💳 {tt('admWallet', 'ກະເປົາ ລູກຄ້າ — ຄຳ ຂໍ ເຕີມ ລໍ ກວດ')} ({pendingTopups.length})</Text>
        {pendingTopups.length === 0 ? (
          <Text style={styles.empty}>{tt('admWallet', 'ບໍ່ ມີ ຄຳ ຂໍ ເຕີມ')}</Text>
        ) : pendingTopups.map((t) => (
          <View key={t.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.who}>👤 {nameOf[t.uid] ?? t.uid}</Text>
              <Text style={styles.amount}>{money(t.amount)}</Text>
              {!!t.slipUrl && <Pressable onPress={() => { if (typeof window !== 'undefined') window.open(t.slipUrl, '_blank'); }}><Text style={styles.slipLink}>📎 {tt('admWallet', 'ເບິ່ງ ສະລິບ')}</Text></Pressable>}
            </View>
            <View style={styles.actions}>
              <Pressable style={[styles.mini, { backgroundColor: '#16a34a' }]} onPress={() => setTopupStatus(t.id, 'verified')}><Text style={styles.miniText}>✅ {tt('admWallet', 'ຢືນຢັນ')}</Text></Pressable>
              <Pressable style={[styles.mini, { backgroundColor: '#dc2626' }]} onPress={() => setTopupStatus(t.id, 'rejected')}><Text style={styles.miniText}>❌</Text></Pressable>
            </View>
          </View>
        ))}
        <Text style={[styles.cwTitle, { marginTop: 12 }]}>＋ {tt('admWallet', 'ເຕີມ ໃຫ້ ໂດຍ ຕົງ')}</Text>
        <TextInput style={styles.inp} placeholder={tt('admWallet', 'ຄົ້ນຫາ ລູກຄ້າ (ຊື່ / ເບີ)')} placeholderTextColor="#9ca3af" value={creditSearch} onChangeText={(v) => { setCreditSearch(v); setCreditUid(''); }} />
        {!creditUid && creditSearch.trim().length > 0 && users
          .filter((u) => (u.name || u.firstName || u.phone || '').toLowerCase().includes(creditSearch.toLowerCase()))
          .slice(0, 5)
          .map((u) => (
            <Pressable key={u.uid} style={styles.match} onPress={() => { setCreditUid(u.uid); setCreditSearch(u.name || u.phone || u.uid); }}>
              <Text style={styles.matchText}>👤 {u.name || u.firstName || u.phone || u.uid}</Text>
            </Pressable>
          ))}
        <TextInput style={styles.inp} placeholder={tt('admWallet', 'ຈຳນວນ (ກີບ)')} placeholderTextColor="#9ca3af" keyboardType="numeric" value={groupThousands(creditAmt)} onChangeText={(v) => setCreditAmt(v.replace(/[^\d]/g, ''))} />
        <Pressable
          style={[styles.creditBtn, (!creditUid || !creditAmt) && { opacity: 0.5 }]}
          disabled={!creditUid || !creditAmt}
          onPress={async () => {
            try { await adminCreditWallet(creditUid, Number(creditAmt)); setCreditUid(''); setCreditAmt(''); setCreditSearch(''); } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
          }}>
          <Text style={styles.creditBtnText}>💳 {tt('admWallet', 'ເຕີມ ໃຫ້ ເລີຍ')}</Text>
        </Pressable>
      </View>

      <View style={styles.cards}>
        <View style={styles.card}><Text style={styles.cLabel}>{tt('admWallet','ຄອມມິຊັ່ນ ສະສົມ (10%)')}</Text><Text style={styles.cVal}>{money(commission)}</Text></View>
        <View style={styles.card}><Text style={styles.cLabel}>{tt('admWallet','ຈ່າຍຖອນແລ້ວ')}</Text><Text style={styles.cVal}>{money(paidOut)}</Text></View>
        <View style={styles.card}><Text style={styles.cLabel}>{tt('admWallet','ລໍຖ້າ ຈ່າຍ')}</Text><Text style={[styles.cVal, { color: '#b45309' }]}>{money(pendingSum)}</Text></View>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.v} onPress={() => setTab(t.v)} style={styles.tab}>
            <Text style={[styles.tabText, tab === t.v && styles.tabOn]}>{t.l}</Text>
            {tab === t.v && <View style={styles.bar} />}
          </Pressable>
        ))}
      </View>

      {pg.items.map((w) => {
        const s = STATUS[w.status];
        return (
          <View key={w.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.who}>👤 {nameOf[w.uid] ?? w.uid}</Text>
              <Text style={styles.amount}>{money(w.amount)}</Text>
              {!!w.bankInfo && <Text style={styles.bank}>🏦 {w.bankInfo}</Text>}
              <Text style={styles.date}>{fmt(w.createdAt)}</Text>
            </View>
            <View style={styles.right}>
              <View style={[styles.badge, { backgroundColor: s.bg }]}><Text style={[styles.badgeText, { color: s.fg }]}>{tt('admWallet', s.lao)}</Text></View>
              {w.status === 'pending' && (
                <View style={styles.actions}>
                  <Pressable style={[styles.mini, { backgroundColor: '#16a34a' }]} onPress={() => setWithdrawalStatus(w.id, 'completed')}><Text style={styles.miniText}>✅ {tt('admWallet','ຈ່າຍແລ້ວ')}</Text></Pressable>
                  <Pressable style={[styles.mini, { backgroundColor: '#dc2626' }]} onPress={() => setWithdrawalStatus(w.id, 'rejected')}><Text style={styles.miniText}>❌ {tt('admWallet','ປະຕິເສດ')}</Text></Pressable>
                </View>
              )}
            </View>
          </View>
        );
      })}
      {shown.length === 0 && <Text style={styles.empty}>{tt('admWallet','ບໍ່ມີ ລາຍການ')}</Text>}
      {pg.bar}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  card: { flex: 1, minWidth: 150, backgroundColor: '#f8fafc', borderRadius: 10, padding: 12 },
  cLabel: { fontSize: 12, color: '#6b7280' },
  cVal: { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 2, borderBottomColor: '#f0f0f0', marginBottom: 12 },
  tab: { paddingHorizontal: 12, paddingVertical: 8 },
  tabText: { fontSize: 12, color: '#6b7280' },
  tabOn: { color: '#0066CC', fontWeight: '700' },
  bar: { height: 2, backgroundColor: '#0066CC', marginTop: 6, marginHorizontal: -12, marginBottom: -10 },
  row: { flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 6 },
  who: { fontSize: 14, fontWeight: '600', color: '#111' },
  amount: { fontSize: 15, fontWeight: '700', color: '#0066CC', marginTop: 2 },
  bank: { fontSize: 12, color: '#4b5563', marginTop: 2 },
  date: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 6 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  actions: { gap: 4, alignItems: 'flex-end' },
  mini: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  miniText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', padding: 24 },
  cwSec: { backgroundColor: '#f0f7ff', borderWidth: 1, borderColor: '#cfe0f5', borderRadius: 12, padding: 12, marginBottom: 14 },
  cwTitle: { fontSize: 13, fontWeight: '800', color: '#0c4a6e', marginBottom: 8 },
  slipLink: { fontSize: 12, color: '#0066CC', fontWeight: '700', marginTop: 2 },
  inp: { borderWidth: 1, borderColor: '#cfe0f5', borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, marginTop: 6 },
  match: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 9, marginTop: 4 },
  matchText: { fontSize: 13, color: '#111', fontWeight: '600' },
  creditBtn: { backgroundColor: '#0066CC', borderRadius: 8, alignItems: 'center', paddingVertical: 11, marginTop: 8 },
  creditBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
