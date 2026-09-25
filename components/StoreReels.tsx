import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ttStatic } from '@/lib/i18n';
import { youtubeId } from '@/lib/learnClips';
import { type Reel, watchReelsByAuthor, watchReelsByShop } from '@/lib/reels';
import { colors, font, radius, shadow } from '@/lib/theme';

/** A storefront's own shoppable reels (by shop or by author). Renders nothing
 * when empty. Reused on the shop and technician storefront pages (Slice D). */
export default function StoreReels({ shopId, authorId, title }: { shopId?: string; authorId?: string; title?: string }) {
  const [reels, setReels] = useState<Reel[]>([]);
  useEffect(() => {
    if (shopId) return watchReelsByShop(shopId, setReels);
    if (authorId) return watchReelsByAuthor(authorId, setReels);
  }, [shopId, authorId]);

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
    <View>
      <Text style={styles.section}>{title ?? ttStatic('reels', '🎬 ວິດີໂອ')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {reels.map((r) => {
          const p = poster(r);
          return (
            <Pressable key={r.id} style={styles.card} onPress={() => router.push('/reels' as any)}>
              <View style={styles.vid}>
                {p ? <Image source={{ uri: p }} style={StyleSheet.absoluteFill} /> : null}
                <View style={styles.playWrap}><Text style={styles.play}>▶</Text></View>
                {typeof r.productPrice === 'number' && <Text style={styles.price}>{r.productPrice.toLocaleString()}</Text>}
              </View>
              <Text style={styles.caption} numberOfLines={1}>{r.productName ?? r.caption ?? ''}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: font.lg, fontWeight: '700', color: colors.text, marginTop: 20, marginBottom: 10 },
  row: { gap: 10, paddingBottom: 4 },
  card: { width: 110 },
  vid: { width: 110, height: 155, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', ...shadow.card },
  playWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  play: { fontSize: 14, color: colors.primary, marginLeft: 2 },
  price: { position: 'absolute', bottom: 6, left: 6, fontSize: 12, backgroundColor: colors.secondary, color: '#fff', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 7, fontWeight: '700', overflow: 'hidden' },
  caption: { fontSize: 12, color: colors.text2, fontWeight: '600', marginTop: 5 },
});
