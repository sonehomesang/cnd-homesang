import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { cnd } from '@/lib/cnd/theme';
import { createCndCategory, updateCndCategory, catDepth, catWithDescendants, catPath, type CndCategory } from '@/lib/cnd/catalog';
import { ttStatic } from '@/lib/i18n';

const ICONS = ['💡', '🚰', '❄️', '🎨', '🔧', '🧱', '🚽', '🪟', '🪚', '🔩', '🚪', '🧰', '💧', '🏠', '📦'];

// CND admin — add / edit a category (name · icon · order · parent · install-fee %).
export default function CategoryEditor({ editing, nextOrder, cats = [], defaultParentId, onClose }: { editing: CndCategory | null; nextOrder: number; cats?: CndCategory[]; defaultParentId?: string; onClose: () => void }) {
  const [name, setName] = useState(editing?.name ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? '📦');
  const [order, setOrder] = useState(String(editing?.order ?? nextOrder));
  const [pct, setPct] = useState(editing?.installFeePct != null ? String(editing.installFeePct) : '');
  const [parentId, setParentId] = useState<string>(editing?.parentId ?? defaultParentId ?? '');
  const [busy, setBusy] = useState(false);
  const [pq, setPq] = useState('');   // search within the (potentially long) parent list

  // eligible parents: not self, not one of my own descendants (no cycle), and ≤ depth-1
  // (so the child lands at ≤ 3 levels: main → sub → sub2)
  const ownBranch = editing ? catWithDescendants(cats, editing.id) : new Set<string>();
  const parents = cats.filter((c) => !ownBranch.has(c.id) && catDepth(cats, c.id) <= 1)
    .sort((a, b) => catPath(cats, a.id).map((x) => x.name).join('/').localeCompare(catPath(cats, b.id).map((x) => x.name).join('/')));
  const crumb = (c: CndCategory) => catPath(cats, c.id).map((x) => `${x.icon ?? ''} ${x.name}`.trim()).join(' › ');
  const shownParents = pq.trim() ? parents.filter((c) => crumb(c).toLowerCase().includes(pq.trim().toLowerCase())) : parents;

  const save = async () => {
    if (!name.trim()) { alert(ttStatic('cndAdmin', 'ໃສ່ ຊື່ ໝວດ')); return; }
    setBusy(true);
    try {
      const patch = { name: name.trim(), icon, order: Number(order.replace(/\D/g, '')) || 0, parentId: parentId || undefined, installFeePct: pct === '' ? undefined : Number(pct.replace(/\D/g, '')) };
      if (editing) await updateCndCategory(editing.id, patch); else await createCndCategory(patch);
      onClose();
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.back} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={styles.title}>{editing ? ttStatic('cndAdmin', 'ແກ້ ໝວດ') : ttStatic('cndAdmin', 'ເພີ່ມ ໝວດ')}</Text>
            <Pressable onPress={onClose} hitSlop={12}><Text style={styles.x}>✕</Text></Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator>
            <Text style={styles.lbl}>{ttStatic('cndAdmin', 'ໄອຄອນ')}</Text>
            <View style={styles.icons}>{ICONS.map((i) => <Pressable key={i} style={[styles.iconChip, icon === i && styles.iconOn]} onPress={() => setIcon(i)}><Text style={{ fontSize: 20 }}>{i}</Text></Pressable>)}</View>

            <Text style={styles.lbl}>{ttStatic('cndAdmin', 'ຊື່ ໝວດ *')}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={ttStatic('cndAdmin', 'ເຊ່ນ ໄຟຟ້າ')} placeholderTextColor={cnd.ink3} />

            <Text style={styles.lbl}>{ttStatic('cndAdmin', 'ຢູ່ ພາຍ ໃຕ້ ໝວດ (ວ່າງ = ໝວດ ຫຼັກ)')}</Text>
            <TextInput style={styles.input} value={pq} onChangeText={setPq} placeholder={ttStatic('cndAdmin', '🔍 ຄົ້ນຫາ ໝວດ ແມ່')} placeholderTextColor={cnd.ink3} />
            <ScrollView style={styles.parentsBox} contentContainerStyle={styles.parents} nestedScrollEnabled showsVerticalScrollIndicator>
              <Pressable style={[styles.pChip, parentId === '' && styles.pOn]} onPress={() => setParentId('')}><Text style={[styles.pTx, parentId === '' && styles.pTxOn]}>— {ttStatic('cndAdmin', 'ໝວດ ຫຼັກ')}</Text></Pressable>
              {shownParents.map((c) => <Pressable key={c.id} style={[styles.pChip, parentId === c.id && styles.pOn]} onPress={() => setParentId(c.id)}><Text style={[styles.pTx, parentId === c.id && styles.pTxOn]} numberOfLines={1}>{crumb(c)}</Text></Pressable>)}
              {shownParents.length === 0 && <Text style={styles.noHit}>{ttStatic('cndAdmin', '— ບໍ່ ພົບ ໝວດ —')}</Text>}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Text style={styles.lbl}>{ttStatic('cndAdmin', 'ລຳ ດັບ')}</Text><TextInput style={styles.input} value={order} onChangeText={(t) => setOrder(t.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Text style={styles.lbl}>{ttStatic('cndAdmin', 'ຄ່າ ຕິດຕັ້ງ %')}</Text><TextInput style={styles.input} value={pct} onChangeText={(t) => setPct(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={ttStatic('cndAdmin', 'ໃຊ້ global')} placeholderTextColor={cnd.ink3} /></View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Pressable style={[styles.btn, styles.cancel]} onPress={onClose}><Text style={[styles.btnTx, { color: cnd.ink2 }]}>{ttStatic('cndAdmin', 'ຍົກເລີກ')}</Text></Pressable>
              <Pressable style={[styles.btn, styles.save, busy && { opacity: 0.5 }]} disabled={busy} onPress={save}><Text style={styles.btnTx}>{editing ? ttStatic('cndAdmin', 'ບັນທຶກ') : ttStatic('cndAdmin', 'ເພີ່ມ')}</Text></Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 420, maxHeight: '90%', backgroundColor: cnd.surface, borderRadius: 16, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: cnd.line },
  x: { fontSize: 20, fontWeight: '800', color: cnd.ink2, paddingHorizontal: 6 },
  body: { paddingHorizontal: 18, paddingBottom: 18 },
  parentsBox: { maxHeight: 190, borderWidth: 1, borderColor: cnd.line, borderRadius: 10, backgroundColor: cnd.surface2, padding: 8 },
  noHit: { fontSize: 12, color: cnd.ink3, padding: 8 },
  title: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  lbl: { fontSize: 12.5, fontWeight: '800', color: cnd.ink2, marginTop: 12, marginBottom: 5 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  iconChip: { width: 40, height: 40, borderRadius: 9, borderWidth: 1, borderColor: cnd.line, alignItems: 'center', justifyContent: 'center', backgroundColor: cnd.surface2 },
  iconOn: { borderColor: cnd.brand, borderWidth: 2, backgroundColor: cnd.brandSoft },
  parents: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pChip: { borderWidth: 1, borderColor: cnd.line, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 11, backgroundColor: cnd.surface2, maxWidth: '100%' },
  pOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  pTx: { fontSize: 12, fontWeight: '700', color: cnd.ink2 },
  pTxOn: { color: cnd.white },
  input: { borderWidth: 1, borderColor: cnd.line, borderRadius: 9, padding: 11, fontSize: 14, color: cnd.ink, backgroundColor: cnd.surface },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancel: { backgroundColor: cnd.surface2, borderWidth: 1, borderColor: cnd.line },
  save: { backgroundColor: cnd.brand },
  btnTx: { color: cnd.white, fontWeight: '800', fontSize: 14 },
});
