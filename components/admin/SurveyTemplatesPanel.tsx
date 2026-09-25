import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';
import CategoryIcon from '@/components/CategoryIcon';
import { type Category, watchCategories } from '@/lib/refdata';
import AppSwitch from '@/components/AppSwitch';
import {
  createSurveyTemplate,
  deleteSurveyTemplate,
  recoverSurveyData,
  setSurveyEnabled,
  type SurveyTemplate,
  updateSurveyTemplate,
  watchAllSurveyTemplates,
} from '@/lib/surveyTemplates';
import { usePaged } from './Paginator';

function shortDate(ms?: number): string {
  return ms ? new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
}

export default function SurveyTemplatesPanel() {
  const { profile } = useAuth();
  const myName = profile?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'admin';
  const { canCreate, canEdit, canDelete } = useSectionPerms('survey');
  const tt = useTT();

  const [list, setList] = useState<SurveyTemplate[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [fMain, setFMain] = useState('');
  const [fSub, setFSub] = useState('');
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoverMsg, setRecoverMsg] = useState('');

  const recover = async () => {
    setRecovering(true); setRecoverMsg('');
    try {
      const r = await recoverSurveyData(myName);
      setRecoverMsg(`✓ ${tt('admSurvey','ກູ້ ຂໍ້ມູນ ເກ່າ')} ${r.migrated} · ${tt('admSurvey','ນຳ ແບບ ມາດຕະຖານ')} ${r.seeded}`);
    } catch (e: any) { setRecoverMsg('❌ ' + (e?.message ?? String(e))); }
    finally { setRecovering(false); }
  };

  useEffect(() => watchAllSurveyTemplates(setList), []);
  useEffect(() => watchCategories('service', setCats), []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((t) =>
      (!fMain || t.mainCategory === fMain) &&
      (!fSub || t.subKey === fSub) &&
      (!q || [t.name, t.mainCategoryLao, t.subName].filter(Boolean).join(' ').toLowerCase().includes(q)),
    );
  }, [list, search, fMain, fSub]);
  const pg = usePaged(shown, 12);

  const subOptsForFilter = cats.find((c) => (c.nameEn || '').toLowerCase() === fMain || c.id === fMain)?.subTypes ?? [];

  const viewT = list.find((t) => t.id === viewId);
  const editT = list.find((t) => t.id === editId);

  return (
    <View>
      <Text style={styles.title}>{tt('admSurvey','📋 ແບບສຳຫຼວດ · Survey templates')}</Text>
      <Text style={styles.sub}>{tt('admSurvey','ບັນຊີ ແບບສຳຫຼວດ (ຕໍ່ ໝວດຍ່ອຍ) — ຄົ້ນຫາ/ກັນຕອງ · ກົດ 👁 ເບິ່ງ · ✎ ແກ້ (ອັບ version).')}</Text>

      <View style={styles.toolbar}>
        <View style={styles.search}>
          <Text style={{ fontSize: 13 }}>🔍</Text>
          <TextInput value={search} onChangeText={setSearch} placeholder={tt('admSurvey','ຄົ້ນຫາ ຊື່ / ໝວດ')} placeholderTextColor="#999" style={styles.searchInput} />
        </View>
        {canCreate && <Pressable style={styles.createBtn} onPress={() => setCreating(true)}><Text style={styles.createBtnText}>{tt('admSurvey','＋ ສ້າງ')}</Text></Pressable>}
      </View>
      {canDelete && (
        <View style={styles.recoverRow}>
          <Pressable style={[styles.recoverBtn, recovering && { opacity: 0.5 }]} onPress={recover} disabled={recovering}>
            <Text style={styles.recoverText}>{recovering ? tt('admSurvey','ກຳລັງ ກູ້...') : tt('admSurvey','↩️ ກູ້ ຂໍ້ມູນ ເກ່າ + ນຳ ແບບ ມາດຕະຖານ')}</Text>
          </Pressable>
          {recoverMsg !== '' && <Text style={styles.recoverMsg}>{recoverMsg}</Text>}
        </View>
      )}
      <View style={styles.filterRow}>
        <FilterSelect value={fMain} onChange={(v) => { setFMain(v); setFSub(''); }} placeholder={tt('admSurvey','ໝວດຫຼັກ: ທັງໝົດ')}
          options={cats.map((c) => ({ value: (c.nameEn || '').toLowerCase(), label: `${c.icon} ${c.nameLao}` }))} />
        <FilterSelect value={fSub} onChange={setFSub} placeholder={tt('admSurvey','ໝວດຍ່ອຍ: ທັງໝົດ')}
          options={subOptsForFilter.map((s) => ({ value: s.key, label: s.nameLao }))} disabled={!fMain} />
      </View>

      {shown.length === 0 ? (
        <Text style={styles.empty}>{list.length === 0 ? tt('admSurvey','ຍັງບໍ່ມີ ແບບສຳຫຼວດ — ກົດ ＋ ສ້າງ') : tt('admSurvey','ບໍ່ພົບ ຕາມ ຕົວກອງ')}</Text>
      ) : (
        pg.items.map((t) => (
          <View key={t.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.name} numberOfLines={1}>{t.name}</Text>
              <Pressable style={styles.iconBtn} onPress={() => setViewId(t.id)}><Text>👁</Text></Pressable>
              {canEdit && <Pressable style={[styles.iconBtn, styles.iconEdit]} onPress={() => setEditId(t.id)}><Text style={styles.iconEditText}>✎</Text></Pressable>}
              <AppSwitch value={t.enabled} onValueChange={(v) => { if (canEdit) setSurveyEnabled(t.id, v); }} disabled={!canEdit} />
            </View>
            <View style={styles.chips}>
              {!!t.mainCategoryLao && <Text style={[styles.chip, styles.cMain]}>{t.mainCategoryLao}</Text>}
              {!!t.subName && <Text style={[styles.chip, styles.cSub]}>{t.subName}</Text>}
              <Text style={styles.ver}>v{t.version}</Text>
            </View>
            <Text style={styles.meta}>
              👤 {t.createdByName ?? '—'} · {shortDate(t.createdAt)}
              {t.updatedAt ? ` · ${tt('admSurvey','ອັບ')} ${shortDate(t.updatedAt)}` : ''}
              {' · '}{tt('admSurvey','ໃຊ້')} {t.usageCount ?? 0} {tt('admSurvey','ຄັ້ງ')} · ⭐ {t.rating ? `${t.rating} (${t.ratingCount})` : '—'}
            </Text>
          </View>
        ))
      )}
      {pg.bar}

      {creating && (
        <SurveyEditor mode="create" cats={cats} byName={myName} onClose={() => setCreating(false)} />
      )}
      {editT && (
        <SurveyEditor mode="edit" template={editT} byName={myName} onClose={() => setEditId(null)} canDelete={canDelete} />
      )}
      {viewT && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setViewId(null)}>
          <View style={styles.overlay}>
            <View style={styles.modal}>
              <View style={styles.mHead}>
                <Text style={styles.mTitle} numberOfLines={1}>👁 {viewT.name}</Text>
                <Pressable onPress={() => setViewId(null)} hitSlop={8}><Text style={styles.mClose}>✕</Text></Pressable>
              </View>
              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 14 }}>
                <View style={styles.chips}>
                  {!!viewT.mainCategoryLao && <Text style={[styles.chip, styles.cMain]}>{viewT.mainCategoryLao}</Text>}
                  {!!viewT.subName && <Text style={[styles.chip, styles.cSub]}>{viewT.subName}</Text>}
                  <Text style={styles.ver}>v{viewT.version}</Text>
                </View>
                <Text style={styles.meta}>👤 {viewT.createdByName ?? '—'} · {shortDate(viewT.createdAt)}{viewT.updatedByName ? ` · ${tt('admSurvey','ແກ້')} ${viewT.updatedByName} ${shortDate(viewT.updatedAt)}` : ''} · {tt('admSurvey','ໃຊ້')} {viewT.usageCount ?? 0} · ⭐ {viewT.rating ?? '—'}</Text>
                {viewT.items.map((it, i) => (
                  <Text key={i} style={styles.viewItem}>{i + 1}. {it}</Text>
                ))}
                {viewT.items.length === 0 && <Text style={styles.empty}>{tt('admSurvey','ບໍ່ມີ ລາຍການ')}</Text>}
              </ScrollView>
              <View style={styles.mActions}>
                <Pressable style={styles.saveBtn} onPress={() => { setViewId(null); setEditId(viewT.id); }}><Text style={styles.saveText}>{tt('admSurvey','✎ ແກ້ໄຂ')}</Text></Pressable>
                <Pressable style={styles.cancelBtn} onPress={() => setViewId(null)}><Text style={styles.cancelText}>{tt('admSurvey','ປິດ')}</Text></Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ── web <select> filter (falls back to a chip on native) ──
