import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { watchAllUsers, type AdminUser } from '@/lib/admin';
import {
  type TechApplication,
  approveTechApplication,
  finalizeTechAssessment,
  rejectTechApplication,
  setTechListed,
  setTechVerified,
  watchTechApplications,
} from '@/lib/techOnboarding';
import { saveAppSettings, useAppSettings } from '@/lib/appSettings';
import TechAssessmentModal, { type AssessDecision } from '@/components/admin/TechAssessmentModal';
import TechQuizBuilder from '@/components/admin/TechQuizBuilder';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';

const P = 'admTechVerify';

export default function TechVerifyPanel() {
  const { canEdit } = useSectionPerms('techverify');
  const tt = useTT();
  const settings = useAppSettings();
  const mode = (settings as any)?.techApprovalMode === 'review' ? 'review' : 'auto';
  const [apps, setApps] = useState<TechApplication[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => watchTechApplications(setApps), []);
  useEffect(() => watchAllUsers(setUsers), []);

  // technicians still needing attention: not verified, OR held (techListed===false)
  const pendingTechs = useMemo(() => users.filter((u) => {
    const roles = (u as any).roles ?? [];
    if (!roles.includes('technician')) return false;
    const verified = (u as any).verified === true;
    const held = (u as any).techListed === false;
    return !verified || held;
  }), [users]);

  const nameOf = (u: any) => u?.name || [u?.firstName, u?.lastName].filter(Boolean).join(' ') || tt(P, 'ຊ່າງ');

  const [assess, setAssess] = useState<{ uid: string; name: string; kind: 'app' | 'tech' } | null>(null);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);

  const onApprove = (d: AssessDecision) => {
    if (!assess) return;
    if (assess.kind === 'app') approveTechApplication(assess.uid, d).catch((e) => console.error(e));
    else finalizeTechAssessment(assess.uid, d).catch((e) => console.error(e));
    setAssess(null);
  };
  const onReject = () => {
    if (!assess) return;
    if (assess.kind === 'app') rejectTechApplication(assess.uid).catch(() => {});
    setAssess(null);
  };

  return (
    <View>
      <Text style={styles.title}>🧑‍🔧 {tt(P, 'ຮັບ + ຢືນ ຢັນ ຊ່າງ')}</Text>
      <Text style={styles.sub}>{tt(P, 'ອະນຸ ມັດ ໃບ ສະໝັກ + ຢືນ ຢັນ ຕົວ ຕົນ ຊ່າງ')}</Text>

      {/* mode toggle */}
      <View style={styles.modeBar}>
        <View style={styles.modeRow}>
          <Text style={styles.modeK}>⚙️ {tt(P, 'ໂໝດ ຮັບ ຊ່າງ ໃໝ່')}</Text>
          <View style={styles.seg}>
            <Pressable style={[styles.segBtn, mode === 'auto' && styles.segOn]} disabled={!canEdit} onPress={() => saveAppSettings({ techApprovalMode: 'auto' } as any)}><Text style={[styles.segT, mode === 'auto' && styles.segTOn]}>{tt(P, 'ປະກົດ ທັນ ທີ')}</Text></Pressable>
            <Pressable style={[styles.segBtn, mode === 'review' && styles.segOn]} disabled={!canEdit} onPress={() => saveAppSettings({ techApprovalMode: 'review' } as any)}><Text style={[styles.segT, mode === 'review' && styles.segTOn]}>{tt(P, 'ລໍ ອະນຸ ມັດ')}</Text></Pressable>
          </View>
        </View>
        <Text style={styles.modeHint}>{mode === 'auto'
          ? tt(P, 'ຊ່າງ ທີ່ ຕັ້ງ ໂປຣ ໄຟລ ຄົບ ປະກົດ ໃນ ໜ້າ ຫາ ຊ່າງ ທັນ ທີ (ຍັງ ບໍ່ ມີ badge) · admin ຕິດ badge ພາຍ ຫຼັງ')
          : tt(P, 'ຊ່າງ ໃໝ່ ຖືກ ເຊື່ອງ ຈົນ admin ກົດ ເປີດ ໃຊ້ / ຢືນ ຢັນ ກ່ອນ')}</Text>
      </View>

      {/* assessment config (admin-defined criteria + pass bar + tiers) */}
      <Pressable style={styles.cfgToggle} onPress={() => setCfgOpen((v) => !v)}>
        <Text style={styles.cfgToggleT}>⚙️ {tt(P, 'ຕັ້ງ ຄ່າ ການ ປະ ເມີນ (checklist · ເກນ · tier)')} {cfgOpen ? '▲' : '▼'}</Text>
      </Pressable>
      {cfgOpen && <AssessConfigEditor canEdit={canEdit} tt={tt} settings={settings as any} />}

      <Pressable style={styles.cfgToggle} onPress={() => setQuizOpen((v) => !v)}>
        <Text style={styles.cfgToggleT}>📝 {tt(P, 'ຄັງ ຂໍ້ ທົດ ສอບ (quiz)')} {quizOpen ? '▲' : '▼'}</Text>
      </Pressable>
      {quizOpen && <TechQuizBuilder />}

      {/* applications */}
      <Text style={styles.section}>📥 {tt(P, 'ໃບ ສະໝັກ ໃໝ່')} ({apps.length})</Text>
      {apps.length === 0 && <Text style={styles.empty}>{tt(P, 'ບໍ່ ມີ ໃບ ສະໝັກ ລໍ ຢູ່')}</Text>}
      {apps.map((a) => (
        <View key={a.uid} style={styles.row}>
          <View style={styles.head}>
            <View style={styles.avatar}><Text style={styles.avatarT}>🧑‍🔧</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{a.name || tt(P, 'ຜູ້ ສະໝັກ')}</Text>
              <Text style={styles.meta}>{a.subType || '—'}{a.years ? ` · ${a.years} ${tt(P, 'ປີ')}` : ''}{a.address ? ` · ${a.address}` : ''}</Text>
            </View>
            <Text style={styles.statePending}>{tt(P, 'ລໍ ອະນຸ ມັດ')}</Text>
          </View>
          {!!a.roleDescription && <Text style={styles.desc}>{a.roleDescription}</Text>}
          {!!a.specialties?.length && <View style={styles.tags}>{a.specialties.map((s, i) => <Text key={i} style={styles.tag}>{s}</Text>)}</View>}
          {(!!a.portfolio?.length || !!a.idDocs?.length) && (
            <View style={styles.docs}>
              {(a.idDocs ?? []).slice(0, 3).map((u, i) => <View key={'id' + i} style={styles.docWrap}><Image source={{ uri: u }} style={styles.doc} /><Text style={styles.docTag}>🪪</Text></View>)}
              {(a.portfolio ?? []).slice(0, 4).map((u, i) => <Image key={'p' + i} source={{ uri: u }} style={styles.doc} />)}
            </View>
          )}
          {canEdit && (
            <View style={styles.acts}>
              <Pressable style={[styles.act, styles.verify]} onPress={() => setAssess({ uid: a.uid, name: a.name || tt(P, 'ຜູ້ ສະໝັກ'), kind: 'app' })}><Text style={styles.actT}>📋 {tt(P, 'ປະ ເມີນ 3 ຂັ້ນ')}</Text></Pressable>
              <Pressable style={[styles.act, styles.open]} onPress={() => approveTechApplication(a.uid, { verify: false })}><Text style={[styles.actT, styles.openT]}>{tt(P, 'ເປີດ ໄວ (ບໍ່ ຢືນ ຢັນ)')}</Text></Pressable>
              <Pressable style={[styles.act, styles.reject]} onPress={() => rejectTechApplication(a.uid)}><Text style={[styles.actT, styles.rejectT]}>{tt(P, 'ປະ ຕິ ເສດ')}</Text></Pressable>
            </View>
          )}
        </View>
      ))}

      {/* technicians needing verify / open */}
      <Text style={styles.section}>🕓 {tt(P, 'ຊ່າງ ລໍ ຢືນ ຢັນ / ເປີດ')} ({pendingTechs.length})</Text>
      {pendingTechs.length === 0 && <Text style={styles.empty}>{tt(P, 'ຊ່າງ ທັງ ໝົດ ຢືນ ຢັນ ແລ້ວ')}</Text>}
      {pendingTechs.map((u) => {
        const held = (u as any).techListed === false;
        const verified = (u as any).verified === true;
        return (
          <View key={u.uid} style={styles.row}>
            <View style={styles.head}>
              {(u as any).image ? <Image source={{ uri: (u as any).image }} style={styles.avatarImg} /> : <View style={styles.avatar}><Text style={styles.avatarT}>🧑‍🔧</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{nameOf(u)}</Text>
                <Text style={styles.meta}>{(u as any).subType || (u as any).roleDescription || '—'}</Text>
              </View>
              <Text style={held ? styles.stateHeld : styles.stateListed}>{held ? tt(P, 'ເຊື່ອງ') : tt(P, 'ປະກົດ · ບໍ່ ຢືນ ຢັນ')}</Text>
            </View>
            {canEdit && (
              <View style={styles.acts}>
                <Pressable style={[styles.act, styles.verify]} onPress={() => setAssess({ uid: u.uid, name: nameOf(u), kind: 'tech' })}><Text style={styles.actT}>📋 {tt(P, 'ປະ ເມີນ 3 ຂັ້ນ')}</Text></Pressable>
                {held && <Pressable style={[styles.act, styles.open]} onPress={() => setTechListed(u.uid, true)}><Text style={[styles.actT, styles.openT]}>{tt(P, 'ເປີດ ໃຊ້')}</Text></Pressable>}
                {!verified
                  ? <Pressable style={[styles.act, styles.open]} onPress={() => setTechVerified(u.uid, true)}><Text style={[styles.actT, styles.openT]}>✔️ {tt(P, 'ຢືນ ຢັນ ໄວ')}</Text></Pressable>
                  : <Pressable style={[styles.act, styles.reject]} onPress={() => setTechVerified(u.uid, false)}><Text style={[styles.actT, styles.rejectT]}>{tt(P, 'ຖອນ ຢືນ ຢັນ')}</Text></Pressable>}
              </View>
            )}
          </View>
        );
      })}

      {assess && (
        <TechAssessmentModal
          visible={!!assess}
          name={assess.name}
          uid={assess.uid}
          onApprove={onApprove}
          onReject={onReject}
          onClose={() => setAssess(null)}
        />
      )}
    </View>
  );
}

