import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { type CartItem, useCart } from '@/lib/cart-context';
import { useTT } from '@/lib/i18n';
import { computeTotals } from '@/lib/orders';
import { getProductsByCategory, type Product } from '@/lib/shop';
import AppFooter from '@/components/AppFooter';

/** 3-step progress header (ກະຕ່າ → ຈັດສົ່ງ & ຈ່າຍ → ສຳເລັດ). */
function Steps({ active }: { active: number }) {
  const tt = useTT();
  const labels = [tt('cart', 'ກະຕ່າ'), tt('cart', 'ຈັດສົ່ງ & ຈ່າຍ'), tt('cart', 'ສຳເລັດ')];
  return (
    <View style={styles.steps}>
      {labels.map((l, i) => (
        <View key={l} style={styles.stepItem}>
          <View style={[styles.stepDot, i <= active && styles.stepDotOn]}>
            <Text style={[styles.stepNo, i <= active && styles.stepNoOn]}>{i + 1}</Text>
          </View>
          <Text style={[styles.stepLb, i === active && styles.stepLbOn]} numberOfLines={1}>{l}</Text>
          {i < labels.length - 1 && <View style={[styles.stepBar, i < active && styles.stepBarOn]} />}
        </View>
      ))}
    </View>
  );
}

export default function CartScreen() {
  const { fbUser } = useAuth();
  const { items, count, shopIds, setQty, removeItem } = useCart();
  const tt = useTT();
  const [similar, setSimilar] = useState<Product[]>([]);

  // group the cart by shop — each shop is checked out as its own order
  const groups = useMemo(() => {
    const m = new Map<string, { shopId: string; shopName?: string; items: CartItem[] }>();
    for (const i of items) {
      const sid = i.product.shopId;
      if (!m.has(sid)) m.set(sid, { shopId: sid, shopName: i.product.shopName, items: [] });
      m.get(sid)!.items.push(i);
    }
    return [...m.values()];
  }, [items]);

  // "customers also bought" — same category as the first cart item
  const catKey = items[0]?.product.category;
  const firstId = items[0]?.product.id;
  useEffect(() => {
    if (!catKey || !firstId) { setSimilar([]); return; }
    getProductsByCategory(catKey, firstId, 10)
      .then((list) => setSimilar(list.filter((p) => !items.some((i) => i.product.id === p.id))))
      .catch(() => setSimilar([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catKey, firstId, items.length]);

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 48 }}>🛒</Text>
        <Text style={styles.emptyText}>{tt('cart', 'ກະຕ່າຫວ່າງເປົ່າ')}</Text>
        <Pressable style={styles.btn} onPress={() => router.push('/(tabs)/shop' as any)}>
          <Text style={styles.btnText}>{tt('cart', 'ໄປເລືອກສິນຄ້າ')}</Text>
        </Pressable>
      </View>
    );
  }

  const checkout = (shopId: string) => {
    if (!fbUser) { router.push('/sign-in'); return; }
    router.push(`/checkout?shop=${shopId}` as any);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        <Steps active={0} />

        <Text style={styles.title}>{tt('cart', '🛒 ກະຕ່າ ຂອງ ຂ້ອຍ')} ({count})</Text>
        {shopIds.length > 1 && (
          <View style={styles.multiNote}>
            <Text style={styles.multiNoteTx}>
              🛍️ {tt('cart', 'ກະຕ່າ ມີ')} {shopIds.length} {tt('cart', 'ຮ້ານ — ສັ່ງ ແຍກ ຕໍ່ ຮ້ານ (1 ຮ້ານ = 1 ໃບ ສັ່ງຊື້)')}
            </Text>
          </View>
        )}

        {groups.map((g) => {
          const t = computeTotals(g.items, 'delivery');
          const n = g.items.reduce((s, i) => s + i.qty, 0);
          return (
            <View key={g.shopId} style={styles.shopGroup}>
              <View style={styles.shopHead}>
                <Text style={styles.shopName} numberOfLines={1}>🏬 {g.shopName ?? tt('cart', 'ຮ້ານ')}</Text>
                <Text style={styles.shopCount}>{n} {tt('cart', 'ລາຍການ')}</Text>
              </View>

              {g.items.map((i) => {
                const sold = i.product.soldCount ?? 0;
                return (
                  <View key={i.variantKey} style={styles.item}>
                    <Pressable onPress={() => router.push(`/products/${i.product.id}` as any)}>
                      <Image source={{ uri: i.product.images?.[0] }} style={styles.img} />
                    </Pressable>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name} numberOfLines={2}>{i.product.name}</Text>
                      {!!i.variantLabel && <Text style={styles.variant}>{i.variantLabel}</Text>}
                      <Text style={styles.price}>{i.unitPrice.toLocaleString()} LAK / {i.product.unit}</Text>
                      {sold > 0 && <Text style={styles.social}>🔥 {tt('cart', 'ຂາຍ ແລ້ວ')} {sold.toLocaleString()} {tt('cart', 'ຊິ້ນ')}</Text>}
                      <View style={styles.itemFoot}>
                        <View style={styles.qty}>
                          <Pressable style={styles.qbtn} onPress={() => setQty(i.variantKey, i.qty - 1)}><Text style={styles.qbtnText}>−</Text></Pressable>
                          <Text style={styles.qn}>{i.qty}</Text>
                          <Pressable style={styles.qbtn} onPress={() => setQty(i.variantKey, i.qty + 1)}><Text style={styles.qbtnText}>+</Text></Pressable>
                        </View>
                        <Text style={styles.lineTotal}>{(i.unitPrice * i.qty).toLocaleString()} LAK</Text>
                        <Pressable onPress={() => removeItem(i.variantKey)} hitSlop={8}><Text style={styles.rm}>🗑️</Text></Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}

              <View style={styles.shopSummary}>
                <Row label={tt('cart', 'ລວມຍ່ອຍ')} value={t.subtotal} />
                <Row label={tt('cart', 'ຄ່າສົ່ງ (ໂດຍປະມານ)')} value={t.deliveryFee} />
                <Row label={`VAT ${t.vatRate}%`} value={t.vat} />
                <View style={[styles.srow, { marginTop: 4 }]}>
                  <Text style={styles.totalLabel}>{tt('cart', 'ລວມ ຮ້ານ ນີ້')}</Text>
                  <Text style={styles.totalValue}>{t.grandTotal.toLocaleString()} LAK</Text>
                </View>
              </View>

              <Pressable style={styles.btn} onPress={() => checkout(g.shopId)}>
                <Text style={styles.btnText}>
                  {fbUser ? `${tt('cart', 'ສັ່ງຊື້ ຮ້ານ ນີ້')} →` : tt('cart', '🔒 ເຂົ້າສູ່ລະບົບເພື່ອສັ່ງຊື້')}
                </Text>
              </Pressable>
            </View>
          );
        })}

        {/* trust / process reassurance */}
        <View style={styles.trust}>
          <Text style={styles.trustItem}>💵 {tt('cart', 'ຈ່າຍ ປາຍທາງ ໄດ້')}</Text>
          <Text style={styles.trustItem}>🚚 {tt('cart', 'ຈັດສົ່ງ ເຖິງ ບ້ານ')}</Text>
          <Text style={styles.trustItem}>🛡️ {tt('cart', 'ຮັບປະກັນ ຄືນເງິນ')}</Text>
        </View>

        <Pressable style={styles.btnGhost} onPress={() => router.push('/(tabs)/shop' as any)}>
          <Text style={styles.btnGhostText}>← {tt('cart', 'ກັບ ໄປ ເລືອກ ສິນຄ້າ ອື່ນ')}</Text>
        </Pressable>

        {/* upsell — customers also bought */}
        {similar.length > 0 && (
          <View style={styles.simSec}>
            <Text style={styles.simTitle}>🛍️ {tt('cart', 'ຄົນ ອື່ນ ຍັງ ຊື້ ນຳ')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.simRow}>
              {similar.map((s) => (
                <Pressable key={s.id} style={styles.simCard} onPress={() => router.push(`/products/${s.id}` as any)}>
                  <Image source={{ uri: s.images?.[0] || '' }} style={styles.simImg} />
                  <Text style={styles.simName} numberOfLines={2}>{s.name}</Text>
                  <Text style={styles.simPrice}>{s.price.toLocaleString()} <Text style={styles.simUnit}>/ {s.unit}</Text></Text>
                  {(s.soldCount ?? 0) > 0 && <Text style={styles.simSold}>🔥 {tt('cart', 'ຂາຍ')} {s.soldCount}</Text>}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.srow}>
      <Text style={styles.srowLabel}>{label}</Text>
      <Text style={styles.srowValue}>{value.toLocaleString()} LAK</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 8, alignItems: 'center', paddingBottom: 60 },
  wrap: { width: '100%', maxWidth: 640 },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { fontSize: 14, color: '#6b7280' },
  steps: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#eef0f3', paddingVertical: 12, paddingHorizontal: 8, marginBottom: 12 },
  stepItem: { flex: 1, alignItems: 'center', position: 'relative' },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  stepDotOn: { backgroundColor: '#0066CC' },
  stepNo: { fontSize: 12, fontWeight: '800', color: '#9ca3af' },
  stepNoOn: { color: '#fff' },
  stepLb: { fontSize: 12, color: '#9ca3af', marginTop: 4, fontWeight: '600' },
  stepLbOn: { color: '#0066CC', fontWeight: '800' },
  stepBar: { position: 'absolute', top: 13, left: '58%', right: '-42%', height: 2, backgroundColor: '#e5e7eb', zIndex: 1 },
  stepBarOn: { backgroundColor: '#0066CC' },
  title: { fontSize: 15, fontWeight: 'bold', color: '#111', marginBottom: 8 },
  multiNote: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 10, padding: 10, marginBottom: 10 },
  multiNoteTx: { fontSize: 12, color: '#c2410c', fontWeight: '600', lineHeight: 18 },
  shopGroup: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 10, marginBottom: 14, backgroundColor: '#fbfcfe' },
  shopHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 },
  shopName: { fontSize: 13, fontWeight: '800', color: '#0f172a', flex: 1 },
  shopCount: { fontSize: 12, color: '#64748b' },
  item: { flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: '#fff' },
  img: { width: 70, height: 70, borderRadius: 10, backgroundColor: '#f3f4f6' },
  name: { fontSize: 14, fontWeight: '600', color: '#111' },
  variant: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  price: { fontSize: 12, color: '#0066CC', fontWeight: '700', marginTop: 2 },
  social: { fontSize: 12, color: '#b45309', marginTop: 2, fontWeight: '600' },
  itemFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qbtn: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  qbtnText: { fontSize: 15, color: '#111' },
  qn: { fontSize: 14, minWidth: 20, textAlign: 'center' },
  lineTotal: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '800', color: '#111' },
  rm: { fontSize: 15 },
  shopSummary: { borderTopWidth: 1, borderTopColor: '#eef0f3', marginTop: 4, paddingTop: 10, paddingHorizontal: 2 },
  srow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  srowLabel: { fontSize: 14, color: '#4b5563' },
  srowValue: { fontSize: 14, color: '#4b5563' },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#111' },
  totalValue: { fontSize: 15, fontWeight: '700', color: '#0066CC' },
  trust: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 10, paddingVertical: 10, marginTop: 4 },
  trustItem: { fontSize: 12, color: '#166534', fontWeight: '600' },
  btn: { backgroundColor: '#0066CC', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnGhost: { padding: 13, borderRadius: 12, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#0066CC', backgroundColor: '#fff' },
  btnGhostText: { color: '#0066CC', fontSize: 13, fontWeight: '700' },
  simSec: { marginTop: 22, borderTopWidth: 1, borderTopColor: '#eef0f3', paddingTop: 16 },
  simTitle: { fontSize: 14, fontWeight: '800', color: '#111', marginBottom: 10 },
  simRow: { gap: 10, paddingRight: 8 },
  simCard: { width: 132, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 8 },
  simImg: { width: '100%', height: 92, borderRadius: 10, backgroundColor: '#f3f4f6' },
  simName: { fontSize: 12, color: '#111', fontWeight: '600', marginTop: 6, minHeight: 32 },
  simPrice: { fontSize: 13, color: '#0066CC', fontWeight: '700', marginTop: 2 },
  simUnit: { fontSize: 12, color: '#9ca3af', fontWeight: 'normal' },
  simSold: { fontSize: 12, color: '#b45309', marginTop: 2, fontWeight: '600' },
});
