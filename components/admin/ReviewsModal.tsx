import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type ProductReview, watchProductReviews } from '@/lib/productReviews';
import { useTT } from '@/lib/i18n';

function stars(n: number): string {
  const r = Math.round(n);
  return '⭐'.repeat(Math.max(0, Math.min(5, r)));
}
function fmt(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Read-only list of a product's reviews (admin). */
export default function ReviewsModal({
  productId,
  title,
  onClose,
}: {
  productId: string;
  title: string;
  onClose: () => void;
}) {
  const tt = useTT();
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  useEffect(() => watchProductReviews(productId, setReviews), [productId]);

  const avg = reviews.length ? reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length : 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={1}>{tt('admReviewsModal','✏️ ຣີວິວ ·')} {title}</Text>
            <Pressable onPress={onClose} style={styles.close} hitSlop={8}><Text style={styles.closeTxt}>✕</Text></Pressable>
          </View>
          <Text style={styles.summary}>{reviews.length} {tt('admReviewsModal','ຣີວິວ')}{reviews.length ? ` · ${tt('admReviewsModal','ສະເລ່ຍ')} ${stars(avg)} ${avg.toFixed(1)}` : ''}</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {reviews.map((r) => (
              <View key={r.id} style={styles.item}>
                <View style={styles.itemTop}>
                  <Text style={styles.rater} numberOfLines={1}>{r.raterName ?? tt('admReviewsModal','ຜູ້ໃຊ້')}</Text>
                  <Text style={styles.date}>{fmt(r.createdAt)}</Text>
                </View>
                <Text style={styles.rstars}>{stars(r.rating)} <Text style={styles.rnum}>{r.rating}</Text></Text>
                {!!r.comment && <Text style={styles.comment}>{r.comment}</Text>}
              </View>
            ))}
            {reviews.length === 0 && <Text style={styles.empty}>{tt('admReviewsModal','ຍັງບໍ່ມີ ຣີວິວ')}</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  closeTxt: { fontSize: 14, color: '#374151', fontWeight: '700' },
  summary: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  item: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingVertical: 10 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between' },
  rater: { fontSize: 14, fontWeight: '600', color: '#111', flex: 1 },
  date: { fontSize: 12, color: '#9ca3af' },
  rstars: { fontSize: 13, marginTop: 2 },
  rnum: { color: '#6b7280', fontSize: 12 },
  comment: { fontSize: 13, color: '#374151', marginTop: 4 },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 24 },
});
