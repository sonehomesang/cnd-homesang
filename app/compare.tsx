import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTT } from '@/lib/i18n';
import { clearCompare, getCompare, type MiniProduct, toggleCompare } from '@/lib/recentlyViewed';
import { getProduct, type Product } from '@/lib/shop';
import { colors, font, radius, space } from '@/lib/theme';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

/** First technical-spec value (used as the "key feature" comparison cell). */
function firstSpec(specs?: string): string {
  const line = (specs ?? '').split('\n').map((l) => l.trim()).find((l) => l.includes(':'));
  return line ? line.slice(line.indexOf(':') + 1).trim() : '';
}

export default function CompareScreen() {
  const [items, setItems] = useState<MiniProduct[]>(getCompare());
  const [full, setFull] = useState<Record<string, Product>>({});
  const tt = useTT();

  // pull full product records so we can compare brand/model/features/rating
  useEffect(() => {
    let alive = true;
    Promise.all(items.map((i) => getProduct(i.id).catch(() => null))).then((ps) => {
      if (!alive) return;
      const map: Record<string, Product> = {};
      ps.forEach((p) => { if (p) map[p.id] = p; });
      setFull(map);
    });
    return () => { alive = false; };
  }, [items]);

  const remove = (p: MiniProduct) => setItems(toggleCompare(p));
  const clearAll = () => { clearCompare(); setItems([]); };

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>⚖️</Text>
        <Text style={styles.muted}>{tt('compare', 'ຍັງບໍ່ມີສິນຄ້າ ໃນລາຍການປຽບທຽບ')}</Text>
        <Text style={styles.hint}>{tt('compare', 'ກົດ «⚖️ ເພີ່ມເຂົ້າປຽບທຽບ» ໃນໜ້າສິນຄ້າ')}</Text>
        <Pressable style={styles.shopBtn} onPress={() => router.push('/(tabs)/shop' as any)}>
          <Text style={styles.shopBtnText}>{tt('compare', 'ເບິ່ງສິນຄ້າ')}</Text>
        </Pressable>
      </View>
    );
  }

  const prices = items.map((i) => full[i.id]?.price ?? i.price);
  const minPrice = Math.min(...prices);

  // each row reads the full product when available, else the mini snapshot
  const ROWS: { label: string; render: (p: MiniProduct) => string; stars?: boolean; highlightMin?: boolean }[] = [
    { label: tt('compare', 'ໝວດ'), render: (p) => full[p.id]?.categoryLao ?? full[p.id]?.category ?? p.category ?? '—' },
    { label: tt('compare', 'ຍີ່ຫໍ້'), render: (p) => full[p.id]?.brand ?? '—' },
    { label: tt('compare', 'ລຸ້ນ'), render: (p) => full[p.id]?.model ?? '—' },
    { label: tt('compare', 'ຄຸນສົມບັດເດັ່ນ'), render: (p) => firstSpec(full[p.id]?.specs) || '—' },
    { label: tt('compare', 'ຮ້ານ'), render: (p) => full[p.id]?.shopName ?? p.shopName ?? '—' },
    { label: tt('compare', 'ຄະແນນ'), render: (p) => { const r = full[p.id]?.rating; const c = full[p.id]?.reviewCount ?? 0; return c > 0 && r ? `${r.toFixed(1)}` : '—'; }, stars: true },
    { label: tt('compare', 'ຫົວໜ່ວຍ'), render: (p) => full[p.id]?.unit ?? p.unit ?? '—' },
    { label: tt('compare', 'ລາຄາ'), render: (p) => `${(full[p.id]?.price ?? p.price ?? 0).toLocaleString()} ${tt('common', 'ກີບ')}`, highlightMin: true },
  ];

  const starStr = (p: MiniProduct) => {
    const r = full[p.id]?.rating ?? 0;
    const c = full[p.id]?.reviewCount ?? 0;
    if (!c || !r) return '';
    const n = Math.round(r);
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll} horizontal={false}>
      <View style={styles.colWrap}>
      <View style={styles.headRow}>
        <Text style={styles.title}>{tt('compare', 'ປຽບທຽບສິນຄ້າ')} ({items.length})</Text>
        <Pressable onPress={clearAll}><Text style={styles.clear}>{tt('compare', 'ລ້າງທັງໝົດ')}</Text></Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableWrap}>
        <View>
          <View style={styles.row}>
            <View style={styles.labelCell} />
            {items.map((p) => (
              <View key={p.id} style={styles.prodCell}>
                <Pressable onPress={() => router.push(`/products/${p.id}` as any)}>
                  <Image source={{ uri: full[p.id]?.images?.[0] ?? p.image }} style={styles.prodImg} />
                  <Text style={styles.prodName} numberOfLines={2}>{full[p.id]?.name ?? p.name}</Text>
                </Pressable>
                <Pressable onPress={() => remove(p)}><Text style={styles.removeText}>{tt('compare', '✕ ເອົາອອກ')}</Text></Pressable>
              </View>
            ))}
          </View>

          {ROWS.map((r) => (
            <View key={r.label} style={styles.row}>
              <Text style={styles.labelCell}>{r.label}</Text>
              {items.map((p) => {
                const price = full[p.id]?.price ?? p.price;
                const isMin = r.highlightMin && price === minPrice && items.length > 1;
                return (
                  <View key={p.id} style={styles.valueCell}>
                    {r.stars && !!starStr(p) && <Text style={styles.starRow}>{starStr(p)}</Text>}
                    <Text style={[styles.valueText, isMin && styles.valueBest]}>
                      {r.render(p)}{isMin ? '  🏆' : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      <BackButton />
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const COL = 150;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  colWrap: { width: '100%', maxWidth: 720 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyIcon: { fontSize: 48 },
  muted: { color: colors.text2, fontSize: font.md, textAlign: 'center' },
  hint: { color: colors.text3, fontSize: font.sm, textAlign: 'center' },
  shopBtn: { marginTop: 16, backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: 24, paddingVertical: 12 },
  shopBtnText: { color: '#fff', fontWeight: '700', fontSize: font.md },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.text },
  clear: { color: colors.error, fontSize: font.sm },
  tableWrap: { paddingBottom: 8 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'stretch' },
  labelCell: { width: 88, paddingVertical: 12, paddingRight: 8, fontSize: font.sm, color: colors.text3, fontWeight: '600' },
  prodCell: { width: COL, padding: 8, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: colors.border },
  prodImg: { width: COL - 24, height: COL - 24, borderRadius: 10, backgroundColor: colors.surface2 },
  prodName: { fontSize: font.sm, fontWeight: '600', color: colors.text, marginTop: 6, textAlign: 'center' },
  removeText: { fontSize: font.xs, color: colors.error, marginTop: 6 },
  valueCell: { width: COL, paddingVertical: 12, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: colors.border, justifyContent: 'center' },
  valueText: { fontSize: font.sm, color: colors.text, textAlign: 'center' },
  valueBest: { color: colors.accent, fontWeight: '800' },
  starRow: { fontSize: font.sm, color: '#F59E0B', textAlign: 'center', marginBottom: 2 },
});
