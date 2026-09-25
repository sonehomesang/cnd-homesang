import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { gbCountdown, gbState, type GroupBuy, watchOpenGroupBuys } from '@/lib/groupBuys';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow, space } from '@/lib/theme';

/**
 * Home "👥 ຊື້ເປັນກຸ່ມ" row: live group-buy campaigns (before deadline),
 * closest-to-unlocking first, each with a progress bar + countdown. Renders
 * nothing when no campaign is live. Self-contained (watches + ticks a clock).
 */
export default function GroupBuys() {
  const tt = useTT();
  const [items, setItems] = useState<GroupBuy[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => watchOpenGroupBuys(setItems), []);

  useEffect(() => {
    if (items.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>👥 {tt('groupBuy', 'ຊື້ເປັນກຸ່ມ')}</Text>
        <Pressable onPress={() => router.push('/(tabs)/shop' as any)}>
          <Text style={styles.more}>{tt('groupBuy', 'ທັງໝົດ →')}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((g) => {
          const st = gbState(g, now);
          const pct = Math.round((1 - g.groupPrice / Math.max(1, g.origPrice)) * 100);
          return (
            <Pressable key={g.id} style={styles.card} onPress={() => router.push(`/products/${g.productId}` as any)}>
              <View>
                <Image source={{ uri: g.productImage }} style={styles.img} />
                <View style={styles.badge}><Text style={styles.badgeText}>-{pct}%</Text></View>
              </View>
              <Text style={styles.name} numberOfLines={2}>{g.productName}</Text>
              <Text style={styles.price}>{g.groupPrice.toLocaleString()}</Text>
              <Text style={styles.orig}>{g.origPrice.toLocaleString()}</Text>
              <View style={styles.bar}><View style={[styles.barFill, { width: `${st.pct}%` }]} /></View>
              <Text style={styles.meta}>
                {st.unlocked ? `✅ ${tt('groupBuy', 'ປົດລັອກ')}` : `👥 ${st.count}/${g.target}`}
                {gbCountdown(g.endsAt, now) ? ` · ⏳ ${gbCountdown(g.endsAt, now)}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  title: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  more: { fontSize: font.sm, color: '#7c3aed', fontWeight: '700' },
  row: { gap: 10, paddingVertical: 2, paddingRight: 8 },
  card: { width: 150, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: '#ddd6fe', overflow: 'hidden', padding: 6, ...shadow.card },
  img: { width: '100%', height: 100, borderRadius: 10, backgroundColor: '#ede9fe' },
  badge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#7c3aed', borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  name: { fontSize: font.sm, fontWeight: '600', color: colors.text, marginTop: 6, paddingHorizontal: 2, minHeight: 36 },
  price: { fontSize: font.md, fontWeight: '900', color: '#7c3aed', paddingHorizontal: 2 },
  orig: { fontSize: font.xs, color: colors.text3, textDecorationLine: 'line-through', paddingHorizontal: 2 },
  bar: { height: 7, backgroundColor: '#ede9fe', borderRadius: 6, marginTop: 6, marginHorizontal: 2, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#7c3aed' },
  meta: { fontSize: 12, color: '#7c3aed', fontWeight: '700', paddingHorizontal: 2, paddingBottom: 2, marginTop: 4, fontVariant: ['tabular-nums'] },
});
