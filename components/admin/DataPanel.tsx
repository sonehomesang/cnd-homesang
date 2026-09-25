import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLLECTIONS, type RecordDoc, watchCollection } from '@/lib/records';
import { useTT } from '@/lib/i18n';
import RecordEditor from './RecordEditor';
import { usePaged } from './Paginator';

function csvCell(v: any): string {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(colName: string, docs: RecordDoc[]) {
  if (Platform.OS !== 'web' || docs.length === 0) return;
  const keys = Array.from(new Set(docs.flatMap((d) => Object.keys(d))));
  const ordered = ['id', ...keys.filter((k) => k !== 'id')];
  const header = ordered.join(',');
  const rows = docs.map((d) => ordered.map((k) => csvCell((d as any)[k])).join(','));
  const csv = '﻿' + [header, ...rows].join('\n'); // BOM for Excel/Lao
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${colName}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataPanel() {
  const tt = useTT();
  const [colName, setColName] = useState<string>('users');
  const [docs, setDocs] = useState<RecordDoc[]>([]);
  const [editing, setEditing] = useState<RecordDoc | 'new' | null>(null);

  useEffect(() => {
    const unsub = watchCollection(colName, setDocs);
    return unsub;
  }, [colName]);

  const meta = COLLECTIONS.find((c) => c.name === colName)!;
  const pg = usePaged(docs, 12);

  return (
    <View>
      <Text style={styles.title}>{tt('admData','🗄️ ຂໍ້ມູນ (full CRUD)')}</Text>
      <Text style={styles.sub}>{tt('admData','ເລືອກ collection → ແກ້ທຸກ field · ຕື່ມ field ທີ່ຂາດ')}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {COLLECTIONS.map((c) => (
          <Pressable key={c.name} style={[styles.chip, colName === c.name && styles.chipOn]} onPress={() => setColName(c.name)}>
            <Text style={[styles.chipText, colName === c.name && styles.chipTextOn]}>{c.lao}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.listTop}>
        <Text style={styles.count}>{docs.length} {tt('admData','ລາຍການ')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {Platform.OS === 'web' && docs.length > 0 && (
            <Pressable style={styles.csvBtn} onPress={() => exportCsv(colName, docs)}>
              <Text style={styles.csvBtnText}>⬇ CSV</Text>
            </Pressable>
          )}
          <Pressable style={styles.newBtn} onPress={() => setEditing('new')}>
            <Text style={styles.newBtnText}>{tt('admData','+ ສ້າງໃໝ່')}</Text>
          </Pressable>
        </View>
      </View>

      {pg.items.map((d) => (
        <Pressable key={d.id} style={styles.row} onPress={() => setEditing(d)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rName} numberOfLines={1}>
              {String(d[meta.titleField] ?? tt('admData','(ບໍ່ມີ ') + meta.titleField + ')')}
            </Text>
            <Text style={styles.rId}>{d.id}</Text>
          </View>
          <Text style={styles.editTag}>{tt('admData','✎ ແກ້')}</Text>
        </Pressable>
      ))}

      {pg.bar}

      {editing && (
        <RecordEditor
          colName={colName}
          record={editing === 'new' ? null : editing}
          canDelete
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  chips: { gap: 6, paddingBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  chipText: { fontSize: 12, color: '#4b5563' },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  listTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  count: { fontSize: 12, color: '#6b7280' },
  newBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  newBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  csvBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  csvBtnText: { color: '#0066CC', fontWeight: '600', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 6 },
  rName: { fontSize: 14, fontWeight: '600', color: '#111' },
  rId: { fontSize: 12, color: '#9ca3af', fontFamily: 'monospace' },
  editTag: { fontSize: 12, color: '#0066CC', fontWeight: '600' },
});
