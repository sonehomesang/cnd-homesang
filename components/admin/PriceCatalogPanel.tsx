import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AmountInput from '@/components/AmountInput';
import AppSwitch from '@/components/AppSwitch';
import { CATEGORIES, getCategory } from '@/lib/categories';
import {
  addPriceItem,
  deletePriceItem,
  type PriceItem,
  type PriceKind,
  PRICE_KIND_LABEL,
  seedDefaultPriceItems,
  updatePriceItem,
  watchPriceItems,
} from '@/lib/priceCatalog';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';

const KINDS: PriceKind[] = ['material', 'labor'];

export default function PriceCatalogPanel() {
  const { canCreate, canEdit, canDelete } = useSectionPerms('pricing');
  const [items, setItems] = useState<PriceItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [kind, setKind] = useState<PriceKind>('material');
  const [draft, setDraft] = useState({ name: '', unit: '', price: 0, category: '' });
  const [seeding, setSeeding] = useState(false);
  const tt = useTT();

  useEffect(() => watchPriceItems((it) => { setItems(it); setLoaded(true); }), []);

  const shown = useMemo(() => items.filter((i) => i.kind === kind), [items, kind]);

  const add = async () => {
    if (!draft.name.trim() || !draft.unit.trim()) { alert(tt('admPrices','ໃສ່ ຊື່ + ໜ່ວຍ')); return; }
    try {
      await addPriceItem({
        kind,
        name: draft.name.trim(),
        unit: draft.unit.trim(),
        price: draft.price,
        category: draft.category || '',
        active: true,
      });
      setDraft({ name: '', unit: '', price: 0, category: '' });
    } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
  };

  const seed = async () => {
    if (!confirm(tt('admPrices','ເພີ່ມ ຄ່າມາດຕະຖານ HomeSang? (ເພີ່ມໃສ່ ບໍ່ລຶບຂອງເກົ່າ)'))) return;
    setSeeding(true);
    try { await seedDefaultPriceItems(); } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setSeeding(false); }
  };

  return (
    <View>
      <Text style={styles.title}>{tt('admPrices','💲 ລາຄາກາງ · Reference prices')}</Text>
      <Text style={styles.sub}>{tt('admPrices','ວັດສະດຸ ແລະ ຄ່າແຮງ ມາດຕະຖານ — ຊ່າງດຶງເຂົ້າໃບສະເໜີ. ບັນທຶກແລ້ວ ມີຜົນທັນທີ.')}</Text>

      <View style={styles.tabs}>
        {KINDS.map((k) => (
          <Pressable key={k} style={[styles.tab, kind === k && styles.tabOn]} onPress={() => setKind(k)}>
            <Text style={[styles.tabText, kind === k && styles.tabTextOn]}>{tt('priceKind', PRICE_KIND_LABEL[k])}</Text>
          </Pressable>
        ))}
        {canCreate && loaded && items.length === 0 && (
          <Pressable style={styles.seedBtn} onPress={seed} disabled={seeding}>
            <Text style={styles.seedText}>{seeding ? '...' : tt('admPrices','↻ ຄ່າມາດຕະຖານ')}</Text>
          </Pressable>
        )}
      </View>

      {/* add row */}
      {canCreate && (
      <View style={styles.addCard}>
        <TextInput value={draft.name} onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))} placeholder={`${tt('admPrices','ຊື່ ')}${tt('priceKind', PRICE_KIND_LABEL[kind])}`} placeholderTextColor="#999" style={[styles.input, { flex: 2 }]} />
        <TextInput value={draft.unit} onChangeText={(v) => setDraft((d) => ({ ...d, unit: v }))} placeholder={tt('admPrices','ໜ່ວຍ')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
        <AmountInput value={draft.price} onChangeValue={(n) => setDraft((d) => ({ ...d, price: n }))} placeholder={tt('admPrices','ລາຄາ')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
        <Pressable style={styles.addBtn} onPress={add}><Text style={styles.addBtnText}>＋</Text></Pressable>
      </View>
      )}

      <Text style={styles.count}>{shown.length} {tt('admPrices','ລາຍການ')}</Text>

      {shown.map((it) => (
        <View key={it.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <TextInput value={it.name} editable={canEdit} onChangeText={(v) => updatePriceItem(it.id, { name: v })} style={styles.rowName} />
            <View style={styles.rowMeta}>
              <Text style={styles.cat}>{it.category ? getCategory(it.category)?.lao ?? it.category : tt('admPrices','ທຸກໝວດ')}</Text>
            </View>
          </View>
          <TextInput value={it.unit} editable={canEdit} onChangeText={(v) => updatePriceItem(it.id, { unit: v })} style={styles.unit} />
          <TextInput
            value={it.price ? it.price.toLocaleString('en-US') : ''}
            editable={canEdit}
            onChangeText={(v) => updatePriceItem(it.id, { price: parseInt(v.replace(/\D/g, ''), 10) || 0 })}
            keyboardType="number-pad"
            style={styles.price}
          />
          <AppSwitch value={it.active} onValueChange={(v) => { if (canEdit) updatePriceItem(it.id, { active: v }); }} disabled={!canEdit} />
          {canDelete && <Pressable style={styles.del} onPress={() => { if (confirm(tt('admPrices','ລຶບ?'))) deletePriceItem(it.id); }}>
            <Text style={styles.delText}>✕</Text>
          </Pressable>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  tabOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  tabText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  tabTextOn: { color: '#fff' },
  seedBtn: { marginLeft: 'auto', borderWidth: 1, borderColor: '#16a34a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  seedText: { color: '#16a34a', fontSize: 12, fontWeight: '600' },
  addCard: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 12, color: '#111', backgroundColor: '#fff' },
  addBtn: { backgroundColor: '#16a34a', borderRadius: 8, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  count: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 8 },
  rowName: { fontSize: 12, color: '#111', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 6, padding: 6 },
  rowMeta: { flexDirection: 'row', marginTop: 3 },
  cat: { fontSize: 12, color: '#7c3aed', backgroundColor: '#f3e8ff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  unit: { width: 60, fontSize: 12, color: '#111', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 6, padding: 6, textAlign: 'center' },
  price: { width: 90, fontSize: 12, color: '#111', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 6, padding: 6, textAlign: 'right' },
  del: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  delText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
});
