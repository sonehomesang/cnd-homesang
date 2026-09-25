import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { useCart } from '@/lib/cart-context';
import { type Category, watchCategories } from '@/lib/refdata';
import { type Product, seedShopAndProductsIfEmpty, watchProducts } from '@/lib/shop';
import { getCompare, getRecent, type MiniProduct } from '@/lib/recentlyViewed';
import ProductShowcase from '@/components/ProductShowcase';
import CategoryIcon from '@/components/CategoryIcon';
import { isFresh, rankByFreshness } from '@/lib/freshness';
import { useAppSettings, useFeedConfig } from '@/lib/appSettings';
import AppHeader, { type HeaderAction } from '@/components/AppHeader';
import SortBar from '@/components/SortBar';
import AppFooter from '@/components/AppFooter';
import { colors, useResponsive } from '@/lib/theme';

const GAP = 12;

export default function ShopScreen() {
  const { fbUser, loading, profile } = useAuth();
  const { can } = usePermissions();
  const canManageShop = can('sell') || !!(profile as any)?.shopId; // owner or linked staff
  const { count, addItem } = useCart();
  const { width } = useWindowDimensions();
  const { maxWidth } = useResponsive(); // shared responsive content width (phone full / tablet 720 / desktop 960)
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [cat, setCat] = useState<string>('');
  const [sort, setSort] = useState('recommended');
  const [recent, setRecent] = useState<MiniProduct[]>([]);
  const [compareN, setCompareN] = useState(0);
  const tt = useTT();
  const feedCfg = useFeedConfig('products'); // freshness ranking (admin-configurable)
  const appCfg = useAppSettings();           // admin-set grid columns

  useFocusEffect(
    useCallback(() => {
      setRecent(getRecent());
      setCompareN(getCompare().length);
    }, []),
  );

  const contentW = Math.min(width, maxWidth) - 16; // column minus the 8px body padding each side
  // columns: admin-configurable at the two ends (wide vs phone); tablet interpolates
  const colWide = Math.max(2, Math.min(6, appCfg.shopColsWide || 5));
  const colMob = Math.max(1, Math.min(3, appCfg.shopColsMobile || 2));
  const cols = contentW >= 900 ? colWide : contentW >= 680 ? Math.max(colMob, colWide - 1) : contentW >= 460 ? Math.max(colMob, 3) : colMob;
  const cardW = Math.floor((contentW - GAP * (cols - 1)) / cols);
  const imgH = Math.round(cardW * 0.72);

  useEffect(() => {
    if (fbUser) seedShopAndProductsIfEmpty(fbUser.uid).catch((e) => console.error('seed shop:', e));
  }, [fbUser]);

  useEffect(() => {
    const u1 = watchProducts(setProducts);
    const u2 = watchCategories('product', setCats);
    return () => { u1(); u2(); };
  }, []);

  if (loading) {
    return <View style={styles.center}><Text>{tt('shopTab', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  }

  const activeCats = cats.filter((c) => c.active !== false); // show unless explicitly disabled
  const filtered = cat ? products.filter((p) => p.category === cat) : products;
  // user-chosen sort overrides the default freshness ranking
  const shown =
    sort === 'priceAsc' ? [...filtered].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    : sort === 'priceDesc' ? [...filtered].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
    : sort === 'rating' ? [...filtered].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    // default: new products on top (newest-first), then random/priority
    : rankByFreshness(filtered, feedCfg, { createdAt: (p) => p.createdAt, priority: (p) => (p.featured ? 1 : 0) });

  return (
    <View style={styles.screen}>
      <AppHeader
        accent={colors.accent}
        accentSoft="#DCFCE7"
        icon="🛍️"
        nameAccent="ເຄື່ອງ"
        subtitle={tt('shopTab', 'ວັດສະດຸ ແລະ ອຸປະກອນ ກໍ່ສ້າງ')}
        searchPlaceholder={tt('shopTab', 'ຄົ້ນຫາ ສິນຄ້າ…')}
        extra={{ icon: '🛒', badge: count, onPress: () => router.push('/cart' as any) }}
        actions={[
          { label: tt('shopTab', '🏪 ຮ້ານຄ້າ'), onPress: () => router.push('/shops' as any) },
          ...(canManageShop
            ? [{ label: tt('shopTab', '🏬 ຈັດການ'), onPress: () => router.push('/shop/manage' as any) }]
            : []),
        ] as HeaderAction[]}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <View style={[styles.wrap, { maxWidth }]}>

        <View style={styles.body}>
        {/* marketplace showcase (recommended / new / best sellers) */}
        <ProductShowcase />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
          <Pressable style={[styles.cat, cat === '' && styles.catActive]} onPress={() => setCat('')}>
            <Text style={[styles.catText, cat === '' && styles.catTextActive]}>{tt('shopTab', 'ທັງໝົດ')}</Text>
          </Pressable>
          {activeCats.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.cat, cat === c.nameEn && styles.catActive]}
              onPress={() => setCat(c.nameEn)}>
              <Text style={[styles.catText, cat === c.nameEn && styles.catTextActive]}>
                <CategoryIcon icon={c.icon} size={13} color={cat === c.nameEn ? '#fff' : '#4b5563'} /> {c.nameLao}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {compareN >= 2 && (
          <Pressable style={styles.compareBar} onPress={() => router.push('/compare' as any)}>
            <Text style={styles.compareBarText}>{tt('shopTab', '⚖️ ປຽບທຽບສິນຄ້າ')} ({compareN}) →</Text>
          </Pressable>
        )}

        {recent.length > 0 && (
          <View style={styles.recentWrap}>
            <Text style={styles.recentTitle}>{tt('shopTab', 'ເບິ່ງລ່າສຸດ')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
              {recent.map((p) => (
                <Pressable key={p.id} style={styles.recentCard} onPress={() => router.push(`/products/${p.id}` as any)}>
                  <Image source={{ uri: p.image }} style={styles.recentImg} />
                  <Text style={styles.recentName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.recentPrice}>{(p.price ?? 0).toLocaleString()}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <SortBar
          value={sort}
          onChange={setSort}
          options={[
            { key: 'recommended', label: tt('shopTab', 'ແນະນຳ') },
            { key: 'priceAsc', label: tt('shopTab', 'ລາຄາ ຕ່ຳ→ສູງ') },
            { key: 'priceDesc', label: tt('shopTab', 'ລາຄາ ສູງ→ຕ່ຳ') },
            { key: 'rating', label: tt('shopTab', '⭐ ຄະແນນ') },
          ]}
        />

        {shown.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🛒</Text>
            <Text style={styles.emptyText}>{tt('shopTab', 'ບໍ່ມີສິນຄ້າ')}</Text>
          </View>
        ) : (
          <View style={[styles.grid, { gap: GAP }]}>
            {shown.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.pcard, { width: cardW }]}
                onPress={() => router.push(`/products/${p.id}` as any)}>
                <View style={styles.pimgWrap}>
                  <Image source={{ uri: p.images?.[0] }} style={[styles.pimg, { height: imgH }]} />
                  {isFresh(p.createdAt, feedCfg.freshDays) && (
                    <View style={styles.newBadge}><Text style={styles.newBadgeText}>{tt('shopTab', 'ໃໝ່')}</Text></View>
                  )}
                </View>
                <View style={styles.pbody}>
                  <Text style={styles.pname} numberOfLines={2}>{p.name}</Text>
                  <View style={styles.pfoot}>
                    <View style={{ flexShrink: 1 }}>
                      <Text style={styles.pprice}>{(p.price ?? 0).toLocaleString()}</Text>
                      <Text style={styles.punit}>LAK / {p.unit}</Text>
                    </View>
                    <Pressable hitSlop={6} style={styles.qadd} onPress={(e) => { (e as any).stopPropagation?.(); addItem(p); }} accessibilityLabel="ເພີ່ມ ໃສ່ ຕະກ້າ">
                      <Ionicons name="cart" size={15} color="#fff" />
                      <Text style={styles.qaddPlus}>＋</Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        </View>
        <AppFooter page="shop" />
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { paddingBottom: 0, alignItems: 'center' },
  wrap: { width: '100%' },
  body: { paddingHorizontal: 8, paddingTop: 8 },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 15, fontWeight: 'bold', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  cartIcon: { fontSize: 20 },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cats: { gap: 6, paddingBottom: 12 },
  cat: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db' },
  catActive: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  catText: { fontSize: 12, color: '#4b5563' },
  catTextActive: { color: '#fff', fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  pcard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10 },
  pimgWrap: { padding: 6 },
  pimg: { width: '100%', backgroundColor: '#f3f4f6', borderRadius: 10 },
  newBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  newBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  pbody: { padding: 8 },
  pname: { fontSize: 12, fontWeight: '600', color: '#111' },
  pprice: { fontSize: 14, fontWeight: '700', color: '#0066CC', marginTop: 2 },
  punit: { fontSize: 12, color: '#6b7280' },
  pfoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 },
  qadd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1, minWidth: 40, height: 30, paddingHorizontal: 6, borderRadius: 9, backgroundColor: '#0066CC' },
  qaddPlus: { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 14, marginTop: -1 },
  compareBar: { backgroundColor: '#EAF2FB', borderRadius: 10, padding: 11, alignItems: 'center', marginBottom: 12 },
  compareBarText: { color: '#0066CC', fontSize: 12, fontWeight: '700' },
  recentWrap: { marginBottom: 14 },
  recentTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 8 },
  recentRow: { gap: 10 },
  recentCard: { width: 96 },
  recentImg: { width: 96, height: 96, borderRadius: 10, backgroundColor: '#f3f4f6' },
  recentName: { fontSize: 12, color: '#374151', marginTop: 4 },
  recentPrice: { fontSize: 12, fontWeight: '700', color: '#0066CC' },
  empty: { backgroundColor: '#fff', padding: 32, borderRadius: 12, alignItems: 'center' },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 14, color: '#6b7280', marginTop: 8 },
  signinBtn: { backgroundColor: '#0066CC', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 8 },
  signinText: { color: '#fff', fontWeight: '600' },
});
