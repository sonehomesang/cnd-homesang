import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTT } from '@/lib/i18n';
import { type Shop, watchShops } from '@/lib/shop';
import { colors, font, radius, shadow } from '@/lib/theme';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

export default function ShopsScreen() {
  const [shops, setShops] = useState<Shop[]>([]);
  const tt = useTT();
  useEffect(() => watchShops(setShops), []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{tt('shops', '🏬 ຮ້ານຄ້າ')}</Text>
        <Text style={styles.sub}>{tt('shops', 'ຮ້ານຄູ່ຄ້າ ໂຮມຊ໊ອບ')}</Text>

        {shops.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏬</Text>
            <Text style={styles.emptyText}>{tt('shops', 'ຍັງບໍ່ມີຮ້ານ')}</Text>
          </View>
        ) : (
          shops.map((s) => (
            <Pressable key={s.id} style={styles.card} onPress={() => router.push(`/shop/${s.id}` as any)}>
              {s.image ? (
                <Image source={{ uri: s.image }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}><Text style={{ fontSize: 24 }}>🏬</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.name}</Text>
                {!!s.address && <Text style={styles.addr} numberOfLines={1}>📍 {s.address}</Text>}
                <Text style={[styles.status, s.isOpen !== false ? styles.open : styles.closed]}>
                  {s.isOpen !== false ? tt('shops', 'ເປີດ') : tt('shops', 'ປິດ')}
                </Text>
              </View>
              <Text style={styles.chev}>›</Text>
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
  wrap: { width: '100%', maxWidth: 640 },
  title: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  sub: { fontSize: font.sm, color: colors.text2, marginTop: 2, marginBottom: 14 },
  empty: { backgroundColor: colors.surface, padding: 32, borderRadius: radius.lg, alignItems: 'center', ...shadow.card },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: font.sm, color: colors.text2, marginTop: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 8, ...shadow.card },
  avatar: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.md, fontWeight: '700', color: colors.text },
  addr: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  status: { fontSize: 12, fontWeight: '700', marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, overflow: 'hidden' },
  open: { backgroundColor: '#d1fae5', color: '#065f46' },
  closed: { backgroundColor: '#fee2e2', color: '#991b1b' },
  chev: { fontSize: 15, color: colors.text3 },
});
