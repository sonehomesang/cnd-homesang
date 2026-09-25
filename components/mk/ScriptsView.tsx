import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import { isMock, useMockEnabled } from '@/lib/mock';
import MockBadge from '@/components/MockBadge';
import { type MkPlatform, MK_PLATFORM_LABEL } from '@/lib/mkContent';
import {
  type MkScene, type MkScript, type MkScriptInput, type MkScriptStatus,
  MK_SCRIPT_STATUS_LABEL, MK_SCRIPT_STATUS_ORDER,
  createMkScript, deleteMkScript, seedMkAdScripts, seedMkRecruitScripts, seedMkScriptsSample, seedMkStorySeries, updateMkScript, watchMkScripts,
} from '@/lib/mkScripts';

const ST_STYLE: Record<MkScriptStatus, { bg: string; fg: string }> = {
  draft: { bg: '#eef2f7', fg: '#718399' }, ready: { bg: '#e7f0fb', fg: '#0a5fc0' }, generated: { bg: '#e2f6ea', fg: '#1f9d57' },
};
const blank = (): MkScriptInput => ({ title: '', platform: 'both', durationSec: 30, hook: '', scenes: [{ label: '', desc: '' }], aiPrompt: '', status: 'draft' });

export default function ScriptsView() {
  const tt = useTT();
  const [items, setItems] = useState<MkScript[]>([]);
  const [editing, setEditing] = useState<MkScript | null>(null);
  const [draft, setDraft] = useState<MkScriptInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const mockEnabled = useMockEnabled();
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => watchMkScripts(setItems), []);

  const openNew = () => { setEditing(null); setDraft(blank()); };
  const openEdit = (s: MkScript) => { setEditing(s); setDraft({ ...s, scenes: s.scenes.length ? s.scenes.map((x) => ({ ...x })) : [{ label: '', desc: '' }] }); };
  const close = () => { setDraft(null); setEditing(null); };
  const save = async () => {
    if (!draft || !draft.title.trim()) return;
    setBusy(true);
    try {
      const clean = { ...draft, scenes: draft.scenes.filter((s) => s.label.trim() || s.desc.trim()) };
      if (editing) await updateMkScript(editing.id, clean); else await createMkScript(clean);
      close();
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const remove = async () => { if (!editing) return; setBusy(true); try { await deleteMkScript(editing.id); close(); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const seed = async () => { setSeeding(true); try { await seedMkScriptsSample(items.length); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setSeeding(false); } };
  const seedAds = async () => { setSeeding(true); try { const n = await seedMkAdScripts(items.map((s) => s.title)); alert(n > 0 ? `${tt('mk', 'ໃສ່ ສະຄຣິບ ໂຄສະນາ ແລ້ວ')} (+${n})` : tt('mk', 'ມີ ຄົບ ແລ້ວ')); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setSeeding(false); } };
  const seedStory = async () => { setSeeding(true); try { const n = await seedMkStorySeries(items.map((s) => s.title)); alert(n > 0 ? `${tt('mk', 'ໃສ່ ຊຸດ "ບ້ານ ໃຜ ກໍ່ ເປັນ" ແລ້ວ')} (+${n})` : tt('mk', 'ມີ ຄົບ ແລ້ວ')); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setSeeding(false); } };
  const seedRecruit = async () => { setSeeding(true); try { const n = await seedMkRecruitScripts(items.map((s) => s.title)); alert(n > 0 ? `${tt('mk', 'ໃສ່ ຊຸດ ຮັບ ສະໝັກ ຊ່າງ ແລ້ວ')} (+${n})` : tt('mk', 'ມີ ຄົບ ແລ້ວ')); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setSeeding(false); } };
  const copy = (id: string, text: string) => {
    try { if (Platform.OS === 'web' && (navigator as any)?.clipboard) { (navigator as any).clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); } } catch { /* ignore */ }
  };
  const setScene = (i: number, patch: Partial<MkScene>) => draft && setDraft({ ...draft, scenes: draft.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const addScene = () => draft && setDraft({ ...draft, scenes: [...draft.scenes, { label: '', desc: '' }] });
  const rmScene = (i: number) => draft && setDraft({ ...draft, scenes: draft.scenes.filter((_, j) => j !== i) });

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.toolbar}>
        <Text style={styles.hint}>{tt('mk', 'ບົດ ສາກ + AI Prompt — copy ໄປ ໃສ່ ເຄຣື່ອງມືອ ສ້າງ ວີດີໂອ AI')}</Text>
        <Pressable style={[styles.adBtn, seeding && { opacity: 0.5 }]} disabled={seeding} onPress={seedAds}><Text style={styles.adTx}>📝 {tt('mk', 'ໃສ່ ສະຄຣິບ ໂຄສະນາ ພຣ້ອມ ໃຊ້')}</Text></Pressable>
        <Pressable style={[styles.adBtn, seeding && { opacity: 0.5 }]} disabled={seeding} onPress={seedStory}><Text style={styles.adTx}>🎬 {tt('mk', 'ຊຸດ "ບ້ານ ໃຜ ກໍ່ ເປັນ" (7)')}</Text></Pressable>
        <Pressable style={[styles.adBtn, seeding && { opacity: 0.5 }]} disabled={seeding} onPress={seedRecruit}><Text style={styles.adTx}>🧑‍🔧 {tt('mk', 'ຊຸດ ຮັບ ສະໝັກ ຊ່າງ (5)')}</Text></Pressable>
        <Pressable style={styles.addBtn} onPress={openNew}><Text style={styles.addTx}>+ {tt('mk', 'ເພີ່ມ')}</Text></Pressable>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 34 }}>🎬</Text>
          <Text style={styles.emptyT}>{tt('mk', 'ຍັງ ບໍ່ ມີ script')}</Text>
          {mockEnabled && (
          <Pressable style={[styles.seedBtn, seeding && { opacity: 0.5 }]} disabled={seeding} onPress={seed}>
            <Text style={styles.seedTx}>{seeding ? tt('mk', 'ກຳລັງ...') : `🌱 ${tt('mk', 'ໃສ່ ຕົວຢ່າງ 2 script')}`}</Text>
          </Pressable>
          )}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {items.map((s) => {
            const st = ST_STYLE[s.status];
            return (
              <View key={s.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.title}>🎬 {s.title}</Text>
                  <Pressable style={[styles.stPill, { backgroundColor: st.bg }]} onPress={() => openEdit(s)}><Text style={[styles.stTx, { color: st.fg }]}>{tt('mk', MK_SCRIPT_STATUS_LABEL[s.status])}</Text></Pressable>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={styles.sub}>{MK_PLATFORM_LABEL[s.platform]} · {s.durationSec} {tt('mk', 'ວິ')}{s.hook ? ` · ${s.hook}` : ''}</Text>
                  {isMock(s) && <MockBadge small />}
                </View>
                {s.scenes.map((sc, i) => (
                  <View key={i} style={styles.scene}>
                    <Text style={styles.sceneL}>{sc.label}</Text>
                    <Text style={styles.sceneD}>{sc.desc}</Text>
                  </View>
                ))}
                {!!s.aiPrompt && (
                  <View style={styles.prompt}>
                    <View style={styles.promptHead}>
                      <Text style={styles.promptL}>🤖 {tt('mk', 'AI Prompt')}</Text>
                      <Pressable onPress={() => copy(s.id, s.aiPrompt)} style={styles.copyBtn}><Text style={styles.copyTx}>{copied === s.id ? `✓ ${tt('mk', 'ກ໊ອບປີ້ ແລ້ວ')}` : `📋 ${tt('mk', 'ກ໊ອບປີ້')}`}</Text></Pressable>
                    </View>
                    <Text style={styles.promptTx}>{s.aiPrompt}</Text>
                  </View>
                )}
                <Pressable onPress={() => openEdit(s)} style={styles.editLink}><Text style={styles.editTx}>✏️ {tt('mk', 'ແກ້')}</Text></Pressable>
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{editing ? tt('mk', 'ແກ້ script') : tt('mk', 'script ໃໝ່')}</Text>
              <Pressable onPress={close} hitSlop={8}><Text style={styles.x}>✕</Text></Pressable>
            </View>
            {draft && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Field label={tt('mk', 'ຫົວຂໍ້')}><TextInput style={styles.input} value={draft.title} onChangeText={(t) => setDraft({ ...draft, title: t })} placeholder={tt('mk', 'ເຊັ່ນ ກ່ອນ-ຫຼັງ ລ້າງ ແອ')} placeholderTextColor="#9ca3af" /></Field>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 2 }}><Field label={tt('mk', 'ຊ່ອງ ທາງ')}><Seg options={[['fb', 'FB'], ['tiktok', 'TikTok'], ['both', 'ທັງ ສອງ']]} value={draft.platform} onChange={(v) => setDraft({ ...draft, platform: v as MkPlatform })} /></Field></View>
                  <View style={{ flex: 1 }}><Field label={tt('mk', 'ວິນາທີ')}><TextInput style={styles.input} value={String(draft.durationSec)} onChangeText={(t) => setDraft({ ...draft, durationSec: Number(t.replace(/[^\d]/g, '')) || 0 })} keyboardType="numeric" /></Field></View>
                </View>
                <Field label={tt('mk', 'Hook (ປະໂຫຍກ ດຶງ)')}><TextInput style={styles.input} value={draft.hook} onChangeText={(t) => setDraft({ ...draft, hook: t })} placeholder={tt('mk', 'ເຊັ່ນ ແອ ບໍ່ ເຢັນ? ຢ່າ ຟ້າວ ຊື້ ໃໝ່!')} placeholderTextColor="#9ca3af" /></Field>
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.flabel, { flex: 1 }]}>{tt('mk', 'ສາກ (label + ລາຍລະອຽດ)')}</Text>
                    <Pressable onPress={addScene}><Text style={styles.addScene}>+ {tt('mk', 'ເພີ່ມ ສາກ')}</Text></Pressable>
                  </View>
                  {draft.scenes.map((sc, i) => (
                    <View key={i} style={styles.sceneEdit}>
                      <TextInput style={[styles.input, styles.sceneLabel]} value={sc.label} onChangeText={(t) => setScene(i, { label: t })} placeholder={tt('mk', '0-5 ວິ')} placeholderTextColor="#9ca3af" />
                      <TextInput style={[styles.input, { flex: 1 }]} value={sc.desc} onChangeText={(t) => setScene(i, { desc: t })} placeholder={tt('mk', 'ລາຍລະອຽດ ສາກ')} placeholderTextColor="#9ca3af" />
                      {draft.scenes.length > 1 && <Pressable onPress={() => rmScene(i)} hitSlop={6} style={styles.rmScene}><Text style={{ color: colors.error, fontSize: 15 }}>×</Text></Pressable>}
                    </View>
                  ))}
                </View>
                <Field label={tt('mk', '🤖 AI Prompt (ໃຫ້ AI ສ້າງ ວີດີໂອ)')}><TextInput style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]} value={draft.aiPrompt} onChangeText={(t) => setDraft({ ...draft, aiPrompt: t })} multiline placeholder="Create a 30-sec vertical video..." placeholderTextColor="#9ca3af" /></Field>
                <Field label={tt('mk', 'ສະຖານະ')}><Seg options={MK_SCRIPT_STATUS_ORDER.map((s) => [s, MK_SCRIPT_STATUS_LABEL[s]])} value={draft.status} onChange={(v) => setDraft({ ...draft, status: v as MkScriptStatus })} /></Field>
                <Pressable style={[styles.saveBtn, (busy || !draft.title.trim()) && { opacity: 0.5 }]} disabled={busy || !draft.title.trim()} onPress={save}><Text style={styles.saveTx}>{busy ? tt('mk', 'ກຳລັງ ບັນທຶກ...') : tt('mk', 'ບັນທຶກ')}</Text></Pressable>
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
function Seg({ options, value, onChange }: { options: (readonly [string, string])[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.seg}>
      {options.map(([v, l]) => (
        <Pressable key={v} style={[styles.segItem, value === v && styles.segItemOn]} onPress={() => onChange(v)}><Text style={[styles.segTx, value === v && styles.segTxOn]}>{l}</Text></Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  hint: { flex: 1, minWidth: 140, fontSize: 12, color: colors.text3 },
  adBtn: { backgroundColor: '#e7f0fb', borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  adTx: { color: colors.primary, fontWeight: '800', fontSize: 12.5 },
  addBtn: { backgroundColor: colors.secondary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  addTx: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 50 },
  emptyT: { fontSize: 15, fontWeight: '700', color: colors.text2 },
  seedBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 20 },
  seedTx: { color: '#fff', fontWeight: '800', fontSize: 13 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  stPill: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  stTx: { fontSize: 12, fontWeight: '800' },
  sub: { fontSize: 12.5, color: colors.text3, marginTop: 3 },
  scene: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  sceneL: { fontSize: 12, fontWeight: '800', color: colors.text },
  sceneD: { fontSize: 13, color: colors.text2, marginTop: 1 },
  prompt: { backgroundColor: '#fff8f1', borderWidth: 1, borderColor: '#fbdcb6', borderStyle: 'dashed', borderRadius: 10, padding: 12, marginTop: 10 },
  promptHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  promptL: { flex: 1, fontSize: 12, fontWeight: '800', color: colors.warning, letterSpacing: 0.4 },
  copyBtn: { backgroundColor: colors.warning, borderRadius: 7, paddingVertical: 4, paddingHorizontal: 10 },
  copyTx: { color: '#fff', fontSize: 12, fontWeight: '800' },
  promptTx: { fontSize: 12.5, color: colors.text2, lineHeight: 18 },
  editLink: { marginTop: 10 },
  editTx: { fontSize: 12.5, fontWeight: '700', color: colors.primary },
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
  addScene: { fontSize: 12.5, fontWeight: '800', color: colors.primary },
  sceneEdit: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sceneLabel: { width: 78 },
  rmScene: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 11, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveTx: { color: '#fff', fontWeight: '800', fontSize: 15 },
  delBtn: { alignItems: 'center', paddingVertical: 10 },
  delTx: { color: colors.error, fontWeight: '700', fontSize: 13 },
});
