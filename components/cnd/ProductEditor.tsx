import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import PhotoPicker from '@/components/PhotoPicker';
import AmountInput from '@/components/AmountInput';
import { cnd, kip, kipT, unitT } from '@/lib/cnd/theme';
import { ttStatic } from '@/lib/i18n';
import { createCndProduct, updateCndProduct, catChildren, catPath, type CndCategory, type CndProduct, type CndProductInput } from '@/lib/cnd/catalog';
import { SERVICE_TEMPLATES, formatDuration } from '@/lib/ninesang';
import { DEFAULT_CND_UNITS, watchCndUnits } from '@/lib/cnd/units';

// Fallback for a store that has not opened the ຫົວໜ່ວຍ panel yet — the picker
// must never be empty. Once units exist in the DB, those replace this list.
const FALLBACK_UNITS = DEFAULT_CND_UNITS.map((u) => u.name);

function blank(): CndProductInput {
  return { name: '', categoryId: '', brand: '', unit: 'ໜ່ວຍ', price: 0, cost: undefined, oldPrice: undefined, sku: '', stock: undefined, images: [], installable: false, installFeePct: undefined, description: '' };
}

// CND admin — add / edit a product (phase 0c). Full form + image upload.
export default function ProductEditor({ cats, editing, onClose }: { cats: CndCategory[]; editing: CndProduct | null; onClose: () => void }) {
  const [d, setD] = useState<CndProductInput>(() => editing
    ? { name: editing.name, categoryId: editing.categoryId, brand: editing.brand ?? '', unit: editing.unit, price: editing.price, cost: editing.cost, oldPrice: editing.oldPrice, sku: editing.sku ?? '', stock: editing.stock, images: editing.images ?? [], installable: !!editing.installable, installFeePct: editing.installFeePct, description: editing.description ?? '', warrantyDays: editing.warrantyDays, isService: !!editing.isService, serviceScope: editing.serviceScope, serviceExcludes: editing.serviceExcludes, serviceRequirements: editing.serviceRequirements, durationMin: editing.durationMin, durationMax: editing.durationMax }
    : blank());
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<CndProductInput>) => setD((p) => ({ ...p, ...patch }));

  // admin-managed units (ຫົວໜ່ວຍ panel); retired ones stay listed only while the
  // product being edited still uses them, so its value is never silently lost.
  const [unitNames, setUnitNames] = useState<string[]>(FALLBACK_UNITS);
  useEffect(() => watchCndUnits((us) => {
    const live = us.filter((u) => u.active).map((u) => u.name);
    setUnitNames(live.length ? live : FALLBACK_UNITS);
  }), []);
  const units = unitNames.includes(d.unit) ? unitNames : [...unitNames, d.unit];
  const applyTemplate = (t: typeof SERVICE_TEMPLATES[number]) => setD((p) => ({
    ...p, isService: true, unit: t.unit, warrantyDays: t.warrantyDays || undefined,
    durationMin: t.durationMin, durationMax: t.durationMax,
    serviceScope: [...t.scope], serviceExcludes: [...t.excludes], serviceRequirements: [...t.requirements],
    name: p.name.trim() ? p.name : t.name,
  }));

  const save = async () => {
    if (!d.name.trim()) { alert(ttStatic('cndAdmin', 'ໃສ່ ຊື່ ສິນຄ້າ')); return; }
    if (!d.categoryId) { alert(ttStatic('cndAdmin', 'ເລືອກ ໝວດ')); return; }
    if (!d.price) { alert(ttStatic('cndAdmin', 'ໃສ່ ລາຄາ')); return; }
    setBusy(true);
    try {
      if (editing) await updateCndProduct(editing.id, d); else await createCndProduct(d);
      onClose();
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>{editing ? ttStatic('cndAdmin', 'ແກ້ ສິນຄ້າ') : ttStatic('cndAdmin', 'ເພີ່ມ ສິນຄ້າ')}</Text>
            <Pressable onPress={onClose} hitSlop={10}><Text style={styles.x}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.lbl}>{ttStatic('cndAdmin', 'ຮູບ ສິນຄ້າ')}</Text>
            <PhotoPicker photos={d.images ?? []} onChange={(imgs) => set({ images: imgs })} pathPrefix="cnd/products" max={4} aspect={[1, 1]} />

            <Text style={styles.lbl}>{ttStatic('cndAdmin', 'ຊື່ ສິນຄ້າ *')}</Text>
            <TextInput style={styles.input} value={d.name} onChangeText={(t) => set({ name: t })} placeholder={ttStatic('cndAdmin', 'ເຊ່ນ ແອຣ໌ 12000 BTU Inverter')} placeholderTextColor={cnd.ink3} />

            <Text style={styles.lbl}>{ttStatic('cndAdmin', 'ໝວດ *')}</Text>
            {cats.length === 0 ? <Text style={styles.warn}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ໝວດ — ໄປ ໃສ່ ຂໍ້ມູນ ຕົວຢ່າງ ກ່ອນ')}</Text> : (() => {
              const path = d.categoryId ? catPath(cats, d.categoryId) : [];
              const lvl0 = catChildren(cats, null);
              const lvl1 = path[0] ? catChildren(cats, path[0].id) : [];
              const lvl2 = path[1] ? catChildren(cats, path[1].id) : [];
              const Row = ({ list, sel }: { list: CndCategory[]; sel?: string }) => (
                <View style={styles.chips}>{list.map((c) => <Pressable key={c.id} style={[styles.chip, sel === c.id && styles.chipOn]} onPress={() => set({ categoryId: c.id })}><Text style={[styles.chipTx, sel === c.id && styles.chipTxOn]}>{c.icon} {c.name}</Text></Pressable>)}</View>
              );
              return (
                <>
                  <Row list={lvl0} sel={path[0]?.id} />
                  {lvl1.length > 0 && <><Text style={styles.subLbl}>{ttStatic('cndAdmin', '↳ ໝວດ ຍ່ອຍ')}</Text><Row list={lvl1} sel={path[1]?.id} /></>}
                  {lvl2.length > 0 && <><Text style={styles.subLbl}>{ttStatic('cndAdmin', '↳ ໝວດ ຍ່ອຍ 2')}</Text><Row list={lvl2} sel={path[2]?.id} /></>}
                  {d.categoryId ? <Text style={styles.crumb}>{path.map((x) => x.name).join(' › ')}</Text> : null}
                </>
              );
            })()}

            <View style={styles.rowG}>
              <View style={{ flex: 1 }}><Text style={styles.lbl}>{ttStatic('cndAdmin', 'ຍີ່ຫໍ້')}</Text><TextInput style={styles.input} value={d.brand} onChangeText={(t) => set({ brand: t })} placeholder={ttStatic('cndAdmin', 'ເຊ່ນ HISENSE')} placeholderTextColor={cnd.ink3} /></View>
              <View style={{ flex: 1 }}><Text style={styles.lbl}>{ttStatic('cndAdmin', 'SKU/ບາໂຄດ')}</Text><TextInput style={styles.input} value={d.sku} onChangeText={(t) => set({ sku: t })} placeholder={ttStatic('cndAdmin', 'ບໍ່ ບັງຄັບ')} placeholderTextColor={cnd.ink3} /></View>
            </View>

            <Text style={styles.lbl}>{ttStatic('cndAdmin', 'ໜ່ວຍ ຂາຍ')}</Text>
            <View style={styles.chips}>{units.map((u) => <Pressable key={u} style={[styles.chip, d.unit === u && styles.chipOn]} onPress={() => set({ unit: u })}><Text style={[styles.chipTx, d.unit === u && styles.chipTxOn]}>{unitT(u)}</Text></Pressable>)}</View>

            <View style={styles.rowG}>
              <View style={{ flex: 1 }}><Text style={styles.lbl}>{ttStatic('cndAdmin', 'ລາຄາ (ກີບ) *')}</Text><AmountInput style={styles.input} value={d.price} onChangeValue={(n) => set({ price: n })} placeholder="0" placeholderTextColor={cnd.ink3} /></View>
              <View style={{ flex: 1 }}><Text style={styles.lbl}>{ttStatic('cndAdmin', 'ລາຄາ ເກົ່າ (ຫຼຸດ)')}</Text><AmountInput style={styles.input} value={d.oldPrice ?? 0} onChangeValue={(n) => set({ oldPrice: n || undefined })} placeholder={ttStatic('cndAdmin', 'ບໍ່ ບັງຄັບ')} placeholderTextColor={cnd.ink3} /></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Text style={styles.lbl}>{ttStatic('cndAdmin', 'ຕົ້ນທຶນ (ກຳໄລ)')}</Text><AmountInput style={styles.input} value={d.cost ?? 0} onChangeValue={(n) => set({ cost: n || undefined })} placeholder={ttStatic('cndAdmin', 'ບໍ່ ບັງຄັບ')} placeholderTextColor={cnd.ink3} /></View>
              <View style={{ flex: 1 }}><Text style={styles.lbl}>{ttStatic('cndAdmin', 'ສະຕັອກ')}</Text><AmountInput style={styles.input} value={d.stock ?? 0} onChangeValue={(n) => set({ stock: n || undefined })} placeholder={ttStatic('cndAdmin', 'ບໍ່ ບັງຄັບ')} placeholderTextColor={cnd.ink3} /></View>
            </View>
            {!!d.cost && !!d.price && d.price > d.cost && <Text style={styles.margin}>{ttStatic('cndAdmin', 'ກຳໄລ')} {kipT(d.price - d.cost)} ({Math.round(((d.price - d.cost) / d.price) * 100)}%)</Text>}

            {/* install service */}
            <View style={styles.instBox}>
              <View style={styles.instRow}><Text style={styles.instL}>{ttStatic('cndAdmin', '🔧 ສະເໜີ ຊ່າງ ໄປ ຕິດຕັ້ງ?')}</Text><Switch value={!!d.installable} onValueChange={(v) => set({ installable: v })} trackColor={{ true: cnd.green }} /></View>
              {d.installable && (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.lbl}>{ttStatic('cndAdmin', 'ຄ່າ ຕິດຕັ້ງ % (ວ່າງ = ໃຊ້ ຄ່າ ໝວດ/global)')}</Text>
                  <AmountInput style={[styles.input, { maxWidth: 120 }]} value={d.installFeePct ?? 0} onChangeValue={(n) => set({ installFeePct: n || undefined })} placeholder={ttStatic('cndAdmin', 'ໃຊ້ ຄ່າ ໝວດ')} placeholderTextColor={cnd.ink3} />
                </View>
              )}
            </View>

            <Text style={styles.lbl}>{ttStatic('cndAdmin', '🛡️ ຮັບປະກັນ ວຽກ (ວັນ · ວ່າງ = ບໍ່ ມີ)')}</Text>
            <View style={styles.warRow}>
              <AmountInput style={[styles.input, { maxWidth: 120 }]} value={d.warrantyDays ?? 0} onChangeValue={(n) => set({ warrantyDays: n || undefined })} placeholder="0" placeholderTextColor={cnd.ink3} />
              {[['30 ວັນ', 30], ['180 ວັນ', 180], ['1 ປີ', 365], ['2 ປີ', 730]].map(([l, dv]) => (
                <Pressable key={dv as number} style={[styles.warChip, d.warrantyDays === dv && styles.warOn]} onPress={() => set({ warrantyDays: dv as number })}><Text style={[styles.warTx, d.warrantyDays === dv && styles.warTxOn]}>{ttStatic('cndAdmin', l as string)}</Text></Pressable>
              ))}
            </View>

            {/* service-detail template (dohome-style structured service SKU) */}
            <View style={styles.svBox}>
              <View style={styles.instRow}>
                <Text style={styles.instL}>{ttStatic('cndAdmin', '🛠️ ນີ້ ເປັນ ບໍລິການ (ຄິດ ຕໍ່ ຄັ້ງ)')}</Text>
                <Switch value={!!d.isService} onValueChange={(v) => set(v ? { isService: true, unit: d.unit === 'ໜ່ວຍ' ? 'ຄັ້ງ' : d.unit } : { isService: false })} trackColor={{ true: cnd.green }} />
              </View>
              {d.isService && (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.lbl}>{ttStatic('cndAdmin', '📋 ໂຫຼດ ເທມເພລດ ສຳເລັດ ຮູບ')}</Text>
                  <View style={styles.chips}>
                    {SERVICE_TEMPLATES.map((t) => (
                      <Pressable key={t.key} style={styles.tplChip} onPress={() => applyTemplate(t)}><Text style={styles.tplChipTx}>{t.icon} {t.name.replace('ບໍລິການ ', '')}</Text></Pressable>
                    ))}
                  </View>
                  <ListEditor label={ttStatic('cndAdmin', '✓ ຂອບ ເຂດ ງານ (ໄດ້ ຫຍັງ ແດ່)')} items={d.serviceScope ?? []} onChange={(a) => set({ serviceScope: a.length ? a : undefined })} placeholder={ttStatic('cndAdmin', 'ເຊ່ນ ລ້າງ ຄອຍ ເຢັນ + ຖາດ ນ້ຳ')} />
                  <ListEditor label={ttStatic('cndAdmin', '✕ ບໍ່ ລວມ ໃນ ລາຄາ')} items={d.serviceExcludes ?? []} onChange={(a) => set({ serviceExcludes: a.length ? a : undefined })} placeholder={ttStatic('cndAdmin', 'ເຊ່ນ ຕື່ມ ນ້ຳຢາ (ຄິດ ແຍກ)')} />
                  <ListEditor label={ttStatic('cndAdmin', '📋 ລູກຄ້າ ຕຽມ / ຂໍ້ ຄວນ ຮູ້')} items={d.serviceRequirements ?? []} onChange={(a) => set({ serviceRequirements: a.length ? a : undefined })} placeholder={ttStatic('cndAdmin', 'ເຊ່ນ ມີ ໄຟຟ້າ + ນ້ຳ ໜ້າ ງານ')} />
                  <View style={styles.rowG}>
                    <View style={{ flex: 1 }}><Text style={styles.lbl}>{ttStatic('cndAdmin', '⏱ ເວລາ ຕ່ຳ (ນາທີ)')}</Text><AmountInput style={styles.input} value={d.durationMin ?? 0} onChangeValue={(n) => set({ durationMin: n || undefined })} placeholder="0" placeholderTextColor={cnd.ink3} /></View>
                    <View style={{ flex: 1 }}><Text style={styles.lbl}>{ttStatic('cndAdmin', '⏱ ເວລາ ສູງ (ນາທີ)')}</Text><AmountInput style={styles.input} value={d.durationMax ?? 0} onChangeValue={(n) => set({ durationMax: n || undefined })} placeholder="0" placeholderTextColor={cnd.ink3} /></View>
                  </View>
                  {!!formatDuration(d.durationMin, d.durationMax) && <Text style={styles.margin}>⏱ {formatDuration(d.durationMin, d.durationMax)}</Text>}
                </View>
              )}
            </View>

            <Text style={styles.lbl}>{ttStatic('cndAdmin', 'ລາຍລະອຽດ')}</Text>
            <TextInput style={[styles.input, { height: 70 }]} value={d.description} onChangeText={(t) => set({ description: t })} placeholder={ttStatic('cndAdmin', 'ຄຸນ ລັກສະນະ / ໝາຍເຫດ')} placeholderTextColor={cnd.ink3} multiline />

            <Pressable style={[styles.save, busy && { opacity: 0.5 }]} disabled={busy} onPress={save}><Text style={styles.saveTx}>{busy ? ttStatic('cndAdmin', 'ກຳລັງ ບັນທຶກ...') : editing ? ttStatic('cndAdmin', 'ບັນທຶກ ການ ແກ້') : ttStatic('cndAdmin', 'ເພີ່ມ ສິນຄ້າ')}{d.price ? ` · ${kip(d.price)} ${ttStatic('cndAdmin', 'ກີບ')}` : ''}</Text></Pressable>
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// bulleted-list editor (add / edit / remove rows) — used for service scope/excludes/prep
function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (a: string[]) => void; placeholder?: string }) {
  const edit = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const add = () => onChange([...items, '']);
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.lbl}>{label}</Text>
      {items.map((it, i) => (
        <View key={i} style={styles.leRow}>
          <TextInput style={[styles.input, { flex: 1, minWidth: 0 }]} value={it} onChangeText={(v) => edit(i, v)} placeholder={placeholder} placeholderTextColor={cnd.ink3} />
          <Pressable style={styles.leDel} onPress={() => remove(i)} hitSlop={8}><Text style={styles.leDelTx}>✕</Text></Pressable>
        </View>
      ))}
      <Pressable style={styles.leAdd} onPress={add}><Text style={styles.leAddTx}>+ {ttStatic('cndAdmin', 'ເພີ່ມ ແຖວ')}</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: cnd.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '94%' },
  head: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: cnd.line, backgroundColor: cnd.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  title: { flex: 1, fontSize: 15, fontWeight: '900', color: cnd.ink },
  x: { fontSize: 20, color: cnd.ink3, fontWeight: '800' },
  body: { padding: 14, gap: 4 },
  lbl: { fontSize: 12.5, fontWeight: '800', color: cnd.ink2, marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: cnd.line, borderRadius: 9, padding: 11, fontSize: 14, color: cnd.ink, backgroundColor: cnd.surface },
  rowG: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderColor: cnd.line, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: cnd.surface },
  chipOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  chipTx: { fontSize: 12.5, fontWeight: '700', color: cnd.ink2 },
  chipTxOn: { color: cnd.white },
  warn: { fontSize: 12.5, color: cnd.error, fontWeight: '700' },
  subLbl: { fontSize: 12, fontWeight: '800', color: cnd.ink3, marginTop: 8, marginBottom: 3 },
  crumb: { fontSize: 12, fontWeight: '700', color: cnd.brandDark, marginTop: 6 },
  margin: { fontSize: 12, fontWeight: '800', color: cnd.green, marginTop: 4 },
  warRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  warChip: { borderWidth: 1, borderColor: cnd.line, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: cnd.surface2 },
  warOn: { backgroundColor: cnd.blueSoft, borderColor: cnd.blue },
  warTx: { fontSize: 12, fontWeight: '700', color: cnd.ink2 },
  warTxOn: { color: cnd.blue },
  instBox: { backgroundColor: cnd.yellowSoft, borderWidth: 1, borderColor: cnd.yellow, borderRadius: 11, padding: 12, marginTop: 12 },
  instRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  instL: { fontSize: 14, fontWeight: '800', color: cnd.ink },
  svBox: { backgroundColor: '#F0F9F4', borderWidth: 1, borderColor: '#B7E4C7', borderRadius: 11, padding: 12, marginTop: 12 },
  tplChip: { borderWidth: 1, borderColor: cnd.green, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: cnd.surface },
  tplChipTx: { fontSize: 12, fontWeight: '700', color: cnd.green },
  leRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  leDel: { width: 30, height: 30, borderRadius: 8, backgroundColor: cnd.surface2, alignItems: 'center', justifyContent: 'center' },
  leDelTx: { color: cnd.error, fontWeight: '900', fontSize: 13 },
  leAdd: { alignSelf: 'flex-start', marginTop: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line },
  leAddTx: { fontSize: 12.5, fontWeight: '800', color: cnd.blue },
  save: { backgroundColor: cnd.brand, borderRadius: 11, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  saveTx: { color: cnd.white, fontWeight: '800', fontSize: 14 },
});
