import { useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import { isMock, useMockEnabled } from '@/lib/mock';
import MockBadge from '@/components/MockBadge';
import {
  type MkPartner, type MkPartnerInput, type MkPartnerStage, type MkPartnerType,
  MK_PARTNER_TYPE_LABEL, MK_STAGE_ALL, MK_STAGE_FLOW, MK_STAGE_LABEL,
  createMkPartner, deleteMkPartner, seedMkPartnersSample, setMkPartnerStage, updateMkPartner, watchMkPartners,
} from '@/lib/mkPartners';

const STAGE_STYLE: Record<MkPartnerStage, { bg: string; fg: string }> = {
  lead: { bg: '#eef2f7', fg: '#718399' }, contacted: { bg: '#e7f0fb', fg: '#0a5fc0' }, talking: { bg: '#fdeede', fg: '#e56f16' },
  signed: { bg: '#efe8fb', fg: '#7a4bd0' }, active: { bg: '#e2f6ea', fg: '#1f9d57' }, lost: { bg: '#fdecec', fg: '#c0392b' },
};
const blank = (): MkPartnerInput => ({ name: '', type: 'tech', stage: 'lead', phone: '', area: '', trade: '', note: '', nextAction: '', owner: '' });

export default function PartnerCRMView() {
  const tt = useTT();
  const [items, setItems] = useState<MkPartner[]>([]);
  const [ftype, setFtype] = useState<MkPartnerType | 'all'>('all');
  const [fstage, setFstage] = useState<MkPartnerStage | 'all'>('all');
  const [editing, setEditing] = useState<MkPartner | null>(null);
  const [draft, setDraft] = useState<MkPartnerInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const mockEnabled = useMockEnabled();

  useEffect(() => watchMkPartners(setItems), []);
  const shown = useMemo(() => items.filter((i) => (ftype === 'all' || i.type === ftype) && (fstage === 'all' || i.stage === fstage)), [items, ftype, fstage]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of MK_STAGE_ALL) c[s] = 0;
    for (const it of items) if (ftype === 'all' || it.type === ftype) c[it.stage] = (c[it.stage] ?? 0) + 1;
    return c;
  }, [items, ftype]);

  const openNew = () => { setEditing(null); setDraft(blank()); };
  const openEdit = (p: MkPartner) => { setEditing(p); setDraft({ ...p }); };
  const close = () => { setDraft(null); setEditing(null); };
  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    setBusy(true);
    try { if (editing) await updateMkPartner(editing.id, draft); else await createMkPartner(draft); close(); }
    catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const remove = async () => { if (!editing) return; setBusy(true); try { await deleteMkPartner(editing.id); close(); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const advance = async (p: MkPartner) => {
    if (p.stage === 'lost' || p.stage === 'active') return;
    const i = MK_STAGE_FLOW.indexOf(p.stage);
    const next = MK_STAGE_FLOW[Math.min(i + 1, MK_STAGE_FLOW.length - 1)];
    if (next !== p.stage) await setMkPartnerStage(p.id, next).catch(() => {});
  };
  const seed = async () => { setSeeding(true); try { await seedMkPartnersSample(items.length); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setSeeding(false); } };
  const call = (phone?: string) => { if (phone) Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() => {}); };

  return (
    <View style={{ gap: 12 }}>
      {/* funnel */}
      <View style={styles.funnel}>
        {MK_STAGE_FLOW.map((s) => (
          <Pressable key={s} style={[styles.fstep, fstage === s && styles.fstepOn]} onPress={() => setFstage(fstage === s ? 'all' : s)}>
            <Text style={styles.fn}>{counts[s] ?? 0}</Text>
            <Text style={styles.fl}>{tt('mk', MK_STAGE_LABEL[s])}</Text>
          </Pressable>
        ))}
        {counts.lost > 0 && (
          <Pressable style={[styles.fstep, styles.fstepLost, fstage === 'lost' && styles.fstepOn]} onPress={() => setFstage(fstage === 'lost' ? 'all' : 'lost')}>
            <Text style={[styles.fn, { color: '#c0392b' }]}>{counts.lost}</Text><Text style={styles.fl}>{tt('mk', 'ບໍ່ ສຳເລັດ')}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flex: 1 }}>
          {(['all', 'tech', 'shop', 'broker'] as const).map((f) => (
            <Pressable key={f} style={[styles.tchip, ftype === f && styles.tchipOn]} onPress={() => setFtype(f)}>
              <Text style={[styles.tchipTx, ftype === f && styles.tchipTxOn]}>{f === 'all' ? tt('mk', 'ໝົດ') : tt('mk', MK_PARTNER_TYPE_LABEL[f])}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable style={styles.addBtn} onPress={openNew}><Text style={styles.addTx}>+ {tt('mk', 'ເພີ່ມ')}</Text></Pressable>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 34 }}>🤝</Text><Text style={styles.emptyT}>{tt('mk', 'ຍັງ ບໍ່ ມີ ພາດເນີ')}</Text>
          {mockEnabled && <Pressable style={[styles.seedBtn, seeding && { opacity: 0.5 }]} disabled={seeding} onPress={seed}><Text style={styles.seedTx}>{seeding ? tt('mk', 'ກຳລັງ...') : `🌱 ${tt('mk', 'ໃສ່ ຕົວຢ່າງ')}`}</Text></Pressable>}
        </View>
      ) : (
        <View style={styles.card}>
          {shown.map((p) => {
            const st = STAGE_STYLE[p.stage];
            return (
              <Pressable key={p.id} style={styles.row} onPress={() => openEdit(p)}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.name} numberOfLines={1}>{MK_PARTNER_TYPE_LABEL[p.type].split(' ')[0]} {p.name}</Text>
                    {isMock(p) && <MockBadge small />}
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>{[p.trade, p.area].filter(Boolean).join(' · ')}{p.nextAction ? ` · ▶ ${p.nextAction}` : ''}</Text>
                </View>
                {!!p.phone && <Pressable onPress={() => call(p.phone)} hitSlop={8} style={styles.callBtn}><Text style={styles.callTx}>📞</Text></Pressable>}
                <Pressable onPress={() => advance(p)} style={[styles.stPill, { backgroundColor: st.bg }]}>
                  <Text style={[styles.stTx, { color: st.fg }]}>{tt('mk', MK_STAGE_LABEL[p.stage])}{p.stage !== 'active' && p.stage !== 'lost' ? ' ›' : ''}</Text>
                </Pressable>
              </Pressable>
            );
          })}
          {shown.length === 0 && <Text style={styles.noneTx}>{tt('mk', 'ບໍ່ ມີ ໃນ ຕົວ ກັ່ນຕອງ ນີ້')}</Text>}
        </View>
      )}

      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={styles.modalHead}><Text style={styles.modalTitle}>{editing ? tt('mk', 'ແກ້ ພາດເນີ') : tt('mk', 'ພາດເນີ ໃໝ່')}</Text><Pressable onPress={close} hitSlop={8}><Text style={styles.x}>✕</Text></Pressable></View>
            {draft && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Field label={tt('mk', 'ຊື່')}><TextInput style={styles.input} value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t })} placeholder={tt('mk', 'ຊື່ ຊ່າງ / ຮ້ານ')} placeholderTextColor="#9ca3af" /></Field>
                <Field label={tt('mk', 'ປະເພດ')}><Seg options={[['tech', '🔧 ຊ່າງ'], ['shop', '🏪 ຮ້ານ'], ['broker', '📣 ນາຍໜ້າ']]} value={draft.type} onChange={(v) => setDraft({ ...draft, type: v as MkPartnerType })} /></Field>
                <Field label={tt('mk', 'ຂັ້ນ ຕອນ')}><Seg options={MK_STAGE_ALL.map((s) => [s, MK_STAGE_LABEL[s]])} value={draft.stage} onChange={(v) => setDraft({ ...draft, stage: v as MkPartnerStage })} wrap /></Field>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}><Field label={tt('mk', 'ເບີ ໂທ')}><TextInput style={styles.input} value={draft.phone} onChangeText={(t) => setDraft({ ...draft, phone: t })} keyboardType="phone-pad" placeholder="20xxxxxxxx" placeholderTextColor="#9ca3af" /></Field></View>
                  <View style={{ flex: 1 }}><Field label={tt('mk', 'trade / ໝວດ')}><TextInput style={styles.input} value={draft.trade} onChangeText={(t) => setDraft({ ...draft, trade: t })} placeholder={tt('mk', 'ໄຟ/ແອ/ວັດສະດຸ')} placeholderTextColor="#9ca3af" /></Field></View>
                </View>
                <Field label={tt('mk', 'ພື້ນທີ່')}><TextInput style={styles.input} value={draft.area} onChangeText={(t) => setDraft({ ...draft, area: t })} placeholder={tt('mk', 'ວຽງຈັນ · ເມືອງ...')} placeholderTextColor="#9ca3af" /></Field>
                <Field label={tt('mk', '▶ ຂັ້ນ ຕໍ່ ໄປ (next action)')}><TextInput style={styles.input} value={draft.nextAction} onChangeText={(t) => setDraft({ ...draft, nextAction: t })} placeholder={tt('mk', 'ເຊັ່ນ ໂທ ຕາມ / ນັດ ພົບ')} placeholderTextColor="#9ca3af" /></Field>
                <Field label={tt('mk', 'ໝາຍເຫດ')}><TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} value={draft.note} onChangeText={(t) => setDraft({ ...draft, note: t })} multiline placeholderTextColor="#9ca3af" /></Field>
                <Field label={tt('mk', 'ຮັບຜິດຊອບ')}><TextInput style={styles.input} value={draft.owner} onChangeText={(t) => setDraft({ ...draft, owner: t })} placeholder={tt('mk', 'ຊື່ ທີມ')} placeholderTextColor="#9ca3af" /></Field>
                <Pressable style={[styles.saveBtn, (busy || !draft.name.trim()) && { opacity: 0.5 }]} disabled={busy || !draft.name.trim()} onPress={save}><Text style={styles.saveTx}>{busy ? tt('mk', 'ກຳລັງ ບັນທຶກ...') : tt('mk', 'ບັນທຶກ')}</Text></Pressable>
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
      {options.map(([v, l]) => <Pressable key={v} style={[styles.segItem, value === v && styles.segItemOn, wrap && { flexGrow: 0, paddingHorizontal: 12 }]} onPress={() => onChange(v)}><Text style={[styles.segTx, value === v && styles.segTxOn]}>{l}</Text></Pressable>)}
    </View>
  );
}

