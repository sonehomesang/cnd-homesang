import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import { isMock } from '@/lib/mock';
import MockBadge from '@/components/MockBadge';
import AmountInput from '@/components/AmountInput';
import {
  type AutoKpis, type MkAutoMetrics, type MkCampaign, type MkCampaignInput, type MkCampaignStatus, type MkMetrics,
  MK_CAMPAIGN_STATUS_LABEL,
  createMkCampaign, deleteMkCampaign, fetchAutoKpis, refreshMkAutoMetrics, saveMkMetrics, updateMkCampaign, watchMkAutoMetrics, watchMkCampaigns, watchMkMetrics,
} from '@/lib/mkCampaigns';

const CAMP_ST: Record<MkCampaignStatus, { bg: string; fg: string }> = {
  active: { bg: '#e2f6ea', fg: '#1f9d57' }, paused: { bg: '#fbf0d9', fg: '#c07d12' }, done: { bg: '#e7f0fb', fg: '#0a5fc0' },
};
const kip = (n: number) => (Number(n) || 0).toLocaleString('en-US');
const blankC = (): MkCampaignInput => ({ name: '', goal: '', target: 0, current: 0, status: 'active', note: '' });

export default function KpiView() {
  const tt = useTT();
  const [auto, setAuto] = useState<AutoKpis | null>(null);
  const [autoM, setAutoM] = useState<MkAutoMetrics | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<MkMetrics>({ reach: 0, engagementPct: 0, adSpendKip: 0, leads: 0 });
  const [camps, setCamps] = useState<MkCampaign[]>([]);
  const [mEdit, setMEdit] = useState<MkMetrics | null>(null);
  const [draft, setDraft] = useState<MkCampaignInput | null>(null);
  const [editing, setEditing] = useState<MkCampaign | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchAutoKpis().then(setAuto); }, []);
  useEffect(() => watchMkMetrics(setMetrics), []);
  useEffect(() => watchMkAutoMetrics(setAutoM), []);
  useEffect(() => watchMkCampaigns(setCamps), []);

  const refreshAuto = async () => { setRefreshing(true); try { await refreshMkAutoMetrics(); } finally { setRefreshing(false); } };
  const svrTiles = [
    { k: '💰 GMV 30 ວັນ', v: `${kip(autoM?.gmv30dKip ?? 0)} ₭` },
    { k: '🛒 ອໍເດີ 30 ວັນ', v: kip(autoM?.orders30d ?? 0) },
    { k: '📦 ອໍເດີ ສຳເລັດ', v: kip(autoM?.ordersDone ?? 0) },
    { k: '🔧 ວຽກ ສຳເລັດ', v: kip(autoM?.jobsDone ?? 0) },
    { k: '👤 ຜູ້ໃຊ້', v: kip(autoM?.users ?? 0) },
  ];

  const autoTiles = [
    { k: '🔧 ຊ່າງ', v: auto?.techs },
    { k: '🏪 ຮ້ານ', v: auto?.shops },
    { k: '📣 ງານ ເປີດ', v: auto?.openJobs },
    { k: '🤝 ພາດເນີ active', v: auto?.partnersActive },
    { k: '✅ ໂພສ ເຜີຍແຜ່', v: auto?.postsPublished },
  ];
  const manTiles = [
    { k: '👁 Reach', v: kip(metrics.reach) },
    { k: '💬 Engagement', v: `${metrics.engagementPct}%` },
    { k: '💸 ຄ່າ ໂຄສະນາ', v: `${kip(metrics.adSpendKip)} ₭` },
    { k: '🎯 Leads', v: kip(metrics.leads) },
  ];

  const saveMetrics = async () => { if (!mEdit) return; setBusy(true); try { await saveMkMetrics(mEdit); setMEdit(null); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const saveCamp = async () => {
    if (!draft || !draft.name.trim()) return; setBusy(true);
    try { if (editing) await updateMkCampaign(editing.id, draft); else await createMkCampaign(draft); setDraft(null); setEditing(null); }
    catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const removeCamp = async () => { if (!editing) return; setBusy(true); try { await deleteMkCampaign(editing.id); setDraft(null); setEditing(null); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };

  return (
    <View style={{ gap: 16 }}>
      {/* AUTO */}
      <View>
        <View style={styles.secHead}><Text style={styles.secT}>{tt('mk', 'ຕົວເລກ ຈາກ ແອັບ ຈິງ')}</Text><Text style={[styles.badge, styles.bAuto]}>auto</Text></View>
        <View style={styles.tiles}>
          {autoTiles.map((t) => (
            <View key={t.k} style={styles.tile}><Text style={styles.tileK}>{t.k}</Text><Text style={styles.tileV}>{t.v === undefined ? '…' : t.v.toLocaleString('en-US')}</Text></View>
          ))}
        </View>
      </View>

      {/* SERVER auto (GMV/orders — computed by Cloud Function) */}
      <View>
        <View style={styles.secHead}>
          <Text style={styles.secT}>{tt('mk', 'ຍອດ ຂາຍ / ອໍເດີ')}</Text>
          <Text style={[styles.badge, styles.bAuto]}>auto</Text>
          <View style={{ flex: 1 }} />
          <Pressable style={styles.editM} onPress={refreshAuto} disabled={refreshing}><Text style={styles.editMtx}>{refreshing ? '…' : `🔄 ${tt('mk', 'ໂຫຼດ ໃໝ່')}`}</Text></Pressable>
        </View>
        <View style={styles.tiles}>
          {svrTiles.map((t) => (<View key={t.k} style={styles.tile}><Text style={styles.tileK}>{t.k}</Text><Text style={styles.tileV}>{t.v}</Text></View>))}
        </View>
        {!autoM?.updatedAt && <Text style={styles.svrHint}>{tt('mk', 'ກົດ "ໂຫຼດ ໃໝ່" ເພື່ອ ຄິດໄລ່ ຄັ້ງ ທຳ ອິດ (ຫຼື ລໍ ຖ້າ ຮອບ ປະຈຳ ວັນ)')}</Text>}
      </View>

      {/* MANUAL */}
      <View>
        <View style={styles.secHead}><Text style={styles.secT}>{tt('mk', 'ຕົວເລກ ໃສ່ ເອງ')}</Text><Text style={[styles.badge, styles.bMan]}>manual</Text>
          <Pressable style={styles.editM} onPress={() => setMEdit({ ...metrics })}><Text style={styles.editMtx}>✏️ {tt('mk', 'ແກ້')}</Text></Pressable>
        </View>
        <View style={styles.tiles}>
          {manTiles.map((t) => (<View key={t.k} style={styles.tile}><Text style={styles.tileK}>{t.k}</Text><Text style={styles.tileV}>{t.v}</Text></View>))}
        </View>
      </View>

      {/* CAMPAIGNS */}
      <View>
        <View style={styles.secHead}><Text style={styles.secT}>🎯 {tt('mk', 'Campaign')}</Text><View style={{ flex: 1 }} />
          <Pressable style={styles.addBtn} onPress={() => { setEditing(null); setDraft(blankC()); }}><Text style={styles.addTx}>+ {tt('mk', 'ເພີ່ມ')}</Text></Pressable>
        </View>
        {camps.length === 0 ? (
          <Text style={styles.noneTx}>{tt('mk', 'ຍັງ ບໍ່ ມີ campaign — ກົດ + ເພີ່ມ')}</Text>
        ) : (
          <View style={styles.card}>
            {camps.map((c) => {
              const pct = c.target && c.target > 0 ? Math.min(100, Math.round(((c.current ?? 0) / c.target) * 100)) : 0;
              const st = CAMP_ST[c.status];
              return (
                <Pressable key={c.id} style={styles.crow} onPress={() => { setEditing(c); setDraft({ name: c.name, goal: c.goal, target: c.target, current: c.current, status: c.status, note: c.note }); }}>
                  <View style={styles.crowTop}>
                    <Text style={styles.cname} numberOfLines={1}>{c.name}</Text>
                    {isMock(c) && <MockBadge small />}
                    <Text style={[styles.cpill, { backgroundColor: st.bg, color: st.fg }]}>{tt('mk', MK_CAMPAIGN_STATUS_LABEL[c.status])}</Text>
                  </View>
                  {!!c.goal && <Text style={styles.cgoal}>{c.goal}</Text>}
                  {!!c.target && c.target > 0 && (
                    <View style={styles.barRow}>
                      <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
                      <Text style={styles.barTx}>{(c.current ?? 0).toLocaleString()}/{c.target.toLocaleString()} · {pct}%</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* manual metrics editor */}
      <Modal visible={!!mEdit} animationType="slide" transparent onRequestClose={() => setMEdit(null)}>
        <View style={styles.modalWrap}><View style={styles.modal}>
          <View style={styles.modalHead}><Text style={styles.modalTitle}>{tt('mk', 'ແກ້ ຕົວເລກ ໃສ່ ເອງ')}</Text><Pressable onPress={() => setMEdit(null)} hitSlop={8}><Text style={styles.x}>✕</Text></Pressable></View>
          {mEdit && (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <Num grouped label={tt('mk', '👁 Reach (ຄົນ ເຫັນ)')} value={mEdit.reach} onChange={(n) => setMEdit({ ...mEdit, reach: n })} />
              <Num label={tt('mk', '💬 Engagement (%)')} value={mEdit.engagementPct} onChange={(n) => setMEdit({ ...mEdit, engagementPct: n })} />
              <Num grouped label={tt('mk', '💸 ຄ່າ ໂຄສະນາ (ກີບ)')} value={mEdit.adSpendKip} onChange={(n) => setMEdit({ ...mEdit, adSpendKip: n })} />
              <Num grouped label={tt('mk', '🎯 Leads (ຄົນ ສົນໃຈ)')} value={mEdit.leads} onChange={(n) => setMEdit({ ...mEdit, leads: n })} />
              <Pressable style={[styles.saveBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={saveMetrics}><Text style={styles.saveTx}>{busy ? tt('mk', 'ກຳລັງ...') : tt('mk', 'ບັນທຶກ')}</Text></Pressable>
            </ScrollView>
          )}
        </View></View>
      </Modal>

      {/* campaign editor */}
      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={() => { setDraft(null); setEditing(null); }}>
        <View style={styles.modalWrap}><View style={styles.modal}>
          <View style={styles.modalHead}><Text style={styles.modalTitle}>{editing ? tt('mk', 'ແກ້ campaign') : tt('mk', 'campaign ໃໝ່')}</Text><Pressable onPress={() => { setDraft(null); setEditing(null); }} hitSlop={8}><Text style={styles.x}>✕</Text></Pressable></View>
          {draft && (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <Field label={tt('mk', 'ຊື່')}><TextInput style={styles.input} value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t })} placeholder={tt('mk', 'ເຊັ່ນ ເປີດ ຕົວ ວຽງຈັນ')} placeholderTextColor="#9ca3af" /></Field>
              <Field label={tt('mk', 'ເປົ້າ ໝາຍ')}><TextInput style={styles.input} value={draft.goal} onChangeText={(t) => setDraft({ ...draft, goal: t })} placeholder={tt('mk', 'ເຊັ່ນ ຫາ ຊ່າງ 150 ຄົນ')} placeholderTextColor="#9ca3af" /></Field>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Num grouped label={tt('mk', 'ເປົ້າ (target)')} value={draft.target ?? 0} onChange={(n) => setDraft({ ...draft, target: n })} /></View>
                <View style={{ flex: 1 }}><Num grouped label={tt('mk', 'ປັດຈຸບັນ')} value={draft.current ?? 0} onChange={(n) => setDraft({ ...draft, current: n })} /></View>
              </View>
              <Field label={tt('mk', 'ສະຖານະ')}><View style={styles.seg}>{(['active', 'paused', 'done'] as MkCampaignStatus[]).map((s) => <Pressable key={s} style={[styles.segItem, draft.status === s && styles.segItemOn]} onPress={() => setDraft({ ...draft, status: s })}><Text style={[styles.segTx, draft.status === s && styles.segTxOn]}>{tt('mk', MK_CAMPAIGN_STATUS_LABEL[s])}</Text></Pressable>)}</View></Field>
              <Field label={tt('mk', 'ໝາຍເຫດ')}><TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} value={draft.note} onChangeText={(t) => setDraft({ ...draft, note: t })} multiline placeholderTextColor="#9ca3af" /></Field>
              <Pressable style={[styles.saveBtn, (busy || !draft.name.trim()) && { opacity: 0.5 }]} disabled={busy || !draft.name.trim()} onPress={saveCamp}><Text style={styles.saveTx}>{busy ? tt('mk', 'ກຳລັງ...') : tt('mk', 'ບັນທຶກ')}</Text></Pressable>
              {editing && <Pressable style={styles.delBtn} onPress={removeCamp}><Text style={styles.delTx}>🗑 {tt('mk', 'ລຶບ')}</Text></Pressable>}
            </ScrollView>
          )}
        </View></View>
      </Modal>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={{ gap: 6 }}><Text style={styles.flabel}>{label}</Text>{children}</View>; }
function Num({ label, value, onChange, grouped }: { label: string; value: number; onChange: (n: number) => void; grouped?: boolean }) {
  return <Field label={label}>{grouped
    ? <AmountInput style={styles.input} value={value} onChangeValue={onChange} />
    : <TextInput style={styles.input} value={String(value)} onChangeText={(t) => onChange(Number(t.replace(/[^\d]/g, '')) || 0)} keyboardType="numeric" />}</Field>;
}

const styles = StyleSheet.create({
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  secT: { fontSize: 14, fontWeight: '800', color: colors.text },
  badge: { fontSize: 12, fontWeight: '800', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden', textTransform: 'uppercase' },
  bAuto: { backgroundColor: '#e2f6ea', color: '#1f9d57' }, bMan: { backgroundColor: '#e7f0fb', color: '#0a5fc0' },
  editM: { marginLeft: 'auto' }, editMtx: { fontSize: 12.5, fontWeight: '800', color: colors.primary },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: 130, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13 },
  svrHint: { fontSize: 12, color: colors.text3, marginTop: 6 },
  tileK: { fontSize: 12, color: colors.text2, fontWeight: '700' },
  tileV: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 5 },
  addBtn: { backgroundColor: colors.secondary, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 13 },
  addTx: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  noneTx: { color: colors.text3, fontSize: 13, paddingVertical: 8 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  crow: { padding: 13, borderBottomWidth: 1, borderBottomColor: colors.borderLight, gap: 6 },
  crowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cname: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  cpill: { fontSize: 12, fontWeight: '800', borderRadius: 7, paddingVertical: 3, paddingHorizontal: 9, overflow: 'hidden' },
  cgoal: { fontSize: 12.5, color: colors.text2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  track: { flex: 1, height: 16, backgroundColor: colors.surface2, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 6 },
  barTx: { fontSize: 12, fontWeight: '800', color: colors.text2 },
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
  saveBtn: { backgroundColor: colors.primary, borderRadius: 11, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveTx: { color: '#fff', fontWeight: '800', fontSize: 15 },
  delBtn: { alignItems: 'center', paddingVertical: 10 },
  delTx: { color: colors.error, fontWeight: '700', fontSize: 13 },
});
