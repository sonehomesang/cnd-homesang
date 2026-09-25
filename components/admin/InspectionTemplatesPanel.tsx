import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';
import { getCategory } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import {
  type InspectionTemplate,
  saveInspectionTemplate,
  seedInspectionTemplates,
  type StdParam,
  watchInspectionTemplates,
} from '@/lib/inspectionTemplates';

export default function InspectionTemplatesPanel() {
  const { canEdit } = useSectionPerms('survey');
  const tt = useTT();
  const [list, setList] = useState<InspectionTemplate[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => watchInspectionTemplates(setList), []);

  const seed = async () => {
    setSeeding(true); setMsg('');
    try { const n = await seedInspectionTemplates(); setMsg(`✓ ${tt('admInsp', 'ນຳ ຕົວຢ່າງ')} ${n} ${tt('admInsp', 'ໝວດ')}`); }
    catch (e: any) { setMsg('❌ ' + (e?.message ?? String(e))); }
    finally { setSeeding(false); }
  };

  return (
    <View>
      <Text style={styles.title}>📋 {tt('admInsp', 'ໃບກວດງານ + ຮັບປະກັນ · ມາດຕະຖານ ໝວດ')}</Text>
      <Text style={styles.sub}>{tt('admInsp', 'ລາຍການ ກວດ ຕອນ ສົ່ງມອບ + ໄລຍະ ຮັບປະກັນ ຕໍ່ ໝວດ ບໍລິການ. ຊ່າງ ດຶງ ໄປ ໃຊ້ ໃນ ໃບ ມອບຮັບ ວຽກ.')}</Text>

      {canEdit && (
        <View style={styles.seedRow}>
          <Pressable style={[styles.seedBtn, seeding && { opacity: 0.5 }]} onPress={seed} disabled={seeding}>
            <Text style={styles.seedText}>{seeding ? tt('admInsp', 'ກຳລັງ...') : tt('admInsp', '🌱 ນຳ ຕົວຢ່າງ ມາດຕະຖານ (ໝວດ ທີ່ ຍັງ ບໍ່ ມີ)')}</Text>
          </Pressable>
          {msg !== '' && <Text style={styles.msg}>{msg}</Text>}
        </View>
      )}

      {list.length === 0 ? (
        <Text style={styles.empty}>{tt('admInsp', 'ຍັງ ບໍ່ ມີ — ກົດ 🌱 ນຳ ຕົວຢ່າງ')}</Text>
      ) : (
        list.map((t) => <TemplateCard key={t.category} t={t} canEdit={canEdit} />)
      )}
    </View>
  );
}

