import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type ClipTopic, type LearnClip, watchLearnClips } from '@/lib/learnClips';
import ClipCard from '@/components/ClipCard';
import { useTT } from '@/lib/i18n';

/** Home "Knowledge & Safety" section — horizontal clip row with a topic filter. */
export default function LearnShowcase() {
  const tt = useTT();
  const [clips, setClips] = useState<LearnClip[]>([]);
  const [filter, setFilter] = useState<'all' | ClipTopic>('all');
  useEffect(() => watchLearnClips(setClips), []);

  if (clips.length === 0) return null;
  const shown = (filter === 'all' ? clips : clips.filter((c) => c.topic === filter)).slice(0, 10);

  const FILTERS: { key: 'all' | ClipTopic; label: string }[] = [
    { key: 'all', label: tt('learn', 'ທັງໝົດ') },
    { key: 'trade', label: tt('learn', '🔧 ທັກສະຊ່າງ') },
    { key: 'safety', label: tt('learn', '🦺 ຄວາມປອດໄພ') },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>{tt('learn', '📚 ຄວາມຮູ້ & ຄວາມປອດໄພ')}</Text>
        <Pressable onPress={() => router.push('/safety' as any)}>
          <Text style={styles.more}>{tt('learn', 'ທັງໝົດ →')}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <Pressable key={f.key} style={[styles.fchip, on && styles.fchipOn]} onPress={() => setFilter(f.key)}>
              <Text style={[styles.fchipT, on && styles.fchipTOn]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {shown.length === 0 ? (
        <Text style={styles.empty}>{tt('learn', 'ຍັງບໍ່ມີ ຄລິບ ໃນໝວດນີ້')}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {shown.map((c) => <ClipCard key={c.id} clip={c} width={190} />)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  more: { fontSize: 12, color: '#0066CC', fontWeight: '700' },
  filters: { gap: 6, paddingBottom: 10 },
  fchip: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  fchipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  fchipT: { fontSize: 12, color: '#475569' },
  fchipTOn: { color: '#fff', fontWeight: '700' },
  row: { gap: 10, paddingBottom: 4, paddingRight: 8 },
  empty: { fontSize: 12, color: '#9ca3af', paddingVertical: 20, textAlign: 'center' },
});