function FilterSelect({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string; disabled?: boolean;
}) {
  if (typeof document === 'undefined') {
    return <Text style={styles.filterNative}>{placeholder}</Text>;
  }
  const sel: any = { border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#374151', backgroundColor: disabled ? '#f1f5f9' : '#fff', fontFamily: 'inherit', flex: 1, minWidth: 0 };
  return (
    // @ts-ignore web select
    <select value={value} disabled={disabled} onChange={(e: any) => onChange(e.target.value)} style={sel}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── create / edit modal ──
function SurveyEditor({ mode, cats, template, byName, onClose, canDelete }: {
  mode: 'create' | 'edit';
  cats?: Category[];
  template?: SurveyTemplate;
  byName: string;
  onClose: () => void;
  canDelete?: boolean;
}) {
  const [mainCat, setMainCat] = useState<Category | null>(null);
  const [subKey, setSubKey] = useState('');
  const [name, setName] = useState(template?.name ?? '');
  const [items, setItems] = useState<string[]>(template?.items ?? []);
  const [saving, setSaving] = useState(false);
  const tt = useTT();

  const isCreate = mode === 'create';
  const subs = mainCat?.subTypes ?? [];
  const canSave = isCreate ? !!mainCat && !!subKey && name.trim() !== '' : name.trim() !== '';

  const pickSub = (key: string, nm: string) => { setSubKey(key); if (!name.trim()) setName(nm); };

  const save = async () => {
    setSaving(true);
    try {
      if (isCreate && mainCat) {
        const sub = subs.find((s) => s.key === subKey);
        await createSurveyTemplate({
          name: name.trim(),
          mainCategory: (mainCat.nameEn || '').toLowerCase(),
          mainCategoryLao: mainCat.nameLao,
          subKey,
          subName: sub?.nameLao,
          items,
        }, byName);
      } else if (template) {
        await updateSurveyTemplate(template.id, { name: name.trim(), items }, byName);
      }
      onClose();
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.mHead}>
            <Text style={styles.mTitle}>{isCreate ? tt('admSurvey','＋ ສ້າງ ແບບສຳຫຼວດ') : tt('admSurvey','✎ ແກ້ໄຂ (ບັນທຶກ = ອັບ version)')}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={styles.mClose}>✕</Text></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ padding: 14 }}>
            {isCreate && (
              <>
                <Text style={styles.step}>{tt('admSurvey','① ເລືອກ ໝວດ ບໍລິການ (ຫຼັກ)')}</Text>
                <View style={styles.chipsRow}>
                  {(cats ?? []).map((c) => (
                    <Pressable key={c.id} style={[styles.pick, mainCat?.id === c.id && styles.pickOn]} onPress={() => { setMainCat(c); setSubKey(''); }}>
                      <Text style={[styles.pickText, mainCat?.id === c.id && styles.pickTextOn]}><CategoryIcon icon={c.icon} size={13} color={mainCat?.id === c.id ? '#fff' : '#374151'} /> {c.nameLao}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.step}>{tt('admSurvey','② ເລືອກ ໝວດຍ່ອຍ')}</Text>
                <View style={styles.chipsRow}>
                  {subs.map((s) => (
                    <Pressable key={s.key} style={[styles.pick, subKey === s.key && styles.pickOn]} onPress={() => pickSub(s.key, s.nameLao)}>
                      <Text style={[styles.pickText, subKey === s.key && styles.pickTextOn]}>{s.nameLao}</Text>
                    </Pressable>
                  ))}
                  {!mainCat && <Text style={styles.hint}>{tt('admSurvey','← ເລືອກ ໝວດຫຼັກ ກ່ອນ')}</Text>}
                  {mainCat && subs.length === 0 && <Text style={styles.hint}>{tt('admSurvey','ໝວດ ນີ້ ຍັງ ບໍ່ ມີ ໝວດຍ່ອຍ (ເພີ່ມ ທີ່ 📂 ໝວດໝູ່)')}</Text>}
                </View>
              </>
            )}

            <Text style={styles.step}>{tt('admSurvey','ຊື່ ແບບສຳຫຼວດ')}</Text>
            <TextInput value={name} onChangeText={setName} placeholder={tt('admSurvey','ຊື່ ແບບ')} placeholderTextColor="#999" style={styles.nameInput} />

            <Text style={styles.step}>{tt('admSurvey','ລາຍການ ກວດ')}</Text>
            {items.map((it, i) => (
              <View key={i} style={styles.itemRow}>
                <Text style={styles.bullet}>{i + 1}.</Text>
                <TextInput value={it} onChangeText={(v) => setItems((p) => p.map((x, idx) => (idx === i ? v : x)))} placeholder={tt('admSurvey','ລາຍການ ກວດ...')} placeholderTextColor="#999" style={styles.itemInput} />
                <Pressable style={styles.rm} onPress={() => setItems((p) => p.filter((_, idx) => idx !== i))}><Text style={styles.rmText}>✕</Text></Pressable>
              </View>
            ))}
            <Pressable style={styles.addItem} onPress={() => setItems((p) => [...p, ''])}><Text style={styles.addItemText}>{tt('admSurvey','＋ ເພີ່ມ ລາຍການ')}</Text></Pressable>
          </ScrollView>

          <View style={styles.mActions}>
            {!isCreate && canDelete && template && (
              <Pressable style={styles.delBtn} onPress={() => { if (confirm(tt('admSurvey','ລຶບ ແບບ ນີ້?'))) { deleteSurveyTemplate(template.id); onClose(); } }}><Text style={styles.delText}>🗑️</Text></Pressable>
            )}
            <Pressable style={[styles.saveBtn, (!canSave || saving) && styles.saveOff]} onPress={save} disabled={!canSave || saving}>
              <Text style={styles.saveText}>{saving ? '...' : isCreate ? tt('admSurvey','✓ ສ້າງ') : tt('admSurvey','💾 ບັນທຶກ (v+1)')}</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={onClose}><Text style={styles.cancelText}>{tt('admSurvey','ຍົກເລີກ')}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#fff' },
  searchInput: { flex: 1, fontSize: 13, color: '#111', paddingVertical: 9 },
  createBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  recoverRow: { marginBottom: 10 },
  recoverBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#d97706', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  recoverText: { color: '#d97706', fontSize: 12, fontWeight: '700' },
  recoverMsg: { fontSize: 12, color: '#374151', marginTop: 6 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterNative: { flex: 1, fontSize: 12, color: '#6b7280' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 14 },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 8, backgroundColor: '#fff' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '700', color: '#111' },
  iconBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  iconEdit: { borderColor: '#0066CC' },
  iconEditText: { color: '#0066CC', fontSize: 14, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  chip: { fontSize: 12, fontWeight: '700', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  cMain: { color: '#0066CC', backgroundColor: '#EAF2FB' },
  cSub: { color: '#7c3aed', backgroundColor: '#ede9fe' },
  ver: { fontSize: 12, fontWeight: '700', color: '#0f766e', backgroundColor: '#ccfbf1', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden' },
  meta: { fontSize: 12, color: '#9ca3af', marginTop: 8 },
  // modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90%', overflow: 'hidden' },
  mHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef0f3' },
  mTitle: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
  mClose: { fontSize: 15, color: '#6b7280', fontWeight: '700' },
  mActions: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#eef0f3' },
  step: { fontSize: 12, color: '#0066CC', fontWeight: '700', marginTop: 12, marginBottom: 6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pick: { borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  pickOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  pickText: { fontSize: 12, color: '#374151' },
  pickTextOn: { color: '#fff', fontWeight: '700' },
  hint: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  nameInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  bullet: { fontSize: 12, color: '#9ca3af', width: 18 },
  itemInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 8, fontSize: 12, color: '#111', backgroundColor: '#fff' },
  rm: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  rmText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
  addItem: { alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addItemText: { color: '#0066CC', fontSize: 12, fontWeight: '600' },
  viewItem: { fontSize: 13, color: '#374151', marginTop: 6 },
  saveBtn: { flex: 1, backgroundColor: '#0066CC', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  saveOff: { opacity: 0.4 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cancelBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  cancelText: { color: '#6b7280', fontWeight: '600', fontSize: 13 },
  delBtn: { borderWidth: 1, borderColor: '#dc2626', borderRadius: 8, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' },
  delText: { color: '#dc2626', fontWeight: '700', fontSize: 13 },
});
