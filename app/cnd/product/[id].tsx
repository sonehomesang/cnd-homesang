import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { cnd, kip, unitT } from '@/lib/cnd/theme';
import { getCndProduct, resolveInstallPct, watchCndCategories, type CndCategory, type CndProduct } from '@/lib/cnd/catalog';
import { useCndConfig } from '@/lib/cnd/config';
import { cndCartAdd } from '@/lib/cnd/cart';
import { useTT } from '@/lib/i18n';
import WarrantyChip from '@/components/ninesang/WarrantyChip';
import { formatDuration, formatWarrantyDays } from '@/lib/ninesang';

// CND product detail — shows price + the signature "add a technician to install"
// option (+% service fee). Cart + real tech-linkage arrive in phase 0b.
export default function CndProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [p, setP] = useState<CndProduct | null>(null);
  const [cats, setCats] = useState<CndCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [install, setInstall] = useState(false);
  const config = useCndConfig();
  const tt = useTT();

  useEffect(() => watchCndCategories(setCats), []);
  useEffect(() => { if (!id) return; (async () => { setLoading(true); setP(await getCndProduct(id)); setLoading(false); })(); }, [id]);

  if (loading) return <View style={styles.root}><View style={styles.top}><Back /><Text style={styles.topT}>{tt('cndProduct', 'ກຳລັງ ໂຫຼດ...')}</Text></View></View>;
  if (!p) return <View style={styles.root}><View style={styles.top}><Back /><Text style={styles.topT}>{tt('cndProduct', 'ບໍ່ ພົບ ສິນຄ້າ')}</Text></View></View>;

  const pct = resolveInstallPct(p, cats, config.installFeeDefaultPct);
  const fee = Math.round((p.price * pct) / 100);
  const addToCart = () => {
    cndCartAdd({ productId: p.id, name: p.name, unit: p.unit, price: p.price, qty: 1, installable: !!p.installable, install: install && !!p.installable, feePct: pct, warrantyDays: p.warrantyDays });
    router.push('/cnd/cart' as any);
  };
  const total = p.price + (install && p.installable ? fee : 0);
  const cat = cats.find((c) => c.id === p.categoryId);

  return (
    <View style={styles.root}>
      <View style={styles.top}><Back /><Text style={styles.topT}>{cat?.icon} {cat?.name ?? tt('cndProduct', 'ສິນຄ້າ')}</Text></View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.imgBox}>{p.images?.[0] ? <Image source={{ uri: p.images[0] }} style={styles.imgReal} resizeMode="cover" /> : <Text style={{ fontSize: 72 }}>{cat?.icon ?? '📦'}</Text>}</View>
        {!!p.brand && <Text style={styles.brand}>{p.brand}</Text>}
        <Text style={styles.name}>{p.name}</Text>
        <Text style={styles.price}>{kip(p.price)} <Text style={styles.unit}>{tt('cndProduct', 'ກີບ')} / {unitT(p.unit)}</Text></Text>
        {!!p.oldPrice && p.oldPrice > p.price && <Text style={styles.old}>{kip(p.oldPrice)} {tt('cndProduct', 'ກີບ')}</Text>}
        {!!p.warrantyDays && !p.isService && <View style={{ marginTop: 8 }}><WarrantyChip days={p.warrantyDays} /></View>}
        {!!p.description && <Text style={styles.desc}>{p.description}</Text>}

        {p.isService && (
          <>
            <View style={styles.readyCard}>
              <Text style={styles.readyT}>🧑‍🔧 {tt('cndProduct', 'ພ້ອມ ບໍລິການ ໂດຍ ຊ່າງ CND')}</Text>
              <Text style={styles.readySub}>{tt('cndProduct', 'ຟຣີ ຄ່າ ເດີນທາງ ພາຍ ໃນ ເຂດ ບໍລິການ · ຊ່າງ ຮ້ານ ໄປ ເຖິງ ບ້ານ · ມີ ຮັບປະກັນ')}</Text>
            </View>
            <View style={styles.svChips}>
              {!!formatDuration(p.durationMin, p.durationMax) && <View style={styles.svChip}><Text style={styles.svChipTx}>⏱ {formatDuration(p.durationMin, p.durationMax)}</Text></View>}
              {!!p.warrantyDays && <View style={styles.svChip}><Text style={styles.svChipTx}>🛡️ {tt('cndProduct', 'ຮັບປະກັນ')} {formatWarrantyDays(p.warrantyDays)}</Text></View>}
              <View style={styles.svChip}><Text style={styles.svChipTx}>🧾 {tt('cndProduct', 'ຄິດ ຕໍ່')} {unitT(p.unit)}</Text></View>
            </View>
            {!!p.serviceScope?.length && <SvList title={tt('cndProduct', '✓ ຂອບ ເຂດ ງານ (ໄດ້ ຫຍັງ ແດ່)')} items={p.serviceScope} kind="inc" />}
            {!!p.serviceExcludes?.length && <SvList title={tt('cndProduct', '✕ ບໍ່ ລວມ ໃນ ລາຄາ')} items={p.serviceExcludes} kind="exc" />}
            {!!p.serviceRequirements?.length && <SvList title={tt('cndProduct', '📋 ລູກຄ້າ ຕຽມ / ຂໍ້ ຄວນ ຮູ້')} items={p.serviceRequirements} kind="req" />}
          </>
        )}

        {p.installable && (
          <View style={styles.installCard}>
            <View style={styles.ih}>
              <Text style={styles.ihT}>{tt('cndProduct', '🔧 ໃຫ້ ຊ່າງ ໄປ ຕິດຕັ້ງ?')}</Text>
              <Switch value={install} onValueChange={setInstall} trackColor={{ true: cnd.green }} />
            </View>
            <Text style={styles.ihSub}>{tt('cndProduct', 'ຊ່າງ CND ຈັດ ຫາ ໃຫ້ ໄປ ຕິດຕັ້ງ ຮອດ ບ້ານ · ມີ ຮັບປະກັນ')}</Text>
            <View style={styles.feeRow}><Text style={styles.feeL}>{tt('cndProduct', 'ຄ່າ ບໍລິການ ຕິດຕັ້ງ')} (+{pct}%)</Text><Text style={styles.feeV}>+{kip(fee)} {tt('cndProduct', 'ກີບ')}</Text></View>
          </View>
        )}

        <Pressable style={styles.addBtn} onPress={addToCart}>
          <Text style={styles.addTx}>{tt('cndProduct', '🛒 ເພີ່ມ ລົງ ຕະກ້າ')} · {kip(total)} {tt('cndProduct', 'ກີບ')}</Text>
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function Back() { return <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/cnd' as any))}><Text style={styles.back}>‹</Text></Pressable>; }

function SvList({ title, items, kind }: { title: string; items: string[]; kind: 'inc' | 'exc' | 'req' }) {
  const mark = kind === 'inc' ? '✓' : kind === 'exc' ? '✕' : '•';
  const color = kind === 'inc' ? cnd.green : kind === 'exc' ? '#C0392B' : cnd.blue;
  return (
    <View style={styles.svSec}>
      <Text style={styles.svSecT}>{title}</Text>
      {items.map((it, i) => (
        <View key={i} style={styles.svLi}><Text style={[styles.svMark, { color }]}>{mark}</Text><Text style={styles.svLiTx}>{it}</Text></View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: cnd.steel },
  back: { color: cnd.white, fontSize: 24, fontWeight: '800', width: 24 },
  topT: { color: cnd.white, fontSize: 15, fontWeight: '800' },
  body: { padding: 14, gap: 8 },
  imgBox: { height: 200, borderRadius: 14, backgroundColor: cnd.surface2, borderWidth: 1, borderColor: cnd.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imgReal: { width: '100%', height: '100%' },
  brand: { fontSize: 12, fontWeight: '800', color: cnd.ink3, letterSpacing: 0.4, marginTop: 6 },
  name: { fontSize: 15, fontWeight: '800', color: cnd.ink, lineHeight: 24 },
  price: { fontSize: 15, fontWeight: '900', color: cnd.brandDark, marginTop: 4 },
  unit: { fontSize: 12, fontWeight: '600', color: cnd.ink3 },
  old: { fontSize: 13, color: cnd.ink3, textDecorationLine: 'line-through' },
  desc: { fontSize: 13, color: cnd.ink2, lineHeight: 19, marginTop: 6 },
  readyCard: { backgroundColor: '#F0F9F4', borderWidth: 1, borderColor: '#B7E4C7', borderRadius: 12, padding: 12, marginTop: 10, gap: 3 },
  readyT: { fontSize: 13.5, fontWeight: '900', color: cnd.green },
  readySub: { fontSize: 12, color: cnd.ink2, lineHeight: 18 },
  svChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  svChip: { backgroundColor: cnd.surface2, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  svChipTx: { fontSize: 12, fontWeight: '700', color: cnd.ink },
  svSec: { marginTop: 12, borderTopWidth: 1, borderTopColor: cnd.line, paddingTop: 10 },
  svSecT: { fontSize: 13, fontWeight: '900', color: cnd.ink, marginBottom: 5 },
  svLi: { flexDirection: 'row', gap: 8, marginTop: 3 },
  svMark: { fontSize: 13, fontWeight: '900', width: 14, lineHeight: 19 },
  svLiTx: { flex: 1, fontSize: 13, color: cnd.ink2, lineHeight: 19 },
  installCard: { borderWidth: 1.5, borderColor: cnd.yellow, backgroundColor: cnd.yellowSoft, borderRadius: 13, padding: 14, marginTop: 10, gap: 6 },
  ih: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ihT: { fontSize: 14, fontWeight: '800', color: cnd.ink },
  ihSub: { fontSize: 12, color: cnd.ink2 },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  feeL: { fontSize: 12.5, fontWeight: '800', color: cnd.ink2 },
  feeV: { fontSize: 13, fontWeight: '900', color: cnd.brandDark },
  addBtn: { backgroundColor: cnd.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  addTx: { color: cnd.white, fontWeight: '800', fontSize: 15 },
});
