import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  addCategory,
  type Category,
  deleteCategory,
  type RefType,
  seedRefDataIfEmpty,
  updateCategory,
  watchCategories,
} from '@/lib/refdata';
import { ttStatic, useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';
import IconPicker from '@/components/IconPicker';
import CategoryIcon from '@/components/CategoryIcon';

// ---- duplicate / similarity guard (prevent repeats, flag near-matches) ----
const norm = (s: string) => (s ?? '').trim().toLowerCase().replace(/\s+/g, '');
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}
function checkDup(name: string, existing: string[]): { exact?: string; similar?: string } {
  const n = norm(name);
  if (!n) return {};
  for (const e of existing) if (norm(e) === n) return { exact: e };
  let best = '', score = 0;
  for (const e of existing) {
    const ne = norm(e);
    if (!ne) continue;
    let s = 1 - lev(n, ne) / Math.max(n.length, ne.length);
    if (ne.includes(n) || n.includes(ne)) s = Math.max(s, 0.85);
    if (s > score) { score = s; best = e; }
  }
  return score >= 0.72 ? { similar: best } : {};
}
// returns false → caller should abort (exact dup, or user declined a near-match)
function passDupGuard(name: string, existing: string[], kind: string): boolean {
  const d = checkDup(name, existing);
  if (d.exact) { if (typeof alert === 'function') alert(`${kind} "${d.exact}" ${ttStatic('admCategories','ມີ ຢູ່ ແລ້ວ — ບໍ່ ສ້າງ ຊ້ຳ')}.`); return false; }
  if (d.similar) return typeof confirm !== 'function' || confirm(`${ttStatic('admCategories','ຄ້າຍ ກັບ')} "${d.similar}" ${ttStatic('admCategories','ທີ່ ມີ ຢູ່ ແລ້ວ')}.\n${ttStatic('admCategories','ຢືນຢັນ ສ້າງ')} "${name.trim()}" ${ttStatic('admCategories','ໃໝ່ ບໍ')}?`);
  return true;
}

