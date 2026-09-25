import { StyleSheet, Text, View } from 'react-native';
import { useTT } from '@/lib/i18n';

// The app-wide "this is sample data" marker. Rendered next to any record that
// carries __mock: true (see lib/mock.ts). Dashed amber pill so it reads clearly
// as demo content, never mistaken for a real status tag.
export default function MockBadge({ small }: { small?: boolean }) {
  const tt = useTT();
  return (
    <View style={[styles.pill, small && styles.pillSm]}>
      <Text style={[styles.tx, small && styles.txSm]}>{tt('mock', '🧪 ຕົວຢ່າງ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', borderColor: '#f59e0b', borderWidth: 1, borderStyle: 'dashed', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  pillSm: { paddingVertical: 1, paddingHorizontal: 5, borderRadius: 5 },
  tx: { fontSize: 12, fontWeight: '800', color: '#b45309' },
  txSm: { fontSize: 12 },
});
