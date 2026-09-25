import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type Banner, watchActiveBanners } from '@/lib/banners';
import { font, radius, shadow } from '@/lib/theme';

/** Full-width auto-sliding hero promo carousel. Renders nothing when empty. */
export default function BannerCarousel() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [w, setW] = useState(0);
  const [idx, setIdx] = useState(0);
  const ref = useRef<ScrollView>(null);

  useEffect(() => watchActiveBanners(setBanners), []);

  // auto-advance
  useEffect(() => {
    if (banners.length <= 1 || w === 0) return;
    const id = setInterval(() => {
      setIdx((prev) => {
        const next = (prev + 1) % banners.length;
        ref.current?.scrollTo({ x: next * w, animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(id);
  }, [banners.length, w]);

  if (banners.length === 0) return null;

  return (
    <View style={styles.wrap} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => w && setIdx(Math.round(e.nativeEvent.contentOffset.x / w))}>
        {banners.map((b) => (
          <Pressable
            key={b.id}
            style={[styles.slide, { width: w || 320 }]}
            onPress={() => b.link && router.push(b.link as any)}>
            <Image source={{ uri: b.image }} style={styles.img} />
            {(b.title || b.subtitle) && (
              <View style={styles.overlay}>
                {!!b.title && <Text style={styles.title}>{b.title}</Text>}
                {!!b.subtitle && <Text style={styles.subtitle} numberOfLines={2}>{b.subtitle}</Text>}
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>
      {banners.length > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {banners.map((_, i) => (
            <View key={i} style={[styles.dot, i === idx && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

const HEIGHT = 190;
const styles = StyleSheet.create({
  wrap: { marginTop: 14, borderRadius: radius.xl, overflow: 'hidden', height: HEIGHT, ...shadow.card },
  slide: { height: HEIGHT, backgroundColor: '#dbeafe' },
  img: { width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    padding: 18,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  title: { color: '#fff', fontSize: 15, fontWeight: '800' },
  subtitle: { color: '#fff', fontSize: font.sm, marginTop: 3, opacity: 0.95, maxWidth: '85%' },
  dots: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { backgroundColor: '#fff', width: 18 },
});
