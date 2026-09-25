import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import { CATEGORIES } from '@/lib/categories';
import { watchSitesForOwner, type Site } from '@/lib/sites';
import {
  type MaintenancePlan, type MaintenancePlanInput,
  MAINT_INTERVALS, MONTH_MS, createMaintenancePlan, deleteMaintenancePlan, maintStatus,
  updateMaintenancePlan, watchMaintenancePlansForOwner,
} from '@/lib/maintenance';
import BackButton from '@/components/BackButton';

const isoDate = (ms: number) => { const d = new Date(ms || Date.now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const parseDate = (s: string) => { const t = Date.parse(s); return Number.isFinite(t) ? t : Date.now(); };
const ST: Record<string, { bg: string; fg: string; t: string }> = {
  due: { bg: '#fdecec', fg: '#c0392b', t: 'ຮອດ ກຳນົດ' }, soon: { bg: '#fbf0d9', fg: '#c07d12', t: 'ໃກ້ ຮອດ' },
  ok: { bg: '#e2f6ea', fg: '#1f9d57', t: 'ຍັງ' }, off: { bg: '#eef2f7', fg: '#718399', t: 'ປິດ' },
};

export default function MaintenanceScreen() {
  const { fbUser } = useAuth();
  const tt = useTT();
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [editing, setEditing] = useState<MaintenancePlan | null>(null);
  const [draft, setDraft] = useState<MaintenancePlanInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(Date.now());

  useEffect(() => { if (!fbUser) { router.replace('/sign-in' as any); return; } return watchMaintenancePlansForOwner(fbUser.uid, setPlans); }, [fbUser]);
  useEffect(() => { if (fbUser) return watchSitesForOwner(fbUser.uid, setSites); }, [fbUser]);

  const blank = (): MaintenancePlanInput => ({ ownerId: fbUser!.uid, title: '', category: 'aircon', intervalMonths: 3, nextDueAt: Date.now() + 3 * MONTH_MS, active: true, autoPost: false, note: '' });
  const openNew = () => { setEditing(null); setDraft(blank()); };
  const openEdit = (p: MaintenancePlan) => { setEditing(p); setDraft({ ownerId: p.ownerId, siteId: p.siteId, siteName: p.siteName, assetId: p.assetId, title: p.title, category: p.category, intervalMonths: p.intervalMonths, nextDueAt: p.nextDueAt, lastServiceAt: p.lastServiceAt, active: p.active, autoPost: p.autoPost, note: p.note }); };
  const close = () => { setDraft(null); setEditing(null); };
  const save = async () => {
    if (!draft || !draft.title.trim()) return; setBusy(true);
    try { if (editing) await updateMaintenancePlan(editing.id, draft); else await createMaintenancePlan(draft); close(); }
    catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const remove = async () => { if (!editing) return; setBusy(true); try { await deleteMaintenancePlan(editing.id); close(); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };

  const D = (d: number) => new Date(d).toLocaleDateString('lo-LA');

  return (
    <View style={styles.root}>
      <View style={styles.top}><BackButton /><Text style={styles.topT}>🔁 {tt('maint', 'ສ້ອມ ບຳຣຸງ ປະຈຳ')}</Text></View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.intro}>{tt('maint', 'ຕັ້ງ ຮອບ ດູແລ ເຄຣື່ອງ/ອາຄານ — ຮອດ ກຳນົດ ລະບົບ ຈະ ເຕືອນ ຫຼື ໂພສ ງານ ໃຫ້ ອັດຕະໂນມັຕ. ເໝາະ ໂຮງແຮມ · ໂຮງງານ · ຫ້ອງການ.')}</Text>

        <Pressable style={styles.addBtn} onPress={openNew}><Text style={styles.addTx}>+ {tt('maint', 'ຕັ້ງ ຮອບ ໃໝ່')}</Text></Pressable>

        {plans.length === 0 ? (
          <View style={styles.empty}><Text style={{ fontSize: 34 }}>🔁</Text><Text style={styles.emptyT}>{tt('maint', 'ຍັງ ບໍ່ ມີ ຮອບ ບຳຣຸງ')}</Text></View>
        ) : plans.map((p) => {
          const s = ST[maintStatus(p, now)];
          const cat = CATEGORIES.find((c) => c.value === p.category);
          return (
            <Pressable key={p.id} style={styles.card} onPress={() => openEdit(p)}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>{cat?.icon ?? '🔧'} {p.title}</Text>
                <Text style={[styles.pill, { backgroundColor: s.bg, color: s.fg }]}>{tt('maint', s.t)}</Text>
              </View>
              <Text style={styles.cardMeta}>
                {tt('maint', 'ທຸກ')} {p.intervalMonths} {tt('maint', 'ເດືອນ')} · {tt('maint', 'ຄັ້ງ ຕໍ່ ໄປ')} {D(p.nextDueAt)}
                {p.siteName ? ` · 📍 ${p.siteName}` : ''} · {p.autoPost ? tt('maint', '⚙️ ໂພສ ອັຕໂນມັຕ') : tt('maint', '🔔 ເຕືອນ ຢ່າງ ດຽວ')}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.modalWrap}><View style={styles.modal}>
          <View style={styles.modalHead}><Text style={styles.modalTitle}>{editing ? tt('maint', 'ແກ້ ຮອບ') : tt('maint', 'ຮອບ ໃໝ່')}</Text><Pressable onPress={close} hitSlop={8}><Text style={styles.x}>✕</Text></Pressable></View>
          {draft && (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              <Field label={tt('maint', 'ຫຍັງ ຕ້ອງ ດູແລ')}><TextInput style={styles.input} value={draft.title} onChangeText={(t) => setDraft({ ...draft, title: t })} placeholder={tt('maint', 'ເຊ່ນ ລ້າງ ແອ ຫ້ອງ ປະຊຸມ')} placeholderTextColor="#9ca3af" /></Field>
              <Field label={tt('maint', 'ໝວດ ບໍລິການ')}>
                <View style={styles.chips}>{CATEGORIES.filter((c) => c.value !== 'other').map((c) => <Pressable key={c.value} style={[styles.chip, draft.category === c.value && styles.chipOn]} onPress={() => setDraft({ ...draft, category: c.value })}><Text style={[styles.chipTx, draft.category === c.value && styles.chipTxOn]}>{c.icon} {c.lao}</Text></Pressable>)}</View>
              </Field>
              {sites.length > 0 && (
                <Field label={tt('maint', 'ສະຖານທີ່ (ບໍ່ ບັງຄັບ)')}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    <Pressable style={[styles.chip, !draft.siteId && styles.chipOn]} onPress={() => setDraft({ ...draft, siteId: undefined, siteName: undefined })}><Text style={[styles.chipTx, !draft.siteId && styles.chipTxOn]}>{tt('maint', 'ບໍ່ ລະບຸ')}</Text></Pressable>
                    {sites.map((si) => <Pressable key={si.id} style={[styles.chip, draft.siteId === si.id && styles.chipOn]} onPress={() => setDraft({ ...draft, siteId: si.id, siteName: (si as any).name })}><Text style={[styles.chipTx, draft.siteId === si.id && styles.chipTxOn]}>📍 {(si as any).name}</Text></Pressable>)}
                  </ScrollView>
                </Field>
              )}
              <Field label={tt('maint', 'ຮອບ (ທຸກ ກີ່ ເດືອນ)')}>
                <View style={styles.seg}>{MAINT_INTERVALS.map((m) => <Pressable key={m} style={[styles.segItem, draft.intervalMonths === m && styles.segItemOn]} onPress={() => setDraft({ ...draft, intervalMonths: m, nextDueAt: draft.nextDueAt || Date.now() + m * MONTH_MS })}><Text style={[styles.segTx, draft.intervalMonths === m && styles.segTxOn]}>{m}</Text></Pressable>)}</View>
              </Field>
              <Field label={tt('maint', 'ຄັ້ງ ຕໍ່ ໄປ (ປປປປ-ດດ-ວວ)')}><TextInput style={styles.input} value={isoDate(draft.nextDueAt)} onChangeText={(t) => setDraft({ ...draft, nextDueAt: parseDate(t) })} placeholder="2026-11-15" placeholderTextColor="#9ca3af" /></Field>
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}><Text style={styles.swT}>{tt('maint', '⚙️ ໂພສ ງານ ອັຕໂນມັຕ')}</Text><Text style={styles.swS}>{tt('maint', 'ຮອດ ກຳນົດ → ໂພສ ຫາ ຊ່າງ ໃຫ້ ເລີຍ (ບໍ່ ເປີດ = ພຽງ ເຕືອນ)')}</Text></View>
                <Switch value={draft.autoPost} onValueChange={(v) => setDraft({ ...draft, autoPost: v })} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.swT}>{tt('maint', 'ເປີດ ໃຊ້ ງານ')}</Text>
                <Switch value={draft.active} onValueChange={(v) => setDraft({ ...draft, active: v })} />
              </View>
              <Field label={tt('maint', 'ໝາຍເຫດ')}><TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} value={draft.note} onChangeText={(t) => setDraft({ ...draft, note: t })} multiline placeholderTextColor="#9ca3af" /></Field>
              <Pressable style={[styles.saveBtn, (busy || !draft.title.trim()) && { opacity: 0.5 }]} disabled={busy || !draft.title.trim()} onPress={save}><Text style={styles.saveTx}>{busy ? tt('maint', 'ກຳລັງ ບັນທຶກ...') : tt('maint', 'ບັນທຶກ')}</Text></Pressable>
              {editing && <Pressable style={styles.delBtn} onPress={remove}><Text style={styles.delTx}>🗑 {tt('maint', 'ລຶບ')}</Text></Pressable>}
            </ScrollView>
          )}
        </View></View>
      </Modal>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={{ gap: 6 }}><Text style={styles.flabel}>{label}</Text>{children}</View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  topT: { fontSize: 15, fontWeight: '800', color: colors.text },
  body: { padding: 12, paddingBottom: 60, gap: 10 },
  intro: { fontSize: 13, color: colors.text2, lineHeight: 19, backgroundColor: '#e7f0fb', borderRadius: 10, padding: 12 },
  addBtn: { backgroundColor: colors.primary, borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  addTx: { color: '#fff', fontWeight: '800', fontSize: 14 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyT: { fontSize: 14, fontWeight: '700', color: colors.text2 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  pill: { fontSize: 12, fontWeight: '800', borderRadius: 7, paddingVertical: 3, paddingHorizontal: 9, overflow: 'hidden' },
  cardMeta: { fontSize: 12.5, color: colors.text2, marginTop: 5, lineHeight: 18 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  x: { fontSize: 15, color: colors.text2, fontWeight: '700' },
  flabel: { fontSize: 12.5, fontWeight: '700', color: colors.text2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTx: { fontSize: 12, fontWeight: '700', color: colors.text2 },
  chipTxOn: { color: '#fff' },
  seg: { flexDirection: 'row', gap: 6 },
  segItem: { flexGrow: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  segItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segTx: { fontSize: 13, fontWeight: '800', color: colors.text2 },
  segTxOn: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12 },
  swT: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  swS: { fontSize: 12, color: colors.text3, marginTop: 2, lineHeight: 16 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 11, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveTx: { color: '#fff', fontWeight: '800', fontSize: 15 },
  delBtn: { alignItems: 'center', paddingVertical: 10 },
  delTx: { color: colors.error, fontWeight: '700', fontSize: 13 },
});