// ── admin-defined assessment config (checklist criteria + standards, pass %, tiers) ──
function AssessConfigEditor({ canEdit, tt, settings }: { canEdit: boolean; tt: (p: string, s: string) => string; settings: any }) {
  const [crit, setCrit] = useState<{ id: string; label: string; standard?: string }[]>(settings?.techAssessCriteria ?? []);
  const [pass, setPass] = useState(String(settings?.techAssessPassPct ?? 70));
  const [tiers, setTiers] = useState<{ key: string; label: string }[]>(settings?.techAssessTiers ?? []);
  const [saved, setSaved] = useState(false);

  const setC = (i: number, k: 'label' | 'standard', v: string) => setCrit((cur) => cur.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
  const addC = () => setCrit((cur) => [...cur, { id: 'c' + Date.now(), label: '', standard: '' }]);
  const delC = (i: number) => setCrit((cur) => cur.filter((_, idx) => idx !== i));
  const setT = (i: number, v: string) => setTiers((cur) => cur.map((t, idx) => (idx === i ? { ...t, label: v } : t)));

  const save = () => {
    saveAppSettings({
      techAssessCriteria: crit.filter((c) => c.label.trim()),
      techAssessPassPct: Math.max(0, Math.min(100, parseInt(pass || '0', 10) || 0)),
      techAssessTiers: tiers.filter((t) => t.label.trim()),
    } as any).then(() => { setSaved(true); setTimeout(() => setSaved(false), 1500); });
  };

  return (
    <View style={styles.cfg}>
      <Text style={styles.cfgH}>{tt(P, '📋 ຂໍ້ checklist ຄຸນ ນະ ພາບ & ຄວາມ ປອດ ໄພ')}</Text>
      <Text style={styles.cfgHint}>{tt(P, 'ໃສ່ ອ້າງ ອີງ ມາດ ຕະ ຖານ ໄດ້ (ເຊັ່ນ NFPA 70E)')}</Text>
      {crit.map((c, i) => (
        <View key={c.id} style={styles.cfgRow}>
          <TextInput value={c.label} onChangeText={(v) => setC(i, 'label', v)} editable={canEdit} placeholder={tt(P, 'ຂໍ້ ກວດ')} placeholderTextColor="#999" style={[styles.cfgInput, { flex: 2 }]} />
          <TextInput value={c.standard ?? ''} onChangeText={(v) => setC(i, 'standard', v)} editable={canEdit} placeholder={tt(P, 'ມາດ ຕະ ຖານ')} placeholderTextColor="#999" style={[styles.cfgInput, { flex: 1 }]} />
          {canEdit && <Pressable onPress={() => delC(i)} hitSlop={6} style={styles.cfgDel}><Text style={styles.cfgDelT}>✕</Text></Pressable>}
        </View>
      ))}
      {canEdit && <Pressable style={styles.cfgAdd} onPress={addC}><Text style={styles.cfgAddT}>＋ {tt(P, 'ເພີ່ມ ຂໍ້')}</Text></Pressable>}

      <View style={styles.cfgRow2}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cfgLbl}>{tt(P, 'ເກນ ຜ່ານ ທົດ ສอບ (%)')}</Text>
          <TextInput value={pass} onChangeText={(v) => setPass(v.replace(/\D/g, ''))} editable={canEdit} keyboardType="number-pad" style={styles.cfgInput} />
        </View>
      </View>
      <Text style={styles.cfgLbl}>{tt(P, 'ຊື່ tier')}</Text>
      <View style={styles.cfgTiers}>
        {tiers.map((t, i) => (
          <TextInput key={t.key} value={t.label} onChangeText={(v) => setT(i, v)} editable={canEdit} style={[styles.cfgInput, { flex: 1 }]} />
        ))}
      </View>

      {canEdit && <Pressable style={styles.cfgSave} onPress={save}><Text style={styles.cfgSaveT}>{saved ? tt(P, '✓ ບັນທຶກ ແລ້ວ') : tt(P, '💾 ບັນທຶກ ຄ່າ ການ ປະ ເມີນ')}</Text></Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  modeBar: { borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 12, padding: 12, backgroundColor: '#fff' },
  modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  modeK: { fontSize: 12.5, fontWeight: '800', color: '#111' },
  seg: { flexDirection: 'row', gap: 5, backgroundColor: '#f1f5f9', borderRadius: 9, padding: 4 },
  segBtn: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 7 },
  segOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segT: { fontSize: 12, fontWeight: '800', color: '#64748b' },
  segTOn: { color: '#0066CC' },
  modeHint: { fontSize: 12, color: '#8b95a5', marginTop: 8 },
  cfgToggle: { marginTop: 12, borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 10, padding: 11, backgroundColor: '#fff' },
  cfgToggleT: { fontSize: 12.5, fontWeight: '800', color: '#0066CC' },
  cfg: { marginTop: 8, borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 12, padding: 12, backgroundColor: '#fbfcfe' },
  cfgH: { fontSize: 12.5, fontWeight: '800', color: '#111' },
  cfgHint: { fontSize: 12, color: '#8b95a5', marginTop: 2, marginBottom: 8 },
  cfgRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 },
  cfgRow2: { flexDirection: 'row', gap: 8, marginTop: 8 },
  cfgInput: { borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 8, padding: 9, fontSize: 13, color: '#111', backgroundColor: '#fff' },
  cfgDel: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  cfgDelT: { color: '#dc2626', fontWeight: '900', fontSize: 14 },
  cfgAdd: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#EAF2FB', marginTop: 2 },
  cfgAddT: { color: '#004a97', fontWeight: '800', fontSize: 12 },
  cfgLbl: { fontSize: 12, fontWeight: '700', color: '#556072', marginTop: 10, marginBottom: 4 },
  cfgTiers: { flexDirection: 'row', gap: 8 },
  cfgSave: { marginTop: 12, backgroundColor: '#0066CC', borderRadius: 9, padding: 11, alignItems: 'center' },
  cfgSaveT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  section: { fontSize: 14, fontWeight: '800', color: '#111', marginTop: 22, marginBottom: 10 },
  empty: { fontSize: 13, color: '#94a3b8', textAlign: 'center', paddingVertical: 14 },
  row: { borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 14, padding: 13, marginBottom: 10, backgroundColor: '#fff' },
  head: { flexDirection: 'row', gap: 11, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 11, backgroundColor: '#EAF2FB', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 44, height: 44, borderRadius: 11, backgroundColor: '#EAF2FB' },
  avatarT: { fontSize: 20 },
  name: { fontSize: 15, fontWeight: '800', color: '#111' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  desc: { fontSize: 12.5, color: '#374151', marginTop: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  tag: { fontSize: 12, backgroundColor: '#f1f5f9', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, color: '#475569', fontWeight: '700', overflow: 'hidden' },
  docs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  docWrap: { position: 'relative' },
  doc: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#eef2f7' },
  docTag: { position: 'absolute', top: 2, left: 2, fontSize: 12 },
  statePending: { fontSize: 12, fontWeight: '800', color: '#a86a12', backgroundColor: '#fdf3d6', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  stateHeld: { fontSize: 12, fontWeight: '800', color: '#a86a12', backgroundColor: '#fdf3d6', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  stateListed: { fontSize: 12, fontWeight: '800', color: '#004a97', backgroundColor: '#EAF2FB', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  acts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  act: { flexGrow: 1, minWidth: 110, borderRadius: 9, padding: 10, alignItems: 'center' },
  verify: { backgroundColor: '#1f9d57' },
  open: { backgroundColor: '#EAF2FB' },
  reject: { backgroundColor: '#f1f5f9' },
  actT: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  openT: { color: '#004a97' },
  rejectT: { color: '#64748b' },
});
