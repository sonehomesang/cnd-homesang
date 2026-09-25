import { ScrollView, Pressable, StyleSheet, Text } from 'react-native';

export interface SortOption {
  key: string;
  label: string;
}

/**
 * A horizontal row of "sort" chips shared by the browse screens (find-tech /
 * shop / explore). The first option is the default ("ແນະນຳ" = keep the
 * admin freshness ranking); the rest re-order the list by one field. The
 * screens own the actual comparators — this is purely the selector UI.
 */
export default function SortBar({
  options,
  value,
  onChange,
}: {
  options: SortOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Text style={styles.lead}>↕</Text>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} style={[styles.chip, on && styles.chipOn]} onPress={() => onChange(o.key)}>
            <Text style={[styles.txt, on && styles.txtOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, alignItems: 'center', paddingVertical: 2 },
  lead: { fontSize: 13, color: '#94a3b8', fontWeight: '800', marginRight: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  chipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  txt: { fontSize: 12, color: '#475569', fontWeight: '700' },
  txtOn: { color: '#fff' },
});
