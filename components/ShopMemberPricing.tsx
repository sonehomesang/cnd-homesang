import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MEMBER_GROUPS, type MemberDiscountRule } from '@/lib/memberPricing';
import { setShopMemberRules, type Shop } from '@/lib/shop';
import { colors, font, radius, shadow } from '@/lib/theme';
import { useTT } from '@/lib/i18n';

/**
 * Shop-level member/group discount rules — the shop's own negotiated rates
 * (overrides the global default, overridden by per-product). Each shop sets its
 * own %; category optional (empty = every category).
 */
export default function ShopMemberPricing({ shop }: { shop: Shop }) {
  const tt = useTT();
  const [rules, setRules] = useState<MemberDiscountRule[]>(shop.memberDiscountRules ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // re-sync when the shop changes (shop is loaded once, not live-watched)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setRules(shop.memberDiscountRules ?? []); }, [shop.id]);

  const patch = (i: number, p: Partial<MemberDiscountRule>) => { setRules((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x))); setSaved(false); };
  const remove = (i: number) => { setRules((r) => r.filter((_, j) => j !== i)); setSaved(false); };
  const add = () => { setRules((r) => [...r, { group: MEMBER_GROUPS[0].key, category: '', pct: 0 }]); setSaved(false); };
  const save = async () => {
    setSaving(true);
    try { await setShopMemberRules(shop.id, rules); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    finally { setSaving(false); }
  };

  return (
    <View>
      <Text style={styles.title}>🏷️ {tt('shopManage', 'ລາຄາສະມາຊິກ ຂອງ ຮ້ານ')}</Text>
      <Text style={styles.sub}>{tt('shopManage', 'ຕັ້ງ ສ່ວນຫຼຸດ % ຕາມ ກຸ່ມ ລູກຄ້າ (ຊ່າງ/ບໍລິສັດ/ທົ່ວໄປ). ວ່າງ category = ທຸກ ໝວດ. ທັບ ຄ່າ default ທົ່ວລະບົບ.')}</Text>

      {rules.length === 0 && <Text style={styles.empty}>{tt('shopManage', 'ຍັງບໍ່ມີ — ກົດ «＋ ເພີ່ມ ກົດເກນ»')}</Text>}
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
            <TextInput value={r.category ?? ''} onChangeText={(v) => patch(i, { category: v })} placeholder={tt('shopManage', 'category (ວ່າງ=ທຸກໝວດ)')} placeholderTextColor="#999" style={styles.catInput} />
            <TextInput value={String(r.pct)} onChangeText={(v) => patch(i, { pct: Number(v.replace(/[^\d.]/g, '')) || 0 })} keyboardType="numeric" style={styles.pctInput} />
            <Text style={styles.pctUnit}>%</Text>
            <Pressable style={styles.rm} onPress={() => remove(i)}><Text style={styles.rmText}>✕</Text></Pressable>
          </View>
        </View>
      ))}

      <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addText}>{tt('shopManage', '＋ ເພີ່ມ ກົດເກນ')}</Text></Pressable>
      <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        <Text style={styles.saveText}>{saving ? '...' : tt('shopManage', '💾 ບັນທຶກ')}</Text>
      </Pressable>
      {saved && <Text style={styles.ok}>✅ {tt('shopManage', 'ບັນທຶກແລ້ວ')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.md, fontWeight: '700', color: colors.text },
  sub: { fontSize: font.xs, color: colors.text3, marginTop: 2, marginBottom: 12, lineHeight: 17 },
  empty: { fontSize: font.sm, color: colors.text3, fontStyle: 'italic', paddingVertical: 10, textAlign: 'center' },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, marginBottom: 10, backgroundColor: colors.surface, ...shadow.card },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipText: { fontSize: font.xs, color: colors.text2 },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  catInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 9, fontSize: font.sm, color: colors.text, backgroundColor: colors.surface },
  pctInput: { width: 60, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 9, fontSize: font.md, color: colors.text, textAlign: 'center', backgroundColor: colors.surface },
  pctUnit: { fontSize: font.md, color: colors.text2 },
  rm: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  rmText: { color: colors.error, fontSize: 15, fontWeight: '700' },
  addBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#ddd6fe', backgroundColor: '#faf5ff', borderRadius: radius.md, padding: 12, alignItems: 'center', marginTop: 4 },
  addText: { color: '#7c3aed', fontWeight: '700', fontSize: font.sm },
  saveBtn: { backgroundColor: '#7c3aed', borderRadius: radius.md, padding: 13, alignItems: 'center', marginTop: 10 },
  saveText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  ok: { fontSize: font.sm, color: '#16a34a', textAlign: 'center', marginTop: 10 },
});
