import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTT } from '@/lib/i18n';
import {
  type Bid,
  type BidVersion,
  type QuoteItem,
  watchBid,
  watchBidVersions,
} from '@/lib/bids';
import BackButton from '@/components/BackButton';
import AppFooter from '@/components/AppFooter';

const kip = (n?: number) => (Number(n) || 0).toLocaleString('en-US');
const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

/** One quote version rendered as a card (works for both the live bid + archives). */
function VersionCard({ v, current, tt }: {
  v: { version?: number; items?: QuoteItem[]; subtotal?: number; discount?: number; vatRate?: number; vat?: number; total?: number; price?: number; note?: string; revisionNote?: string; revisedAt?: number; archivedAt?: number };
  current?: boolean;
  tt: (m: string, s: string) => string;
}) {
  const items = v.items ?? [];
  const total = v.total ?? v.price ?? 0;
  const when = v.revisedAt ?? v.archivedAt;
  return (
    <View style={[styles.card, current && styles.cardCur]}>
      <View style={styles.head}>
        <Text style={styles.vBadge}>v{v.version ?? 1}</Text>
        {current
          ? <Text style={styles.curTag}>{tt('quoteHistory', '● ປັດຈຸບັນ')}</Text>
          : <Text style={styles.archTag}>{tt('quoteHistory', 'ເກົ່າ')}</Text>}
        {!!when && <Text style={styles.date}>{day(when)}</Text>}
      </View>

      {!!v.revisionNote && (
        <View style={styles.askBox}>
          <Text style={styles.askText}>✏️ {tt('quoteHistory', 'ຄຳຂໍ:')} {v.revisionNote}</Text>
        </View>
      )}

      {items.length > 0 ? (
        <View style={styles.items}>
          {items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemDesc} numberOfLines={2}>{it.desc || '—'}</Text>
              <Text style={styles.itemQty}>{it.qty}×{kip(it.unitPrice)}</Text>
              <Text style={styles.itemLine}>{kip((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.flat}>{tt('quoteHistory', 'ລາຄາ ເໝົາ')}</Text>
      )}

      <View style={styles.foot}>
        {!!v.discount && v.discount > 0 && (
          <Text style={styles.footLine}>{tt('quoteHistory', 'ຫຼຸດ')}: −{kip(v.discount)}</Text>
        )}
        {!!v.vat && v.vat > 0 && (
          <Text style={styles.footLine}>VAT {v.vatRate ?? 0}%: {kip(v.vat)}</Text>
        )}
        <Text style={styles.total}>{tt('quoteHistory', 'ລວມ')}: {kip(total)} {tt('quoteHistory', 'ກີບ')}</Text>
      </View>
    </View>
  );
}

export default function QuoteHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tt = useTT();
  const [bid, setBid] = useState<Bid | null>(null);
  const [versions, setVersions] = useState<BidVersion[]>([]);

  useEffect(() => { if (id) return watchBid(id, setBid); }, [id]);
  useEffect(() => { if (id) return watchBidVersions(id, setVersions); }, [id]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🕑 {tt('quoteHistory', 'ປະຫວັດ ໃບສະເໜີ')}</Text>
      <Text style={styles.sub}>{tt('quoteHistory', 'ທຸກ ເວີຊັນ ທີ່ ຜ່ານ ການ ຕໍ່ລອງ / ແກ້ໄຂ')}</Text>

      {!bid && versions.length === 0 ? (
        <Text style={styles.empty}>{tt('quoteHistory', 'ກຳລັງ ໂຫຼດ...')}</Text>
      ) : (
        <>
          {bid && <VersionCard v={bid} current tt={tt} />}
          {versions.map((v) => <VersionCard key={v.version} v={v} tt={tt} />)}
          {versions.length === 0 && bid && (
            <Text style={styles.note}>{tt('quoteHistory', 'ຍັງ ບໍ່ ມີ ເວີຊັນ ເກົ່າ — ໃບ ນີ້ ຍັງ ບໍ່ ໄດ້ ຖືກ ແກ້ໄຂ')}</Text>
          )}
        </>
      )}

      <BackButton />
      <View style={styles.footerBleed}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 8, paddingBottom: 80, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: '#111', marginTop: 4 },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  empty: { textAlign: 'center', color: '#9ca3af', fontSize: 13, marginTop: 30 },
  note: { fontSize: 12, color: '#9ca3af', marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 14, padding: 14, marginBottom: 12 },
  cardCur: { borderColor: '#bae6fd', backgroundColor: '#f8fdff' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  vBadge: { fontSize: 13, fontWeight: '800', color: '#fff', backgroundColor: '#0066CC', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden' },
  curTag: { fontSize: 12, fontWeight: '800', color: '#065f46' },
  archTag: { fontSize: 12, fontWeight: '700', color: '#9ca3af' },
  date: { fontSize: 12, color: '#9ca3af', marginLeft: 'auto' },
  askBox: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, padding: 8, marginBottom: 8 },
  askText: { fontSize: 12, color: '#92400e' },
  items: { gap: 6, marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemDesc: { flex: 1, fontSize: 13, color: '#111' },
  itemQty: { fontSize: 12, color: '#6b7280' },
  itemLine: { fontSize: 13, fontWeight: '700', color: '#111', minWidth: 64, textAlign: 'right' },
  flat: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  foot: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, alignItems: 'flex-end' },
  footLine: { fontSize: 12, color: '#6b7280' },
  total: { fontSize: 15, fontWeight: '900', color: '#0066CC', marginTop: 2 },
  footerBleed: { width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -80 },
});
