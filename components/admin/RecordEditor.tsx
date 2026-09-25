import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { deleteRecord, fieldType, type RecordDoc, saveRecord } from '@/lib/records';
import { useTT } from '@/lib/i18n';
import { isMoneyField } from '@/lib/format';

const READONLY = ['id', 'createdAt', 'updatedAt', '_creationTime', 'locationUpdatedAt'];

const IMG_KEY = /image|images|photo|photos|portfolio|gallery|slip|logo|avatar|banner|cover|thumb|pic/i;
const isUrl = (s: any) => typeof s === 'string' && /^https?:\/\//.test(s);

function looksImage(key: string, items: any[]): boolean {
  if (IMG_KEY.test(key)) return items.every(isUrl);
  return items.length > 0 && items.every(isUrl);
}

type ETab = 'main' | 'lists' | 'adv';

/**
 * Generic full-field editor for any Firestore document, shown as a centred
 * modal. Fields are grouped into tabs (basic / lists / advanced-JSON); string
 * lists render as chips and image-URL lists as thumbnails. Writes go through
 * lib/records (audit-logged). `canDelete` gates delete (Super admin only).
 */
export default function RecordEditor({
  colName,
  record,
  canDelete,
  canEdit = true,
  canCreate = true,
  onClose,
}: {
  colName: string;
  record: RecordDoc | null;
  canDelete?: boolean;
  canEdit?: boolean;
  canCreate?: boolean;
  onClose: () => void;
}) {
  const tt = useTT();
  // may this admin persist? editing an existing record needs edit; a new one needs create
  const canSave = record ? canEdit : canCreate;
  const initial = useMemo(() => {
    const f: Record<string, any> = {};
    const arr: Record<string, any[]> = {};
    const j: Record<string, string> = {};
    if (record) {
      for (const [k, v] of Object.entries(record)) {
        if (k === 'id') continue;
        const t = fieldType(v);
        if (t === 'array' && (v as any[]).every((x) => typeof x === 'string')) arr[k] = v as any[];
        else if (t === 'array' || t === 'object') j[k] = JSON.stringify(v, null, 2);
        else f[k] = v;
      }
    }
    return { f, arr, j };
  }, [record]);

  const [form, setForm] = useState<Record<string, any>>(initial.f);
  const [arrays, setArrays] = useState<Record<string, any[]>>(initial.arr);
  const [json, setJson] = useState<Record<string, string>>(initial.j);
  const [adders, setAdders] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<ETab>('main');

  const setF = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));
  const setJ = (k: string, v: string) => setJson((p) => ({ ...p, [k]: v }));
  const addToArr = (k: string) => {
    const v = (adders[k] ?? '').trim();
    if (!v) return;
    setArrays((p) => ({ ...p, [k]: [...(p[k] ?? []), v] }));
    setAdders((p) => ({ ...p, [k]: '' }));
  };
  const removeFromArr = (k: string, i: number) =>
    setArrays((p) => ({ ...p, [k]: (p[k] ?? []).filter((_, idx) => idx !== i) }));

  const addField = () => {
    if (!newKey) return;
    setF(newKey, newVal);
    setNewKey('');
    setNewVal('');
    setTab('main');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(form)) {
        if (READONLY.includes(k)) continue;
        out[k] = v;
      }
      for (const [k, v] of Object.entries(arrays)) {
        if (READONLY.includes(k)) continue;
        out[k] = v;
      }
      for (const [k, txt] of Object.entries(json)) {
        if (READONLY.includes(k)) continue;
        out[k] = JSON.parse(txt);
      }
      await saveRecord(colName, record?.id ?? null, out);
      onClose();
    } catch (e: any) {
      setError(tt('admRecordEditor','JSON ຜິດ ຫຼື error: ') + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!record) return;
    if (typeof confirm === 'function' && !confirm(tt('admRecordEditor','ລົບ record ນີ້?'))) return;
    await deleteRecord(colName, record.id);
    onClose();
  };

  const scalarKeys = Object.keys(form).sort();
  const arrKeys = Object.keys(arrays);
  const jsonKeys = Object.keys(json);

  const TABS: { key: ETab; label: string }[] = [
    { key: 'main', label: `📝 ${tt('admRecordEditor','ຂໍ້ມູນ')} (${scalarKeys.length})` },
    { key: 'lists', label: `📋 ${tt('admRecordEditor','ລາຍການ')} (${arrKeys.length})` },
    { key: 'adv', label: `⚙️ ${tt('admRecordEditor','ຂັ້ນສູງ')} (${jsonKeys.length})` },
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.mTitle} numberOfLines={1}>
              {record ? tt('admRecordEditor','✎ ແກ້ໄຂ') : tt('admRecordEditor','+ ສ້າງໃໝ່')} · {colName}
            </Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.tabBar}>
            {TABS.map((t) => (
              <Pressable key={t.key} style={[styles.tab, tab === t.key && styles.tabOn]} onPress={() => setTab(t.key)}>
                <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]} numberOfLines={1}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }}>
            {tab === 'main' && scalarKeys.map((k) => {
              const v = form[k];
              const ro = READONLY.includes(k);
              const t = fieldType(v);
              return (
                <View key={k} style={styles.field}>
                  <Text style={styles.fLabel}>{k} <Text style={styles.fType}>{ro ? 'read-only' : t}</Text></Text>
                  {ro ? (
                    <Text style={styles.roVal}>{String(v)}</Text>
                  ) : t === 'boolean' ? (
                    <Pressable style={[styles.toggle, v ? styles.tgOn : styles.tgOff]} onPress={() => setF(k, !v)}>
                      <View style={styles.knob} />
                    </Pressable>
                  ) : t === 'number' && isMoneyField(k) ? (
                    // money / large-quantity — live thousands-grouping (integer)
                    <TextInput
                      value={v === '' || v == null ? '' : Number(v).toLocaleString('en-US')}
                      onChangeText={(x) => { const n = x.replace(/[^0-9]/g, ''); setF(k, n === '' ? '' : Number(n)); }}
                      keyboardType="numeric"
                      style={styles.input}
                    />
                  ) : (
                    <TextInput
                      value={String(v ?? '')}
                      onChangeText={(x) => setF(k, t === 'number' ? (x === '' ? '' : Number(x)) : x)}
                      keyboardType={t === 'number' ? 'numeric' : 'default'}
                      style={styles.input}
                    />
                  )}
                </View>
              );
            })}
            {tab === 'main' && scalarKeys.length === 0 && <Text style={styles.hint}>{tt('admRecordEditor','ບໍ່ມີ field ພື້ນຖານ')}</Text>}

            {tab === 'lists' && arrKeys.map((k) => {
              const items = arrays[k] ?? [];
              const img = looksImage(k, items);
              return (
                <View key={k} style={styles.field}>
                  <Text style={styles.fLabel}>{k} <Text style={styles.fType}>{img ? tt('admRecordEditor','ຮູບ') : tt('admRecordEditor','ລາຍການ')} · {items.length}</Text></Text>
                  {img ? (
                    <View style={styles.thumbWrap}>
                      {items.map((u, i) => (
                        <View key={i} style={styles.thumbBox}>
                          <Image source={{ uri: u }} style={styles.thumb} />
                          <Pressable style={styles.thumbX} onPress={() => removeFromArr(k, i)}><Text style={styles.thumbXText}>✕</Text></Pressable>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.chipWrap}>
                      {items.map((it, i) => (
                        <Pressable key={i} style={styles.chip} onPress={() => removeFromArr(k, i)}>
                          <Text style={styles.chipText}>{String(it)} ✕</Text>
                        </Pressable>
                      ))}
                      {items.length === 0 && <Text style={styles.hint}>{tt('admRecordEditor','ວ່າງ')}</Text>}
                    </View>
                  )}
                  <View style={styles.addArrRow}>
                    <TextInput
                      value={adders[k] ?? ''}
                      onChangeText={(x) => setAdders((p) => ({ ...p, [k]: x }))}
                      placeholder={img ? tt('admRecordEditor','ວາງ URL ຮູບ ໃໝ່') : tt('admRecordEditor','ເພີ່ມ ລາຍການ')}
                      placeholderTextColor="#999"
                      style={[styles.input, { flex: 1 }]}
                    />
                    <Pressable style={styles.addBtn} onPress={() => addToArr(k)}><Text style={styles.addBtnText}>+</Text></Pressable>
                  </View>
                </View>
              );
            })}
            {tab === 'lists' && arrKeys.length === 0 && <Text style={styles.hint}>{tt('admRecordEditor','ບໍ່ມີ ລາຍການ')}</Text>}

            {tab === 'adv' && (
              <>
                {jsonKeys.map((k) => (
                  <View key={k} style={styles.field}>
                    <Text style={styles.fLabel}>{k} <Text style={styles.fType}>{fieldType(record?.[k])} (JSON)</Text></Text>
                    <TextInput value={json[k]} onChangeText={(x) => setJ(k, x)} style={[styles.input, styles.jsonInput]} multiline />
                  </View>
                ))}
                <View style={styles.addFieldBox}>
                  <Text style={styles.fLabel}>{tt('admRecordEditor','ເພີ່ມ field ໃໝ່')}</Text>
                  <View style={styles.addArrRow}>
                    <TextInput value={newKey} onChangeText={setNewKey} placeholder={tt('admRecordEditor','ຊື່ field')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
                    <TextInput value={newVal} onChangeText={setNewVal} placeholder={tt('admRecordEditor','ຄ່າ')} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
                    <Pressable style={styles.addBtn} onPress={addField}><Text style={styles.addBtnText}>+</Text></Pressable>
                  </View>
                </View>
              </>
            )}

            {error !== '' && <Text style={styles.error}>❌ {error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            {canSave ? (
              <Pressable style={[styles.btn, styles.saveBtn]} onPress={save} disabled={saving}>
                <Text style={styles.btnText}>{saving ? '...' : tt('admRecordEditor','💾 ບັນທຶກ')}</Text>
              </Pressable>
            ) : (
              <View style={[styles.btn, styles.roBadge]}><Text style={styles.roBadgeText}>{tt('admRecordEditor','👁 ເບິ່ງ ຢ່າງ ດຽວ')}</Text></View>
            )}
            {record && canDelete && (
              <Pressable style={[styles.btn, styles.delBtn]} onPress={del}>
                <Text style={styles.delText}>{tt('admRecordEditor','🗑️ ລົບ')}</Text>
              </Pressable>
            )}
            <Pressable style={[styles.btn, styles.cancel]} onPress={onClose}>
              <Text style={styles.cancelText}>{tt('admRecordEditor','ປິດ')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '88%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef0f3' },
  mTitle: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  closeTxt: { fontSize: 14, color: '#374151', fontWeight: '700' },
  tabBar: { flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' },
  tabOn: { backgroundColor: '#0066CC' },
  tabText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  tabTextOn: { color: '#fff' },
  body: { paddingHorizontal: 16, paddingTop: 6 },
  field: { marginBottom: 12 },
  fLabel: { fontSize: 12, color: '#4b5563', marginBottom: 4, fontWeight: '600' },
  fType: { color: '#9ca3af', fontSize: 12, fontWeight: '400' },
  roVal: { fontSize: 12, color: '#9ca3af', padding: 8, backgroundColor: '#f3f4f6', borderRadius: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  jsonInput: { minHeight: 70, fontFamily: 'monospace', fontSize: 12, textAlignVertical: 'top' },
  toggle: { width: 44, height: 24, borderRadius: 12, padding: 2, flexDirection: 'row' },
  tgOn: { backgroundColor: '#16a34a', justifyContent: 'flex-end' },
  tgOff: { backgroundColor: '#cbd5e1', justifyContent: 'flex-start' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  thumbWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbBox: { position: 'relative' },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#f3f4f6' },
  thumbX: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  thumbXText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#bcd6f5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, color: '#0066CC', fontWeight: '600' },
  addArrRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  addBtn: { backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 15 },
  addFieldBox: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12, marginTop: 4 },
  hint: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 8 },
  error: { color: '#c00', fontSize: 12, marginVertical: 8 },
  actions: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#eef0f3' },
  btn: { flex: 1, padding: 11, borderRadius: 8, alignItems: 'center' },
  saveBtn: { backgroundColor: '#0066CC' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  delBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dc2626' },
  delText: { color: '#dc2626', fontWeight: '600', fontSize: 13 },
  roBadge: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  roBadgeText: { color: '#6b7280', fontWeight: '600', fontSize: 13 },
  cancel: { backgroundColor: '#f3f4f6' },
  cancelText: { color: '#374151', fontWeight: '600', fontSize: 13 },
});
