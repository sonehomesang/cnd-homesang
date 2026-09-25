import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AppSwitch from '@/components/AppSwitch';
import { CATEGORIES, getCategory } from '@/lib/categories';
import { useSectionPerms } from '@/lib/permissions-context';
import { ttStatic, useTT } from '@/lib/i18n';
import { type Product, watchAllProducts } from '@/lib/shop';
import {
  type BomItem,
  type BomTemplate,
  COST_TYPE_LABEL,
  COST_TYPES,
  type CostType,
  createBomTemplate,
  deleteBomTemplate,
  updateBomTemplate,
  watchBomTemplates,
} from '@/lib/bomTemplates';

const CAT_CYCLE = ['', ...CATEGORIES.map((c) => c.value)];
const catLabel = (v?: string) => (v ? getCategory(v)?.lao ?? v : ttStatic('admBom', 'ທຸກໝວດ'));

const TYPE_STYLE: Record<CostType, { c: string; bg: string }> = {
  materials: { c: '#ca8a04', bg: '#fef9ec' },
  labor: { c: '#0066CC', bg: '#EAF2FB' },
  service: { c: '#15803d', bg: '#ecfdf3' },
  survey: { c: '#0f766e', bg: '#ecfdfa' },
  risk: { c: '#b91c1c', bg: '#fee2e2' },
  tax: { c: '#7c3aed', bg: '#ede9fe' },
  other: { c: '#374151', bg: '#f1f5f9' },
};

const genCode = (category: string | undefined, n: number): string =>
  `${category ? String(category).slice(0, 5).toUpperCase() : 'BOM'}-${String(n).padStart(3, '0')}`;
const isSel = (it: BomItem) => it.selected !== false;

