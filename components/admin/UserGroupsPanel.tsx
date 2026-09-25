import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSectionPerms } from '@/lib/permissions-context';
import { type UserGroup, reconcileUserGroups, seedUserGroupsIfEmpty, watchUserGroups } from '@/lib/userGroups';
import { type RecordDoc, saveRecord } from '@/lib/records';
import { useTT } from '@/lib/i18n';
import RecordEditor from './RecordEditor';

export default function UserGroupsPanel() {
  const { canCreate, canEdit, canDelete } = useSectionPerms('users');
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [edit, setEdit] = useState<RecordDoc | 'new' | null>(null);
  const [adder, setAdder] = useState<Record<string, string>>({});
  const [subEdit, setSubEdit] = useState<{ gid: string; key: string } | null>(null);
  const [subEditVal, setSubEditVal] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const tt = useTT();

  const reconcile = async () => {
    if (typeof confirm === 'function' && !confirm(tt('admGroups', 'ຈັດ ປະເພດຜູ້ໃຊ້ ໃຫ້ ເປັນ 4 ກຸ່ມ (System Admin · Corporation · Individual Services · General Users)? ຈະ ລວມ ບໍລິສັດ+ຮ້ານຄ້າ ເປັນ Corporation ແລະ ລຶບ 2 ກຸ່ມ ເກົ່າ.'))) return;
    setSyncing(true); setSyncMsg('');
    try {
      const r = await reconcileUserGroups();
      setSyncMsg(`✓ ${tt('admGroups','ເພີ່ມ')} ${r.added} · ${tt('admGroups','ອັບເດດ')} ${r.updated} · ${tt('admGroups','ລຶບ')} ${r.removed}`);
    } catch (e: any) { setSyncMsg('❌ ' + (e?.message ?? String(e))); }
    finally { setSyncing(false); }
  };

  const addSub = (g: UserGroup) => {
    const name = (adder[g.id] ?? '').trim();
    if (!name) return;
    const next = [...(g.subTypes ?? []), { key: `st_${Date.now().toString(36)}`, nameLao: name }];
    saveRecord('userGroups', g.id, { subTypes: next });
    setAdder((p) => ({ ...p, [g.id]: '' }));
  };
  const removeSub = (g: UserGroup, key: string) => {
    saveRecord('userGroups', g.id, { subTypes: (g.subTypes ?? []).filter((s) => s.key !== key) });
  };
  const startSubEdit = (gid: string, key: string, cur: string) => { setSubEdit({ gid, key }); setSubEditVal(cur); };
  const saveSubEdit = (g: UserGroup) => {
    if (!subEdit) return;
    const v = subEditVal.trim();
    if (v) saveRecord('userGroups', g.id, { subTypes: (g.subTypes ?? []).map((s) => (s.key === subEdit.key ? { ...s, nameLao: v } : s)) });
    setSubEdit(null);
  };

  useEffect(() => {
    seedUserGroupsIfEmpty().catch((e) => console.error('seed userGroups:', e));
    return watchUserGroups(setGroups);
  }, []);

  return (
    <View>
      <Text style={styles.title}>{tt('admGroups', '👪 ປະເພດ / ກຸ່ມ ຜູ້ໃຊ້ · User groups')}</Text>
      <Text style={styles.sub}>{tt('admGroups', 'ປະເພດບັນຊີ (1 ຄົນ = 1 ກຸ່ມ) + ປະເພດຍ່ອຍ — ເກັບໃນ DB, ບໍ່ hardcode')}</Text>

      {canEdit && (
        <View style={styles.syncRow}>
          <Pressable style={[styles.syncBtn, syncing && { opacity: 0.6 }]} onPress={reconcile} disabled={syncing}>
            <Text style={styles.syncText}>{syncing ? '...' : tt('admGroups', '🔄 ຈັດ ໃຫ້ ເປັນ 4 ກຸ່ມ (ລວມ ບໍລິສັດ+ຮ້ານ)')}</Text>
          </Pressable>
          {syncMsg !== '' && <Text style={styles.syncMsg}>{syncMsg}</Text>}
        </View>
      )}

      <View style={styles.top}>
        <Text style={styles.count}>{groups.length} {tt('admGroups', 'ກຸ່ມ')}</Text>
        {canCreate && <Pressable style={styles.newBtn} onPress={() => setEdit('new')}><Text style={styles.newBtnText}>{tt('admGroups', '+ ສ້າງກຸ່ມ')}</Text></Pressable>}
      </View>

      {groups.map((g) => (
        <View key={g.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.icon}>{g.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{g.nameLao} <Text style={styles.en}>· {g.nameEn}</Text></Text>
              <Text style={styles.desc}>{g.desc}</Text>
            </View>
            {!g.active && <Text style={styles.off}>{tt('admGroups', 'ປິດ')}</Text>}
            <Pressable style={styles.editBtn} onPress={() => setEdit({ ...(g as any) })}><Text style={styles.editTxt}>{canEdit ? tt('admGroups', '✎ ແກ້') : tt('admGroups', '👁 ເບິ່ງ')}</Text></Pressable>
          </View>
          <View style={styles.subWrap}>
            {(g.subTypes ?? []).map((s) => {
              const editing = subEdit?.gid === g.id && subEdit?.key === s.key;
              if (editing) {
                return (
                  <View key={s.key} style={styles.subEditRow}>
                    <TextInput value={subEditVal} onChangeText={setSubEditVal} autoFocus onSubmitEditing={() => saveSubEdit(g)} style={styles.subEditInput} />
                    <Pressable style={styles.subSave} onPress={() => saveSubEdit(g)}><Text style={styles.subSaveText}>✓</Text></Pressable>
                    <Pressable style={styles.subCancel} onPress={() => setSubEdit(null)}><Text style={styles.subCancelText}>✕</Text></Pressable>
                  </View>
                );
              }
              return (
                <View key={s.key} style={styles.subChip}>
                  <Pressable onPress={() => canEdit && startSubEdit(g.id, s.key, s.nameLao)}><Text style={styles.subChipText}>{s.nameLao}</Text></Pressable>
                  {canEdit && <Pressable onPress={() => startSubEdit(g.id, s.key, s.nameLao)} hitSlop={4}><Text style={styles.subChipEdit}>✎</Text></Pressable>}
                  {canEdit && <Pressable onPress={() => removeSub(g, s.key)} hitSlop={4}><Text style={styles.subChipX}>✕</Text></Pressable>}
                </View>
              );
            })}
            {(g.subTypes ?? []).length === 0 && <Text style={styles.hint}>{tt('admGroups', 'ບໍ່ມີ ປະເພດຍ່ອຍ')}</Text>}
          </View>
          {canEdit && <View style={styles.addRow}>
            <TextInput
              value={adder[g.id] ?? ''}
              onChangeText={(v) => setAdder((p) => ({ ...p, [g.id]: v }))}
              placeholder={tt('admGroups', '+ ເພີ່ມ ປະເພດຍ່ອຍ ໃໝ່')}
              placeholderTextColor="#999"
              style={styles.addInput}
              onSubmitEditing={() => addSub(g)}
            />
            <Pressable style={styles.addBtn} onPress={() => addSub(g)}><Text style={styles.addBtnText}>{tt('admGroups', '+ ເພີ່ມ')}</Text></Pressable>
          </View>}
        </View>
      ))}

      {edit && (
        <RecordEditor
          colName="userGroups"
          record={edit === 'new' ? null : edit}
          canDelete={canDelete}
          canEdit={canEdit}
          canCreate={canCreate}
          onClose={() => setEdit(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 },
  syncBtn: { borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  syncText: { color: '#0066CC', fontSize: 12, fontWeight: '700' },
  syncMsg: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  count: { fontSize: 12, color: '#6b7280' },
  newBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  newBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { fontSize: 24 },
  name: { fontSize: 14, fontWeight: '700', color: '#111' },
  en: { fontSize: 12, color: '#9ca3af', fontWeight: '400' },
  desc: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  off: { fontSize: 12, color: '#991b1b', backgroundColor: '#fee', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  editBtn: { backgroundColor: '#0066CC', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  editTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  subWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10 },
  subChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#bcd6f5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  subChipText: { fontSize: 12, color: '#0066CC', fontWeight: '600' },
  subChipEdit: { fontSize: 12, color: '#0066CC', fontWeight: '700' },
  subChipX: { fontSize: 12, color: '#dc2626', fontWeight: '700' },
  subEditRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  subEditInput: { borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, color: '#111', minWidth: 110, backgroundColor: '#fff' },
  subSave: { backgroundColor: '#16a34a', borderRadius: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  subSaveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  subCancel: { backgroundColor: '#e5e7eb', borderRadius: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  subCancelText: { color: '#6b7280', fontWeight: '700', fontSize: 12 },
  hint: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  addRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  addInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: '#111', backgroundColor: '#fff' },
  addBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
});
