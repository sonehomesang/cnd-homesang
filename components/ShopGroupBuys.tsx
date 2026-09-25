import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Product } from '@/lib/shop';
import {
  closeGroupBuy,
  createGroupBuy,
  gbCountdown,
  gbState,
  type GroupBuy,
  watchGroupBuysByShop,
} from '@/lib/groupBuys';
import { colors, font, radius, shadow } from '@/lib/theme';
import { useTT } from '@/lib/i18n';
import AmountInput from '@/components/AmountInput';

const DAY = 86400000;
const DURATIONS = [
  { label: '1 ມື້', ms: DAY },
  { label: '3 ມື້', ms: 3 * DAY },
  { label: '7 ມື້', ms: 7 * DAY },
];

/**
 * Shop dashboard tab — open & manage group-buy campaigns for this shop's own
 * products. Pick a product, set the group price + target headcount + duration,
 * open it. Live campaigns show progress; owner can close early.
 */
export default function ShopGroupBuys({ shopId, products, uid }: { shopId: string; products: Product[]; uid: string }) {
  const tt = useTT();
  const [items, setItems] = useState<GroupBuy[]>([]);
  const [now, setNow] = useState(Date.now());
  const [pid, setPid] = useState('');
  const [price, setPrice] = useState('');
  const [target, setTarget] = useState('10');
  const [durIdx, setDurIdx] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => watchGroupBuysByShop(shopId, setItems), [shopId]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sellable = products.filter((p) => p.active !== false);
  const chosen = sellable.find((p) => p.id === pid) ?? null;

  const open = async () => {
    setErr('');
    if (!chosen) { setErr(tt('groupBuy', 'ເລືອກ ສິນຄ້າ ກ່ອນ')); return; }
    const gp = parseInt(price.replace(/\D/g, ''), 10);
    const tg = parseInt(target.replace(/\D/g, ''), 10);
    if (!Number.isFinite(gp) || gp <= 0 || gp >= (chosen.price ?? 0)) { setErr(tt('groupBuy', 'ລາຄາກຸ່ມ ຕ້ອງ ຕ່ຳກວ່າ ລາຄາປົກກະຕິ')); return; }
    if (!Number.isFinite(tg) || tg < 2) { setErr(tt('groupBuy', 'ເປົ້າ ຕ້ອງ ຢ່າງໜ້ອຍ 2 ຄົນ')); return; }
    setSaving(true);
    try {
      await createGroupBuy({
        productId: chosen.id,
        shopId,
        productName: chosen.name,
        productImage: chosen.images?.[0],
        productUnit: chosen.unit,
        origPrice: chosen.price ?? 0,
        groupPrice: gp,
        target: tg,
        endsAt: Date.now() + DURATIONS[durIdx].ms,
        createdBy: uid,
      });
      setPid(''); setPrice(''); setTarget('10'); setDurIdx(1);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <View style={styles.form}>
        <Text style={styles.formTitle}>👥 {tt('groupBuy', 'ເປີດ ຊື້ເປັນກຸ່ມ')}</Text>

        <Text style={styles.label}>{tt('groupBuy', 'ສິນຄ້າ')}</Text>
        <View style={styles.chips}>
          {sellable.length === 0 ? (
            <Text style={styles.muted}>{tt('groupBuy', 'ຍັງບໍ່ມີສິນຄ້າ')}</Text>
          ) : sellable.map((p) => (
            <Pressable key={p.id} style={[styles.chip, pid === p.id && styles.chipOn]} onPress={() => { setPid(p.id); setPrice(''); }}>
              <Text style={[styles.chipText, pid === p.id && styles.chipTextOn]} numberOfLines={1}>{p.name}</Text>
            </Pressable>
          ))}
        </View>

        {chosen && (
          <>
            <Text style={styles.hint}>{tt('groupBuy', 'ລາຄາປົກກະຕິ')}: {(chosen.price ?? 0).toLocaleString()} {tt('groupBuy', 'ກີບ')}</Text>
            <View style={styles.row}>
              <View style={{ flex: 1.4 }}>
                <Text style={styles.label}>{tt('groupBuy', 'ລາຄາກຸ່ມ (ກີບ)')}</Text>
                <AmountInput value={price ? Number(price) : 0} onChangeValue={(v) => setPrice(v ? String(v) : '')} placeholder="0" placeholderTextColor="#999" style={styles.input} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{tt('groupBuy', 'ເປົ້າ (ຄົນ)')}</Text>
                <TextInput value={target} onChangeText={(v) => setTarget(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="10" placeholderTextColor="#999" style={styles.input} />
              </View>
            </View>
            <Text style={styles.label}>{tt('groupBuy', 'ໄລຍະເວລາ')}</Text>
            <View style={styles.durs}>
              {DURATIONS.map((d, i) => (
                <Pressable key={d.label} style={[styles.dur, durIdx === i && styles.durOn]} onPress={() => setDurIdx(i)}>
                  <Text style={[styles.durText, durIdx === i && styles.durTextOn]}>{d.label}</Text>
                </Pressable>
              ))}
            </View>
            {err !== '' && <Text style={styles.err}>❌ {err}</Text>}
            <Pressable style={[styles.btn, saving && styles.btnOff]} onPress={open} disabled={saving}>
              <Text style={styles.btnText}>{saving ? '...' : tt('groupBuy', '💾 ເປີດ campaign')}</Text>
            </Pressable>
          </>
        )}
        {!chosen && err !== '' && <Text style={styles.err}>❌ {err}</Text>}
      </View>

      <Text style={styles.listTitle}>{tt('groupBuy', 'campaign ຂອງຮ້ານ')} ({items.length})</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>{tt('groupBuy', 'ຍັງບໍ່ມີ — ເປີດ campaign ທຳອິດ')}</Text>
      ) : items.map((g) => {
        const st = gbState(g, now);
        return (
          <View key={g.id} style={styles.gRow}>
            <Image source={{ uri: g.productImage }} style={styles.gThumb} />
            <View style={{ flex: 1 }}>
              <Text style={styles.gName} numberOfLines={1}>{g.productName}</Text>
              <Text style={styles.gMeta}>{g.groupPrice.toLocaleString()} {tt('groupBuy', 'ກີບ')} · 👥 {st.count}/{g.target}</Text>
              <Text style={[styles.gStatus, st.unlocked ? styles.sDone : st.expired ? styles.sExp : styles.sOpen]}>
                {st.unlocked ? tt('groupBuy', '✅ ປົດລັອກແລ້ວ') : st.expired ? tt('groupBuy', '⌛ ໝົດເວລາ') : `⏳ ${gbCountdown(g.endsAt, now)}`}
              </Text>
            </View>
            {!st.expired && (
              <Pressable style={styles.closeBtn} onPress={() => closeGroupBuy(g.id)}>
                <Text style={styles.closeText}>{tt('groupBuy', 'ປິດ')}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 16, ...shadow.card },
  formTitle: { fontSize: font.md, fontWeight: '700', color: colors.text, marginBottom: 4 },
  label: { fontSize: font.xs, color: colors.text2, marginTop: 12, marginBottom: 4 },
  hint: { fontSize: font.xs, color: colors.text3, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, fontSize: font.md, color: colors.text, backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { maxWidth: 160, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipText: { fontSize: font.xs, color: colors.text2 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  muted: { fontSize: font.sm, color: colors.text3 },
  durs: { flexDirection: 'row', gap: 6 },
  dur: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  durOn: { backgroundColor: '#ede9fe', borderColor: '#7c3aed' },
  durText: { fontSize: font.sm, color: colors.text2, fontWeight: '600' },
  durTextOn: { color: '#7c3aed', fontWeight: '700' },
  btn: { backgroundColor: '#7c3aed', padding: 14, borderRadius: radius.md, alignItems: 'center', marginTop: 16 },
  btnOff: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  err: { color: colors.error, fontSize: font.sm, marginTop: 10 },
  listTitle: { fontSize: font.md, fontWeight: '700', color: colors.text, marginBottom: 8 },
  empty: { fontSize: font.sm, color: colors.text3, fontStyle: 'italic', textAlign: 'center', paddingVertical: 20 },
  gRow: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, marginBottom: 8, ...shadow.card },
  gThumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#ede9fe' },
  gName: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  gMeta: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  gStatus: { fontSize: font.xs, fontWeight: '700', marginTop: 3, fontVariant: ['tabular-nums'] },
  sOpen: { color: '#7c3aed' },
  sDone: { color: '#16a34a' },
  sExp: { color: colors.text3 },
  closeBtn: { borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#64748b' },
  closeText: { fontSize: font.xs, color: '#fff', fontWeight: '600' },
});
