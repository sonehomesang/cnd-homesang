import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import {
  type Product,
  seedShopAndProductsIfEmpty,
  setProductActive,
  setProductApproved,
  setProductFeatured,
  watchAllProducts,
} from '@/lib/shop';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';
import type { RecordDoc } from '@/lib/records';
import GroupedRecordEditor from './GroupedRecordEditor';
import { PRODUCT_GROUPS } from '@/lib/adminEditors';
import ShareSheet from './ShareSheet';
import ReviewsModal from './ReviewsModal';
import { usePaged } from './Paginator';

type Tab = '' | 'pending' | 'approved';

export default function ProductsPanel() {
  const { fbUser, profile } = useAuth();
  const { canCreate, canEdit, canDelete } = useSectionPerms('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [tab, setTab] = useState<Tab>('');
  const [editRecord, setEditRecord] = useState<RecordDoc | 'new' | null>(null);
  const [shareP, setShareP] = useState<Product | null>(null);
  const [reviewP, setReviewP] = useState<Product | null>(null);
  const tt = useTT();
  const authorName = profile?.firstName || (profile as any)?.name || 'Admin';

  useEffect(() => {
    if (fbUser) seedShopAndProductsIfEmpty(fbUser.uid).catch((e) => console.error('seed:', e));
  }, [fbUser]);

  useEffect(() => {
    const unsub = watchAllProducts(setProducts);
    return unsub;
  }, []);

  const TABS: { value: Tab; label: string }[] = [
    { value: '', label: `${tt('admProducts','ທັງໝົດ')} (${products.length})` },
    { value: 'pending', label: `${tt('admProducts','ຮໍ')} (${products.filter((p) => !p.approved).length})` },
    { value: 'approved', label: `approved (${products.filter((p) => p.approved).length})` },
  ];
  const shown = products.filter((p) =>
    tab === '' ? true : tab === 'pending' ? !p.approved : p.approved,
  );
  const pg = usePaged(shown, 8);

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.title}>🛍️ {tt('admProducts','ສິນຄ້າ')} · Products</Text>
        {canCreate && (
          <Pressable style={styles.createBtn} onPress={() => setEditRecord('new')}>
            <Text style={styles.createBtnText}>{tt('admProducts','＋ ສ້າງ ສິນຄ້າ')}</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.sub}>{tt('admProducts','ສ້າງ / ອະນຸມັດ / ປິດ-ເປີດ / ແກ້ ສິນຄ້າ')}</Text>

      <View style={styles.subtabs}>
        {TABS.map((t) => (
          <Pressable key={t.value} onPress={() => setTab(t.value)} style={styles.subtab}>
            <Text style={[styles.subtabText, tab === t.value && styles.subtabActive]}>{t.label}</Text>
            {tab === t.value && <View style={styles.bar} />}
          </Pressable>
        ))}
      </View>

      {pg.items.map((p) => (
        <View key={p.id} style={styles.card}>
          <View style={styles.prow}>
          <Image source={{ uri: p.images?.[0] }} style={styles.thumb} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{p.name}</Text>
            <Text style={styles.meta}>
              {(p.price ?? 0).toLocaleString()} LAK / {p.unit ?? '—'} · stock {p.stock ?? '—'} · {p.categoryLao ?? p.category ?? '—'}
            </Text>
            <View style={styles.badges}>
              <Text style={[styles.badge, p.approved ? styles.ok : styles.pend]}>
                {p.approved ? 'approved' : tt('admProducts','ຮໍ')}
              </Text>
              {!p.active && <Text style={[styles.badge, styles.off]}>{tt('admProducts','ປິດ')}</Text>}
              {p.featured && <Text style={[styles.badge, styles.feat]}>📌 {tt('admProducts','ເດ່ນ')}</Text>}
              {typeof p.rating === 'number' && p.rating > 0 && (
                <Text style={[styles.badge, styles.rate]}>⭐ {p.rating.toFixed(1)} ({p.reviewCount ?? 0})</Text>
              )}
              <Text style={[styles.badge, styles.sold]}>🛒 {tt('admProducts','ຍອດຂາຍ')} {p.soldCount ?? 0}</Text>
            </View>
          </View>
          </View>
          <View style={styles.actions}>
            {canEdit && <Pressable
              style={[styles.mini, { backgroundColor: p.approved ? '#9ca3af' : '#16a34a' }]}
              onPress={() => setProductApproved(p.id, !p.approved)}>
              <Text style={styles.miniText}>{p.approved ? 'Unapprove' : 'Approve'}</Text>
            </Pressable>}
            {canEdit && <Pressable
              style={[styles.mini, { backgroundColor: p.active ? '#16a34a' : '#64748b' }]}
              onPress={() => setProductActive(p.id, !p.active)}>
              <Text style={styles.miniText}>{p.active ? tt('admProducts','ເປີດ') : tt('admProducts','ປິດ')}</Text>
            </Pressable>}
            {canEdit && <Pressable
              style={[styles.mini, { backgroundColor: p.featured ? '#f59e0b' : '#e5e7eb' }]}
              onPress={() => setProductFeatured(p.id, !p.featured)}>
              <Text style={[styles.miniText, !p.featured && { color: '#374151' }]}>📌 {tt('admProducts','ເດ່ນ')}</Text>
            </Pressable>}
            <Pressable style={[styles.mini, { backgroundColor: '#0066CC' }]} onPress={() => setEditRecord(p as any)}>
              <Text style={styles.miniText}>{canEdit ? tt('admProducts','✎ ແກ້') : tt('admProducts','👁 ເບິ່ງ')}</Text>
            </Pressable>
            <Pressable
              style={[styles.mini, { backgroundColor: '#0d9488' }]}
              onPress={() => {
                // open the real customer product page in a NEW tab (web) — a true
                // preview, not the edit form; native falls back to in-app nav
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.open(`/products/${p.id}`, '_blank', 'noopener,noreferrer');
                } else {
                  router.push(`/products/${p.id}` as any);
                }
              }}>
              <Text style={styles.miniText}>👁 {tt('admProducts','ພຣີວິວ')}</Text>
            </Pressable>
            <Pressable style={[styles.mini, { backgroundColor: '#0ea5e9' }]} onPress={() => setShareP(p)}>
              <Text style={styles.miniText}>🔗 {tt('admProducts','ແຊຣ໌')}</Text>
            </Pressable>
            <Pressable style={[styles.mini, { backgroundColor: '#7c3aed' }]} onPress={() => setReviewP(p)}>
              <Text style={styles.miniText}>✏️ {tt('admProducts','ຣີວິວ')}</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {pg.bar}

      {editRecord && (
        <GroupedRecordEditor
          colName="products"
          record={editRecord === 'new' ? null : editRecord}
          groups={PRODUCT_GROUPS}
          canDelete={canDelete}
          canEdit={canEdit}
          canCreate={canCreate}
          onClose={() => setEditRecord(null)}
        />
      )}
      {shareP && (
        <ShareSheet kind="products" id={shareP.id} title={shareP.name} image={shareP.images?.[0]} price={shareP.price} authorId={fbUser?.uid ?? ''} authorName={authorName} onClose={() => setShareP(null)} />
      )}
      {reviewP && (
        <ReviewsModal productId={reviewP.id} title={reviewP.name} onClose={() => setReviewP(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  createBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  subtabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 2, borderBottomColor: '#f0f0f0', marginBottom: 14 },
  subtab: { paddingHorizontal: 12, paddingVertical: 8 },
  subtabText: { fontSize: 12, color: '#6b7280' },
  subtabActive: { color: '#0066CC', fontWeight: '700' },
  bar: { height: 2, backgroundColor: '#0066CC', marginTop: 6, marginHorizontal: -12, marginBottom: -10 },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, marginBottom: 8 },
  prow: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10 },
  thumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#f3f4f6' },
  name: { fontSize: 14, fontWeight: '600', color: '#111' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  badges: { flexDirection: 'row', gap: 4, marginTop: 4 },
  badge: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  ok: { backgroundColor: '#d1fae5', color: '#065f46' },
  pend: { backgroundColor: '#fef3c7', color: '#92400e' },
  off: { backgroundColor: '#fee', color: '#991b1b' },
  feat: { backgroundColor: '#fef3c7', color: '#92400e' },
  sold: { backgroundColor: '#ffedd5', color: '#9a3412' },
  rate: { backgroundColor: '#fef9c3', color: '#854d0e' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingBottom: 10, paddingTop: 2 },
  mini: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  miniText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
