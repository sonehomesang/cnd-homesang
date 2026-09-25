import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';
import {
  DEFAULT_SERVICE_CONFIG,
  saveServiceConfig,
  type ServiceConfig,
  type TermsClause,
  watchServiceConfig,
  type WorkOption,
} from '@/lib/serviceConfig';

function genKey() {
  return 'k' + Math.random().toString(36).slice(2, 8);
}

export default function ServiceConfigPanel() {
  const { canEdit } = useSectionPerms('settings');
  const tt = useTT();
  const [cfg, setCfg] = useState<ServiceConfig>(DEFAULT_SERVICE_CONFIG);
  const [workTypes, setWorkTypes] = useState<WorkOption[]>([]);
  const [continuity, setContinuity] = useState<WorkOption[]>([]);
  const [terms, setTerms] = useState<TermsClause[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => watchServiceConfig(setCfg), []);
  useEffect(() => {
    if (loaded) return;
    setWorkTypes(cfg.workTypes); setContinuity(cfg.continuity); setTerms(cfg.terms); setLoaded(true);
  }, [cfg, loaded]);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await saveServiceConfig({
        workTypes: workTypes.filter((o) => o.label.trim()).map((o) => ({ key: o.key || genKey(), label: o.label.trim(), icon: o.icon?.trim() || undefined })),
        continuity: continuity.filter((o) => o.label.trim()).map((o) => ({ key: o.key || genKey(), label: o.label.trim(), icon: o.icon?.trim() || undefined })),
        terms: terms.filter((t) => t.title.trim() || t.body.trim()).map((t) => ({ title: t.title.trim(), body: t.body.trim() })),
      });
      setSaved(true);
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setSaving(false); }
  };

  const optRow = (list: WorkOption[], setList: (v: WorkOption[]) => void) => (
    <>
      {list.map((o, i) => (
        <View key={i} style={styles.row}>
          <TextInput value={o.icon ?? ''} onChangeText={(v) => setList(list.map((x, idx) => idx === i ? { ...x, icon: v } : x))} editable={canEdit} placeholder="😀" placeholderTextColor="#999" style={[styles.input, { width: 48, textAlign: 'center' }]} />
          <TextInput value={o.label} onChangeText={(v) => setList(list.map((x, idx) => idx === i ? { ...x, label: v } : x))} editable={canEdit} placeholder={tt('admSvc', 'ຊື່')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
          {canEdit && <Pressable onPress={() => setList(list.filter((_, idx) => idx !== i))} hitSlop={6}><Text style={styles.rm}>✕</Text></Pressable>}
        </View>
      ))}
      {canEdit && <Pressable style={styles.add} onPress={() => setList([...list, { key: genKey(), label: '', icon: '' }])}><Text style={styles.addText}>＋ {tt('admSvc', 'ເພີ່ມ')}</Text></Pressable>}
    </>
  );

  return (
    <View>
      <Text style={styles.title}>🧾 {tt('admSvc', 'ປະເພດ ວຽກ + ເງື່ອນໄຂ ບໍລິການ')}</Text>
      <Text style={styles.sub}>{tt('admSvc', 'ຕົວເລືອກ ປະເພດ ວຽກ · ຄວາມ ຕໍ່ເນື່ອງ · ຂໍ້ ເງື່ອນໄຂ ທີ່ ລູກຄ້າ ຕ້ອງ ຍອມຮັບ. ເພີ່ມ/ແກ້ ໄດ້.')}</Text>

      <Text style={styles.h}>🏷️ {tt('admSvc', 'ປະເພດ ວຽກ')}</Text>
      {optRow(workTypes, setWorkTypes)}

      <Text style={styles.h}>🔗 {tt('admSvc', 'ຄວາມ ຕໍ່ເນື່ອງ ຂອງ ວຽກ')}</Text>
      {optRow(continuity, setContinuity)}

      <Text style={styles.h}>📜 {tt('admSvc', 'ຂໍ້ ເງື່ອນໄຂ (ໃຊ້ {price} {warranty} {payment} {worktype})')}</Text>
      {terms.map((t, i) => (
        <View key={i} style={styles.clause}>
          <View style={styles.row}>
            <TextInput value={t.title} onChangeText={(v) => setTerms(terms.map((x, idx) => idx === i ? { ...x, title: v } : x))} editable={canEdit} placeholder={tt('admSvc', 'ຫົວຂໍ້')} placeholderTextColor="#999" style={[styles.input, { flex: 1, fontWeight: '700' }]} />
            {canEdit && <Pressable onPress={() => setTerms(terms.filter((_, idx) => idx !== i))} hitSlop={6}><Text style={styles.rm}>✕</Text></Pressable>}
          </View>
          <TextInput value={t.body} onChangeText={(v) => setTerms(terms.map((x, idx) => idx === i ? { ...x, body: v } : x))} editable={canEdit} placeholder={tt('admSvc', 'ເນື້ອຫາ...')} placeholderTextColor="#999" style={[styles.input, styles.area]} multiline />
        </View>
      ))}
      {canEdit && <Pressable style={styles.add} onPress={() => setTerms([...terms, { title: '', body: '' }])}><Text style={styles.addText}>＋ {tt('admSvc', 'ເພີ່ມ ຂໍ້')}</Text></Pressable>}

      {canEdit && (
        <Pressable style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving}>
          <Text style={styles.saveText}>{saving ? '...' : saved ? tt('admSvc', '✓ ບັນທຶກ ແລ້ວ') : tt('admSvc', '💾 ບັນທຶກ ທັງໝົດ')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 8 },
  h: { fontSize: 13, fontWeight: '800', color: '#334155', marginTop: 16, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8, fontSize: 13, color: '#111', backgroundColor: '#fff' },
  area: { minHeight: 60, textAlignVertical: 'top', marginTop: 4 },
  clause: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 8, marginBottom: 8, backgroundColor: '#fafbfc' },
  rm: { color: '#dc2626', fontSize: 14, fontWeight: '700', paddingHorizontal: 2 },
  add: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginTop: 2 },
  addText: { color: '#0066CC', fontSize: 12, fontWeight: '700' },
  saveBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 18 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
