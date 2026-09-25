import { Text, View, StyleSheet } from 'react-native';
import { computeTechTier, NINESANG_BRAND, type TechTier } from '@/lib/ninesang';
import { useTT } from '@/lib/i18n';

/**
 * Compact craftsman credential badge — an official "verified" stamp + the auto
 * skill tier (+ optional rating). Namespace-agnostic (CND + HomeSang); pass the
 * already-computed stats. `brand` defaults to the CND service brand.
 */
export default function TechBadge({ verified, jobsDone = 0, ratingAvg = 0, showRating, brand = NINESANG_BRAND, compact }: {
  verified?: boolean; jobsDone?: number; ratingAvg?: number; showRating?: boolean; brand?: string; compact?: boolean;
}) {
  const tt = useTT();
  const tier: TechTier = computeTechTier(jobsDone, ratingAvg);
  return (
    <View style={styles.row}>
      {verified && (
        <View style={[styles.chip, { backgroundColor: '#e7f6ee', borderColor: '#bfe6cf' }]}>
          <Text style={[styles.chipTx, { color: '#1F9D57' }]} numberOfLines={1}>✅ {compact ? tt('cndCommon', 'ຢັ້ງຢືນ') : brand}</Text>
        </View>
      )}
      <View style={[styles.chip, { backgroundColor: tier.color + '1a', borderColor: tier.color + '55' }]}>
        <Text style={[styles.chipTx, { color: tier.color }]} numberOfLines={1}>{tier.icon} {compact ? tier.short : tt('cndCommon', tier.name)}</Text>
      </View>
      {showRating && ratingAvg > 0 && (
        <View style={[styles.chip, { backgroundColor: '#fff7d6', borderColor: '#f0e0a0' }]}>
          <Text style={[styles.chipTx, { color: '#8a6d00' }]}>★ {ratingAvg.toFixed(1)}{jobsDone ? ` · ${jobsDone} ${tt('cndCommon', 'ວຽກ')}` : ''}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 2 },
  chipTx: { fontSize: 12, fontWeight: '800' },
});
