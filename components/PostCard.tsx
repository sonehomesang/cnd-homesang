import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Post } from '@/lib/community';
import { ttStatic } from '@/lib/i18n';

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return ttStatic('time', 'ຫາກໍ່');
  if (m < 60) return `${m} ${ttStatic('time', 'ນທ')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${ttStatic('time', 'ຊມ')}`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ${ttStatic('time', 'ມື້')}`;
  return new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit' });
}

export default function PostCard({
  post,
  liked,
  fresh,
  onLike,
  onOpen,
  onContact,
  onAddToCart,
  onViewProduct,
}: {
  post: Post;
  liked: boolean;
  fresh?: boolean;
  onLike: () => void;
  onOpen?: () => void;
  onContact?: () => void;
  onAddToCart?: () => void;
  onViewProduct?: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable onPress={onOpen} disabled={!onOpen}>
        <View style={styles.top}>
          {post.authorImage ? (
            <Image source={{ uri: post.authorImage }} style={styles.av} />
          ) : (
            <View style={[styles.av, styles.avEmpty]}>
              <Text style={{ fontSize: 18 }}>{post.type === 'sell' ? '🛒' : '🙂'}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{post.authorName}</Text>
            <Text style={styles.time}>{timeAgo(post.createdAt)}</Text>
          </View>
          {fresh && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>{ttStatic('feed', 'ໃໝ່')}</Text>
            </View>
          )}
          {post.type === 'sell' && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{ttStatic('community', 'ຂາຍ')}</Text>
            </View>
          )}
        </View>

        {!!post.content && <Text style={styles.text}>{post.content}</Text>}

        {post.images && post.images.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
            style={{ marginTop: 8 }}>
            {post.images.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.img} />
            ))}
          </ScrollView>
        )}
      </Pressable>

      {/* product-linked shoppable post → product card + buy actions */}
      {post.type === 'sell' && post.productId ? (
        <>
          <Pressable style={styles.prodCard} onPress={onViewProduct} disabled={!onViewProduct}>
            <Image source={{ uri: post.productImage }} style={styles.prodImg} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.prodName} numberOfLines={1}>{post.productName}</Text>
              <Text style={styles.prodPrice}>{(post.productPrice ?? post.price ?? 0).toLocaleString()} <Text style={styles.prodUnit}>{ttStatic('community', 'ກີບ')}{post.productUnit ? ` / ${post.productUnit}` : ''}</Text></Text>
            </View>
          </Pressable>
          <View style={styles.buyRow}>
            <Pressable style={[styles.buyBtn, styles.cartBtn]} onPress={onAddToCart}>
              <Text style={styles.cartBtnText}>🛒 {ttStatic('community', 'ເພີ່ມກະຕ່າ')}</Text>
            </Pressable>
            <Pressable style={[styles.buyBtn, styles.viewBtn]} onPress={onViewProduct}>
              <Text style={styles.viewBtnText}>👁️ {ttStatic('community', 'ເບິ່ງ')}</Text>
            </Pressable>
          </View>
        </>
      ) : post.type === 'sell' && post.price !== undefined ? (
        <View style={styles.sellbar}>
          <Text style={styles.price}>{post.price.toLocaleString()} {ttStatic('community', 'ກີບ')}</Text>
          {post.contact ? (
            <Pressable style={styles.callBtn} onPress={onContact}>
              <Text style={styles.callText}>📞 {ttStatic('community', 'ຕິດຕໍ່')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.acts}>
        <Pressable style={styles.act} onPress={onLike}>
          <Text style={[styles.actText, liked && styles.liked]}>
            {liked ? '❤️' : '🤍'} {post.likeCount}
          </Text>
        </Pressable>
        <Pressable style={styles.act} onPress={onOpen} disabled={!onOpen}>
          <Text style={styles.actText}>💬 {post.commentCount}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 14, padding: 14, marginBottom: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  av: { width: 40, height: 40, borderRadius: 20 },
  avEmpty: { backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '600', color: '#111' },
  time: { fontSize: 12, color: '#9ca3af' },
  badge: { backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, color: '#166534', fontWeight: '600' },
  newBadge: { backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3 },
  newBadgeText: { fontSize: 12, color: '#fff', fontWeight: '800' },
  text: { fontSize: 14, lineHeight: 21, color: '#111', marginTop: 10 },
  img: { width: 180, height: 170, borderRadius: 10, backgroundColor: '#f3f4f6' },
  prodCard: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#f8fbff', borderRadius: 12, padding: 10, marginTop: 10 },
  prodImg: { width: 66, height: 66, borderRadius: 10, backgroundColor: '#e0e7ff' },
  prodName: { fontSize: 13, fontWeight: '700', color: '#111' },
  prodPrice: { fontSize: 15, fontWeight: '900', color: '#f97316', marginTop: 2 },
  prodUnit: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  buyRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  buyBtn: { flex: 1, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  cartBtn: { backgroundColor: '#0066CC' },
  cartBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  viewBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0066CC' },
  viewBtnText: { color: '#0066CC', fontSize: 13, fontWeight: '700' },
  sellbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 10, padding: 10, marginTop: 10 },
  price: { fontSize: 15, fontWeight: '700', color: '#16a34a' },
  callBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  callText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  acts: { flexDirection: 'row', gap: 18, borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 12, paddingTop: 10 },
  act: { paddingVertical: 2 },
  actText: { fontSize: 14, color: '#6b7280' },
  liked: { color: '#e11d48', fontWeight: '600' },
});
