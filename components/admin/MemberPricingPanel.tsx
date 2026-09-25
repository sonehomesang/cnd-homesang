import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { type AppSettings, DEFAULT_SETTINGS, saveAppSettings, watchAppSettings } from '@/lib/appSettings';
import { MEMBER_GROUPS, type MemberDiscountRule } from '@/lib/memberPricing';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';

/**
 * Global default member/group discounts (the base layer). Shop rules and
 * per-product overrides take precedence. Every % is set here — never hardcoded.
 */
export default function MemberPricingPanel() {
  const { canEdit } = useSectionPerms('finance');
  const tt = useTT();
  const [rules, setRules] = useState<MemberDiscountRule[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => watchAppSettings((s: AppSettings) => setRules(s.memberDiscounts ?? DEFAULT_SETTINGS.memberDiscounts)), []);

  const patch = (i: number, p: Partial<MemberDiscountRule>) => { setRules((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x))); setSaved(false); };
  const remove = (i: number) => { setRules((r) => r.filter((_, j) => j !== i)); setSaved(false); };
  const add = () => { setRules((r) => [...r, { group: MEMBER_GROUPS[0].key, category: '', pct: 0 }]); setSaved(false); };
  const save = async () => {
    await saveAppSettings({ memberDiscounts: rules.filter((r) => r.group && r.pct > 0) });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View>
      <Text style={styles.title}>👥 {tt('admMemberPricing', 'ລາຄາສະມາຊິກ · ຄ່າ default ທົ່ວລະບົບ')}</Text>
      <Text style={styles.sub}>{tt('admMemberPricing', 'ສ່ວນຫຼຸດ % ຕາມ ກຸ່ມ ບັນຊີ (ຊ່າງ/ບໍລິສັດ/ທົ່ວໄປ). ນີ້ ເປັນ ຄ່າ ພື້ນຖານ — ຮ້ານ ຫຼື ສິນຄ້າ ຕັ້ງ ທັບ ໄດ້. ວ່າງ category = ທຸກ ໝວດ.')}</Text>

      {rules.length === 0 && <Text style={styles.empty}>{tt('admMemberPricing', 'ຍັງບໍ່ມີ — ກົດ «＋ ເພີ່ມ ກົດເກນ»')}</Text>}
      {rules.map((r, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.groupRow}>
            {MEMBER_GROUPS.map((g) => (
              <Pressable key={g.key} style={[styles.chip, r.group === g.key && styles.chipOn]} onPress={() => patch(i, { group: g.key })}>
                <Text style={[styles.chipText, r.group === g.key && styles.chipTextOn]}>{g.icon} {g.label.split(' ')[0]}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            <TextInput value={r.category ?? ''} onChangeText={(v) => patch(i, { category: v })} placeholder={tt('admMemberPricing', 'category (ວ່າງ = ທຸກໝວດ)')} placeholderTextColor="#999" style={styles.catInput} />
            <TextInput value={String(r.pct)} onChangeText={(v) => patch(i, { pct: Number(v.replace(/[^\d.]/g, '')) || 0 })} keyboardType="numeric" style={styles.pctInput} />
            <Text style={styles.pctUnit}>%</Text>
            {canEdit && <Pressable style={styles.rm} onPress={() => remove(i)}><Text style={styles.rmText}>✕</Text></Pressable>}
          </View>
        </View>
      ))}

      {canEdit && (
        <>
          <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addText}>＋ {tt('admMemberPricing', 'ເພີ່ມ ກົດເກນ')}</Text></Pressable>
          <Pressable style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>💾 {tt('admMemberPricing', 'ບັນທຶກ')}</Text></Pressable>
        </>
      )}
      {saved && <Text style={styles.ok}>✅ {tt('admMemberPricing', 'ບັນທຶກແລ້ວ')}</Text>}
      <Text style={styles.note}>{tt('admMemberPricing', 'ໃຊ້ ຕອນ checkout: ລະບົບ ຮູ້ ກຸ່ມ ຂອງ ຜູ້ຊື້ → ຫຼຸດ ອັດຕະໂນມັດ (best-price-wins ກັບ flash/group-buy). ບໍ່ ບວກ ຊ້ອນ.')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14, lineHeight: 17 },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 10 },
  card: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 10 },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipText: { fontSize: 12, color: '#6b7280' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  catInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 13, color: '#111' },
  pctInput: { width: 64, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 14, color: '#111', textAlign: 'center' },
  pctUnit: { fontSize: 14, color: '#6b7280' },
  rm: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  rmText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },
  addBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#ddd6fe', backgroundColor: '#faf5ff', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  addText: { color: '#7c3aed', fontWeight: '700', fontSize: 13 },
  saveBtn: { backgroundColor: '#7c3aed', borderRadius: 8, padding: 13, alignItems: 'center', marginTop: 10 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ok: { fontSize: 13, color: '#16a34a', textAlign: 'center', marginTop: 10 },
  note: { fontSize: 12, color: '#9ca3af', marginTop: 16, lineHeight: 18 },
});
