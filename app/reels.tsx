import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';
import { useCart } from '@/lib/cart-context';
import BottomSheet from '@/components/BottomSheet';
import VideoEmbed from '@/components/VideoEmbed';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';
import { detectSource } from '@/lib/learnClips';
import { createReel, type Reel, toggleReelLike, watchMyReelLikes, watchReels } from '@/lib/reels';
import { getProduct, type Product, resolveMyShop, saleInfo, type Shop, watchMyProducts } from '@/lib/shop';

function displayName(p: any): string {
  return p?.name || [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'ຜູ້ໃຊ້';
}

export default function ReelsScreen() {
  const { fbUser, profile } = useAuth();
  const { can } = usePermissions();
  const { attach } = useLocalSearchParams<{ attach?: string }>();
  const tt = useTT();
  const { addItem } = useCart();
  const [reels, setReels] = useState<Reel[]>([]);
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());

  // composer
  const [composing, setComposing] = useState(false);
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [myShop, setMyShop] = useState<Shop | null>(null);
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [attached, setAttached] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => watchReels(setReels), []);
  useEffect(() => {
    if (!fbUser) { setMyLikes(new Set()); return; }
    return watchMyReelLikes(fbUser.uid, setMyLikes);
  }, [fbUser]);
  useEffect(() => {
    if (!fbUser) { setMyShop(null); return; }
    resolveMyShop(fbUser.uid, { shopId: (profile as any)?.shopId, shopRole: (profile as any)?.shopRole })
      .then((r) => setMyShop(r?.shop ?? null)).catch(() => setMyShop(null));
  }, [fbUser, profile]);
  useEffect(() => {
    if (!myShop) { setMyProducts([]); return; }
    return watchMyProducts(myShop.id, setMyProducts);
  }, [myShop]);

  // deep-link from a product page: /reels?attach=<productId> pre-loads that
  // product into the composer so techs/experts can post a promo clip for it.
  useEffect(() => {
    if (!attach || typeof attach !== 'string' || !fbUser) return;
    getProduct(attach).then((p) => {
      if (p) { setAttached(p); setComposing(true); }
    }).catch(() => {});
  }, [attach, fbUser]);

  const handleLike = (id: string) => {
    if (!fbUser) { router.push('/sign-in' as any); return; }
    toggleReelLike(id, fbUser.uid).catch((e) => console.error('reel like:', e));
  };
  const addToCart = async (reel: Reel) => {
    if (!reel.productId) return;
    if (!fbUser) { router.push('/sign-in' as any); return; }
    try {
      const p = await getProduct(reel.productId);
      if (!p) { alert(tt('reels', 'ສິນຄ້ານີ້ ບໍ່ມີ ແລ້ວ')); return; }
      if (p.stock === 0) { alert(tt('reels', 'ສິນຄ້ານີ້ ໝົດ ສະຕັອກ')); return; }
      // a product with variant groups must be configured on its own page —
      // quick-adding it would send the shop a line with no size/colour
      if ((p.variants ?? []).length > 0) { router.push(`/products/${p.id}` as any); return; }
      // pass the sale-effective price: addItem() falls back to product.price, so
      // a quick-add during a flash deal used to charge the pre-deal price
      addItem(p, { unitPrice: saleInfo(p).price });
      alert(tt('reels', '✓ ເພີ່ມ ໃສ່ ກະຕ່າ ແລ້ວ'));
    } catch (e) { console.error('addToCart:', e); }
  };

  const openComposer = () => {
    if (!fbUser) { router.push('/sign-in' as any); return; }
    if (!can('sell') && !myShop) { alert(tt('reels', 'ຕ້ອງ ມີ ຮ້ານ / ສິດຂາຍ ຈຶ່ງ ໂພສ ວິດີໂອ ຂາຍ ໄດ້')); return; }
    setComposing(true);
  };
  const reset = () => { setUrl(''); setCaption(''); setAttached(null); setError(''); };
  const submit = async () => {
    if (!fbUser) return;
    if (!url.trim()) { setError(tt('reels', 'ວາງ ລິ້ງ video (YouTube / Facebook)')); return; }
    setSubmitting(true);
    setError('');
    try {
      await createReel({
        authorId: fbUser.uid,
        authorName: displayName(profile),
        authorImage: profile?.image,
        caption: caption.trim() || undefined,
        videoType: detectSource(url.trim()),
        videoUrl: url.trim(),
        ...(attached ? {
          productId: attached.id, productName: attached.name, productImage: attached.images?.[0],
          productPrice: attached.price, productUnit: attached.unit, shopId: attached.shopId,
        } : {}),
      });
      reset();
      setComposing(false);
    } catch (e: any) {
      console.error('createReel:', e);
      setError(e?.message ?? String(e));
    } finally { setSubmitting(false); }
  };

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <View style={styles.wrap}>
          <View style={styles.head}>
            <Text style={styles.title}>{tt('reels', '🎬 ວິດີໂອ ຂາຍ')}</Text>
            <Pressable style={styles.postBtn} onPress={openComposer}>
              <Text style={styles.postBtnText}>{tt('reels', '⬆ ໂພສ')}</Text>
            </Pressable>
          </View>

          {reels.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🎬</Text>
              <Text style={styles.emptyText}>{tt('reels', 'ຍັງບໍ່ມີ ວິດີໂອ — ເປັນ ຄົນທຳອິດ!')}</Text>
            </View>
          ) : reels.map((r) => (
            <View key={r.id} style={styles.reel}>
              <View style={styles.rHead}>
                {r.authorImage ? <Image source={{ uri: r.authorImage }} style={styles.rAv} /> : <View style={[styles.rAv, styles.rAvEmpty]}><Text>🏬</Text></View>}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rName}>{r.authorName}</Text>
                </View>
              </View>
              <VideoEmbed clip={{ videoType: r.videoType, videoUrl: r.videoUrl, thumbnail: r.thumbnail } as any} />
              {!!r.caption && <Text style={styles.caption}>{r.caption}</Text>}

              {r.productId && (
                <View style={styles.prodStrip}>
                  <Image source={{ uri: r.productImage }} style={styles.prodImg} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.prodName} numberOfLines={1}>{r.productName}</Text>
                    <Text style={styles.prodPrice}>{(r.productPrice ?? 0).toLocaleString()} <Text style={styles.prodUnit}>{tt('reels', 'ກີບ')}{r.productUnit ? ` / ${r.productUnit}` : ''}</Text></Text>
                  </View>
                  <Pressable style={styles.cartBtn} onPress={() => addToCart(r)}>
                    <Text style={styles.cartBtnText}>🛒 {tt('reels', 'ຊື້')}</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.rFoot}>
                <Pressable onPress={() => handleLike(r.id)}><Text style={styles.footItem}>{myLikes.has(r.id) ? '❤️' : '🤍'} {r.likeCount ?? 0}</Text></Pressable>
                {r.productId && <Pressable onPress={() => router.push(`/products/${r.productId}` as any)}><Text style={styles.footItem}>👁️ {tt('reels', 'ເບິ່ງສິນຄ້າ')}</Text></Pressable>}
              </View>
            </View>
          ))}

          <BackButton />
        </View>
        <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
      </ScrollView>

      <BottomSheet visible={composing} onClose={() => { reset(); setComposing(false); }}>
        <View>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{tt('reels', '⬆ ໂພສ ວິດີໂອ ຂາຍ')}</Text>
            <Pressable onPress={() => { reset(); setComposing(false); }}><Text style={styles.close}>✕</Text></Pressable>
          </View>
          <Text style={styles.label}>{tt('reels', 'ວາງ ລິ້ງ video (YouTube / Facebook)')}</Text>
          <TextInput value={url} onChangeText={setUrl} placeholder="https://youtube.com/shorts/..." placeholderTextColor="#999" autoCapitalize="none" style={styles.input} />
          <Text style={styles.label}>{tt('reels', 'ຄຳບັນຍາຍ (ບໍ່ບັງຄັບ)')}</Text>
          <TextInput value={caption} onChangeText={setCaption} placeholder={tt('reels', 'ບອກ ກ່ຽວກັບ ວິດີໂອ...')} placeholderTextColor="#999" style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline />

          {myProducts.length > 0 && (
            <>
              <Text style={styles.label}>{tt('reels', '📦 ຕິດ ສິນຄ້າ (ຊື້ໄດ້ເລີຍ)')}</Text>
              {attached ? (
                <View style={styles.attached}>
                  <Image source={{ uri: attached.images?.[0] }} style={styles.attThumb} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.attName} numberOfLines={1}>{attached.name}</Text>
                    <Text style={styles.attPrice}>{attached.price.toLocaleString()} {tt('reels', 'ກີບ')} / {attached.unit}</Text>
                  </View>
                  <Pressable onPress={() => setAttached(null)} hitSlop={8}><Text style={styles.attX}>✕</Text></Pressable>
                </View>
              ) : (
                <View style={styles.picker}>
                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                    {myProducts.map((p) => (
                      <Pressable key={p.id} style={styles.prow} onPress={() => setAttached(p)}>
                        <Image source={{ uri: p.images?.[0] }} style={styles.attThumb} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.attName} numberOfLines={1}>{p.name}</Text>
                          <Text style={styles.attPriceSm}>{p.price.toLocaleString()} / {p.unit}</Text>
                        </View>
                        <Text style={styles.prowAdd}>＋</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </>
          )}

          {error !== '' && <Text style={styles.error}>❌ {error}</Text>}
          <Pressable style={[styles.submit, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
            <Text style={styles.submitText}>{submitting ? tt('reels', 'ກຳລັງໂພສ...') : tt('reels', '📤 ໂພສ ວິດີໂອ')}</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1 },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 480 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 15, fontWeight: 'bold', color: '#111' },
  postBtn: { backgroundColor: '#0066CC', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 8 },
  postBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { backgroundColor: '#fff', padding: 32, borderRadius: 12, alignItems: 'center' },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 14, color: '#6b7280', marginTop: 8, textAlign: 'center' },
  reel: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 14, overflow: 'hidden', marginBottom: 14 },
  rHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  rAv: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e0e7ff' },
  rAvEmpty: { alignItems: 'center', justifyContent: 'center' },
  rName: { fontSize: 13, fontWeight: '700', color: '#111' },
  caption: { fontSize: 13, color: '#374151', padding: 12, paddingBottom: 0, lineHeight: 20 },
  prodStrip: { flexDirection: 'row', gap: 12, alignItems: 'center', margin: 12, padding: 10, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 12, backgroundColor: '#f8fbff' },
  prodImg: { width: 54, height: 54, borderRadius: 10, backgroundColor: '#e0e7ff' },
  prodName: { fontSize: 13, fontWeight: '700', color: '#111' },
  prodPrice: { fontSize: 15, fontWeight: '900', color: '#f97316' },
  prodUnit: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  cartBtn: { backgroundColor: '#0066CC', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9 },
  cartBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rFoot: { flexDirection: 'row', gap: 18, padding: 12, paddingTop: 0 },
  footItem: { fontSize: 13, color: '#6b7280' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  close: { fontSize: 15, color: '#6b7280' },
  label: { fontSize: 12, color: '#6b7280', marginTop: 12, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  attached: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#f8fbff', borderRadius: 10, padding: 8 },
  attThumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#e0e7ff' },
  attName: { fontSize: 13, fontWeight: '700', color: '#111' },
  attPrice: { fontSize: 12, color: '#f97316', fontWeight: '700' },
  attPriceSm: { fontSize: 12, color: '#6b7280' },
  attX: { color: '#dc2626', fontWeight: '700', fontSize: 15, paddingHorizontal: 4 },
  picker: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' },
  prow: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 8, borderBottomWidth: 1, borderBottomColor: '#f1f3f6' },
  prowAdd: { color: '#0066CC', fontWeight: '700', fontSize: 15 },
  error: { color: '#c00', fontSize: 12, marginTop: 10 },
  submit: { backgroundColor: '#0066CC', borderRadius: 9, padding: 13, alignItems: 'center', marginTop: 16 },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
