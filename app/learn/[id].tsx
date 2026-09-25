import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { type LearnClip, SOURCE_LABEL, TOPIC_LABEL, watchLearnClips } from '@/lib/learnClips';
import VideoEmbed from '@/components/VideoEmbed';
import ClipCard from '@/components/ClipCard';
import { useTT } from '@/lib/i18n';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

const MAX_W = 720;

export default function ClipDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tt = useTT();
  const [clips, setClips] = useState<LearnClip[]>([]);
  useEffect(() => watchLearnClips(setClips), []);

  const clip = clips.find((c) => c.id === id);
  if (!clip) {
    return <View style={styles.center}><Text style={{ color: '#6b7280' }}>{tt('learn', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  }
  const topic = TOPIC_LABEL[clip.topic];
  const related = [
    ...clips.filter((c) => c.id !== clip.id && c.topic === clip.topic),
    ...clips.filter((c) => c.id !== clip.id && c.topic !== clip.topic),
  ].slice(0, 8);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        <BackButton />

        <VideoEmbed clip={clip} />

        <Text style={styles.title}>{clip.title}</Text>
        <Text style={styles.meta}>
          {topic.icon} {tt('learn', topic.lao)} · {SOURCE_LABEL[clip.videoType]}
          {clip.viewCount ? ` · 👁 ${clip.viewCount.toLocaleString()}` : ''}
        </Text>
        {clip.description ? <Text style={styles.desc}>{clip.description}</Text> : null}

        {/* cross-link to the Safety module */}
        <Pressable style={styles.xlink} onPress={() => router.push('/safety' as any)}>
          <Text style={styles.xEm}>🦺</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.xTitle}>{tt('learn', 'ຄວາມປອດໄພ ກ່ຽວຂ້ອງ')}</Text>
            <Text style={styles.xSub}>{tt('learn', 'ເບິ່ງ ຄລິບ ແລະ ຂໍ້ຄວນລະວັງ Safety')}</Text>
          </View>
          <Text style={styles.xGo}>→</Text>
        </Pressable>

        {related.length > 0 && (
          <>
            <Text style={styles.subh}>{tt('learn', 'ຄລິບ ກ່ຽວຂ້ອງ')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {related.map((c) => <ClipCard key={c.id} clip={c} width={168} />)}
            </ScrollView>
          </>
        )}
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: MAX_W },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 15, fontWeight: '800', color: '#111', marginTop: 12, lineHeight: 26 },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  desc: { fontSize: 14, lineHeight: 22, color: '#334155', marginTop: 12 },
  xlink: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 12, padding: 12, marginTop: 16 },
  xEm: { fontSize: 22 },
  xTitle: { color: '#c2410c', fontWeight: '800', fontSize: 13 },
  xSub: { color: '#9a3412', fontSize: 12, marginTop: 1 },
  xGo: { color: '#c2410c', fontWeight: '800', fontSize: 15 },
  subh: { fontSize: 14, fontWeight: '800', color: '#111', marginTop: 20, marginBottom: 10 },
  row: { gap: 10, paddingBottom: 4, paddingRight: 8 },
});
