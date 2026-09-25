import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { cnd, kip, kipT, unitT } from '@/lib/cnd/theme';
import { useCndConfig } from '@/lib/cnd/config';
import { cndCartSetQty, cndCartToggleInstall, cndCartRemove, cndCartTotals, useCndCart } from '@/lib/cnd/cart';
import { useTT } from '@/lib/i18n';

export default function CndCart() {
  const tt = useTT();
  const items = useCndCart();
  const config = useCndConfig();
  const { subtotal, installFeeTotal, installCount } = cndCartTotals(items);
  const delivery = items.length ? config.deliveryFee : 0;
  const total = subtotal + installFeeTotal + delivery;

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/cnd' as any))}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.topT}>{tt('cndCart', '🛒 ຕະກ້າ')} ({items.length})</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {items.length === 0 ? (
          <View style={styles.empty}><Text style={{ fontSize: 40 }}>🛒</Text><Text style={styles.emptyT}>{tt('cndCart', 'ຕະກ້າ ວ່າງ')}</Text><Pressable style={styles.shopBtn} onPress={() => router.replace('/cnd' as any)}><Text style={styles.shopTx}>{tt('cndCart', 'ໄປ ຊື້ ສິນຄ້າ')}</Text></Pressable></View>
        ) : (
          <>
            {items.map((it) => {
              const fee = Math.round((it.price * it.qty * it.feePct) / 100);
              return (
                <View key={it.productId} style={styles.card}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={2}>{it.name}</Text>
                      <Text style={styles.price}>{kip(it.price)} <Text style={styles.unit}>{tt('cndCart', 'ກີບ')}/{unitT(it.unit)}</Text></Text>
                    </View>
                    <Pressable onPress={() => cndCartRemove(it.productId)} hitSlop={8}><Text style={styles.rm}>✕</Text></Pressable>
                  </View>
                  <View style={styles.qtyRow}>
                    <View style={styles.qty}>
                      <Pressable style={styles.qBtn} onPress={() => cndCartSetQty(it.productId, it.qty - 1)}><Text style={styles.qBtnTx}>−</Text></Pressable>
                      <Text style={styles.qN}>{it.qty}</Text>
                      <Pressable style={styles.qBtn} onPress={() => cndCartSetQty(it.productId, it.qty + 1)}><Text style={styles.qBtnTx}>+</Text></Pressable>
                    </View>
                    <Text style={styles.lineTot}>{kipT(it.price * it.qty)}</Text>
                  </View>
                  {it.installable && (
                    <View style={styles.instRow}>
                      <Text style={styles.instL}>{tt('cndCart', '🔧 ໃຫ້ ຊ່າງ ຕິດຕັ້ງ')} (+{it.feePct}%)</Text>
                      <Switch value={it.install} onValueChange={() => cndCartToggleInstall(it.productId)} trackColor={{ true: cnd.green }} />
                      {it.install && <Text style={styles.instFee}>+{kip(fee)}</Text>}
                    </View>
                  )}
                </View>
              );
            })}

            <View style={styles.totals}>
              <Row l={tt('cndCart', 'ລວມ ສິນຄ້າ')} v={`${kip(subtotal)} ${tt('cndCart', 'ກີບ')}`} />
              {installFeeTotal > 0 && <Row l={`${tt('cndCart', 'ຄ່າ ຕິດຕັ້ງ')} (${installCount} ${tt('cndCart', 'ລາຍການ')})`} v={`+${kip(installFeeTotal)} ${tt('cndCart', 'ກີບ')}`} accent />}
              <Row l={tt('cndCart', 'ຄ່າ ສົ່ງ')} v={`${kip(delivery)} ${tt('cndCart', 'ກີບ')}`} />
              <View style={styles.grand}><Text style={styles.grandL}>{tt('cndCart', 'ລວມ ທັງ ໝົດ')}</Text><Text style={styles.grandV}>{kip(total)} {tt('cndCart', 'ກີບ')}</Text></View>
            </View>

            <Pressable style={styles.checkout} onPress={() => router.push('/cnd/checkout' as any)}>
              <Text style={styles.checkoutTx}>{tt('cndCart', 'ໄປ ຊຳລະ →')}</Text>
            </Pressable>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function Row({ l, v, accent }: { l: string; v: string; accent?: boolean }) {
  return <View style={styles.tr}><Text style={[styles.trL, accent && { color: cnd.brandDark, fontWeight: '700' }]}>{l}</Text><Text style={[styles.trV, accent && { color: cnd.brandDark, fontWeight: '800' }]}>{v}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: cnd.steel },
  back: { color: cnd.white, fontSize: 24, fontWeight: '800', width: 24 },
  topT: { color: cnd.white, fontSize: 15, fontWeight: '800' },
  body: { padding: 12, gap: 10 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  emptyT: { fontSize: 15, fontWeight: '800', color: cnd.ink2 },
  shopBtn: { backgroundColor: cnd.brand, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 20 },
  shopTx: { color: cnd.white, fontWeight: '800', fontSize: 13 },
  card: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 12, gap: 9 },
  name: { fontSize: 13, fontWeight: '700', color: cnd.ink, lineHeight: 18 },
  price: { fontSize: 13, fontWeight: '900', color: cnd.brandDark, marginTop: 2 },
  unit: { fontSize: 12, fontWeight: '600', color: cnd.ink3 },
  rm: { fontSize: 15, color: cnd.error, fontWeight: '800', padding: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cnd.surface2, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3 },
  qBtn: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  qBtnTx: { fontSize: 15, fontWeight: '800', color: cnd.ink },
  qN: { fontSize: 14, fontWeight: '800', color: cnd.ink, minWidth: 20, textAlign: 'center' },
  lineTot: { fontSize: 13.5, fontWeight: '800', color: cnd.ink },
  instRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: cnd.yellowSoft, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  instL: { flex: 1, fontSize: 12, fontWeight: '700', color: cnd.ink },
  instFee: { fontSize: 12.5, fontWeight: '900', color: cnd.brandDark },
  totals: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 14 },
  tr: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  trL: { fontSize: 13, color: cnd.ink2 },
  trV: { fontSize: 13, color: cnd.ink, fontWeight: '600' },
  grand: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: cnd.ink, marginTop: 6, paddingTop: 8 },
  grandL: { fontSize: 15, fontWeight: '800', color: cnd.ink },
  grandV: { fontSize: 15, fontWeight: '900', color: cnd.brandDark },
  checkout: { backgroundColor: cnd.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  checkoutTx: { color: cnd.white, fontWeight: '800', fontSize: 15 },
});
