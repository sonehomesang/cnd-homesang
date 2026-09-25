import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { type AuditEntry, watchAuditLogs } from '@/lib/auditLog';
import { useTT } from '@/lib/i18n';
import { usePaged } from './Paginator';

const ACTION_COLOR: Record<string, { bg: string; fg: string; lao: string }> = {
  create: { bg: '#dcfce7', fg: '#166534', lao: 'ສ້າງ' },
  update: { bg: '#dbeafe', fg: '#1e40af', lao: 'ແກ້ໄຂ' },
  delete: { bg: '#fee2e2', fg: '#991b1b', lao: 'ລົບ' },
};

function fmtTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const tt = useTT();

  useEffect(() => watchAuditLogs(setLogs), []);

  const filtered = q
    ? logs.filter((l) => {
        const hay = `${l.actorName} ${l.collection} ${l.docId} ${(l.changedKeys ?? []).join(' ')}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
    : logs;
  const pg = usePaged(filtered, 15);

  return (
    <View>
      <Text style={styles.title}>{tt('admAudit','📜 ບັນທຶກ ການແກ້ໄຂ (Audit log)')}</Text>
      <Text style={styles.sub}>{tt('admAudit','ທຸກການ ສ້າງ / ແກ້ໄຂ / ລົບ ໂດຍ admin · ໃໝ່ສຸດ ກ່ອນ')}</Text>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={tt('admAudit','🔍 ຄົ້ນ ຊື່ / collection / field')}
        placeholderTextColor="#999"
        style={styles.search}
      />

      <Text style={styles.count}>{filtered.length} {tt('admAudit','ລາຍການ')}</Text>

      {pg.items.map((l) => {
        const a = ACTION_COLOR[l.action] ?? ACTION_COLOR.update;
        const isOpen = open === l.id;
        return (
          <Pressable key={l.id} style={styles.row} onPress={() => setOpen(isOpen ? null : l.id)}>
            <View style={styles.rowTop}>
              <View style={[styles.badge, { backgroundColor: a.bg }]}>
                <Text style={[styles.badgeText, { color: a.fg }]}>{tt('admAudit', a.lao)}</Text>
              </View>
              <Text style={styles.col}>{l.collection}</Text>
              <Text style={styles.time}>{fmtTime(l.ts)}</Text>
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              👤 {l.actorName} · {l.docId}
            </Text>
            {(l.changedKeys ?? []).length > 0 && (
              <Text style={styles.keys} numberOfLines={isOpen ? undefined : 1}>
                ✎ {(l.changedKeys ?? []).join(', ')}
              </Text>
            )}
            {isOpen && (
              <View style={styles.detail}>
                {(l.changedKeys ?? []).map((k) => (
                  <View key={k} style={styles.diff}>
                    <Text style={styles.diffKey}>{k}</Text>
                    {l.action !== 'create' && (
                      <Text style={styles.before} numberOfLines={4}>− {JSON.stringify(l.before?.[k])}</Text>
                    )}
                    {l.action !== 'delete' && (
                      <Text style={styles.after} numberOfLines={4}>+ {JSON.stringify(l.after?.[k])}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </Pressable>
        );
      })}

      {filtered.length === 0 && <Text style={styles.empty}>{tt('admAudit','ຍັງບໍ່ມີ ບັນທຶກ')}</Text>}
      {pg.bar}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  search: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 14, color: '#111', backgroundColor: '#fff', marginBottom: 8 },
  count: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  row: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 6, backgroundColor: '#fff' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  col: { fontSize: 14, fontWeight: '600', color: '#111', flex: 1 },
  time: { fontSize: 12, color: '#9ca3af' },
  meta: { fontSize: 12, color: '#4b5563', marginTop: 6 },
  keys: { fontSize: 12, color: '#0066CC', marginTop: 4 },
  detail: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, gap: 8 },
  diff: { gap: 2 },
  diffKey: { fontSize: 12, fontWeight: '700', color: '#374151' },
  before: { fontSize: 12, color: '#991b1b', fontFamily: 'monospace' },
  after: { fontSize: 12, color: '#166534', fontFamily: 'monospace' },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', padding: 24 },
});
