import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { countdownLabel, type Product, saleInfo, watchProducts } from '@/lib/shop';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow, space } from '@/lib/theme';

/**
 * Home "⚡ Flash deals" row: products with a live sale (saleEndsAt > now),
 * soonest-ending first, each with a running countdown. Renders nothing when
 * no deal is active. Self-contained (watches products + ticks a clock).
 */
export default function FlashDeals() {
  const tt = useTT();
  const [products, setProducts] = useState<Product[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => watchProducts(setProducts), []);

  const deals = useMemo(
    () =>
      products
        .map((p) => ({ p, s: saleInfo(p, now) }))
        .filter((d) => d.s.onSale)
        .sort((a, b) => (a.s.endsAt ?? 0) - (b.s.endsAt ?? 0))
        .slice(0, 12),
    [products, now],
  );

  // tick only while at least one deal is live
  useEffect(() => {
    if (deals.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deals.length]);

  if (deals.length === 0) return null;

  const soonest = deals[0].s.endsAt ?? 0;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>⚡ {tt('flash', 'Flash deals')}</Text>
        <View style={styles.countdown}><Text style={styles.countdownText}>{countdownLabel(soonest, now)}</Text></View>
        <Pressable style={{ marginLeft: 'auto' }} onPress={() => router.push('/(tabs)/shop' as any)}>
          <Text style={styles.more}>{tt('flash', 'ທັງໝົດ →')}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {deals.map(({ p, s }) => (
          <Pressable key={p.id} style={styles.card} onPress={() => router.push(`/products/${p.id}` as any)}>
            <View>
              <Image source={{ uri: p.images?.[0] }} style={styles.img} />
              <View style={styles.badge}><Text style={styles.badgeText}>-{s.pct}%</Text></View>
            </View>
            <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
            <Text style={styles.sale}>{s.price.toLocaleString()}</Text>
            <Text style={styles.orig}>{(p.price ?? 0).toLocaleString()}</Text>
            <Text style={styles.timer}>⏳ {countdownLabel(s.endsAt ?? 0, now)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.sm },
  title: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  countdown: { backgroundColor: '#dc2626', borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  countdownText: { color: '#fff', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  more: { fontSize: font.sm, color: colors.primary, fontWeight: '700' },
  row: { gap: 10, paddingVertical: 2, paddingRight: 8 },
  card: { width: 138, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: '#fecaca', overflow: 'hidden', padding: 6, ...shadow.card },
  img: { width: '100%', height: 104, borderRadius: 10, backgroundColor: colors.surface2 },
  badge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#dc2626', borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  name: { fontSize: font.sm, fontWeight: '600', color: colors.text, marginTop: 6, paddingHorizontal: 2, minHeight: 36 },
  sale: { fontSize: font.md, fontWeight: '900', color: '#dc2626', paddingHorizontal: 2 },
  orig: { fontSize: font.xs, color: colors.text3, textDecorationLine: 'line-through', paddingHorizontal: 2 },
  timer: { fontSize: 12, color: '#dc2626', fontWeight: '700', paddingHorizontal: 2, paddingBottom: 2, marginTop: 2, fontVariant: ['tabular-nums'] },
});
