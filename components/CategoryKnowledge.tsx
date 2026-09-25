import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius } from '@/lib/theme';
import { useTT } from '@/lib/i18n';
import type { AssetCategory } from '@/lib/siteConfig';

/**
 * Per-category knowledge viewer (Phase 3B): spare parts + reference prices,
 * service rates, and a troubleshooting guide (symptom → cause → fix + ballpark).
 * Reused from an asset in the Dossier and (later) the report/estimate flow.
 */
export default function CategoryKnowledge({ category, onReport }: { category: AssetCategory; onReport?: (symptom: string, est?: string) => void }) {
  const tt = useTT();
  const [tab, setTab] = useState<'parts' | 'rates' | 'trouble'>('parts');
  const parts = category.spareParts ?? [];
  const rates = category.serviceRates ?? [];
  const trouble = category.troubleshooting ?? [];

  const TabBtn = ({ k, label }: { k: typeof tab; label: string }) => (
    <Pressable style={[styles.tab, tab === k && styles.tabOn]} onPress={() => setTab(k)}>
      <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        <TabBtn k="parts" label={`${tt('catKnowledge', '🔧 ອາໄລ່')} (${parts.length})`} />
        <TabBtn k="rates" label={`${tt('catKnowledge', '💵 ຄ່າ ບໍລິການ')} (${rates.length})`} />
        <TabBtn k="trouble" label={`${tt('catKnowledge', '🩺 ແກ້ ບັນຫາ')} (${trouble.length})`} />
      </View>

      {tab === 'parts' && (
        parts.length === 0 ? <Text style={styles.empty}>{tt('catKnowledge', 'ຍັງ ບໍ່ ໄດ້ ຕັ້ງ ອາໄລ່')}</Text> :
        parts.map((p) => (
          <View key={p.key} style={styles.row}>
            <Text style={styles.k}>{p.name}</Text>
            <Text style={styles.v}>{typeof p.price === 'number' ? `${p.price.toLocaleString()} ${tt('catKnowledge', 'ກີບ')}` : '—'}</Text>
          </View>
        ))
      )}

      {tab === 'rates' && (
        rates.length === 0 ? <Text style={styles.empty}>{tt('catKnowledge', 'ຍັງ ບໍ່ ໄດ້ ຕັ້ງ ອັດຕາ ຄ່າ ບໍລິການ')}</Text> :
        rates.map((r) => (
          <View key={r.key} style={styles.row}>
            <Text style={styles.k}>{r.label}</Text>
            <Text style={styles.v}>{typeof r.price === 'number' ? `${r.price.toLocaleString()} ${tt('catKnowledge', 'ກີບ')}` : '—'}</Text>
          </View>
        ))
      )}

      {tab === 'trouble' && (
        trouble.length === 0 ? <Text style={styles.empty}>{tt('catKnowledge', 'ຍັງ ບໍ່ ໄດ້ ຕັ້ງ ຂໍ້ມູນ ແກ້ ບັນຫາ')}</Text> :
        trouble.map((t) => (
          <View key={t.key} style={styles.ts}>
            <Text style={styles.tsq}>❓ {t.symptom}</Text>
            {!!t.cause && <Text style={styles.tsc}>{tt('catKnowledge', '🔍 ສາເຫດ:')} {t.cause}</Text>}
            {!!t.fix && <Text style={styles.tsc}>{tt('catKnowledge', '🛠️ ວິທີ:')} {t.fix}</Text>}
            {!!t.est && <Text style={styles.est}>{tt('catKnowledge', '💵 ຄາດ ຄ່າ:')} {t.est}</Text>}
            {onReport && (
              <Pressable style={styles.reportBtn} onPress={() => onReport(t.symptom, t.est)}>
                <Text style={styles.reportText}>{tt('catKnowledge', '📣 ແຈ້ງ ສ້ອມ ອາການ ນີ້')}</Text>
              </Pressable>
            )}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#eef2ff' },
  tabOn: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: '#3730a3' },
  tabTextOn: { color: colors.white },
  empty: { fontSize: font.xs, color: colors.text2, paddingVertical: 10, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 10 },
  k: { fontSize: font.sm, color: colors.text, fontWeight: '600', flexShrink: 1 },
  v: { fontSize: font.sm, color: '#0a7d33', fontWeight: '800' },
  ts: { borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', borderRadius: radius.md, padding: 10, marginTop: 6 },
  tsq: { fontSize: font.sm, fontWeight: '800', color: '#92400e' },
  tsc: { fontSize: font.xs, color: '#334155', marginTop: 3 },
  est: { fontSize: font.xs, fontWeight: '800', color: '#065f46', marginTop: 4, backgroundColor: '#ecfdf5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  reportBtn: { marginTop: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 8, alignItems: 'center' },
  reportText: { color: colors.white, fontWeight: '700', fontSize: 12 },
});