function TemplateCard({ t, canEdit }: { t: InspectionTemplate; canEdit: boolean }) {
  const tt = useTT();
  const cat = getCategory(t.category);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(t.items.join('\n'));
  const [months, setMonths] = useState(String(t.warrantyMonths));
  const [terms, setTerms] = useState(t.warrantyTerms);
  const [manual, setManual] = useState(t.manualUrl ?? '');
  const [params, setParams] = useState<StdParam[]>(t.params ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const setParam = (i: number, patch: Partial<StdParam>) => setParams((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await saveInspectionTemplate(t.category, {
        name: t.name,
        items: items.split('\n').map((s) => s.trim()).filter(Boolean),
        params: params.filter((p) => p.key.trim() !== '').map((p) => ({ key: p.key.trim(), unit: p.unit?.trim() || undefined, standard: p.standard?.trim() || undefined })),
        warrantyMonths: Number(months.replace(/\D/g, '')) || 0,
        warrantyTerms: terms.trim(),
        manualUrl: manual.trim() || undefined,
      });
      setSaved(true);
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.card}>
      <Pressable style={styles.cardTop} onPress={() => setOpen((o) => !o)}>
        <Text style={styles.cat}><CategoryIcon icon={cat?.icon} size={14} color="#0066CC" /> {cat?.lao ?? t.category}</Text>
        <Text style={styles.meta}>{t.items.length} {tt('admInsp', 'ຂໍ້')} · 🛡️ {t.warrantyMonths} {tt('admInsp', 'ດ')}</Text>
        <Text style={styles.chev}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open && (
        <View style={styles.body}>
          <Text style={styles.label}>{tt('admInsp', 'ລາຍການ ກວດ (1 ແຖວ = 1 ຂໍ້)')}</Text>
          <TextInput value={items} onChangeText={setItems} editable={canEdit} multiline style={[styles.input, styles.area]} placeholderTextColor="#999" />
          <View style={styles.row}>
            <View style={{ width: 110 }}>
              <Text style={styles.label}>{tt('admInsp', 'ຮັບປະກັນ (ເດືອນ)')}</Text>
              <TextInput value={months} onChangeText={setMonths} editable={canEdit} keyboardType="number-pad" style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{tt('admInsp', 'ລິ້ງ ຄູ່ມື (ບໍ່ບັງຄັບ)')}</Text>
              <TextInput value={manual} onChangeText={setManual} editable={canEdit} autoCapitalize="none" style={styles.input} placeholderTextColor="#999" />
            </View>
          </View>
          <Text style={styles.label}>{tt('admInsp', 'ຄ່າ ພາຣາມິເຕີ ມາດຕະຖານ (ຊື່ · ມາດຕະຖານ · ໜ່ວຍ)')}</Text>
          {params.map((p, i) => (
            <View key={i} style={styles.pRow}>
              <TextInput value={p.key} onChangeText={(v) => setParam(i, { key: v })} editable={canEdit} placeholder={tt('admInsp', 'ຊື່')} placeholderTextColor="#999" style={[styles.input, { flex: 1.5 }]} />
              <TextInput value={p.standard ?? ''} onChangeText={(v) => setParam(i, { standard: v })} editable={canEdit} placeholder={tt('admInsp', 'ມາດຕະຖານ')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
              <TextInput value={p.unit ?? ''} onChangeText={(v) => setParam(i, { unit: v })} editable={canEdit} placeholder={tt('admInsp', 'ໜ່ວຍ')} placeholderTextColor="#999" style={[styles.input, { width: 56 }]} />
              {canEdit && <Pressable onPress={() => setParams((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={6}><Text style={styles.pRm}>✕</Text></Pressable>}
            </View>
          ))}
          {canEdit && (
            <Pressable style={styles.addP} onPress={() => setParams((p) => [...p, { key: '', unit: '', standard: '' }])}>
              <Text style={styles.addPText}>＋ {tt('admInsp', 'ເພີ່ມ ພາຣາມິເຕີ')}</Text>
            </Pressable>
          )}

          <Text style={styles.label}>{tt('admInsp', 'ເງື່ອນໄຂ ຮັບປະກັນ')}</Text>
          <TextInput value={terms} onChangeText={setTerms} editable={canEdit} multiline style={[styles.input, styles.area]} placeholderTextColor="#999" />
          {canEdit && (
            <Pressable style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving}>
              <Text style={styles.saveText}>{saving ? '...' : saved ? tt('admInsp', '✓ ບັນທຶກ ແລ້ວ') : tt('admInsp', '💾 ບັນທຶກ')}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  seedRow: { marginBottom: 12 },
  seedBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#16a34a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  seedText: { color: '#16a34a', fontSize: 13, fontWeight: '700' },
  msg: { fontSize: 12, color: '#374151', marginTop: 6 },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 14 },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, marginBottom: 8, backgroundColor: '#fff', overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  cat: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111' },
  meta: { fontSize: 12, color: '#6b7280' },
  chev: { fontSize: 12, color: '#9ca3af' },
  body: { padding: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  label: { fontSize: 12, color: '#6b7280', fontWeight: '600', marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 13, color: '#111', backgroundColor: '#fff' },
  area: { minHeight: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  saveBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginTop: 12 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  pRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 },
  pRm: { color: '#dc2626', fontSize: 14, fontWeight: '700', paddingHorizontal: 2 },
  addP: { alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderColor: '#0369a1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addPText: { color: '#0369a1', fontSize: 12, fontWeight: '700' },
});
