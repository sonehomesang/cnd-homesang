import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type Bid, type BidStatus, watchAllBids } from '@/lib/bids';
import { ttStatic, useTT } from '@/lib/i18n';
import { usePaged } from './Paginator';

const STATUS_LABEL: Record<BidStatus, string> = {
  pending: ttStatic('bidStatus', 'ລໍຕອບ'),
  accepted: ttStatic('bidStatus', '✓ ຖືກເລືອກ'),
  rejected: ttStatic('bidStatus', 'ບໍ່ຖືກເລືອກ'),
  withdrawn: ttStatic('bidStatus', 'ຖອນແລ້ວ'),
};

type Tab = '' | 'pending' | 'accepted';

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit' });
}

export default function QuotationsPanel() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [tab, setTab] = useState<Tab>('');
  const tt = useTT();

  useEffect(() => watchAllBids(setBids), []);

  const pending = bids.filter((b) => b.status === 'pending');
  const accepted = bids.filter((b) => b.status === 'accepted');
  const shown = tab === '' ? bids : tab === 'pending' ? pending : accepted;
  const pg = usePaged(shown, 10);
  const TABS: { v: Tab; l: string }[] = [
    { v: '', l: `${tt('admQuotations','ທັງໝົດ')} (${bids.length})` },
    { v: 'pending', l: `${tt('admQuotations','ລໍຕອບ')} (${pending.length})` },
    { v: 'accepted', l: `${tt('admQuotations','ຖືກເລືອກ')} (${accepted.length})` },
  ];

  return (
    <View>
      <Text style={styles.title}>{tt('admQuotations','📝 ໃບສະເໜີລາຄາ · Quotations')}</Text>
      <Text style={styles.sub}>{tt('admQuotations','ໃບສະເໜີ / bid ທັງໝົດ ຈາກ ຊ່າງ ໃນ ທຸກ ງານ')}</Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.v} onPress={() => setTab(t.v)} style={styles.tab}>
            <Text style={[styles.tabText, tab === t.v && styles.tabOn]}>{t.l}</Text>
          </Pressable>
        ))}
      </View>

      {shown.length === 0 ? (
        <Text style={styles.empty}>{tt('admQuotations','ບໍ່ມີ ໃບສະເໜີ')}</Text>
      ) : (
        pg.items.map((b) => (
          <View key={b.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.tech} numberOfLines={1}>👷 {b.technicianName ?? tt('admQuotations','ຊ່າງ')}</Text>
              <Text style={styles.price}>{(b.price ?? 0).toLocaleString()} {tt('admQuotations','ກີບ')}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.meta}>
                {b.items?.length ? `${b.items.length} ${tt('admQuotations','ລາຍການ')} · ` : ''}{shortDate(b.createdAt)}
              </Text>
              <Text style={[styles.status, b.status === 'accepted' ? styles.sOk : b.status === 'rejected' || b.status === 'withdrawn' ? styles.sNo : styles.sWait]}>
                {tt('bidStatus', STATUS_LABEL[b.status])}
              </Text>
            </View>
            <Pressable onPress={() => router.push(`/jobs/${b.jobId}` as any)}>
              <Text style={styles.jobLink}>{tt('admQuotations','🛠️ ເບິ່ງ ງານ ›')}</Text>
            </Pressable>
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
  tabs: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  tab: { paddingVertical: 6 },
  tabText: { fontSize: 12, color: '#6b7280' },
  tabOn: { color: '#0066CC', fontWeight: '700' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  tech: { fontSize: 14, fontWeight: '700', color: '#111', flex: 1 },
  price: { fontSize: 14, fontWeight: '700', color: '#0066CC' },
  meta: { fontSize: 12, color: '#6b7280' },
  status: { fontSize: 12, fontWeight: '700', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden' },
  sWait: { color: '#92400e', backgroundColor: '#fde68a' },
  sOk: { color: '#065f46', backgroundColor: '#a7f3d0' },
  sNo: { color: '#991b1b', backgroundColor: '#fecaca' },
  jobLink: { fontSize: 12, color: '#0066CC', marginTop: 6 },
});
