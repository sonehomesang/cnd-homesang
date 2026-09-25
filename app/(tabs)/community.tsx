import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';
import PhotoPicker from '@/components/PhotoPicker';
import PostCard from '@/components/PostCard';
import BottomSheet from '@/components/BottomSheet';
import {
  createPost,
  type Post,
  type PostType,
  seedCommunityIfEmpty,
  toggleLike,
  watchFeed,
  watchMyLikes,
} from '@/lib/community';
import { useCart } from '@/lib/cart-context';
import { getProduct, type Product, resolveMyShop, saleInfo, type Shop, watchMyProducts } from '@/lib/shop';
import { isFresh, rankByFreshness } from '@/lib/freshness';
import { useFeedConfig } from '@/lib/appSettings';
import AmountInput from '@/components/AmountInput';
import AppHeader from '@/components/AppHeader';
import AppFooter from '@/components/AppFooter';
import { useResponsive } from '@/lib/theme';

function displayName(p: any): string {
  return (
    p?.name ||
    [p?.firstName, p?.lastName].filter(Boolean).join(' ') ||
    'ຜູ້ໃຊ້'
  );
}

export default function CommunityScreen() {
  const { fbUser, profile } = useAuth();
  const { can, isSuperAdmin } = usePermissions();
  const { maxWidth } = useResponsive(); // shared responsive content width (phone full / tablet 720 / desktop 960)
  const tt = useTT();
  const feedCfg = useFeedConfig('posts'); // freshness ranking (admin-configurable)
  const { addItem, cartShopId } = useCart();
  const [posts, setPosts] = useState<Post[]>([]);
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [myShop, setMyShop] = useState<Shop | null>(null);
  const [myProducts, setMyProducts] = useState<Product[]>([]);
  const [attached, setAttached] = useState<Product | null>(null);

  // composer
  const [composing, setComposing] = useState(false);
  const [ctype, setCtype] = useState<PostType>('text');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [price, setPrice] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => watchFeed(setPosts), []);

  useEffect(() => {
    if (!fbUser) {
      setMyLikes(new Set());
      return;
    }
    return watchMyLikes(fbUser.uid, setMyLikes);
  }, [fbUser]);

  useEffect(() => {
    if (fbUser && isSuperAdmin) {
      seedCommunityIfEmpty().catch((e) => console.error('seed community:', e));
    }
  }, [fbUser, isSuperAdmin]);

  // seller's own shop + products, for attaching a catalog product to a sell post
  useEffect(() => {
    if (!fbUser) { setMyShop(null); return; }
    resolveMyShop(fbUser.uid, { shopId: (profile as any)?.shopId, shopRole: (profile as any)?.shopRole })
      .then((r) => setMyShop(r?.shop ?? null))
      .catch(() => setMyShop(null));
  }, [fbUser, profile]);
  useEffect(() => {
    if (!myShop) { setMyProducts([]); return; }
    return watchMyProducts(myShop.id, setMyProducts);
  }, [myShop]);

  const handleAddToCart = async (post: Post) => {
    if (!post.productId) return;
    if (!fbUser) { router.push('/sign-in' as any); return; }
    try {
      const p = await getProduct(post.productId);
      if (!p) { alert(tt('community', 'ສິນຄ້ານີ້ ບໍ່ມີ ແລ້ວ')); return; }
      if (p.stock === 0) { alert(tt('community', 'ສິນຄ້ານີ້ ໝົດ ສະຕັອກ')); return; }
      if (cartShopId && cartShopId !== p.shopId && typeof confirm === 'function'
        && !confirm(tt('community', 'ກະຕ່າ ມີ ສິນຄ້າ ຈາກ ຮ້ານ ອື່ນ — ລ້າງ ແລ້ວ ເພີ່ມ?'))) return;
      // variants must be chosen on the product page; otherwise add at the
      // sale-effective price (addItem falls back to the pre-deal product.price)
      if ((p.variants ?? []).length > 0) { router.push(`/products/${p.id}` as any); return; }
      addItem(p, { unitPrice: saleInfo(p).price });
      alert(tt('community', '✓ ເພີ່ມ ໃສ່ ກະຕ່າ ແລ້ວ'));
    } catch (e) { console.error('addToCart:', e); }
  };
  const handleViewProduct = (post: Post) => { if (post.productId) router.push(`/products/${post.productId}` as any); };

  const openComposer = () => {
    if (!fbUser) {
      router.push('/sign-in' as any);
      return;
    }
    if (!can('community')) {
      alert(tt('community','ບັນຊີຂອງເຈົ້າບໍ່ມີສິດໂພສ ໂຮມເພື່ອນ'));
      return;
    }
    setComposing(true);
  };

  const handleLike = (postId: string) => {
    if (!fbUser) {
      router.push('/sign-in' as any);
      return;
    }
    toggleLike(postId, fbUser.uid).catch((e) => console.error('like:', e));
  };

  const handleContact = (post: Post) => {
    if (!fbUser) {
      router.push('/sign-in' as any);
      return;
    }
    alert(`📞 ${tt('community','ຕິດຕໍ່')} ${post.authorName}\n${post.contact}`);
  };

  const reset = () => {
    setContent('');
    setImages([]);
    setPrice('');
    setContact('');
    setCtype('text');
    setAttached(null);
    setError('');
  };

  const submit = async () => {
    if (!fbUser) return;
    if (content.trim() === '' && images.length === 0) {
      setError(tt('community','ໃສ່ເນື້ອຫາ ຫຼື ຮູບ'));
      return;
    }
    const priceNum = attached ? attached.price : (price ? parseInt(price.replace(/\D/g, ''), 10) : undefined);
    if (ctype === 'sell' && !attached && (!priceNum || priceNum <= 0)) {
      setError(tt('community','ໂພສຂາຍ ຕ້ອງໃສ່ລາຄາ ຫຼື ຕິດສິນຄ້າ'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createPost({
        authorId: fbUser.uid,
        authorName: displayName(profile),
        authorImage: profile?.image,
        content: content.trim(),
        images: images.length > 0 ? images : undefined,
        type: ctype,
        price: ctype === 'sell' ? priceNum : undefined,
        contact: ctype === 'sell' && contact ? contact : undefined,
        ...(ctype === 'sell' && attached ? {
          productId: attached.id,
          productName: attached.name,
          productImage: attached.images?.[0],
          productPrice: attached.price,
          productUnit: attached.unit,
          shopId: attached.shopId,
        } : {}),
      });
      reset();
      setComposing(false);
    } catch (e: any) {
      console.error('createPost:', e);
      setError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader
        accent="#7C3AED"
        accentSoft="#EDE9FE"
        icon="🫂"
        nameAccent="ເພື່ອນ"
        subtitle={tt('community', 'ຊຸມຊົນ ຊ່າງ ແລະ ລູກຄ້າ')}
        searchPlaceholder={tt('community', 'ຄົ້ນຫາ ໂພສ / ສິນຄ້າ…')}
        actions={[{ label: tt('community', '✏️ ສ້າງໂພສ'), onPress: openComposer }]}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <View style={[styles.wrap, { maxWidth }]}>
          <View style={styles.pageBody}>
          {/* composer trigger */}
          <Pressable style={styles.trigger} onPress={openComposer}>
            <View style={styles.triggerAv}>
              <Text style={{ fontSize: 18 }}>🙂</Text>
            </View>
            <Text style={styles.triggerText}>{tt('community','ແບ່ງປັນ ຫຼື ຂາຍຫຍັງ...?')}</Text>
            <Text style={styles.triggerPlus}>✏️</Text>
          </Pressable>

          {posts.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🫂</Text>
              <Text style={styles.emptyText}>{tt('community','ຍັງບໍ່ມີໂພສ')}</Text>
            </View>
          ) : (
            rankByFreshness(posts, feedCfg, { createdAt: (p) => p.createdAt, priority: (p) => p.likeCount ?? 0 }).map((p) => (
              <PostCard
                key={p.id}
                post={p}
                liked={myLikes.has(p.id)}
                fresh={isFresh(p.createdAt, feedCfg.freshDays)}
                onLike={() => handleLike(p.id)}
                onOpen={() => router.push(`/community/${p.id}` as any)}
                onContact={() => handleContact(p)}
                onAddToCart={() => handleAddToCart(p)}
                onViewProduct={() => handleViewProduct(p)}
              />
            ))
          )}
          </View>
          <AppFooter page="community" />
        </View>
      </ScrollView>

      {/* ============ COMPOSER (bottom sheet) ============ */}
      <BottomSheet visible={composing} onClose={() => { reset(); setComposing(false); }}>
          <View>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>{tt('community','✏️ ສ້າງໂພສ')}</Text>
                <Pressable onPress={() => { reset(); setComposing(false); }}>
                  <Text style={styles.close}>✕</Text>
                </Pressable>
              </View>

              <View style={styles.typeRow}>
                <Pressable
                  style={[styles.typeChip, ctype === 'text' && styles.typeChipOn]}
                  onPress={() => setCtype('text')}>
                  <Text style={[styles.typeText, ctype === 'text' && styles.typeTextOn]}>{tt('community','📝 ທົ່ວໄປ')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.typeChip, ctype === 'sell' && styles.typeChipOn]}
                  onPress={() => setCtype('sell')}>
                  <Text style={[styles.typeText, ctype === 'sell' && styles.typeTextOn]}>{tt('community','🏷️ ຂາຍເຄື່ອງ')}</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>{tt('community','ເນື້ອຫາ')}</Text>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder={tt('community','ຂຽນຫຍັງ...?')}
                placeholderTextColor="#999"
                style={[styles.input, styles.textarea]}
                multiline
              />

              <Text style={styles.label}>{tt('community','ຮູບ (ບໍ່ບັງຄັບ)')}</Text>
              <PhotoPicker
                photos={images}
                onChange={setImages}
                pathPrefix={`posts/${fbUser?.uid ?? 'anon'}`}
                max={4}
              />

              {ctype === 'sell' && (
                <>
                  {myProducts.length > 0 && (
                    <>
                      <Text style={styles.label}>{tt('community','📦 ຕິດ ສິນຄ້າ ຈາກ ຮ້ານ (ຊື້ໄດ້ເລີຍ)')}</Text>
                      {attached ? (
                        <View style={styles.attached}>
                          <Image source={{ uri: attached.images?.[0] }} style={styles.attThumb} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.attName} numberOfLines={1}>{attached.name}</Text>
                            <Text style={styles.attPrice}>{attached.price.toLocaleString()} {tt('community','ກີບ')} / {attached.unit}</Text>
                          </View>
                          <Pressable onPress={() => setAttached(null)} hitSlop={8}><Text style={styles.attX}>✕</Text></Pressable>
                        </View>
                      ) : (
                        <View style={styles.picker}>
                          <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
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
                  {!attached && (
                    <>
                      <Text style={styles.label}>{tt('community','ລາຄາ (ກີບ)')}</Text>
                      <AmountInput
                        value={price ? Number(price) : 0}
                        onChangeValue={(n) => setPrice(n ? String(n) : '')}
                        placeholder="350,000"
                        placeholderTextColor="#999"
                        style={styles.input}
                      />
                      <Text style={styles.label}>{tt('community','ເບີຕິດຕໍ່')}</Text>
                      <TextInput
                        value={contact}
                        onChangeText={setContact}
                        placeholder="020 5555 5555"
                        placeholderTextColor="#999"
                        keyboardType="phone-pad"
                        style={styles.input}
                      />
                    </>
                  )}
                </>
              )}

              {error !== '' && <Text style={styles.error}>❌ {error}</Text>}

              <Pressable
                style={[styles.btn, submitting && styles.btnDisabled]}
                onPress={submit}
                disabled={submitting}>
                <Text style={styles.btnText}>{submitting ? tt('community','ກຳລັງໂພສ...') : tt('community','📤 ໂພສ')}</Text>
              </Pressable>
          </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1 },
  scroll: { paddingBottom: 0, alignItems: 'center' },
  wrap: { width: '100%' },
  pageBody: { paddingHorizontal: 8, paddingTop: 8 },
  title: { fontSize: 15, fontWeight: 'bold', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 8, padding: 10, marginBottom: 14 },
  triggerAv: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  triggerText: { flex: 1, color: '#9ca3af', fontSize: 14 },
  triggerPlus: { fontSize: 15, paddingRight: 6 },
  empty: { backgroundColor: '#fff', padding: 32, borderRadius: 12, alignItems: 'center' },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 14, color: '#6b7280', marginTop: 8 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  close: { fontSize: 15, color: '#6b7280' },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  typeChipOn: { backgroundColor: '#eef2ff', borderColor: '#c7d2fe' },
  typeText: { fontSize: 12, color: '#4b5563' },
  typeTextOn: { color: '#3730a3', fontWeight: '600' },
  label: { fontSize: 12, color: '#6b7280', marginTop: 12, marginBottom: 4 },
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
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  error: { color: '#c00', fontSize: 12, marginTop: 10 },
  btn: { backgroundColor: '#0066CC', padding: 13, borderRadius: 9, alignItems: 'center', marginTop: 16 },
  btnDisabled: { backgroundColor: '#A8CAEE' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
