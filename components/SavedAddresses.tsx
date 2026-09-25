import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { newAddressId, type SavedAddress, saveUserAddresses } from '@/lib/addresses';
import LocationPicker from '@/components/LocationPicker';

/** Manage the delivery addresses saved on the account (view / add / delete). */
export default function SavedAddresses() {
  const { fbUser, profile } = useAuth();
  const tt = useTT();
  const addrs: SavedAddress[] = profile?.savedAddresses ?? [];
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [text, setText] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setLabel(''); setText(''); setPin(null); setShowMap(false); setAdding(false); };

  const add = async () => {
    if (!fbUser || !text.trim()) return;
    setSaving(true);
    try {
      const na: SavedAddress = { id: newAddressId(), label: label.trim() || undefined, address: text.trim(), lat: pin?.lat, lng: pin?.lng, phone: profile?.phone };
      await saveUserAddresses(fbUser.uid, [...addrs, na]);
      reset();
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    if (!fbUser) return;
    if (typeof confirm === 'function' && !confirm(tt('profile', 'ລຶບ ທີ່ຢູ່ ນີ້?'))) return;
    try { await saveUserAddresses(fbUser.uid, addrs.filter((a) => a.id !== id)); } catch (e: any) { alert(e?.message ?? String(e)); }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>📍 {tt('profile', 'ທີ່ຢູ່ ຈັດສົ່ງ ຂອງ ຂ້ອຍ')}</Text>
      {addrs.length === 0 && !adding && <Text style={styles.muted}>{tt('profile', 'ຍັງ ບໍ່ ມີ ທີ່ຢູ່ ບັນທຶກ ໄວ້ — ເພີ່ມ ໄວ້ ໃຫ້ ສັ່ງຊື້ ໄວ ຂຶ້ນ')}</Text>}

      {addrs.map((a) => (
        <View key={a.id} style={styles.row}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.aLabel}>📍 {a.label || tt('profile', 'ທີ່ຢູ່')}{a.lat != null ? ` · ${tt('profile', 'ມີ ໝຸດ')}` : ''}</Text>
            <Text style={styles.aText} numberOfLines={2}>{a.address}</Text>
          </View>
          <Pressable onPress={() => remove(a.id)} hitSlop={8}><Text style={styles.rm}>🗑️</Text></Pressable>
        </View>
      ))}

      {adding ? (
        <View style={styles.form}>
          <TextInput value={label} onChangeText={setLabel} placeholder={tt('profile', 'ຊື່ (ບ້ານ / ຫ້ອງການ) — ບໍ່ບັງຄັບ')} placeholderTextColor="#999" style={styles.input} />
          <TextInput value={text} onChangeText={setText} placeholder={tt('profile', 'ບ້ານ ເມືອງ ແຂວງ')} placeholderTextColor="#999" style={[styles.input, styles.area]} multiline />
          <Pressable style={styles.pinToggle} onPress={() => setShowMap((s) => !s)}>
            <Text style={styles.pinToggleTx}>{pin ? `📌 ${tt('profile', 'ປັກໝຸດ ແລ້ວ')} — ${tt('profile', 'ແກ້ໄຂ')}` : `📍 ${tt('profile', 'ປັກໝຸດ ຈຸດ ສົ່ງ (ບໍ່ບັງຄັບ)')}`}</Text>
          </Pressable>
          {showMap && <LocationPicker value={pin} onChange={setPin} />}
          <View style={styles.btnRow}>
            <Pressable style={[styles.save, (saving || !text.trim()) && styles.saveOff]} onPress={add} disabled={saving || !text.trim()}>
              <Text style={styles.saveTx}>{saving ? '...' : `💾 ${tt('profile', 'ບັນທຶກ')}`}</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={reset}><Text style={styles.cancelTx}>{tt('profile', 'ຍົກເລີກ')}</Text></Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.addBtn} onPress={() => setAdding(true)}>
          <Text style={styles.addBtnTx}>＋ {tt('profile', 'ເພີ່ມ ທີ່ຢູ່')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 14, marginTop: 12 },
  title: { fontSize: 14, fontWeight: '800', color: '#111', marginBottom: 10 },
  muted: { fontSize: 12, color: '#9ca3af' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10, marginBottom: 8 },
  aLabel: { fontSize: 13, fontWeight: '700', color: '#111' },
  aText: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  rm: { fontSize: 15 },
  form: { gap: 8, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 11, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  area: { minHeight: 56, textAlignVertical: 'top' },
  pinToggle: { borderWidth: 1, borderColor: '#a5f3fc', backgroundColor: '#ecfeff', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  pinToggleTx: { color: '#0e7490', fontSize: 13, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 8 },
  save: { flex: 1, backgroundColor: '#0066CC', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveTx: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cancel: { paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  cancelTx: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  addBtn: { borderWidth: 1, borderColor: '#0066CC', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  addBtnTx: { color: '#0066CC', fontSize: 13, fontWeight: '700' },
});
