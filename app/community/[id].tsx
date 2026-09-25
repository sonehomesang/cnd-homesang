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
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { ttStatic, useTT } from '@/lib/i18n';
import PostCard from '@/components/PostCard';
import {
  addComment,
  type Comment,
  type Post,
  toggleLike,
  watchComments,
  watchLike,
  watchPost,
} from '@/lib/community';
import { useCart } from '@/lib/cart-context';
import { getProduct, saleInfo } from '@/lib/shop';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

function displayName(p: any): string {
  return p?.name || [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'ຜູ້ໃຊ້';
}

function timeAgo(ms: number): string {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return ttStatic('time', 'ຫາກໍ່');
  if (m < 60) return `${m} ${ttStatic('time', 'ນທ')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${ttStatic('time', 'ຊມ')}`;
  return `${Math.floor(h / 24)} ${ttStatic('time', 'ມື້')}`;
}

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fbUser, profile } = useAuth();
  const { can } = usePermissions();
  const { addItem, cartShopId } = useCart();
  const tt = useTT();

  const addToCart = async () => {
    if (!post?.productId) return;
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
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!id) return;
    return watchPost(id, (p) => {
      setPost(p);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return watchComments(id, setComments);
  }, [id]);

  useEffect(() => {
    if (!id || !fbUser) {
      setLiked(false);
      return;
    }
    return watchLike(id, fbUser.uid, setLiked);
  }, [id, fbUser]);

  const handleLike = () => {
    if (!fbUser) {
      router.push('/sign-in' as any);
      return;
    }
    toggleLike(id, fbUser.uid).catch((e) => console.error('like:', e));
  };

  const send = async () => {
    if (!fbUser) {
      router.push('/sign-in' as any);
      return;
    }
    if (!can('community')) {
      alert(tt('communityPost','ບັນຊີຂອງເຈົ້າບໍ່ມີສິດຄອມເມັນ'));
      return;
    }
    if (text.trim() === '') return;
    setSending(true);
    try {
      await addComment(
        id,
        { authorId: fbUser.uid, authorName: displayName(profile), authorImage: profile?.image },
        text.trim(),
      );
      setText('');
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><Text>{tt('communityPost','ກຳລັງໂຫຼດ...')}</Text></View>;
  }
  if (!post) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#c00' }}>{tt('communityPost','ບໍ່ພົບໂພສ')}</Text>
        <BackButton />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <View style={styles.wrap}>
          <PostCard
            post={post}
            liked={liked}
            onLike={handleLike}
            onAddToCart={addToCart}
            onViewProduct={() => post.productId && router.push(`/products/${post.productId}` as any)}
          />

          <Text style={styles.cHead}>{tt('communityPost','ຄອມເມັນ')} ({comments.length})</Text>
          {comments.length === 0 ? (
            <Text style={styles.empty}>{tt('communityPost','ຍັງບໍ່ມີຄອມເມັນ — ເປັນຄົນທຳອິດ')}</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.cmt}>
                {c.authorImage ? (
                  <Image source={{ uri: c.authorImage }} style={styles.cav} />
                ) : (
                  <View style={[styles.cav, styles.cavEmpty]}>
                    <Text style={{ fontSize: 14 }}>🙂</Text>
                  </View>
                )}
                <View style={styles.bubble}>
                  <View style={styles.cmtTop}>
                    <Text style={styles.cname}>{c.authorName}</Text>
                    <Text style={styles.ctime}>{timeAgo(c.createdAt)}</Text>
                  </View>
                  <Text style={styles.ctext}>{c.content}</Text>
                </View>
              </View>
            ))
          )}
        </View>
        <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -24 }}><AppFooter /></View>
      </ScrollView>

      {/* comment input bar */}
      <View style={styles.bar}>
        {!fbUser ? (
          <Pressable style={styles.signin} onPress={() => router.push('/sign-in' as any)}>
            <Text style={styles.signinText}>{tt('communityPost','🔒 ເຂົ້າສູ່ລະບົບເພື່ອຄອມເມັນ')}</Text>
          </Pressable>
        ) : (
          <>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={tt('communityPost','ຂຽນຄອມເມັນ...')}
              placeholderTextColor="#999"
              style={styles.barInput}
              multiline
            />
            <Pressable
              style={[styles.send, (sending || text.trim() === '') && styles.sendOff]}
              onPress={send}
              disabled={sending || text.trim() === ''}>
              <Text style={styles.sendIcon}>➤</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1 },
  scroll: { padding: 8, paddingBottom: 24, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 640 },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  cHead: { fontSize: 14, fontWeight: '700', color: '#111', marginTop: 8, marginBottom: 10 },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  cmt: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  cav: { width: 34, height: 34, borderRadius: 17 },
  cavEmpty: { backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  bubble: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 10 },
  cmtTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cname: { fontSize: 12, fontWeight: '600', color: '#111' },
  ctime: { fontSize: 12, color: '#9ca3af' },
  ctext: { fontSize: 14, color: '#374151', marginTop: 3 },
  bar: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  barInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9, fontSize: 14, color: '#111', maxHeight: 100 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#0066CC', alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: '#A8CAEE' },
  sendIcon: { color: '#fff', fontSize: 15 },
  signin: { flex: 1, backgroundColor: '#0066CC', borderRadius: 8, padding: 12, alignItems: 'center' },
  signinText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