export default function BomTemplatesPanel() {
  const { canCreate, canEdit, canDelete } = useSectionPerms('bom');
  const tt = useTT();
  const [list, setList] = useState<BomTemplate[]>([]);
  const [draft, setDraft] = useState<Record<string, BomTemplate>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [pickerFor, setPickerFor] = useState<{ tplId: string; index: number } | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  useEffect(() => watchBomTemplates(setList), []);
  useEffect(() => watchAllProducts(setProducts), []);

  const tpl = (t: BomTemplate): BomTemplate => draft[t.id] ?? t;
  const edit = (t: BomTemplate, patch: Partial<BomTemplate>) =>
    setDraft((p) => ({ ...p, [t.id]: { ...tpl(t), ...patch } }));
  const editItem = (t: BomTemplate, i: number, patch: Partial<BomItem>) =>
    edit(t, { items: tpl(t).items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  const addItem = (t: BomTemplate) =>
    edit(t, { items: [...tpl(t).items, { name: '', costType: 'materials', unit: 'ອັນ', qty: 1, unitPrice: 0, selected: true }] });
  const removeItem = (t: BomTemplate, i: number) =>
    edit(t, { items: tpl(t).items.filter((_, idx) => idx !== i) });
  const cycleType = (t: BomTemplate, i: number, cur: CostType) =>
    editItem(t, i, { costType: COST_TYPES[(COST_TYPES.indexOf(cur) + 1) % COST_TYPES.length] as CostType });

  // link a line to a shop product (name/unit denormalized; price pulled at quote time)
  const linkProduct = (t: BomTemplate, i: number, p: Product) =>
    editItem(t, i, { productId: p.id, shopId: p.shopId, shopName: p.shopName ?? '', name: p.name, unit: p.unit || 'ອັນ' });
  // unlink: rebuild the item WITHOUT the link keys (Firestore rejects undefined)
  const unlinkProduct = (t: BomTemplate, i: number) =>
    edit(t, {
      items: tpl(t).items.map((it, idx) => {
        if (idx !== i) return it;
        const rest: BomItem = { ...it };
        delete rest.productId; delete rest.shopId; delete rest.shopName;
        return rest;
      }),
    });

  const clearDraft = (id: string) => setDraft((p) => { const n = { ...p }; delete n[id]; return n; });

  const save = async (t: BomTemplate) => {
    const d = tpl(t);
    setSavingId(t.id);
    try {
      await updateBomTemplate(t.id, {
        name: d.name,
        code: d.code || '',
        category: d.category || '',
        active: d.active,
        items: d.items.filter((it) => it.name.trim() !== ''),
      });
      clearDraft(t.id);
      setEditingId(null);
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setSavingId(null); }
  };

  const cancel = (id: string) => { clearDraft(id); setEditingId(null); };

  const create = async () => {
    try {
      const id = await createBomTemplate('ແມ່ແບບໃໝ່', '', genCode('', list.length + 1));
      setViewingId(null);
      setEditingId(id);
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) =>
      [t.name, t.code, catLabel(t.category)].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [list, search]);

  return (
    <View>
      <Text style={styles.title}>{tt('admBom','📦 ຊຸດ BOM · ແມ່ແບບ')}</Text>
      <Text style={styles.sub}>{tt('admBom','ບັນຊີ ລາຍການ ວັດສະດຸ + ຄ່າແຮງ ຕໍ່ປະເພດງານ — ຈຳນວນ/ລາຄາ ໃສ່ ຕອນ ເຮັດ ໃບສະເໜີ.')}</Text>

      <View style={styles.toolbar}>
        <View style={styles.search}>
          <Text style={{ fontSize: 13 }}>🔍</Text>
          <TextInput value={search} onChangeText={setSearch} placeholder={tt('admBom','ຄົ້ນຫາ ຕາມ ຊື່ / ລະຫັດ / ໝວດ')} placeholderTextColor="#999" style={styles.searchInput} />
        </View>
        {canCreate && <Pressable style={styles.createBtn} onPress={create}><Text style={styles.createBtnText}>{tt('admBom','＋ ສ້າງ ໃໝ່')}</Text></Pressable>}
      </View>

      {shown.length === 0 ? (
        <Text style={styles.empty}>{search ? tt('admBom','ບໍ່ ພົບ ແມ່ແບບ') : tt('admBom','ຍັງ ບໍ່ ມີ ແມ່ແບບ — ກົດ ＋ ສ້າງ ໃໝ່')}</Text>
      ) : (
        shown.map((t0) => {
          // ---- VIEW (read-only) ----
          if (viewingId === t0.id) {
            return (
              <View key={t0.id} style={styles.viewCard}>
                <View style={styles.editHead}>
                  <Text style={styles.viewTitle}>{t0.name}</Text>
                  {!!t0.code && <Text style={styles.code}>{t0.code}</Text>}
                  <Text style={styles.catChip}>{catLabel(t0.category)}</Text>
                </View>
                {t0.items.length === 0 ? (
                  <Text style={styles.emptyItems}>{tt('admBom','ບໍ່ ມີ ລາຍການ')}</Text>
                ) : t0.items.map((it, i) => {
                  const ts = TYPE_STYLE[it.costType];
                  return (
                    <View key={i} style={styles.viewRow}>
                      <Text style={styles.viewTick}>{isSel(it) ? '☑' : '☐'}</Text>
                      <Text style={[styles.viewName, !isSel(it) && styles.viewDim]} numberOfLines={1}>{it.name || '—'}{it.productId ? <Text style={styles.viewShop}>  🏬 {it.shopName || tt('admBom','ຮ້ານ')}</Text> : null}</Text>
                      <Text style={[styles.typeBadge, { color: ts.c, backgroundColor: ts.bg, borderColor: ts.c }]}>{tt('costType', COST_TYPE_LABEL[it.costType])}</Text>
                      <Text style={styles.viewUnit}>{it.unit}</Text>
                    </View>
                  );
                })}
                <View style={styles.foot}>
                  <Text style={styles.total}>{t0.items.filter(isSel).length}/{t0.items.length} {tt('admBom','ລາຍການ ເລືອກ')}</Text>
                  <Pressable style={styles.cancelBtn} onPress={() => setViewingId(null)}><Text style={styles.cancelText}>{tt('admBom','ປິດ')}</Text></Pressable>
                  {canEdit && <Pressable style={styles.saveBtn} onPress={() => { setViewingId(null); setEditingId(t0.id); }}><Text style={styles.saveText}>{tt('admBom','✎ ແກ້ໄຂ')}</Text></Pressable>}
                </View>
              </View>
            );
          }

          // ---- COLLAPSED LIST ROW ----
          if (editingId !== t0.id) {
            return (
              <View key={t0.id} style={styles.listRow}>
                <View style={[styles.dot, !t0.active && styles.dotOff]} />
                {!!t0.code && <Text style={styles.code}>{t0.code}</Text>}
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{t0.name}</Text>
                  <Text style={styles.rowMeta}>{t0.items.length} {tt('admBom','ລາຍການ')}</Text>
                </View>
                <Text style={styles.catChip}>{catLabel(t0.category)}</Text>
                <Pressable style={styles.iconBtn} onPress={() => { setEditingId(null); setViewingId(t0.id); }}><Text>👁</Text></Pressable>
                {canEdit && <Pressable style={[styles.iconBtn, styles.iconEdit]} onPress={() => { setViewingId(null); setEditingId(t0.id); }}><Text style={styles.iconEditText}>✎</Text></Pressable>}
                {canDelete && (
                  <Pressable style={styles.iconBtn} onPress={() => { if (confirm(tt('admBom','ລຶບແມ່ແບບ?'))) deleteBomTemplate(t0.id); }}><Text>🗑️</Text></Pressable>
                )}
              </View>
            );
          }

          // ---- EDIT ----
          const t = tpl(t0);
          return (
            <View key={t0.id} style={styles.editCard}>
              <View style={styles.editHead}>
                <TextInput value={t.name} onChangeText={(v) => edit(t0, { name: v })} placeholder={tt('admBom','ຫົວຂໍ້ ແມ່ແບບ')} placeholderTextColor="#999" style={styles.titleInput} />
                <AppSwitch value={t.active} onValueChange={(v) => edit(t0, { active: v })} />
              </View>
              <View style={[styles.editHead, { marginTop: 8 }]}>
                <TextInput value={t.code ?? ''} onChangeText={(v) => edit(t0, { code: v })} placeholder={tt('admBom','ລະຫັດ')} placeholderTextColor="#999" style={styles.codeInput} />
                <Pressable style={styles.catChipBtn} onPress={() => edit(t0, { category: CAT_CYCLE[(CAT_CYCLE.indexOf(t.category || '') + 1) % CAT_CYCLE.length] })}>
                  <Text style={styles.catChipBtnText}>{catLabel(t.category)}</Text>
                </Pressable>
              </View>

              <Text style={styles.hint}>{tt('admBom','ລາຍການ — ☑ = ເລືອກ ໃຊ້ ໂດຍ ຄ່າ ເລີ່ມຕົ້ນ · ກົດ ປ້າຍ ເພື່ອ ປ່ຽນ ປະເພດ')}</Text>

              {t.items.map((it, i) => {
                const ts = TYPE_STYLE[it.costType];
                return (
                  <View key={i} style={styles.itemRow}>
                    <Pressable onPress={() => editItem(t0, i, { selected: !isSel(it) })} style={styles.tick}>
                      <Text style={[styles.tickText, isSel(it) && styles.tickOn]}>{isSel(it) ? '☑' : '☐'}</Text>
                    </Pressable>
                    <TextInput value={it.name} onChangeText={(v) => editItem(t0, i, { name: v })} placeholder={tt('admBom','ລາຍການ')} placeholderTextColor="#999" style={styles.cellName} />
                    <Pressable style={[styles.typeBadge, { borderColor: ts.c, backgroundColor: ts.bg }]} onPress={() => cycleType(t0, i, it.costType)}>
                      <Text style={[styles.typeBadgeText, { color: ts.c }]}>{tt('costType', COST_TYPE_LABEL[it.costType])}</Text>
                    </Pressable>
                    <TextInput value={it.unit} onChangeText={(v) => editItem(t0, i, { unit: v })} placeholder={tt('admBom','ໜ່ວຍ')} placeholderTextColor="#999" style={styles.cellUnit} />
                    <Pressable onPress={() => { setPickerQuery(''); setPickerFor({ tplId: t0.id, index: i }); }} style={[styles.linkBtn, it.productId && styles.linkOn]}>
                      <Text style={styles.linkIcon}>🏬</Text>
                    </Pressable>
                    <Pressable onPress={() => removeItem(t0, i)} style={styles.rm}><Text style={styles.rmText}>✕</Text></Pressable>
                  </View>
                );
              })}
              {t.items.some((it) => it.productId) && (
                <Text style={styles.linkHint}>{tt('admBom','🏬 = ຜູກ ສິນຄ້າ ຮ້ານ (ດຶງ ລາຄາ ຈິງ ຕອນ ໃບສະເໜີ)')}</Text>
              )}

              <Pressable style={styles.addItem} onPress={() => addItem(t0)}><Text style={styles.addItemText}>{tt('admBom','＋ ເພີ່ມ ລາຍການ')}</Text></Pressable>

              <View style={styles.foot}>
                <Text style={styles.total}>{t.items.length} {tt('admBom','ລາຍການ')}</Text>
                <Pressable style={styles.cancelBtn} onPress={() => cancel(t0.id)}><Text style={styles.cancelText}>{tt('admBom','ຍົກເລີກ')}</Text></Pressable>
                <Pressable style={styles.saveBtn} onPress={() => save(t0)} disabled={savingId === t0.id}>
                  <Text style={styles.saveText}>{savingId === t0.id ? '...' : tt('admBom','💾 ບັນທຶກ')}</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}

      {pickerFor && (() => {
        const t0 = list.find((x) => x.id === pickerFor.tplId);
        const cur = t0 ? tpl(t0).items[pickerFor.index] : undefined;
        const q = pickerQuery.trim().toLowerCase();
        const shownP = products
          .filter((p) => p.active !== false && p.approved)
          .filter((p) => !q || `${p.name} ${p.shopName ?? ''}`.toLowerCase().includes(q))
          .slice(0, 60);
        return (
          <Modal visible transparent animationType="fade" onRequestClose={() => setPickerFor(null)}>
            <View style={styles.overlay}>
              <View style={styles.pickerModal}>
                <View style={styles.pickerHead}>
                  <Text style={styles.pickerTitle}>{tt('admBom','🏬 ຜູກ ສິນຄ້າ ຮ້ານ')}</Text>
                  <Pressable onPress={() => setPickerFor(null)} hitSlop={8}><Text style={styles.pickerClose}>✕</Text></Pressable>
                </View>
                <TextInput value={pickerQuery} onChangeText={setPickerQuery} placeholder={tt('admBom','ຄົ້ນຫາ ສິນຄ້າ / ຮ້ານ')} placeholderTextColor="#999" style={styles.pickerSearch} />
                <ScrollView style={{ maxHeight: 360 }}>
                  {cur?.productId && t0 && (
                    <Pressable style={styles.unlinkRow} onPress={() => { unlinkProduct(t0, pickerFor.index); setPickerFor(null); }}>
                      <Text style={styles.unlinkText}>{tt('admBom','✕ ຍົກເລີກ ການ ຜູກ (ພິມ ຊື່ ເອງ)')}</Text>
                    </Pressable>
                  )}
                  {shownP.length === 0 ? (
                    <Text style={styles.emptyItems}>{tt('admBom','ບໍ່ ພົບ ສິນຄ້າ (ຕ້ອງ approved)')}</Text>
                  ) : shownP.map((p) => (
                    <Pressable key={p.id} style={styles.prodRow} onPress={() => { if (t0) linkProduct(t0, pickerFor.index, p); setPickerFor(null); }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.prodName} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.prodMeta} numberOfLines={1}>🏬 {p.shopName ?? tt('admBom','ຮ້ານ')} · {(p.price ?? 0).toLocaleString('en-US')}/{p.unit ?? '—'}</Text>
                      </View>
                      {cur?.productId === p.id && <Text style={styles.prodOn}>✓</Text>}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#fff' },
  searchInput: { flex: 1, fontSize: 13, color: '#111', paddingVertical: 9 },
  createBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 16 },
  emptyItems: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 8 },
  // collapsed row
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a' },
  dotOff: { backgroundColor: '#cbd5e1' },
  code: { fontFamily: 'monospace' as any, fontSize: 12, fontWeight: '700', color: '#0066CC', backgroundColor: '#EAF2FB', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  rowMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  catChip: { fontSize: 12, fontWeight: '700', color: '#0066CC', backgroundColor: '#EAF2FB', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  iconBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  iconEdit: { borderColor: '#0066CC' },
  iconEditText: { color: '#0066CC', fontSize: 14, fontWeight: '700' },
  // editor
  editCard: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#0066CC', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 12, marginBottom: 12 },
  editHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleInput: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 8, padding: 9 },
  codeInput: { width: 150, fontFamily: 'monospace' as any, fontSize: 12, color: '#0066CC', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 8, padding: 9 },
  catChipBtn: { borderWidth: 1, borderColor: '#0066CC', backgroundColor: '#EAF2FB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  catChipBtnText: { color: '#0066CC', fontSize: 12, fontWeight: '700' },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 10, marginBottom: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 0, borderTopWidth: 1, borderTopColor: '#f6f7f9' },
  tick: { width: 26, alignItems: 'center', justifyContent: 'center' },
  tickText: { fontSize: 15, color: '#cbd5e1' },
  tickOn: { color: '#16a34a' },
  cellName: { flex: 1, minWidth: 0, height: 30, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 0, fontSize: 12, color: '#111', backgroundColor: '#fff' },
  typeBadge: { height: 30, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  typeBadgeText: { fontSize: 12, fontWeight: '700' },
  cellUnit: { width: 60, height: 30, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingVertical: 0, fontSize: 12, color: '#111', textAlign: 'center', backgroundColor: '#fff' },
  rm: { width: 24, alignItems: 'center', justifyContent: 'center' },
  rmText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
  linkBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  linkOn: { borderColor: '#0066CC', backgroundColor: '#EAF2FB' },
  linkIcon: { fontSize: 13 },
  linkHint: { fontSize: 12, color: '#9ca3af', marginTop: 6 },
  viewShop: { fontSize: 12, color: '#0066CC', fontWeight: '600' },
  addItem: { alignSelf: 'flex-start', marginTop: 10, borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addItemText: { color: '#0066CC', fontSize: 12, fontWeight: '600' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  total: { fontSize: 13, color: '#6b7280', fontWeight: '700', marginRight: 'auto' },
  cancelBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  cancelText: { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  saveBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  // view (read-only)
  viewCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 12, marginBottom: 12 },
  viewTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111' },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 0, borderTopWidth: 1, borderTopColor: '#f6f7f9' },
  viewTick: { fontSize: 15, color: '#16a34a', width: 20, textAlign: 'center' },
  viewName: { flex: 1, minWidth: 0, fontSize: 13, color: '#111' },
  viewDim: { color: '#9ca3af', textDecorationLine: 'line-through' },
  viewUnit: { fontSize: 12, color: '#6b7280', width: 60, textAlign: 'center' },
  // product picker modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  pickerModal: { backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, overflow: 'hidden' },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef0f3' },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  pickerClose: { fontSize: 15, color: '#6b7280', fontWeight: '700' },
  pickerSearch: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 13, color: '#111', margin: 12, backgroundColor: '#fff' },
  unlinkRow: { paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  unlinkText: { fontSize: 13, color: '#dc2626', fontWeight: '600' },
  prodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  prodName: { fontSize: 13, fontWeight: '600', color: '#111' },
  prodMeta: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  prodOn: { fontSize: 15, color: '#16a34a', fontWeight: '700' },
});
