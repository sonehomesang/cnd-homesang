import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { clearErrorLogs, type ErrorLog, watchErrorLogs } from '@/lib/errorLog';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';
import { usePaged } from './Paginator';

function fmt(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ErrorLogsPanel() {
  const { canDelete: canClear } = useSectionPerms('errors');
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const tt = useTT();

  useEffect(() => watchErrorLogs(setLogs), []);

  const pg = usePaged(logs, 15);

  const clear = async () => {
    if (!confirm(tt('admErrors','ລຶບ error logs ທັງໝົດ?'))) return;
    setBusy(true);
    try { await clearErrorLogs(); } catch (e: any) { alert('Error: ' + (e?.message ?? String(e))); }
    finally { setBusy(false); }
  };

  return (
    <View>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🐞 Error logs</Text>
          <Text style={styles.sub}>{tt('admErrors','ຄວາມຜິດພາດ ທີ່ ເກັບ ຈາກ ແອັບ (ລ່າສຸດ 200)')}</Text>
        </View>
        {canClear && logs.length > 0 && (
          <Pressable style={[styles.clearBtn, busy && styles.off]} onPress={clear} disabled={busy}>
            <Text style={styles.clearText}>{tt('admErrors','🗑️ ລ້າງ')}</Text>
          </Pressable>
        )}
      </View>

      {logs.length === 0 ? (
        <Text style={styles.empty}>{tt('admErrors','ບໍ່ມີ ຄວາມຜິດພາດ 🎉')}</Text>
      ) : (
        pg.items.map((l) => (
          <Pressable key={l.id} style={styles.card} onPress={() => setOpen((p) => ({ ...p, [l.id]: !p[l.id] }))}>
            <Text style={styles.msg} numberOfLines={open[l.id] ? undefined : 2}>{l.message}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{l.source ? `📍 ${l.source} · ` : ''}{fmt(l.at)}</Text>
              {!!l.uid && <Text style={styles.meta}>👤 {l.uid.slice(0, 6)}</Text>}
            </View>
            {open[l.id] && !!l.url && <Text style={styles.url}>{l.url}</Text>}
            {open[l.id] && !!l.stack && <Text style={styles.stack}>{l.stack}</Text>}
          </Pressable>
        ))
      )}

      {pg.bar}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  clearBtn: { borderWidth: 1, borderColor: '#dc2626', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  clearText: { color: '#dc2626', fontSize: 12, fontWeight: '700' },
  off: { opacity: 0.5 },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  card: { borderWidth: 1, borderColor: '#fee2e2', backgroundColor: '#fffbfb', borderRadius: 10, padding: 12, marginBottom: 8 },
  msg: { fontSize: 13, color: '#991b1b', fontWeight: '600' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  meta: { fontSize: 12, color: '#9ca3af' },
  url: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  stack: { fontSize: 12, color: '#6b7280', marginTop: 6, fontFamily: 'monospace' as any },
});
