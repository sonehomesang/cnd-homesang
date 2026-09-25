import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTT } from '@/lib/i18n';

/** Side-by-side "before vs after" evidence gallery.
 * `before` = survey / quote-time photos · `after` = completion photos. */
export default function BeforeAfter({
  before,
  after,
}: {
  before: string[];
  after: string[];
}) {
  const tt = useTT();
  const [mode, setMode] = useState<'pair' | 'before' | 'after'>('pair');

  if (before.length === 0 && after.length === 0) return null;

  const rows = Math.max(before.length, after.length);
  const MODES: { key: typeof mode; label: string }[] = [
    { key: 'pair', label: tt('handover', 'ຄຽງ ຄູ່') },
    { key: 'before', label: `${tt('handover', 'ກ່ອນ')} (${before.length})` },
    { key: 'after', label: `${tt('handover', 'ຫຼັງ')} (${after.length})` },
  ];

  return (
    <View>
      <View style={styles.toggle}>
        {MODES.map((m) => (
          <Pressable key={m.key} style={[styles.tg, mode === m.key && styles.tgOn]} onPress={() => setMode(m.key)}>
            <Text style={[styles.tgText, mode === m.key && styles.tgTextOn]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'pair' ? (
        Array.from({ length: rows }).map((_, i) => (
          <View key={i} style={styles.pairRow}>
            <Cell uri={before[i]} tag={tt('handover', 'ກ່ອນ')} kind="b" />
            <Cell uri={after[i]} tag={tt('handover', 'ຫຼັງ')} kind="a" />
          </View>
        ))
      ) : (
        <View style={styles.grid}>
          {(mode === 'before' ? before : after).map((u) => (
            <Image key={u} source={{ uri: u }} style={styles.gridImg} />
          ))}
        </View>
      )}
    </View>
  );
}

function Cell({ uri, tag, kind }: { uri?: string; tag: string; kind: 'b' | 'a' }) {
  return (
    <View style={styles.cell}>
      {uri ? (
        <Image source={{ uri }} style={styles.cellImg} />
      ) : (
        <View style={[styles.cellImg, styles.empty]}>
          <Text style={styles.emptyText}>—</Text>
        </View>
      )}
      <View style={[styles.tagPill, kind === 'a' ? styles.tagA : styles.tagB]}>
        <Text style={styles.tagText}>{tag}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tg: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  tgOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  tgText: { fontSize: 12, fontWeight: '700', color: '#4b5563' },
  tgTextOn: { color: '#fff' },
  pairRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  cell: { flex: 1, position: 'relative' },
  cellImg: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#e5e7eb' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 20 },
  tagPill: { position: 'absolute', top: 6, left: 6, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  tagB: { backgroundColor: 'rgba(71,85,105,0.85)' },
  tagA: { backgroundColor: 'rgba(21,128,61,0.85)' },
  tagText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridImg: { width: 100, height: 100, borderRadius: 10, backgroundColor: '#e5e7eb' },
});