export default function CategoriesPanel() {
  const { canCreate, canEdit, canDelete } = useSectionPerms('categories');
  const tt = useTT();
  const [type, setType] = useState<RefType>('product');
  const [cats, setCats] = useState<Category[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  // add/edit main-category form
  const [showForm, setShowForm] = useState(false);
  const [icon, setIcon] = useState('');
  const [nameLao, setNameLao] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  // sub-categories
  const [subAdder, setSubAdder] = useState<Record<string, string>>({});
  const [subEdit, setSubEdit] = useState<{ catId: string; key: string } | null>(null);
  const [subEditVal, setSubEditVal] = useState('');
  const [subOpen, setSubOpen] = useState(false); // sub-list collapsed by default

  useEffect(() => {
    seedRefDataIfEmpty().catch((e) => console.error('seed:', e));
  }, []);
  useEffect(() => watchCategories(type, setCats), [type]);
  // start EMPTY — only drop a selection that no longer exists (never auto-pick)
  useEffect(() => {
    setSelId((prev) => (prev && cats.some((c) => c.id === prev) ? prev : null));
  }, [cats]);
  useEffect(() => setSubOpen(false), [selId]); // collapse sub-list when switching category

  const sel = cats.find((c) => c.id === selId) ?? null;
  const selectPrompt = type === 'product' ? tt('admCategories','ກະລຸນາ ເລືອກ ໝວດ ສິນຄ້າ') : tt('admCategories','ກະລຸນາ ເລືອກ ໝວດ ບໍລິການ');
  const shownCats = pickerQuery.trim()
    ? cats.filter((c) => `${c.nameLao} ${c.nameEn}`.toLowerCase().includes(pickerQuery.trim().toLowerCase()))
    : cats;

  const openAdd = () => { setEditId(null); setIcon(''); setNameLao(''); setNameEn(''); setShowForm(true); setPickerOpen(false); };
  const startEdit = (c: Category) => { setEditId(c.id); setIcon(c.icon); setNameLao(c.nameLao); setNameEn(c.nameEn); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditId(null); setIcon(''); setNameLao(''); setNameEn(''); };
  const submit = async () => {
    if (!nameLao.trim()) return;
    if (editId) {
      if (!canEdit) return;
      await updateCategory(editId, { icon: icon || '📦', nameLao: nameLao.trim(), nameEn: nameEn.trim() });
    } else {
      if (!canCreate) return;
      if (!passDupGuard(nameLao, cats.map((c) => c.nameLao), tt('admCategories','ໝວດ'))) return;
      const id = await addCategory(type, icon || '📦', nameLao.trim(), nameEn.trim());
      setSelId(id);
    }
    closeForm();
  };
  const delCat = (c: Category) => { if (typeof confirm !== 'function' || confirm(tt('admCategories','ລຶບ ໝວດ ນີ້ ແລະ ໝວດຍ່ອຍ ທັງໝົດ?'))) deleteCategory(c.id); };

  const addSub = (c: Category) => {
    if (!canEdit) return;
    const n = (subAdder[c.id] ?? '').trim();
    if (!n) return;
    if (!passDupGuard(n, (c.subTypes ?? []).map((s) => s.nameLao), tt('admCategories','ໝວດຍ່ອຍ'))) return;
    updateCategory(c.id, { subTypes: [...(c.subTypes ?? []), { key: `sc_${Date.now().toString(36)}`, nameLao: n }] });
    setSubAdder((p) => ({ ...p, [c.id]: '' }));
  };
  const removeSub = (c: Category, key: string) =>
    updateCategory(c.id, { subTypes: (c.subTypes ?? []).filter((s) => s.key !== key) });
  const startSubEdit = (catId: string, key: string, cur: string) => { setSubEdit({ catId, key }); setSubEditVal(cur); };
  const saveSubEdit = (c: Category) => {
    if (!subEdit) return;
    const v = subEditVal.trim();
    if (v) updateCategory(c.id, { subTypes: (c.subTypes ?? []).map((s) => (s.key === subEdit.key ? { ...s, nameLao: v } : s)) });
    setSubEdit(null);
  };

  return (
    <View>
      <Text style={styles.title}>📂 {tt('admCategories','ໝວດໝູ່')} · Categories</Text>
      <Text style={styles.sub}>{tt('admCategories','ໝວດ ບໍລິການ ແລະ ສິນຄ້າ')}</Text>

      <View style={styles.subtabs}>
        {(['product', 'service'] as RefType[]).map((t) => (
          <Pressable key={t} onPress={() => { setType(t); setSelId(null); setPickerOpen(false); closeForm(); }} style={styles.subtab}>
            <Text style={[styles.subtabText, type === t && styles.subtabActive]}>
              {t === 'product' ? tt('admCategories','ສິນຄ້າ · Product') : tt('admCategories','ບໍລິການ · Service')} ({cats.length})
            </Text>
            {type === t && <View style={styles.bar} />}
          </Pressable>
        ))}
      </View>

      {/* main-category dropdown + add-new */}
      <View style={styles.pickRow}>
        <Text style={styles.pickLabel}>{tt('admCategories','ໝວດຫຼັກ')}</Text>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Pressable style={styles.dropdown} onPress={() => setPickerOpen((o) => !o)}>
            {sel ? (
              <View style={styles.ddCur}>
                <CategoryIcon icon={sel.icon} size={18} color="#0066CC" />
                <Text style={styles.ddText} numberOfLines={1}> {sel.nameLao}{sel.nameEn ? ` · ${sel.nameEn}` : ''}</Text>
              </View>
            ) : (
              <Text style={styles.ddPlaceholder}>{cats.length ? selectPrompt : tt('admCategories','ຍັງ ບໍ່ ມີ ໝວດ')}</Text>
            )}
            <Text style={styles.ddChevron}>{pickerOpen ? '▲' : '▾'}</Text>
          </Pressable>
          {pickerOpen && (
            <View style={styles.ddPanel}>
              <TextInput value={pickerQuery} onChangeText={setPickerQuery} placeholder={tt('admCategories','🔍 ຄົ້ນ ໝວດ')} placeholderTextColor="#999" style={styles.ddSearch} />
              <ScrollView style={styles.ddList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {pickerQuery.trim() === '' && (
                  <Pressable style={styles.ddRow} onPress={() => { setSelId(null); setPickerOpen(false); }}>
                    <Text style={styles.ddPromptRow}>— {selectPrompt} —</Text>
                  </Pressable>
                )}
                {shownCats.map((c) => (
                  <Pressable key={c.id} style={[styles.ddRow, selId === c.id && styles.ddRowOn]} onPress={() => { setSelId(c.id); setPickerOpen(false); setPickerQuery(''); }}>
                    <CategoryIcon icon={c.icon} size={16} color={selId === c.id ? '#0066CC' : '#374151'} />
                    <Text style={[styles.ddRowText, selId === c.id && styles.ddRowTextOn]} numberOfLines={1}> {c.nameLao}{c.active === false ? tt('admCategories',' · ປິດ') : ''}</Text>
                    <Text style={styles.ddCount}>{c.subTypes?.length ?? 0}</Text>
                  </Pressable>
                ))}
                {shownCats.length === 0 && <Text style={styles.hintPad}>{tt('admCategories','ບໍ່ ພົບ')}</Text>}
              </ScrollView>
            </View>
          )}
        </View>
        {canCreate && <Pressable style={styles.newBtn} onPress={openAdd}><Text style={styles.newBtnText}>{tt('admCategories','＋ ໝວດຫຼັກ ໃໝ່')}</Text></Pressable>}
      </View>

      {/* add / edit main-category form */}
      {showForm && (
        <View style={styles.formBox}>
          <Text style={styles.formTitle}>{editId ? tt('admCategories','✎ ແກ້ ໝວດຫຼັກ') : tt('admCategories','＋ ໝວດຫຼັກ ໃໝ່')}</Text>
          <IconPicker value={icon} onPick={setIcon} />
          <View style={styles.formRow}>
            <TextInput value={icon} onChangeText={setIcon} placeholder="📦" placeholderTextColor="#999" style={[styles.input, { width: 56, textAlign: 'center' }]} />
            <TextInput value={nameLao} onChangeText={setNameLao} placeholder={tt('admCategories','ຊື່ ລາວ')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
          </View>
          <View style={styles.formRow}>
            <TextInput value={nameEn} onChangeText={setNameEn} placeholder={tt('admCategories','EN (ບໍ່ບັງຄັບ)')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
            <Pressable style={styles.addBtn} onPress={submit}><Text style={styles.addBtnText}>{editId ? tt('admCategories','💾 ບັນທຶກ') : tt('admCategories','＋ ເພີ່ມ')}</Text></Pressable>
            <Pressable style={styles.cancelBtn} onPress={closeForm}><Text style={styles.cancelBtnText}>✕</Text></Pressable>
          </View>
        </View>
      )}

      {/* selected category + its sub-categories */}
      {sel && !showForm && (
        <View style={[styles.card, sel.active === false && styles.rowOff]}>
          <View style={styles.row}>
            <Pressable style={styles.iconBox} onPress={() => canEdit && startEdit(sel)} disabled={!canEdit}>
              <CategoryIcon icon={sel.icon} size={22} color="#0066CC" />
              {canEdit && <View style={styles.iconEditDot}><Text style={styles.iconEditDotText}>✎</Text></View>}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{sel.nameLao}</Text>
              <Text style={styles.en}>{sel.nameEn}</Text>
            </View>
            <Pressable style={[styles.toggle, sel.active !== false ? styles.toggleOn : styles.toggleOff]} onPress={() => canEdit && updateCategory(sel.id, { active: sel.active === false })} disabled={!canEdit}>
              <View style={styles.knob} />
            </Pressable>
            {canEdit && <Pressable style={[styles.mini, { backgroundColor: '#0066CC' }]} onPress={() => startEdit(sel)}><Text style={styles.miniText}>✎</Text></Pressable>}
            {canDelete && <Pressable style={[styles.mini, { backgroundColor: '#dc2626' }]} onPress={() => delCat(sel)}><Text style={styles.miniText}>✕</Text></Pressable>}
          </View>

          <View style={styles.subSection}>
            <Pressable style={styles.subHeadRow} onPress={() => (sel.subTypes?.length ?? 0) > 0 && setSubOpen((o) => !o)}>
              <Text style={styles.subHead}>{tt('admCategories','ໝວດຍ່ອຍ / ຫົວຂໍ້')} ({sel.subTypes?.length ?? 0})</Text>
              {(sel.subTypes?.length ?? 0) > 0 && <Text style={styles.subChevron}>{subOpen ? tt('admCategories','▲ ຫຍໍ້') : tt('admCategories','▾ ເບິ່ງ')}</Text>}
            </Pressable>
            {(subOpen || (sel.subTypes?.length ?? 0) === 0) && (<>
            {(sel.subTypes ?? []).map((s) => {
              const editing = subEdit?.catId === sel.id && subEdit?.key === s.key;
              if (editing) {
                return (
                  <View key={s.key} style={styles.subRowEdit}>
                    <TextInput value={subEditVal} onChangeText={setSubEditVal} autoFocus onSubmitEditing={() => saveSubEdit(sel)} style={styles.subRowInput} />
                    <Pressable style={styles.subSave} onPress={() => saveSubEdit(sel)}><Text style={styles.subSaveText}>✓</Text></Pressable>
                    <Pressable style={styles.subCancel} onPress={() => setSubEdit(null)}><Text style={styles.subCancelText}>✕</Text></Pressable>
                  </View>
                );
              }
              return (
                <View key={s.key} style={styles.subRow}>
                  <Text style={styles.subRowText}>{s.nameLao}</Text>
                  {canEdit && <Pressable onPress={() => startSubEdit(sel.id, s.key, s.nameLao)} hitSlop={6}><Text style={styles.subRowEditIc}>✎</Text></Pressable>}
                  {canEdit && <Pressable onPress={() => removeSub(sel, s.key)} hitSlop={6}><Text style={styles.subRowX}>✕</Text></Pressable>}
                </View>
              );
            })}
            {(sel.subTypes ?? []).length === 0 && <Text style={styles.hintPad}>{tt('admCategories','ຍັງ ບໍ່ ມີ ໝວດຍ່ອຍ — ເພີ່ມ ໃໝ່:')}</Text>}
            {canEdit && (
              <View style={styles.addSubRow}>
                <TextInput value={subAdder[sel.id] ?? ''} onChangeText={(v) => setSubAdder((p) => ({ ...p, [sel.id]: v }))} placeholder={tt('admCategories','＋ ເພີ່ມ ໝວດຍ່ອຍ ໃໝ່')} placeholderTextColor="#999" style={styles.addSubInput} onSubmitEditing={() => addSub(sel)} />
                <Pressable style={styles.subAddBtn} onPress={() => addSub(sel)}><Text style={styles.subAddText}>＋</Text></Pressable>
              </View>
            )}
            </>)}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  subtabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 2, borderBottomColor: '#f0f0f0', marginBottom: 14 },
  subtab: { paddingHorizontal: 12, paddingVertical: 8 },
  subtabText: { fontSize: 12, color: '#6b7280' },
  subtabActive: { color: '#0066CC', fontWeight: '700' },
  bar: { height: 2, backgroundColor: '#0066CC', marginTop: 6, marginHorizontal: -12, marginBottom: -10 },
  pickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 12, zIndex: 10 },
  pickLabel: { fontSize: 13, color: '#6b7280', paddingTop: 12 },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: '#93c5fd', borderRadius: 8, backgroundColor: '#fff' },
  ddCur: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  ddText: { fontSize: 14, color: '#111', flexShrink: 1 },
  ddPlaceholder: { fontSize: 14, color: '#9ca3af' },
  ddChevron: { fontSize: 12, color: '#6b7280', marginLeft: 8 },
  ddPanel: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginTop: 4, backgroundColor: '#fff', padding: 6 },
  ddSearch: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: '#111', marginBottom: 6 },
  ddList: { maxHeight: 220 },
  ddRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 6 },
  ddRowOn: { backgroundColor: '#EAF2FB' },
  ddRowText: { fontSize: 14, color: '#374151', flexShrink: 1 },
  ddRowTextOn: { color: '#0066CC', fontWeight: '700' },
  ddCount: { fontSize: 12, color: '#6b7280', fontWeight: '700', backgroundColor: '#f1f5f9', borderRadius: 10, minWidth: 22, textAlign: 'center', paddingHorizontal: 6, paddingVertical: 1, marginLeft: 8, overflow: 'hidden' },
  ddPromptRow: { fontSize: 13, color: '#6b7280', fontStyle: 'italic' },
  hintPad: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', padding: 8 },
  newBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, height: 40, justifyContent: 'center' },
  newBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  formBox: { borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, gap: 8, marginBottom: 12 },
  formTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  formRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  addBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center', height: 38 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  cancelBtn: { backgroundColor: '#e5e7eb', borderRadius: 8, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { color: '#6b7280', fontWeight: '700', fontSize: 13 },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowOff: { opacity: 0.6 },
  iconBox: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#EAF2FB', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  iconEditDot: { position: 'absolute', bottom: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#0066CC', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  iconEditDotText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700', color: '#111' },
  en: { fontSize: 12, color: '#9ca3af' },
  toggle: { width: 40, height: 22, borderRadius: 11, padding: 2, flexDirection: 'row' },
  toggleOn: { backgroundColor: '#16a34a', justifyContent: 'flex-end' },
  toggleOff: { backgroundColor: '#cbd5e1', justifyContent: 'flex-start' },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  mini: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  miniText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  subSection: { borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 14, paddingTop: 12 },
  subHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  subHead: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  subChevron: { fontSize: 12, color: '#0066CC', fontWeight: '700' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#f1f3f5', paddingHorizontal: 6, paddingVertical: 6 },
  subRowText: { flex: 1, fontSize: 14, color: '#111' },
  subRowEditIc: { fontSize: 15, color: '#0066CC', fontWeight: '700' },
  subRowX: { fontSize: 15, color: '#dc2626', fontWeight: '700' },
  subRowEdit: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  subRowInput: { flex: 1, borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  subSave: { backgroundColor: '#16a34a', borderRadius: 8, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  subSaveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  subCancel: { backgroundColor: '#e5e7eb', borderRadius: 8, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  subCancelText: { color: '#6b7280', fontWeight: '700', fontSize: 13 },
  addSubRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  addSubInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  subAddBtn: { backgroundColor: '#1f2937', borderRadius: 8, width: 44, alignItems: 'center', justifyContent: 'center' },
  subAddText: { color: '#fff', fontSize: 15 },
});
