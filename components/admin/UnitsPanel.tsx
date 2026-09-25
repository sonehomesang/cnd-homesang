import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  addUnit,
  deleteUnit,
  type RefType,
  seedRefDataIfEmpty,
  type Unit,
  updateUnit,
  watchUnits,
} from '@/lib/refdata';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';

export default function UnitsPanel() {
  const { canCreate, canEdit, canDelete } = useSectionPerms('units');
  const [type, setType] = useState<RefType>('service');
  const [units, setUnits] = useState<Unit[]>([]);
  const [nameLao, setNameLao] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const tt = useTT();

  useEffect(() => {
    seedRefDataIfEmpty().catch((e) => console.error('seed:', e));
  }, []);

  useEffect(() => {
    const unsub = watchUnits(type, setUnits);
    return unsub;
  }, [type]);

  const submit = async () => {
    if (!nameLao) return;
    if (editId) {
      if (!canEdit) return;
      await updateUnit(editId, { nameLao, nameEn });
      setEditId(null);
    } else {
      if (!canCreate) return;
      await addUnit(type, nameLao, nameEn);
    }
    setNameLao('');
    setNameEn('');
  };

  return (
    <View>
      <Text style={styles.title}>{tt('admUnits', '📏 ຫົວໜ່ວຍ · Units')}</Text>
      <Text style={styles.sub}>{tt('admUnits', 'ຫົວໜ່ວຍ ສຳລັບ ບໍລິການ ແລະ ສິນຄ້າ')}</Text>

      <View style={styles.subtabs}>
        {(['service', 'product'] as RefType[]).map((t) => (
          <Pressable key={t} onPress={() => setType(t)} style={styles.subtab}>
            <Text style={[styles.subtabText, type === t && styles.subtabActive]}>
              {t === 'service' ? tt('admUnits', 'ບໍລິການ · Service') : tt('admUnits', 'ສິນຄ້າ · Product')} ({units.length})
            </Text>
            {type === t && <View style={styles.bar} />}
          </Pressable>
        ))}
      </View>

      {(canCreate || editId) && (
      <View style={styles.addbar}>
        <TextInput
          value={nameLao}
          onChangeText={setNameLao}
          placeholder={tt('admUnits', 'ຊື່ ລາວ (ຊົ່ວໂມງ)')}
          placeholderTextColor="#999"
          style={[styles.input, { flex: 1 }]}
        />
        <TextInput
          value={nameEn}
          onChangeText={setNameEn}
          placeholder="EN (hour)"
          placeholderTextColor="#999"
          style={[styles.input, { flex: 1 }]}
        />
        <Pressable style={styles.addBtn} onPress={submit}>
          <Text style={styles.addBtnText}>{editId ? tt('admUnits', 'ບັນທຶກ') : tt('admUnits', '+ ເພີ່ມ')}</Text>
        </Pressable>
      </View>
      )}

      <View style={styles.chips}>
        {units.map((u) => (
          <View key={u.id} style={styles.chip}>
            <Text style={styles.chipText}>{u.nameLao} · {u.nameEn}</Text>
            {canEdit && <Pressable onPress={() => { setEditId(u.id); setNameLao(u.nameLao); setNameEn(u.nameEn); }}>
              <Text style={styles.edit}>✎</Text>
            </Pressable>}
            {canDelete && <Pressable onPress={() => deleteUnit(u.id)}>
              <Text style={styles.x}>✕</Text>
            </Pressable>}
          </View>
        ))}
      </View>
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
  addbar: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 14, color: '#111', minWidth: 110 },
  addBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 14, color: '#111' },
  edit: { color: '#0066CC', fontSize: 14 },
  x: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
});
