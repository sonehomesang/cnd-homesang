import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AmountInput from '@/components/AmountInput';
import {
  DEFAULT_PLATFORM_FEES,
  FEE_CONDITION_LABEL,
  type FeeCondition,
  type PlatformFeeComponent,
  savePlatformFees,
  seedPlatformFeesIfEmpty,
  watchPlatformFees,
} from '@/lib/platformFees';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';

const CONDITIONS: FeeCondition[] = ['all', 'express', 'cod', 'bank'];

export default function PlatformFeesPanel() {
  const { canEdit } = useSectionPerms('finance');
  const tt = useTT();
  const [comps, setComps] = useState<PlatformFeeComponent[]>(DEFAULT_PLATFORM_FEES);
  const [saved, setSaved] = useState(false);

  useEffect(() => { seedPlatformFeesIfEmpty().catch(() => {}); }, []);
  useEffect(() => watchPlatformFees(setComps), []);

  const patch = (i: number, p: Partial<PlatformFeeComponent>) => {
    setComps((prev) => prev.map((c, j) => (j === i ? { ...c, ...p } : c)));
    setSaved(false);
  };
  const remove = (i: number) => { setComps((prev) => prev.filter((_, j) => j !== i)); setSaved(false); };
  const add = () => {
    setComps((prev) => [...prev, { key: `fee${prev.length + 1}`, emoji: '✨', label: 'ຄ່າບໍລິການ ໃໝ່', kind: 'pct', value: 0, appliesTo: 'all', enabled: false }]);
    setSaved(false);
  };
  const save = async () => {
    await savePlatformFees(comps);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View>
      <Text style={styles.title}>🧾 {tt('admPlatformFees', 'ຄ່າທຳນຽມ ບໍລິການ (value-added take-rate)')}</Text>
      <Text style={styles.sub}>{tt('admPlatformFees', 'Take-rate ຕາມ ບໍລິການ (escrow/express/COD) — back-office, ບໍ່ບວກ ໃສ່ ລູກຄ້າ, ຫັກ ຕອນ settle ຮ້ານ. ປິດ = ບໍ່ຄິດ.')}</Text>

      {comps.map((c, i) => (
        <View key={i} style={[styles.card, !c.enabled && styles.cardOff]}>
          <View style={styles.head}>
            <TextInput value={c.emoji ?? ''} onChangeText={(v) => patch(i, { emoji: v })} style={styles.emoji} maxLength={2} />
            <TextInput value={c.label} onChangeText={(v) => patch(i, { label: v })} style={styles.labelInput} placeholder={tt('admPlatformFees', 'ຊື່ ຄ່າທຳນຽມ')} placeholderTextColor="#999" />
            <Pressable style={[styles.sw, c.enabled ? styles.swOn : styles.swOff]} onPress={() => patch(i, { enabled: !c.enabled })}>
              <View style={[styles.swDot, c.enabled && styles.swDotOn]} />
            </Pressable>
          </View>
          <View style={styles.row}>
            <View style={styles.kindTabs}>
              <Pressable style={[styles.kindTab, c.kind === 'pct' && styles.kindOn]} onPress={() => patch(i, { kind: 'pct' })}>
                <Text style={[styles.kindText, c.kind === 'pct' && styles.kindTextOn]}>%</Text>
              </Pressable>
              <Pressable style={[styles.kindTab, c.kind === 'flat' && styles.kindOn]} onPress={() => patch(i, { kind: 'flat' })}>
                <Text style={[styles.kindText, c.kind === 'flat' && styles.kindTextOn]}>{tt('common', 'ກີບ')}</Text>
              </Pressable>
            </View>
            <AmountInput
              value={c.value}
              onChangeValue={(n) => patch(i, { value: n })}
              decimals
              style={styles.valInput}
            />
            <Text style={styles.unit}>{c.kind === 'pct' ? tt('admPlatformFees', '% ຂອງ subtotal') : tt('admPlatformFees', 'ຕໍ່ order')}</Text>
          </View>
          <View style={styles.condRow}>
            {CONDITIONS.map((cond) => (
              <Pressable key={cond} style={[styles.cond, c.appliesTo === cond && styles.condOn]} onPress={() => patch(i, { appliesTo: cond })}>
                <Text style={[styles.condText, c.appliesTo === cond && styles.condTextOn]}>{tt('admPlatformFees', FEE_CONDITION_LABEL[cond])}</Text>
              </Pressable>
            ))}
            {canEdit && <Pressable style={styles.rm} onPress={() => remove(i)}><Text style={styles.rmText}>✕</Text></Pressable>}
          </View>
        </View>
      ))}

      {canEdit && (
        <>
          <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addText}>＋ {tt('admPlatformFees', 'ເພີ່ມ component')}</Text></Pressable>
          <Pressable style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>💾 {tt('admPlatformFees', 'ບັນທຶກ')}</Text></Pressable>
        </>
      )}
      {saved && <Text style={styles.ok}>✅ {tt('admPlatformFees', 'ບັນທຶກແລ້ວ')}</Text>}
      <Text style={styles.note}>{tt('admPlatformFees', 'ໝາຍເຫດ: ຄິດ ຕອນ ສັ່ງຊື້ → ບັນທຶກ ໃສ່ order (platformFees). ລວມ ຢູ່ ແທັບ «ຄອມ ເຂົ້າ». ບໍ່ ແຕະ ລາຄາ ລູກຄ້າ.')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14, lineHeight: 17 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 10 },
  cardOff: { opacity: 0.62 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emoji: { width: 38, textAlign: 'center', fontSize: 15, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 6 },
  labelInput: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 8, fontSize: 14, fontWeight: '600', color: '#111' },
  sw: { width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center' },
  swOn: { backgroundColor: '#16a34a' },
  swOff: { backgroundColor: '#cbd5e1' },
  swDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  swDotOn: { alignSelf: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  kindTabs: { flexDirection: 'row', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, overflow: 'hidden' },
  kindTab: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  kindOn: { backgroundColor: '#16a34a' },
  kindText: { fontSize: 13, color: '#6b7280', fontWeight: '700' },
  kindTextOn: { color: '#fff' },
  valInput: { width: 80, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, fontSize: 14, color: '#111', textAlign: 'center' },
  unit: { fontSize: 12, color: '#9ca3af', flex: 1 },
  condRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' },
  cond: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  condOn: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  condText: { fontSize: 12, color: '#6b7280' },
  condTextOn: { color: '#1d4ed8', fontWeight: '700' },
  rm: { marginLeft: 'auto', width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  rmText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },
  addBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#86efac', backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  addText: { color: '#16a34a', fontWeight: '700', fontSize: 13 },
  saveBtn: { backgroundColor: '#16a34a', borderRadius: 8, padding: 13, alignItems: 'center', marginTop: 10 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ok: { fontSize: 13, color: '#16a34a', textAlign: 'center', marginTop: 10 },
  note: { fontSize: 12, color: '#9ca3af', marginTop: 16, lineHeight: 18 },
});
