import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type Review, deleteReview, setReviewHidden, watchAllReviews } from '@/lib/reviews';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';
import { usePaged } from './Paginator';

function stars(n: number): string {
  const f = Math.max(0, Math.min(5, Math.round(n)));
  return '★★★★★'.slice(0, f) + '☆☆☆☆☆'.slice(0, 5 - f);
}
function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

type Tab = '' | 'visible' | 'hidden';

export default function ReviewsPanel() {
  const { canEdit, canDelete } = useSectionPerms('reviews');
  const tt = useTT();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [tab, setTab] = useState<Tab>('');

  useEffect(() => watchAllReviews(setReviews), []);

  const hidden = reviews.filter((r) => r.hidden);
  const shown = tab === '' ? reviews : tab === 'hidden' ? hidden : reviews.filter((r) => !r.hidden);
  const pg = usePaged(shown, 10);
  const TABS: { v: Tab; l: string }[] = [
    { v: '', l: `${tt('admReviews','ທັງໝົດ')} (${reviews.length})` },
    { v: 'visible', l: `${tt('admReviews','ສະແດງ')} (${reviews.length - hidden.length})` },
    { v: 'hidden', l: `${tt('admReviews','ເຊື່ອງ')} (${hidden.length})` },
  ];

  return (
    <View>
      <Text style={styles.title}>{tt('admReviews','⭐ ຣີວິວ · Moderation')}</Text>
      <Text style={styles.sub}>{tt('admReviews','ກວດ ແລະ ເຊື່ອງ/ລຶບ ຣີວິວ ທີ່ ບໍ່ ເໝາະສົມ')}</Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.v} onPress={() => setTab(t.v)} style={styles.tab}>
            <Text style={[styles.tabText, tab === t.v && styles.tabOn]}>{t.l}</Text>
          </Pressable>
        ))}
      </View>

      {shown.length === 0 ? (
        <Text style={styles.empty}>{tt('admReviews','ບໍ່ມີ ຣີວິວ')}</Text>
      ) : (
        pg.items.map((r) => (
          <View key={r.id} style={[styles.card, r.hidden && styles.cardHidden]}>
            <View style={styles.row}>
              <Text style={styles.rater} numberOfLines={1}>{r.raterName || tt('admReviews','ຜູ້ໃຊ້')} → <Text style={styles.role}>{r.role === 'technician' ? tt('admReviews','👷 ຊ່າງ') : tt('admReviews','🙋 ລູກຄ້າ')}</Text></Text>
              <Text style={styles.starLine}>{stars(r.rating)}</Text>
            </View>
            {!!r.comment && <Text style={styles.comment}>{r.comment}</Text>}
            <View style={styles.metaRow}>
              <Pressable onPress={() => router.push(`/jobs/${r.jobId}` as any)}><Text style={styles.jobLink}>{tt('admReviews','🛠️ ງານ ›')}</Text></Pressable>
              <Text style={styles.date}>{shortDate(r.createdAt)}</Text>
              {r.hidden && <Text style={styles.hiddenTag}>{tt('admReviews','ເຊື່ອງ')}</Text>}
            </View>
            <View style={styles.actions}>
              {canEdit && (
                <Pressable style={[styles.btn, styles.hideBtn]} onPress={() => setReviewHidden(r.id, !r.hidden)}>
                  <Text style={styles.hideText}>{r.hidden ? tt('admReviews','👁 ສະແດງ ຄືນ') : tt('admReviews','🚫 ເຊື່ອງ')}</Text>
                </Pressable>
              )}
              {canDelete && (
                <Pressable style={[styles.btn, styles.delBtn]} onPress={() => { if (confirm(tt('admReviews','ລຶບ ຣີວິວ ນີ້?'))) deleteReview(r.id); }}>
                  <Text style={styles.delText}>{tt('admReviews','🗑️ ລຶບ')}</Text>
                </Pressable>
              )}
              {!canEdit && !canDelete && <Text style={styles.roHint}>{tt('admReviews','👁 ເບິ່ງ ຢ່າງ ດຽວ')}</Text>}
            </View>
          </View>
        ))
      )}

      {pg.bar}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  tabs: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  tab: { paddingVertical: 6 },
  tabText: { fontSize: 12, color: '#6b7280' },
  tabOn: { color: '#0066CC', fontWeight: '700' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 8 },
  cardHidden: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rater: { fontSize: 13, fontWeight: '700', color: '#111', flex: 1 },
  role: { fontSize: 12, color: '#6b7280', fontWeight: '400' },
  starLine: { fontSize: 13, color: '#f59e0b' },
  comment: { fontSize: 13, color: '#374151', marginTop: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  jobLink: { fontSize: 12, color: '#0066CC' },
  date: { fontSize: 12, color: '#9ca3af' },
  hiddenTag: { fontSize: 12, color: '#92400e', backgroundColor: '#fde68a', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  hideBtn: { borderColor: '#d97706' },
  hideText: { color: '#d97706', fontSize: 12, fontWeight: '700' },
  delBtn: { borderColor: '#dc2626' },
  delText: { color: '#dc2626', fontSize: 12, fontWeight: '700' },
  roHint: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 6 },
});
