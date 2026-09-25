import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { type Product, watchProducts } from '@/lib/shop';
import { watchBrokerEarnings } from '@/lib/orders';
import { codeForUid, ensureMyCode } from '@/lib/referrals';
import { itemUrl } from '@/lib/share';
import { type Earning } from '@/lib/wallet';
import { type AppSettings, watchAppSettings } from '@/lib/appSettings';
import ShareCardSheet from '@/components/ShareCardSheet';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

export default function BrokerScreen() {
  const { fbUser, profile, loading } = useAuth();
  const tt = useTT();
  const [products, setProducts] = useState<Product[]>([]);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [shareProd, setShareProd] = useState<Product | null>(null);

  useEffect(() => {
    if (!loading && !fbUser) router.replace('/sign-in' as any);
  }, [fbUser, loading]);
  useEffect(() => {
    if (fbUser) ensureMyCode(fbUser.uid).catch(() => {}); // persist my code so ?ref resolves
  }, [fbUser]);
  useEffect(() => watchProducts(setProducts), []);
  useEffect(() => watchAppSettings(setSettings), []);
  useEffect(() => {
    if (!fbUser) return;
    return watchBrokerEarnings(fbUser.uid, setEarnings);
  }, [fbUser]);

  const myRef = fbUser ? codeForUid(fbUser.uid) : undefined;
  const pct = settings?.brokerCommissionPct ?? 0;
  const net = earnings.reduce((s, e) => s + e.net, 0);
  // top products to promote: best-sellers first
  const top = useMemo(() => [...products].sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0)).slice(0, 20), [products]);
  const authorName = profile?.firstName || (profile as any)?.name || 'HomeSang';

  if (loading || !fbUser) return <View style={styles.center}><Text style={styles.muted}>{tt('broker', 'ກຳລັງໂຫຼດ...')}</Text></View>;

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <View style={styles.wrap}>
          <View style={styles.hero}>
            <Text style={styles.heroBig}>🤝</Text>
            <Text style={styles.heroTitle}>{tt('broker', 'ເປັນ ນາຍໜ້າ HomeSang')}</Text>
            <Text style={styles.heroSub}>
              {pct > 0
                ? `${tt('broker', 'ແຊຣ໌ ສິນຄ້າ → ຄົນຊື້ຜ່ານ ເຈົ້າ → ໄດ້ commission')} ${pct}%`
                : tt('broker', 'ໂປຣແກຣມ ນາຍໜ້າ ຍັງ ບໍ່ ເປີດ (admin ຕັ້ງ %)')}
            </Text>
          </View>

          <View style={styles.earnCard}>
            <View><Text style={styles.earnL}>💰 {tt('broker', 'ລາຍໄດ້ ນາຍໜ້າ (net)')}</Text><Text style={styles.earnV}>{net.toLocaleString()} ₭</Text></View>
            <View style={styles.earnStat}><Text style={styles.earnStatV}>{earnings.length}</Text><Text style={styles.earnStatL}>{tt('broker', 'ຂາຍຜ່ານ ເຈົ້າ')}</Text></View>
          </View>
          <Pressable style={styles.walletBtn} onPress={() => router.push('/wallet' as any)}>
            <Text style={styles.walletBtnText}>🏦 {tt('broker', 'ໄປ wallet · ຖອນເງິນ')}</Text>
          </Pressable>

          <Text style={styles.section}>🔥 {tt('broker', 'ສິນຄ້າ ຍອດນິຍົມ — ແຊຣ໌ ຫາເງິນ')}</Text>
          {top.map((p) => (
            <View key={p.id} style={styles.prow}>
              <Image source={{ uri: p.images?.[0] }} style={styles.pimg} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.pname} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.pmeta}>{(p.price ?? 0).toLocaleString()} ກີບ{pct > 0 ? ` · 🤝 ~${Math.round((p.price ?? 0) * pct / 100).toLocaleString()}` : ''}</Text>
              </View>
              <Pressable style={styles.shareBtn} onPress={() => setShareProd(p)}>
                <Text style={styles.shareBtnText}>↗ {tt('broker', 'ແຊຣ໌')}</Text>
              </Pressable>
            </View>
          ))}

          <BackButton />
        </View>
        <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
      </ScrollView>

      {shareProd && (
        <ShareCardSheet
          data={{
            kind: 'product',
            name: shareProd.name,
            price: shareProd.price,
            unit: shareProd.unit,
            image: shareProd.images?.[0],
            shopName: shareProd.shopName,
            rating: shareProd.rating,
            soldCount: shareProd.soldCount,
            url: itemUrl('products', shareProd.id, myRef),
            refCode: myRef,
            productId: shareProd.id,
            shopId: shareProd.shopId,
          }}
          filename={`product-${shareProd.id.slice(0, 6)}`}
          authorId={fbUser.uid}
          authorName={authorName}
          onClose={() => setShareProd(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1 },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 560 },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: '#9ca3af' },
  hero: { backgroundColor: '#4338ca', borderRadius: 14, padding: 22, alignItems: 'center' },
  heroBig: { fontSize: 38 },
  heroTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 6 },
  heroSub: { color: '#ddd6fe', fontSize: 12, marginTop: 4, textAlign: 'center' },
  earnCard: { backgroundColor: '#111827', borderRadius: 12, padding: 16, marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  earnL: { color: '#9ca3af', fontSize: 12 },
  earnV: { color: '#34d399', fontSize: 15, fontWeight: '900', marginTop: 2 },
  earnStat: { alignItems: 'center' },
  earnStatV: { color: '#fff', fontSize: 15, fontWeight: '800' },
  earnStatL: { color: '#9ca3af', fontSize: 12 },
  walletBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 9, padding: 11, alignItems: 'center', marginTop: 10 },
  walletBtnText: { color: '#111', fontSize: 13, fontWeight: '700' },
  section: { fontSize: 14, fontWeight: '700', color: '#111', marginTop: 18, marginBottom: 8 },
  prow: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: '#fff' },
  pimg: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#e0e7ff' },
  pname: { fontSize: 13, fontWeight: '700', color: '#111' },
  pmeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  shareBtn: { backgroundColor: '#4338ca', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9 },
  shareBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
