import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AmountInput from '@/components/AmountInput';
import { type AppSettings, DEFAULT_SETTINGS, saveAppSettings, watchAppSettings } from '@/lib/appSettings';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';

const FIELDS: { key: keyof AppSettings; label: string; suffix: string; hint?: string; money?: boolean }[] = [
  { key: 'platformFeePct', label: 'ຄ່າທຳນຽມ ລະບົບ (system fee)', suffix: '%', hint: 'ຫັກຈາກ ລາຄາງານ ທີ່ສຳເລັດ' },
  { key: 'vatPct', label: 'ອາກອນ / VAT', suffix: '%', hint: 'ສຳລັບ ລາຍງານ' },
  { key: 'referralRewardKip', label: 'ລາງວັນ ແນະນຳເພື່ອນ', suffix: 'ກີບ', hint: 'ຕໍ່ 1 ການແນະນຳສຳເລັດ', money: true },
  { key: 'minWithdrawalKip', label: 'ຖອນເງິນ ຂັ້ນຕ່ຳ', suffix: 'ກີບ', money: true },
];

export default function FeeRatesPanel() {
  const { canEdit } = useSectionPerms('finance');
  const tt = useTT();
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => watchAppSettings(setS), []);
  useEffect(() => {
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String((s as any)[f.key] ?? 0)])));
  }, [s]);

  const save = async () => {
    const patch: any = {};
    for (const f of FIELDS) patch[f.key] = Number(form[f.key] ?? 0) || 0;
    await saveAppSettings(patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View>
      <Text style={styles.title}>🧾 {tt('admFeeRates', 'ຄ່າທຳນຽມ ແລະ ອັດຕາ · Fee rates')}</Text>
      <Text style={styles.sub}>{tt('admFeeRates', 'ກຳນົດ ອັດຕາຄ່າທຳນຽມ ຂອງ ແພລດຟອມ')}</Text>

      {FIELDS.map((f) => (
        <View key={f.key} style={styles.field}>
          <Text style={styles.label}>{tt('admFeeRates', f.label)}</Text>
          <View style={styles.inputRow}>
            {f.money ? (
              <AmountInput
                value={Number(form[f.key] ?? 0) || 0}
                onChangeValue={(n) => setForm((p) => ({ ...p, [f.key]: String(n) }))}
                style={styles.input}
              />
            ) : (
              <TextInput
                value={form[f.key] ?? ''}
                onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                keyboardType="numeric"
                style={styles.input}
              />
            )}
            <Text style={styles.suffix}>{tt('admFeeRates', f.suffix)}</Text>
          </View>
          {!!f.hint && <Text style={styles.hint}>{tt('admFeeRates', f.hint)}</Text>}
        </View>
      ))}

      {canEdit && <Pressable style={styles.btn} onPress={save}><Text style={styles.btnText}>💾 {tt('admFeeRates', 'ບັນທຶກ')}</Text></Pressable>}
      {saved && <Text style={styles.ok}>✅ {tt('admFeeRates', 'ບັນທຶກແລ້ວ')}</Text>}
      <Text style={styles.note}>{tt('admFeeRates', 'ໝາຍເຫດ: system fee % ໃຊ້ສະແດງ/ລາຍງານ — ການຫັກຈິງ ໃນ wallet ໃຊ້ PLATFORM_FEE_RATE (10%). ປັບໃຫ້ກົງກັນ ຖ້າປ່ຽນ.')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  field: { marginBottom: 14 },
  label: { fontSize: 14, color: '#111', fontWeight: '600', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  suffix: { fontSize: 14, color: '#6b7280', width: 40 },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  btn: { backgroundColor: '#0066CC', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ok: { fontSize: 13, color: '#16a34a', textAlign: 'center', marginTop: 10 },
  note: { fontSize: 12, color: '#9ca3af', marginTop: 16, lineHeight: 18 },
});
