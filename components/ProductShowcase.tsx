import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type Product, watchProducts } from '@/lib/shop';
import { useCart } from '@/lib/cart-context';
import { useTT } from '@/lib/i18n';
import { isFresh } from '@/lib/freshness';
import { useFeedConfig } from '@/lib/appSettings';
import { colors, font, radius, shadow, space } from '@/lib/theme';

/**
 * Horizontal scrollable row of product cards (with optional badge).
 * Cards are big + vivid (square photo), sized so ~2 show per screen on a phone
 * and a comfortable ~208px on wider screens — many items just scroll left↔right.
 */
export function ProductScroll({ items, badge, badgeColor }: { items: Product[]; badge?: string; badgeColor?: string }) {
  const { addItem } = useCart();
  const { width } = useWindowDimensions();
  // phone: two big cards visible; tablet/desktop: fixed comfortable width
  const cardW = width < 560 ? Math.max(150, Math.round((Math.min(width, 720) - 16 - 12) / 2)) : 208;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.prow} decelerationRate="fast" snapToInterval={cardW + 12} snapToAlignment="start">
      {items.map((p) => (
        <Pressable key={p.id} style={[styles.pcard, { width: cardW }]} onPress={() => router.push(`/products/${p.id}` as any)}>
          <View style={styles.pimgWrap}>
            <Image source={{ uri: p.images?.[0] }} style={styles.pimg} resizeMode="cover" />
            {!!badge && (
              <View style={[styles.pbadge, { backgroundColor: badgeColor ?? colors.primary }]}>
                <Text style={styles.pbadgeText}>{badge}</Text>
              </View>
            )}
          </View>
          <View style={styles.pbody}>
            <Text style={styles.pname} numberOfLines={2}>{p.name}</Text>
            <View style={styles.prowFoot}>
              <Text style={styles.pprice} numberOfLines={1}>{(p.price ?? 0).toLocaleString()} <Text style={styles.punit}>/ {p.unit ?? '—'}</Text></Text>
              <Pressable hitSlop={6} style={styles.qadd} onPress={(e) => { (e as any).stopPropagation?.(); addItem(p); }} accessibilityLabel="ເພີ່ມ ໃສ່ ຕະກ້າ">
                <Ionicons name="cart" size={15} color="#fff" />
                <Text style={styles.qaddPlus}>＋</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  const tt = useTT();
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={() => router.push('/(tabs)/shop' as any)}>
          <Text style={styles.more}>{tt('showcase', 'ທັງໝົດ →')}</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

/**
 * Marketplace product showcase: new arrivals, best sellers, recommended, and
 * (optionally) per-category rows. Self-contained (watches products).
 */
export default function ProductShowcase({ byCategory = false }: { byCategory?: boolean }) {
  const tt = useTT();
  const cfg = useFeedConfig('products');
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => watchProducts(setProducts), []);

  if (products.length === 0) return null;

  // "New arrivals" = products still within the freshness window (newest-first);
  // fall back to the newest overall if nothing is fresh yet.
  const fresh = products.filter((p) => isFresh(p.createdAt, cfg.freshDays));
  const newArrivals = (fresh.length > 0 ? fresh : products).slice(0, 10);
  const bestSellers = [...products]
    .filter((p) => (p.soldCount ?? 0) > 0)
    .sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0))
    .slice(0, 10);
  // "Recommended" = admin-featured PLUS brand-new products, so a newly-added
  // product ALWAYS appears here too (not only when manually marked featured).
  const recMap = new Map<string, Product>();
  [...products.filter((p) => p.featured), ...fresh].forEach((p) => recMap.set(p.id, p));
  const recommended = [...recMap.values()].slice(0, 10);
  const groups = byCategory
    ? (() => {
        const map = new Map<string, { lao: string; items: Product[] }>();
        products.forEach((p) => {
          const key = p.category || 'other';
          if (!map.has(key)) map.set(key, { lao: p.categoryLao ?? key, items: [] });
          map.get(key)!.items.push(p);
        });
        return [...map.values()];
      })()
    : [];

  return (
    <View>
      {recommended.length > 0 && (
        <Row title={tt('showcase', '⭐ ສິນຄ້າແນະນຳ')}><ProductScroll items={recommended} badge={tt('showcase', 'ແນະນຳ')} badgeColor={colors.primary} /></Row>
      )}
      {newArrivals.length > 0 && (
        <Row title={tt('showcase', '🆕 ສິນຄ້າມາໃໝ່')}><ProductScroll items={newArrivals} badge={tt('showcase', 'ໃໝ່')} badgeColor={colors.accent} /></Row>
      )}
      {bestSellers.length > 0 && (
        <Row title={tt('showcase', '🔥 ສິນຄ້າຂາຍດີ')}><ProductScroll items={bestSellers} badge={tt('showcase', 'ຂາຍດີ')} badgeColor={colors.secondary} /></Row>
      )}
      {byCategory && groups.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.title}>{tt('showcase', '📂 ຕາມໝວດ')}</Text>
          {groups.map((g) => (
            <View key={g.lao} style={{ marginTop: 12 }}>
              <Text style={styles.catGroupLabel}>{g.lao}</Text>
              <ProductScroll items={g.items.slice(0, 10)} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: space.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  title: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  more: { fontSize: font.sm, color: colors.primary, fontWeight: '700' },
  catGroupLabel: { fontSize: font.sm, fontWeight: '700', color: colors.primary, backgroundColor: '#EAF2FB', alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 },
  prow: { gap: 12, paddingVertical: 2, paddingRight: 8 },
  // big, vivid card: full-bleed square photo on top, clean info block below
  pcard: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight, ...shadow.card },
  pimgWrap: { position: 'relative' },
  pimg: { width: '100%', aspectRatio: 1, backgroundColor: colors.surface2 },
  pbadge: { position: 'absolute', top: 8, left: 8, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  pbadgeText: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  pbody: { padding: 10, gap: 7 },
  pname: { fontSize: 13.5, lineHeight: 20, fontWeight: '700', color: colors.text, minHeight: 40 },
  prowFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  pprice: { fontSize: 15, lineHeight: 22, fontWeight: '800', color: colors.primary, flexShrink: 1 },
  punit: { fontSize: 11.5, color: colors.text3, fontWeight: 'normal' },
  qadd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1, minWidth: 40, height: 32, paddingHorizontal: 7, borderRadius: 10, backgroundColor: colors.primary },
  qaddPlus: { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 14, marginTop: -1 },
});
