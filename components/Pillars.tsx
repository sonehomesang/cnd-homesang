import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useT } from '@/lib/i18n';
import { colors, radius, shadow } from '@/lib/theme';

const ITEMS = [
  { icon: '🛠️', key: 'pillar.tech', subKey: 'pillar.tech.sub', bg: colors.secondary, route: '/(tabs)/explore' },
  { icon: '🛒', key: 'pillar.shop', subKey: 'pillar.shop.sub', bg: colors.accent, route: '/(tabs)/shop' },
  { icon: '🫂', key: 'pillar.friend', subKey: 'pillar.friend.sub', bg: colors.primary, route: '/(tabs)/community' },
];

/** The 3-pillar quick-nav grid (A0 signature). */
export default function Pillars() {
  const t = useT();
  return (
    <View style={styles.row}>
      {ITEMS.map((it) => (
        <Pressable
          key={it.key}
          style={[styles.pillar, { backgroundColor: it.bg }, shadow.card]}
          onPress={() => router.push(it.route as any)}>
          <Text style={styles.ic}>{it.icon}</Text>
          <Text style={styles.title}>{t(it.key)}</Text>
          <Text style={styles.desc} numberOfLines={1}>{t(it.subKey)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  pillar: { flex: 1, borderRadius: radius.lg, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center' },
  ic: { fontSize: 15 },
  title: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 6 },
  desc: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 1 },
});
