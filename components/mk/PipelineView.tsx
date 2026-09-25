import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import { isMock } from '@/lib/mock';
import MockBadge from '@/components/MockBadge';
import {
  type MkContent, type MkStatus, MK_PLATFORM_LABEL, MK_STATUS_LABEL, MK_STATUS_ORDER, setMkStatus, watchMkContent,
} from '@/lib/mkContent';

const COL_ICON: Record<MkStatus, string> = { idea: '💡', script: '✍️', ai: '🤖', review: '👁', scheduled: '📆', published: '✅' };
const COL_TINT: Record<MkStatus, string> = { idea: '#718399', script: '#0a5fc0', ai: '#e56f16', review: '#7a4bd0', scheduled: '#0a5fc0', published: '#1f9d57' };

/**
 * MK Plan · Production pipeline — a kanban over mkContent.status. Each card moves
 * idea → script → AI ສ້າງ → ກວດ → ຄິວ → ເຜີຍແຜ່ with the ‹ › buttons (RN-web has no
 * native drag, so stepper buttons drive the flow). Shares the same data as the
 * calendar, so a status change here is reflected there instantly.
 */
export default function PipelineView() {
  const tt = useTT();
  const [items, setItems] = useState<MkContent[]>([]);
  const [moving, setMoving] = useState<string | null>(null);
  useEffect(() => watchMkContent(setItems), []);

  const byStatus = useMemo(() => {
    const m: Record<MkStatus, MkContent[]> = { idea: [], script: [], ai: [], review: [], scheduled: [], published: [] };
    for (const it of items) (m[it.status] ?? m.idea).push(it);
    return m;
  }, [items]);

  const move = async (it: MkContent, dir: 1 | -1) => {
    const i = MK_STATUS_ORDER.indexOf(it.status);
    const j = i + dir;
    if (j < 0 || j >= MK_STATUS_ORDER.length) return;
    setMoving(it.id);
    try { await setMkStatus(it.id, MK_STATUS_ORDER[j]); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setMoving(null); }
  };

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={{ fontSize: 34 }}>🏭</Text>
        <Text style={styles.emptyT}>{tt('mk', 'ຍັງ ບໍ່ ມີ ໂພສ — ໄປ ໜ້າ ປະຕິທິນ ເພື່ອ ເພີ່ມ ຫຼື ໃສ່ ຕົວຢ່າງ')}</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.hint}>{tt('mk', 'ໃຊ້ ‹ › ຍ້າຍ ບັດ ຂ້າມ ຖັນ — ຂໍ້ມູນ ຊິງ ກັບ ປະຕິທິນ')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
        {MK_STATUS_ORDER.map((st) => (
          <View key={st} style={styles.col}>
            <View style={styles.colHead}>
              <Text style={[styles.colTitle, { color: COL_TINT[st] }]}>{COL_ICON[st]} {tt('mk', MK_STATUS_LABEL[st])}</Text>
              <Text style={styles.colN}>{byStatus[st].length}</Text>
            </View>
            {byStatus[st].map((it) => {
              const i = MK_STATUS_ORDER.indexOf(it.status);
              return (
                <View key={it.id} style={styles.kcard}>
                  <Text style={styles.kTitle} numberOfLines={2}>{it.title}</Text>
                  <View style={styles.kMeta}>
                    <Text style={[styles.chan, it.platform === 'tiktok' ? styles.chanTt : styles.chanFb]}>{MK_PLATFORM_LABEL[it.platform]}</Text>
                    {!!it.pillar && <Text style={styles.pillar}>{it.pillar}</Text>}
                    {isMock(it) && <MockBadge small />}
                  </View>
                  <View style={styles.kMove}>
                    <Pressable disabled={i === 0 || moving === it.id} style={[styles.mvBtn, i === 0 && styles.mvOff]} onPress={() => move(it, -1)}><Text style={styles.mvTx}>‹</Text></Pressable>
                    {it.status === 'published' && typeof it.reach === 'number'
                      ? <Text style={styles.reach}>▲ {it.reach.toLocaleString()}</Text>
                      : <View style={{ flex: 1 }} />}
                    <Pressable disabled={i === MK_STATUS_ORDER.length - 1 || moving === it.id} style={[styles.mvBtn, i === MK_STATUS_ORDER.length - 1 && styles.mvOff]} onPress={() => move(it, 1)}><Text style={styles.mvTx}>›</Text></Pressable>
                  </View>
                </View>
              );
            })}
            {byStatus[st].length === 0 && <Text style={styles.colEmpty}>—</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: 10, paddingVertical: 50 },
  emptyT: { fontSize: 14, fontWeight: '700', color: colors.text2, textAlign: 'center', maxWidth: 320 },
  hint: { fontSize: 12, color: colors.text3 },
  col: { width: 172, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 9 },
  colHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 9 },
  colTitle: { flex: 1, fontSize: 12.5, fontWeight: '800' },
  colN: { fontSize: 12, fontWeight: '800', color: colors.text3 },
  kcard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, marginBottom: 8 },
  kTitle: { fontSize: 12.5, fontWeight: '700', color: colors.text, lineHeight: 17 },
  kMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' },
  chan: { fontSize: 12, fontWeight: '800', borderRadius: 5, paddingVertical: 1, paddingHorizontal: 6 },
  chanFb: { backgroundColor: '#e7f0fb', color: '#0a5fc0' },
  chanTt: { backgroundColor: colors.surface2, color: colors.text, borderWidth: 1, borderColor: colors.border },
  pillar: { fontSize: 12, fontWeight: '700', color: colors.text2, backgroundColor: colors.surface2, borderRadius: 4, paddingVertical: 1, paddingHorizontal: 5 },
  kMove: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  mvBtn: { width: 30, height: 26, borderRadius: 7, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  mvOff: { opacity: 0.35 },
  mvTx: { fontSize: 15, fontWeight: '900', color: colors.primary, lineHeight: 18 },
  reach: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '800', color: colors.success },
  colEmpty: { textAlign: 'center', color: colors.text3, paddingVertical: 8 },
});
