import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { type Favorite, type FavType, toggleFavorite, watchMyFavorites } from '@/lib/favorites';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow } from '@/lib/theme';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

const TABS: { v: FavType | 'all'; label: string }[] = [
  { v: 'all', label: 'ທັງໝົດ' },
  { v: 'product', label: 'ສິນຄ້າ' },
  { v: 'shop', label: 'ຮ້ານ' },
  { v: 'technician', label: 'ຊ່າງ' },
];

const ICON: Record<FavType, string> = { product: '🛍️', shop: '🏬', technician: '👷' };

export default function FavoritesScreen() {
  const tt = useTT();
  const { fbUser, loading } = useAuth();
  const [favs, setFavs] = useState<Favorite[]>([]);
  const [tab, setTab] = useState<FavType | 'all'>('all');

  useEffect(() => {
    if (!loading && !fbUser) router.replace('/sign-in' as any);
  }, [fbUser, loading]);

  useEffect(() => {
    if (!fbUser) return;
    return watchMyFavorites(fbUser.uid, setFavs);
  }, [fbUser]);

  const open = (f: Favorite) => {
    if (f.targetType === 'product') router.push(`/products/${f.targetId}` as any);
    else if (f.targetType === 'technician') router.push(`/users/${f.targetId}` as any);
    else if (f.targetType === 'shop') router.push(`/shop/${f.targetId}` as any);
  };

  if (loading || !fbUser) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('favorites', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  }

  const shown = tab === 'all' ? favs : favs.filter((f) => f.targetType === tab);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{tt('favorites', '❤️ ລາຍການທີ່ມັກ')}</Text>

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.v} style={[styles.tab, tab === t.v && styles.tabOn]} onPress={() => setTab(t.v)}>
              <Text style={[styles.tabText, tab === t.v && styles.tabTextOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {shown.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🤍</Text>
            <Text style={styles.emptyText}>{tt('favorites', 'ຍັງບໍ່ມີລາຍການທີ່ມັກ')}</Text>
          </View>
        ) : (
          shown.map((f) => (
            <Pressable key={f.id} style={styles.row} onPress={() => open(f)}>
              {f.image ? (
                <Image source={{ uri: f.image }} style={styles.img} />
              ) : (
                <View style={[styles.img, styles.imgEmpty]}><Text style={{ fontSize: 22 }}>{ICON[f.targetType]}</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{f.name ?? f.targetId}</Text>
                <Text style={styles.type}>{ICON[f.targetType]} {TABS.find((t) => t.v === f.targetType)?.label}</Text>
              </View>
              <Pressable hitSlop={8} onPress={() => fbUser && toggleFavorite(fbUser.uid, f.targetType, f.targetId)}>
                <Text style={{ fontSize: 20 }}>❤️</Text>
              </Pressable>
            </Pressable>
          ))
        )}

        <BackButton />
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 600 },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.text3 },
  title: { fontSize: font.xl, fontWeight: '700', color: colors.text, marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: font.xs, color: colors.text2 },
  tabTextOn: { color: '#fff', fontWeight: '600' },
  empty: { backgroundColor: colors.surface, padding: 32, borderRadius: radius.lg, alignItems: 'center', ...shadow.card },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: font.sm, color: colors.text2, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, marginBottom: 8, ...shadow.card },
  img: { width: 50, height: 50, borderRadius: radius.md, backgroundColor: colors.surface2 },
  imgEmpty: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  type: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
});
