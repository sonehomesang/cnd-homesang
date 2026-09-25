import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ttStatic } from '@/lib/i18n';
import { youtubeId } from '@/lib/learnClips';
import { type Reel, watchReels } from '@/lib/reels';
import { colors, font, radius, shadow, space } from '@/lib/theme';

/** Home row of shoppable short videos → tap into the full /reels feed. */
export default function ReelsShowcase() {
  const [reels, setReels] = useState<Reel[]>([]);
  useEffect(() => watchReels(setReels), []);

  if (reels.length === 0) return null;

  const poster = (r: Reel): string | undefined => {
    if (r.thumbnail) return r.thumbnail;
    if (r.videoType === 'youtube') {
      const id = youtubeId(r.videoUrl);
      if (id) return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
    }
    return undefined;
  };

  return (
    <View style={{ marginTop: space.xl }}>
      <View style={styles.head}>
        <Text style={styles.title}>{ttStatic('reels', '🎬 ວິດີໂອ ຂາຍ')}</Text>
        <Pressable onPress={() => router.push('/reels' as any)}>
          <Text style={styles.seeAll}>{ttStatic('reels', 'ທັງໝົດ →')}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {reels.slice(0, 8).map((r) => {
          const p = poster(r);
          return (
            <Pressable key={r.id} style={styles.card} onPress={() => router.push('/reels' as any)}>
              <View style={styles.vid}>
                {p ? <Image source={{ uri: p }} style={StyleSheet.absoluteFill} /> : null}
                <View style={styles.playWrap}><Text style={styles.play}>▶</Text></View>
                {typeof r.productPrice === 'number' && (
                  <Text style={styles.price}>{r.productPrice.toLocaleString()}</Text>
                )}
              </View>
              <Text style={styles.caption} numberOfLines={1}>{r.productName ?? r.caption ?? r.authorName}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  title: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  seeAll: { fontSize: font.sm, color: colors.primary, fontWeight: '700' },
  row: { gap: 10, paddingBottom: space.xs },
  card: { width: 124 },
  vid: { width: 124, height: 172, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', ...shadow.card },
  playWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  play: { fontSize: 15, color: colors.primary, marginLeft: 2 },
  price: { position: 'absolute', bottom: 6, left: 6, fontSize: 12, backgroundColor: colors.secondary, color: '#fff', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, fontWeight: '700', overflow: 'hidden' },
  caption: { fontSize: 12, color: colors.text2, fontWeight: '600', marginTop: 6 },
});
