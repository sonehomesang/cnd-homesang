import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  type Product,
  saleInfo,
  type Shop,
  watchShop,
  watchShopProductsPublic,
} from '@/lib/shop';
import { useAuth } from '@/lib/auth-context';
import { SITE, shareItem } from '@/lib/share';
import { codeForUid, ensureMyCode } from '@/lib/referrals';
import FavoriteButton from '@/components/FavoriteButton';
import StoreReels from '@/components/StoreReels';
import { colors, font, radius, shadow } from '@/lib/theme';
import { useTT } from '@/lib/i18n';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

const MAX_W = 1000;
const GAP = 12;

export default function ShopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const { fbUser } = useAuth();
  const tt = useTT();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);

  // shop rating = average of its products' ratings
  const rated = useMemo(() => products.filter((p) => typeof p.rating === 'number' && p.rating > 0), [products]);
  const rating = rated.length ? rated.reduce((s, p) => s + (p.rating ?? 0), 0) / rated.length : 0;

  const doShare = async () => {
    if (!shop) return;
    const ref = fbUser ? codeForUid(fbUser.uid) : undefined;
    if (fbUser) ensureMyCode(fbUser.uid).catch(() => {}); // persist so ?ref resolves
    await shareItem({ url: `${SITE}/shop/${id}${ref ? `?ref=${ref}` : ''}`, title: shop.name, text: shop.name });
  };

  useEffect(() => {
    if (!id) return;
    return watchShop(id, (s) => { setShop(s); setLoading(false); });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return watchShopProductsPublic(id, setProducts);
  }, [id]);

  if (loading) return <View style={styles.center}><Text style={styles.muted}>{tt('shopPage', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  if (!shop) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#c00' }}>{tt('shopPage', 'ບໍ່ພົບຮ້ານ')}</Text>
        <BackButton />
      </View>
    );
  }

  const contentW = Math.min(width, MAX_W) - 32;
  const cols = contentW >= 900 ? 5 : contentW >= 680 ? 4 : contentW >= 460 ? 3 : 2;
  const cardW = Math.floor((contentW - GAP * (cols - 1)) / cols);
  const imgH = Math.round(cardW * 0.72);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={[styles.wrap, { maxWidth: MAX_W }]}>
        <View style={styles.head}>
          {shop.image ? (
            <Image source={{ uri: shop.image }} style={styles.avatar} />
          ) : (
            <View style={styles.avatar}><Text style={{ fontSize: 30 }}>🏬</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{shop.name}{shop.isPartner ? <Text style={styles.partner}>  🤝</Text> : null}</Text>
            {rating > 0 && <Text style={styles.rating}>⭐ {rating.toFixed(1)} ({rated.length} {tt('shopPage', 'ຣີວິວ')})</Text>}
            {!!shop.address && <Text style={styles.meta}>📍 {shop.address}</Text>}
            {!!shop.phone && <Text style={styles.meta}>📞 {shop.phone}</Text>}
          </View>
          <FavoriteButton type="shop" targetId={shop.id} meta={{ name: shop.name }} size={24} />
        </View>

        <Pressable style={styles.shareBtn} onPress={doShare}>
          <Text style={styles.shareBtnText}>↗ {tt('shopPage', 'ແຊຣ໌ ຮ້ານ')}</Text>
        </Pressable>

        <StoreReels shopId={shop.id} title={tt('shopPage', '🎬 ວິດີໂອ ຮ້ານ')} />

        <Text style={styles.section}>{tt('shopPage', 'ສິນຄ້າ')} ({products.length})</Text>
        {products.length === 0 ? (
          <Text style={styles.muted}>{tt('shopPage', 'ຮ້ານນີ້ຍັງບໍ່ມີສິນຄ້າ')}</Text>
        ) : (
          <View style={[styles.grid, { gap: GAP }]}>
            {products.map((p) => (
              <Pressable key={p.id} style={[styles.pcard, { width: cardW }]} onPress={() => router.push(`/products/${p.id}` as any)}>
                <View style={styles.pimgWrap}>
                  <Image source={{ uri: p.images?.[0] }} style={[styles.pimg, { height: imgH }]} />
                </View>
                <View style={styles.pbody}>
                  <Text style={styles.pname} numberOfLines={2}>{p.name}</Text>
                  {(() => {
                    const s = saleInfo(p);
                    return s.onSale ? (
                      <>
                        <View style={styles.saleRow}>
                          <Text style={styles.psale}>{s.price.toLocaleString()}</Text>
                          <Text style={styles.pctPill}>-{s.pct}%</Text>
                        </View>
                        <Text style={styles.porig}>{p.price.toLocaleString()}</Text>
                      </>
                    ) : (
                      <Text style={styles.pprice}>{p.price.toLocaleString()}</Text>
                    );
                  })()}
                  <Text style={styles.punit}>{tt('shopPage', 'ກີບ /')} {p.unit}</Text>
                </View>
              </Pressable>
            ))}
          </View>
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
  wrap: { width: '100%' },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 14 },
  muted: { color: colors.text3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 16, ...shadow.card },
  avatar: { width: 56, height: 56, borderRadius: radius.lg, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  partner: { fontSize: font.sm },
  rating: { fontSize: font.sm, color: '#f59e0b', fontWeight: '700', marginTop: 3 },
  meta: { fontSize: font.sm, color: colors.text2, marginTop: 2 },
  shareBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 11, alignItems: 'center', marginTop: 12 },
  shareBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '700' },
  section: { fontSize: font.lg, fontWeight: '700', color: colors.text, marginTop: 20, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  pcard: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  pimgWrap: { padding: 6 },
  pimg: { width: '100%', borderRadius: 10, backgroundColor: colors.surface2 },
  pbody: { padding: 8 },
  pname: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  pprice: { fontSize: font.md, fontWeight: '700', color: colors.primary, marginTop: 2 },
  saleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  psale: { fontSize: font.md, fontWeight: '900', color: '#dc2626' },
  pctPill: { backgroundColor: '#dc2626', color: '#fff', fontSize: 12, fontWeight: '800', paddingHorizontal: 5, borderRadius: 5, overflow: 'hidden' },
  porig: { fontSize: font.xs, color: colors.text3, textDecorationLine: 'line-through' },
  punit: { fontSize: font.xs, color: colors.text3 },
});
