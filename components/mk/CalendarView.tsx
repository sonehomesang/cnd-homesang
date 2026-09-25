import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import { isMock, useMockEnabled } from '@/lib/mock';
import MockBadge from '@/components/MockBadge';
import {
  type MkContent, type MkContentInput, type MkFormat, type MkPlatform, type MkStatus,
  MK_FORMAT_LABEL, MK_PILLARS, MK_PLATFORM_LABEL, MK_STATUS_LABEL, MK_STATUS_ORDER,
  createMkContent, deleteMkContent, seedMkContentCalendar, seedMkContentSample, setMkStatus, updateMkContent, watchMkContent,
} from '@/lib/mkContent';

const STATUS_STYLE: Record<MkStatus, { bg: string; fg: string }> = {
  idea: { bg: '#eef2f7', fg: '#718399' },
  script: { bg: '#e7f0fb', fg: '#0a5fc0' },
  ai: { bg: '#fdeede', fg: '#e56f16' },
  review: { bg: '#efe8fb', fg: '#7a4bd0' },
  scheduled: { bg: '#e7f0fb', fg: '#0a5fc0' },
  published: { bg: '#e2f6ea', fg: '#1f9d57' },
};
const isoDate = (ms: number) => { const d = new Date(ms || Date.now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const parseDate = (s: string) => { const t = Date.parse(s); return Number.isFinite(t) ? t : Date.now(); };
const blank = (): MkContentInput => ({ title: '', platform: 'fb', format: 'reel', pillar: MK_PILLARS[0], date: Date.now(), status: 'idea', caption: '', assignee: '' });

export default function CalendarView() {
  const tt = useTT();
  const [items, setItems] = useState<MkContent[]>([]);
  const [filter, setFilter] = useState<MkStatus | 'all'>('all');
  const [editing, setEditing] = useState<MkContent | null>(null);
  const [draft, setDraft] = useState<MkContentInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const mockEnabled = useMockEnabled();

  useEffect(() => watchMkContent(setItems), []);
  const shown = useMemo(() => (filter === 'all' ? items : items.filter((i) => i.status === filter)), [items, filter]);

  const openNew = () => { setEditing(null); setDraft(blank()); };
  const openEdit = (it: MkContent) => { setEditing(it); setDraft({ ...it }); };
  const close = () => { setDraft(null); setEditing(null); };
  const save = async () => {
    if (!draft || !draft.title.trim()) return;
    setBusy(true);
    try {
      if (editing) await updateMkContent(editing.id, draft); else await createMkContent(draft);
      close();
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    try { await deleteMkContent(editing.id); close(); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const advance = async (it: MkContent) => {
    const i = MK_STATUS_ORDER.indexOf(it.status);
    const next = MK_STATUS_ORDER[Math.min(i + 1, MK_STATUS_ORDER.length - 1)];
    if (next !== it.status) await setMkStatus(it.id, next).catch(() => {});
  };
  const seed = async () => { setSeeding(true); try { await seedMkContentSample(items.length); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setSeeding(false); } };
  const seedCal = async () => { setSeeding(true); try { const n = await seedMkContentCalendar(items.map((i) => i.title)); alert(n > 0 ? `${tt('mk', 'ໃສ່ ຕາຕະລາງ 30 ວັນ ແລ້ວ')} (+${n})` : tt('mk', 'ມີ ຄົບ ແລ້ວ')); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setSeeding(false); } };

  const D = (d: number) => { const x = new Date(d); return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`; };

  return (
    <View style={{ gap: 12 }}>
      <Pressable style={[styles.calSeed, seeding && { opacity: 0.5 }]} disabled={seeding} onPress={seedCal}>
        <Text style={styles.calSeedTx}>📅 {tt('mk', 'ໃສ່ ຕາຕະລາງ ໂພສ 30 ວັນ (ຈິງ)')}</Text>
      </Pressable>
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flex: 1 }}>
          {(['all', ...MK_STATUS_ORDER] as const).map((f) => (
            <Pressable key={f} style={[styles.fchip, filter === f && styles.fchipOn]} onPress={() => setFilter(f)}>
              <Text style={[styles.fchipTx, filter === f && styles.fchipTxOn]}>{f === 'all' ? tt('mk', 'ໝົດ') : tt('mk', MK_STATUS_LABEL[f])}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable style={styles.addBtn} onPress={openNew}><Text style={styles.addTx}>+ {tt('mk', 'ເພີ່ມ')}</Text></Pressable>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 34 }}>📅</Text>
          <Text style={styles.emptyT}>{tt('mk', 'ຍັງ ບໍ່ ມີ ໂພສ ໃນ ປະຕິທິນ')}</Text>
          {mockEnabled && (
          <Pressable style={[styles.seedBtn, seeding && { opacity: 0.5 }]} disabled={seeding} onPress={seed}>
            <Text style={styles.seedTx}>{seeding ? tt('mk', 'ກຳລັງ...') : `🌱 ${tt('mk', 'ໃສ່ ຕົວຢ່າງ ແຜນ 30 ວັນ')}`}</Text>
          </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          {shown.map((it) => {
            const st = STATUS_STYLE[it.status];
            return (
              <Pressable key={it.id} style={styles.row} onPress={() => openEdit(it)}>
                <View style={styles.dateBox}><Text style={styles.dateTx}>{D(it.date)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{it.title}</Text>
                  <View style={styles.rowMeta}>
                    <Text style={[styles.chan, it.platform === 'tiktok' ? styles.chanTt : styles.chanFb]}>{MK_PLATFORM_LABEL[it.platform]}</Text>
                    <Text style={styles.fmt}>{MK_FORMAT_LABEL[it.format]}</Text>
                    {!!it.pillar && <Text style={styles.pillar}>{it.pillar}</Text>}
                    {isMock(it) && <MockBadge small />}
                  </View>
                </View>
                <Pressable onPress={() => advance(it)} style={[styles.stPill, { backgroundColor: st.bg }]}>
                  <Text style={[styles.stTx, { color: st.fg }]}>{tt('mk', MK_STATUS_LABEL[it.status])} ›</Text>
                </Pressable>
              </Pressable>
            );
          })}
          {shown.length === 0 && <Text style={styles.noneTx}>{tt('mk', 'ບໍ່ ມີ ໃນ ສະຖານະ ນີ້')}</Text>}
        </View>
      )}

      {/* editor */}
      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{editing ? tt('mk', 'ແກ້ ໂພສ') : tt('mk', 'ໂພສ ໃໝ່')}</Text>
              <Pressable onPress={close} hitSlop={8}><Text style={styles.x}>✕</Text></Pressable>
            </View>
            {draft && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Field label={tt('mk', 'ຫົວຂໍ້')}><TextInput style={styles.input} value={draft.title} onChangeText={(t) => setDraft({ ...draft, title: t })} placeholder={tt('mk', 'ເຊັ່ນ ກ່ອນ-ຫຼັງ ລ້າງ ແອ')} placeholderTextColor="#9ca3af" /></Field>
                <Field label={tt('mk', 'ຊ່ອງ ທາງ')}><Seg options={[['fb', 'FB'], ['tiktok', 'TikTok'], ['both', 'ທັງ ສອງ']]} value={draft.platform} onChange={(v) => setDraft({ ...draft, platform: v as MkPlatform })} /></Field>
                <Field label={tt('mk', 'ຮູບແບບ')}><Seg options={[['reel', 'Reel'], ['photo', 'ຮູບ'], ['text', 'ຂໍ້ຄວາມ'], ['story', 'Story']]} value={draft.format} onChange={(v) => setDraft({ ...draft, format: v as MkFormat })} /></Field>
                <Field label={tt('mk', 'ໝວດ ເນື້ອຫາ')}>
                  <View style={styles.chips}>
                    {MK_PILLARS.map((p) => <Pressable key={p} style={[styles.pchip, draft.pillar === p && styles.pchipOn]} onPress={() => setDraft({ ...draft, pillar: p })}><Text style={[styles.pchipTx, draft.pillar === p && styles.pchipTxOn]}>{p}</Text></Pressable>)}
                  </View>
                </Field>
                <Field label={tt('mk', 'ວັນທີ (ປປປປ-ດດ-ວວ)')}><TextInput style={styles.input} value={isoDate(draft.date)} onChangeText={(t) => setDraft({ ...draft, date: parseDate(t) })} placeholder="2026-08-20" placeholderTextColor="#9ca3af" /></Field>
                <Field label={tt('mk', 'ສະຖານະ')}><Seg options={MK_STATUS_ORDER.map((s) => [s, MK_STATUS_LABEL[s]])} value={draft.status} onChange={(v) => setDraft({ ...draft, status: v as MkStatus })} wrap /></Field>
                <Field label={tt('mk', 'Caption / ໝາຍເຫດ')}><TextInput style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} value={draft.caption} onChangeText={(t) => setDraft({ ...draft, caption: t })} multiline placeholder={tt('mk', 'ຮຸກ → ຄຸນຄ່າ → CTA')} placeholderTextColor="#9ca3af" /></Field>
                <Field label={tt('mk', 'ຮັບຜິດຊອບ')}><TextInput style={styles.input} value={draft.assignee} onChangeText={(t) => setDraft({ ...draft, assignee: t })} placeholder={tt('mk', 'ຊື່')} placeholderTextColor="#9ca3af" /></Field>
                <Pressable style={[styles.saveBtn, (busy || !draft.title.trim()) && { opacity: 0.5 }]} disabled={busy || !draft.title.trim()} onPress={save}>
                  <Text style={styles.saveTx}>{busy ? tt('mk', 'ກຳລັງ ບັນທຶກ...') : tt('mk', 'ບັນທຶກ')}</Text>
                </Pressable>
                {editing && <Pressable style={styles.delBtn} onPress={remove}><Text style={styles.delTx}>🗑 {tt('mk', 'ລຶບ')}</Text></Pressable>}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ gap: 6 }}><Text style={styles.flabel}>{label}</Text>{children}</View>;
}
function Seg({ options, value, onChange, wrap }: { options: (readonly [string, string])[]; value: string; onChange: (v: string) => void; wrap?: boolean }) {
  return (
    <View style={[styles.seg, wrap && { flexWrap: 'wrap' }]}>
      {options.map(([v, l]) => (
        <Pressable key={v} style={[styles.segItem, value === v && styles.segItemOn, wrap && { flexGrow: 0, paddingHorizontal: 12 }]} onPress={() => onChange(v)}>
          <Text style={[styles.segTx, value === v && styles.segTxOn]}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fchip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  fchipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  fchipTx: { fontSize: 12, fontWeight: '700', color: colors.text2 },
  fchipTxOn: { color: '#fff' },
  calSeed: { alignSelf: 'flex-start', backgroundColor: '#e7f0fb', borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 13 },
  calSeedTx: { color: colors.primary, fontWeight: '800', fontSize: 12.5 },
  addBtn: { backgroundColor: colors.secondary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  addTx: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 50 },
  emptyT: { fontSize: 15, fontWeight: '700', color: colors.text2 },
  seedBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 20, marginTop: 4 },
  seedTx: { color: '#fff', fontWeight: '800', fontSize: 13 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  dateBox: { width: 46, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  dateTx: { fontSize: 12, fontWeight: '800', color: colors.text },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  chan: { fontSize: 12, fontWeight: '800', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  chanFb: { backgroundColor: '#e7f0fb', color: '#0a5fc0' },
  chanTt: { backgroundColor: colors.surface2, color: colors.text, borderWidth: 1, borderColor: colors.border },
  fmt: { fontSize: 12, color: colors.text3 },
  pillar: { fontSize: 12, fontWeight: '700', color: colors.text2, backgroundColor: colors.surface2, borderRadius: 5, paddingVertical: 1, paddingHorizontal: 6 },
  stPill: { borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  stTx: { fontSize: 12, fontWeight: '800' },
  noneTx: { textAlign: 'center', color: colors.text3, fontSize: 13, padding: 20 },
  // modal
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  x: { fontSize: 15, color: colors.text2, fontWeight: '700' },
  flabel: { fontSize: 12.5, fontWeight: '700', color: colors.text2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  seg: { flexDirection: 'row', gap: 6 },
  segItem: { flexGrow: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  segItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segTx: { fontSize: 12.5, fontWeight: '700', color: colors.text2 },
  segTxOn: { color: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pchip: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pchipOn: { backgroundColor: '#fdeede', borderColor: colors.secondary },
  pchipTx: { fontSize: 12, fontWeight: '700', color: colors.text2 },
  pchipTxOn: { color: colors.secondary },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 11, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveTx: { color: '#fff', fontWeight: '800', fontSize: 15 },
  delBtn: { alignItems: 'center', paddingVertical: 10 },
  delTx: { color: colors.error, fontWeight: '700', fontSize: 13 },
});
