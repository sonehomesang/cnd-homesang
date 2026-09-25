import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type Product, type Shop, seedShopAndProductsIfEmpty, setShopPartner, watchAllProducts, watchShops } from '@/lib/shop';
import { type AdminUser, watchAllUsers } from '@/lib/admin';
import { type Category, seedRefDataIfEmpty, watchCategories } from '@/lib/refdata';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';
import { type RecordDoc, saveRecord } from '@/lib/records';
import GroupedRecordEditor from './GroupedRecordEditor';
import { PRODUCT_GROUPS, SHOP_GROUPS } from '@/lib/adminEditors';
import ShareSheet from './ShareSheet';
import { usePaged } from './Paginator';

type Tab = '' | 'partner' | 'closed';

export default function ShopsPanel() {
  const { fbUser, profile } = useAuth();
  const { canCreate, canEdit, canDelete } = useSectionPerms('catalog');
  const [shops, setShops] = useState<Shop[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [prodCats, setProdCats] = useState<Category[]>([]);
  const [tab, setTab] = useState<Tab>('');
  const [editRecord, setEditRecord] = useState<RecordDoc | 'new' | null>(null);
  const [shareShop, setShareShop] = useState<Shop | null>(null);
  const [addProductShop, setAddProductShop] = useState<Shop | null>(null);
  const tt = useTT();
  const authorName = profile?.firstName || (profile as any)?.name || 'Admin';

  useEffect(() => {
    seedRefDataIfEmpty().catch((e) => console.error('seed refdata:', e));
    if (fbUser) seedShopAndProductsIfEmpty(fbUser.uid).catch((e) => console.error('seed shop:', e));
    return watchShops(setShops);
  }, [fbUser]);

  useEffect(() => watchAllUsers(setUsers), []);
  useEffect(() => watchAllProducts(setProducts), []);
  useEffect(() => watchCategories('product', setProdCats), []);

  const nameOf = (uid?: string) => {
    const u = users.find((x) => x.uid === uid);
    return u ? u.name || u.firstName || u.phone || uid : undefined;
  };
  const staffCount = (shopId: string) => users.filter((u) => (u as any).shopId === shopId && (u as any).shopRole !== 'owner').length;
  // one O(products) pass → per-shop count + rating, instead of filtering per card per render
  const productStats = useMemo(() => {
    const m: Record<string, { count: number; sum: number; n: number }> = {};
    for (const p of products) {
      if (!p.shopId) continue;
      const e = m[p.shopId] ?? (m[p.shopId] = { count: 0, sum: 0, n: 0 });
      e.count++;
      if (typeof p.rating === 'number' && p.rating > 0) { e.sum += p.rating; e.n++; }
    }
    return m;
  }, [products]);
  const catMap = useMemo(() => Object.fromEntries(prodCats.map((c) => [c.id, c.nameLao])), [prodCats]);
  const shopCount = (shopId: string) => productStats[shopId]?.count ?? 0;
  const shopRating = (shopId: string) => { const e = productStats[shopId]; return e && e.n ? e.sum / e.n : 0; };
  const catNames = (s: Shop) => (s.productCategories ?? []).map((id) => catMap[id] ?? id);
  const openMap = (s: Shop) => {
    if (s.lat == null || s.lng == null) return;
    const url = `https://www.google.com/maps?q=${s.lat},${s.lng}`;
    if (typeof window !== 'undefined' && window.open) window.open(url, '_blank');
  };
  const hasGeo = (s: Shop) => s.lat != null && s.lng != null;

  const shown = shops.filter((s) => (tab === '' ? true : tab === 'partner' ? s.isPartner : s.isOpen === false));
  const pg = usePaged(shown, 10);

  const TABS: { v: Tab; l: string }[] = [
    { v: '', l: `${tt('admShops','ທັງໝົດ')} (${shops.length})` },
    { v: 'partner', l: `Partner (${shops.filter((s) => s.isPartner).length})` },
    { v: 'closed', l: `${tt('admShops','ປິດ')} (${shops.filter((s) => s.isOpen === false).length})` },
  ];

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.title}>🏬 {tt('admShops','ຮ້ານຄ້າ')} · Shops</Text>
        {canCreate && (
          <Pressable style={styles.createBtn} onPress={() => setEditRecord('new')}>
            <Text style={styles.createBtnText}>{tt('admShops','＋ ສ້າງ ຮ້ານ')}</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.sub}>{tt('admShops','ສ້າງ / ຈັດການ ຮ້ານ · partner · ເປີດ/ປິດ · ແກ້')}</Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.v} onPress={() => setTab(t.v)} style={styles.tab}>
            <Text style={[styles.tabText, tab === t.v && styles.tabOn]}>{t.l}</Text>
            {tab === t.v && <View style={styles.bar} />}
          </Pressable>
        ))}
      </View>

      {pg.items.map((s) => {
        const rating = shopRating(s.id);
        const cns = catNames(s);
        const staff = staffCount(s.id);
        return (
        <View key={s.id} style={styles.card}>
          <View style={styles.cardRow}>
            {/* LEFT: logo + rating + status + map pin */}
            <View style={styles.leftCol}>
              {s.image ? (
                <Image source={{ uri: s.image }} style={styles.logo} />
              ) : (
                <View style={[styles.logo, styles.logoEmpty]}><Text style={{ fontSize: 20 }}>🏬</Text></View>
              )}
              {rating > 0 && <Text style={styles.rating}>⭐ {rating.toFixed(1)}</Text>}
              <Text style={[styles.badge, s.isOpen === false ? styles.off : styles.on]}>{s.isOpen === false ? tt('admShops','ປິດ') : tt('admShops','ເປີດ')}</Text>
              <Pressable onPress={() => openMap(s)} disabled={!hasGeo(s)} hitSlop={6}>
                <Ionicons name="location-sharp" size={22} color={hasGeo(s) ? '#dc2626' : '#cbd5e1'} />
              </Pressable>
            </View>

            {/* MIDDLE: name + owner + categories + count + contact */}
            <View style={styles.midCol}>
              <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
              <Text style={styles.owner} numberOfLines={1}>👑 {nameOf(s.ownerId) ?? tt('admShops','— ບໍ່ ໄດ້ ກຳນົດ')}{staff > 0 ? ` · 🛠️ ${staff}` : ''}</Text>
              <Text style={styles.catLine} numberOfLines={2}>🏷️ {cns.length ? cns.join(', ') : tt('admShops','— ບໍ່ ໄດ້ ຕັ້ງ ໝວດ')}</Text>
              <Text style={styles.meta}>📦 {tt('admShops','ສິນຄ້າ')} {shopCount(s.id)}</Text>
              <Text style={styles.meta} numberOfLines={1}>📞 {s.phone ?? '—'}</Text>
              {!!s.status && s.status !== 'approved' && (
                <View style={styles.badges}><Text style={[styles.badge, styles.pend]}>{s.status}</Text></View>
              )}
            </View>

            {/* RIGHT: icon-only actions (compact) */}
            <View style={styles.rightCol}>
              {canEdit && <Pressable style={[styles.iconAct, { backgroundColor: s.isPartner ? '#fef3c7' : '#f1f5f9' }]} onPress={() => setShopPartner(s.id, !s.isPartner)}><Text style={styles.iconActText}>🤝</Text></Pressable>}
              {canEdit && <Pressable style={[styles.iconAct, { backgroundColor: s.isOpen === false ? '#e5e7eb' : '#16a34a' }]} onPress={() => saveRecord('shops', s.id, { isOpen: s.isOpen === false })}><Text style={styles.iconActText}>{s.isOpen === false ? '🔒' : '🔓'}</Text></Pressable>}
              <Pressable style={[styles.iconAct, { backgroundColor: '#dbeafe' }]} onPress={() => setEditRecord(s as any)}><Text style={styles.iconActText}>{canEdit ? '✏️' : '👁️'}</Text></Pressable>
              {canCreate && <Pressable style={[styles.iconAct, { backgroundColor: '#dcfce7' }]} onPress={() => setAddProductShop(s)}><Text style={styles.iconActText}>➕</Text></Pressable>}
              <Pressable style={[styles.iconAct, { backgroundColor: '#e0f2fe' }]} onPress={() => setShareShop(s)}><Text style={styles.iconActText}>🔗</Text></Pressable>
            </View>
          </View>
        </View>
        );
      })}
      {shown.length === 0 && <Text style={styles.empty}>{tt('admShops','ບໍ່ມີ ຮ້ານ')}</Text>}
      {pg.bar}

      {editRecord && (
        <GroupedRecordEditor
          colName="shops"
          record={editRecord === 'new' ? null : editRecord}
          groups={SHOP_GROUPS}
          canDelete={canDelete}
          canEdit={canEdit}
          canCreate={canCreate}
          onClose={() => setEditRecord(null)}
        />
      )}
      {shareShop && (
        <ShareSheet kind="products" id={shareShop.id} title={shareShop.name} authorId={fbUser?.uid ?? ''} authorName={authorName} onClose={() => setShareShop(null)} />
      )}
      {addProductShop && (
        <GroupedRecordEditor
          colName="products"
          record={null}
          prefill={{ shopId: addProductShop.id, shopName: addProductShop.name, approved: true, active: true }}
          groups={PRODUCT_GROUPS}
          canDelete={canDelete}
          canEdit={canEdit}
          canCreate={canCreate}
          onClose={() => setAddProductShop(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  createBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 2, borderBottomColor: '#f0f0f0', marginBottom: 12 },
  tab: { paddingHorizontal: 12, paddingVertical: 8 },
  tabText: { fontSize: 12, color: '#6b7280' },
  tabOn: { color: '#0066CC', fontWeight: '700' },
  bar: { height: 2, backgroundColor: '#0066CC', marginTop: 6, marginHorizontal: -12, marginBottom: -10 },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, marginBottom: 8 },
  cardRow: { flexDirection: 'row', padding: 12, gap: 12, alignItems: 'flex-start' },
  leftCol: { width: 66, alignItems: 'center', gap: 4 },
  logo: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#f3f4f6' },
  logoEmpty: { alignItems: 'center', justifyContent: 'center' },
  rating: { fontSize: 12, color: '#b45309', fontWeight: '700' },
  loc: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
  midCol: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: '#111' },
  owner: { fontSize: 12, color: '#5b21b6', fontWeight: '600' },
  catLine: { fontSize: 12, color: '#0f766e', fontWeight: '600' },
  meta: { fontSize: 12, color: '#6b7280' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  badge: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  partner: { backgroundColor: '#fef3c7', color: '#92400e' },
  on: { backgroundColor: '#dcfce7', color: '#166534' },
  off: { backgroundColor: '#fee2e2', color: '#991b1b' },
  pend: { backgroundColor: '#fef3c7', color: '#92400e' },
  rightCol: { width: 66, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', alignContent: 'flex-start' },
  iconAct: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  iconActText: { fontSize: 15 },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', padding: 24 },
});