const styles = StyleSheet.create({
  funnel: { flexDirection: 'row', gap: 6 },
  fstep: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  fstepOn: { borderColor: colors.primary, backgroundColor: '#f2f7ff' },
  fstepLost: { flex: 0.8 },
  fn: { fontSize: 15, fontWeight: '800', color: colors.text },
  fl: { fontSize: 12, color: colors.text3, marginTop: 1, fontWeight: '700' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tchip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  tchipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tchipTx: { fontSize: 12, fontWeight: '700', color: colors.text2 },
  tchipTxOn: { color: '#fff' },
  addBtn: { backgroundColor: colors.secondary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  addTx: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyT: { fontSize: 15, fontWeight: '700', color: colors.text2 },
  seedBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 20 },
  seedTx: { color: '#fff', fontWeight: '800', fontSize: 13 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.text3, marginTop: 2 },
  callBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#e2f6ea', alignItems: 'center', justifyContent: 'center' },
  callTx: { fontSize: 15 },
  stPill: { borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  stTx: { fontSize: 12, fontWeight: '800' },
  noneTx: { textAlign: 'center', color: colors.text3, fontSize: 13, padding: 20 },
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
  segTx: { fontSize: 12, fontWeight: '700', color: colors.text2 },
  segTxOn: { color: '#fff' },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 11, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveTx: { color: '#fff', fontWeight: '800', fontSize: 15 },
  delBtn: { alignItems: 'center', paddingVertical: 10 },
  delTx: { color: colors.error, fontWeight: '700', fontSize: 13 },
});
