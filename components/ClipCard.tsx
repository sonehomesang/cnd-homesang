import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type LearnClip, SOURCE_LABEL, TOPIC_LABEL } from '@/lib/learnClips';
import { useTT } from '@/lib/i18n';

export default function ClipCard({ clip, width }: { clip: LearnClip; width?: number }) {
  const tt = useTT();
  const topic = TOPIC_LABEL[clip.topic];
  const safety = clip.topic === 'safety';
  return (
    <Pressable
      style={[styles.card, width ? { width } : { flex: 1 }]}
      onPress={() => router.push(`/learn/${clip.id}` as any)}>
      <View style={[styles.thumb, safety && styles.thumbSafety]}>
        {clip.thumbnail ? (
          <Image source={{ uri: clip.thumbnail }} style={StyleSheet.absoluteFill} />
        ) : (
          <Text style={styles.thumbIcon}>{topic.icon}</Text>
        )}
        <View style={styles.srcTag}><Text style={styles.srcTagT}>{SOURCE_LABEL[clip.videoType]}</Text></View>
        <View style={styles.play}><Text style={styles.playT}>▶</Text></View>
        {clip.durationLabel ? <View style={styles.dur}><Text style={styles.durT}>{clip.durationLabel}</Text></View> : null}
      </View>
      <View style={styles.body}>
        <View style={[styles.tag, safety ? styles.tagS : styles.tagT]}>
          <Text style={[styles.tagText, safety ? styles.tagTextS : styles.tagTextT]}>{topic.icon} {tt('learn', topic.lao)}</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>{clip.title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, overflow: 'hidden' },
  thumb: { height: 108, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  thumbSafety: { backgroundColor: '#7c2d12' },
  thumbIcon: { fontSize: 40, opacity: 0.85 },
  srcTag: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  srcTagT: { color: '#fff', fontSize: 12, fontWeight: '700' },
  play: { position: 'absolute', width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  playT: { fontSize: 15, color: '#0066CC', marginLeft: 2 },
  dur: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  durT: { color: '#fff', fontSize: 12, fontWeight: '600' },
  body: { padding: 9 },
  tag: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 5 },
  tagT: { backgroundColor: '#DBEAFE' },
  tagS: { backgroundColor: '#FFEDD5' },
  tagText: { fontSize: 12, fontWeight: '700' },
  tagTextT: { color: '#0b4f9e' },
  tagTextS: { color: '#c2410c' },
  title: { fontSize: 13, fontWeight: '700', color: '#111', lineHeight: 18 },
});
