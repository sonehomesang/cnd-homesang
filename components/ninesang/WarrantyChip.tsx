import { Text, View, StyleSheet } from 'react-native';
import { formatWarrantyDays } from '@/lib/ninesang';
import { useTT } from '@/lib/i18n';

/** "🛡️ ຮັບປະກັນ N ວັນ/ເດືອນ/ປີ" — shared (CND + HomeSang). Renders nothing if 0. */
export default function WarrantyChip({ days, small }: { days?: number; small?: boolean }) {
  const tt = useTT();
  if (!days || days <= 0) return null;
  return (
    <View style={[styles.chip, small && styles.chipSm]}>
      <Text style={[styles.tx, small && styles.txSm]}>🛡️ {tt('cndCommon', 'ຮັບປະກັນ')} {formatWarrantyDays(days)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', backgroundColor: '#e7eefc', borderWidth: 1, borderColor: '#c5d6f5', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  chipSm: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tx: { fontSize: 12, fontWeight: '800', color: '#0E7490' },
  txSm: { fontSize: 12 },
});
