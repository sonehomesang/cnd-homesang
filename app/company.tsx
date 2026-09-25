import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import { watchSitesForOwner, type Site } from '@/lib/sites';
import {
  type Org, assignSiteToOrg, createOrg, deleteOrg, getActiveOrgId, joinOrg, removeMember, renameOrg,
  setActiveOrgId, unassignSiteFromOrg, watchMyOrgs, watchSitesForOrg,
} from '@/lib/orgs';
import BackButton from '@/components/BackButton';

export default function CompanyScreen() {
  const { fbUser } = useAuth();
  const tt = useTT();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgSites, setOrgSites] = useState<Site[]>([]);
  const [mySites, setMySites] = useState<Site[]>([]);
  const [newName, setNewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => getActiveOrgId());
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { if (!fbUser) { router.replace('/sign-in' as any); return; } return watchMyOrgs(fbUser.uid, setOrgs); }, [fbUser]);
  // multi-company: the active company is the stored choice, else the first
  const org = orgs.find((o) => o.id === activeId) ?? orgs[0] ?? null;
  const chooseOrg = (id: string) => { setActiveOrgId(id); setActiveId(id); };
  const isOwner = !!org && org.ownerId === fbUser?.uid;
  useEffect(() => { if (org) return watchSitesForOrg(org.id, setOrgSites); setOrgSites([]); }, [org?.id]);
  useEffect(() => { if (fbUser && isOwner) return watchSitesForOwner(fbUser.uid, setMySites); }, [fbUser, isOwner]);

  const assignable = useMemo(() => mySites.filter((s) => (s as any).orgId !== org?.id), [mySites, org?.id]);

  const create = async () => { if (!fbUser || !newName.trim()) return; setBusy(true); try { const id = await createOrg(newName, fbUser.uid); setNewName(''); setShowCreate(false); chooseOrg(id); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const join = async () => { if (!joinCode.trim()) return; setBusy(true); try { const r = await joinOrg(joinCode); if (r.ok) { setJoinCode(''); alert(`${tt('company', 'ເຂົ້າ ຮ່ວມ ບໍລິສັທ')}: ${r.orgName}`); } } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const copy = () => { if (org && Platform.OS === 'web' && (navigator as any)?.clipboard) { (navigator as any).clipboard.writeText(org.inviteCode); setCopied(true); setTimeout(() => setCopied(false), 1500); } };

  return (
    <View style={styles.root}>
      <View style={styles.top}><BackButton /><Text style={styles.topT}>🏢 {tt('company', 'ບໍລິສັທ / ຫຼາຍ ອາຄານ')}</Text></View>
      <ScrollView contentContainerStyle={styles.body}>
        {!org ? (
          <>
            <Text style={styles.intro}>{tt('company', 'ສ້າງ ບໍລິສັທ ເພື່ອ ຈັດ ອາຄານ ຫຼາຍ ຫຼັງ + ໃຫ້ ທີມ ເບິ່ງ ຮ່ວມ ກັນ (ໂຮງແຮມ · ໂຮງງານ · ອາພາຣ໌ຕເມນຕ໌).')}</Text>
            <View style={styles.card}>
              <Text style={styles.cardH}>🏢 {tt('company', 'ສ້າງ ບໍລິສັທ')}</Text>
              <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder={tt('company', 'ຊື່ ບໍລິສັທ')} placeholderTextColor="#9ca3af" />
              <Pressable style={[styles.btn, (busy || !newName.trim()) && { opacity: 0.5 }]} disabled={busy || !newName.trim()} onPress={create}><Text style={styles.btnTx}>{tt('company', 'ສ້າງ')}</Text></Pressable>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardH}>🔑 {tt('company', 'ເຂົ້າ ຮ່ວມ ດ້ວຍ ລະຫັດ')}</Text>
              <TextInput style={[styles.input, { letterSpacing: 3, fontWeight: '800' }]} value={joinCode} onChangeText={(t) => setJoinCode(t.toUpperCase())} placeholder="ABC123" placeholderTextColor="#9ca3af" autoCapitalize="characters" />
              <Pressable style={[styles.btn, styles.btnAlt, (busy || !joinCode.trim()) && { opacity: 0.5 }]} disabled={busy || !joinCode.trim()} onPress={join}><Text style={[styles.btnTx, { color: colors.primary }]}>{tt('company', 'ເຂົ້າ ຮ່ວມ')}</Text></Pressable>
            </View>
          </>
        ) : (
          <>
            {/* company switcher (multi-company) */}
            {(orgs.length > 1 || showCreate) && (
              <View style={styles.switchRow}>
                {orgs.map((o) => (
                  <Pressable key={o.id} style={[styles.switchChip, o.id === org.id && styles.switchChipOn]} onPress={() => chooseOrg(o.id)}>
                    <Text style={[styles.switchTx, o.id === org.id && styles.switchTxOn]} numberOfLines={1}>🏢 {o.name}</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.switchChip} onPress={() => setShowCreate((v) => !v)}>
                  <Text style={styles.switchTx}>{showCreate ? '✕' : '＋ ' + tt('company', 'ໃໝ່')}</Text>
                </Pressable>
              </View>
            )}
            {showCreate && (
              <View style={styles.card}>
                <Text style={styles.cardH}>🏢 {tt('company', 'ສ້າງ ບໍລິສັທ ໃໝ່')}</Text>
                <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder={tt('company', 'ຊື່ ບໍລິສັທ')} placeholderTextColor="#9ca3af" />
                <Pressable style={[styles.btn, (busy || !newName.trim()) && { opacity: 0.5 }]} disabled={busy || !newName.trim()} onPress={create}><Text style={styles.btnTx}>{tt('company', 'ສ້າງ')}</Text></Pressable>
                <View style={{ height: 1, backgroundColor: colors.border }} />
                <Text style={styles.cardSub}>🔑 {tt('company', 'ຫຼື ເຂົ້າ ຮ່ວມ ບໍລິສັທ ອື່ນ ດ້ວຍ ລະຫັດ')}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[styles.input, { flex: 1, letterSpacing: 2, fontWeight: '800' }]} value={joinCode} onChangeText={(t) => setJoinCode(t.toUpperCase())} placeholder="ABC123" placeholderTextColor="#9ca3af" autoCapitalize="characters" />
                  <Pressable style={[styles.btn, styles.btnAlt, (busy || !joinCode.trim()) && { opacity: 0.5 }]} disabled={busy || !joinCode.trim()} onPress={join}><Text style={[styles.btnTx, { color: colors.primary }]}>{tt('company', 'ເຂົ້າ ຮ່ວມ')}</Text></Pressable>
                </View>
              </View>
            )}

            {/* org card */}
            <View style={styles.card}>
              <View style={styles.orgHead}>
                <Text style={styles.orgName}>🏢 {org.name}</Text>
                {isOwner && <Text style={styles.ownerTag}>{tt('company', 'ເຈົ້າ ຂອງ')}</Text>}
              </View>
              <Text style={styles.orgMeta}>👥 {org.memberUids.length} {tt('company', 'ຄົນ')} · 🏠 {orgSites.length} {tt('company', 'ອາຄານ')}</Text>
              {isOwner && (
                <View style={styles.codeBox}>
                  <View style={{ flex: 1 }}><Text style={styles.codeLbl}>{tt('company', 'ລະຫັດ ເຊີນ ທີມ')}</Text><Text style={styles.code}>{org.inviteCode}</Text></View>
                  {Platform.OS === 'web' && <Pressable style={styles.copyBtn} onPress={copy}><Text style={styles.copyTx}>{copied ? `✓ ${tt('company', 'ກ໊ອບປີ້')}` : `📋 ${tt('company', 'ກ໊ອບປີ້')}`}</Text></Pressable>}
                </View>
              )}
            </View>

            {/* vendor pool + RFQ */}
            <Pressable style={styles.navBtn} onPress={() => router.push('/vendors' as any)}>
              <Text style={styles.navIcon}>🤝</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.navT}>{tt('company', 'ຊ່າງ ປະຈຳ & RFQ')}</Text>
                <Text style={styles.navSub}>{tt('company', 'ລາຍຊື່ ຊ່າງ ໄວ້ ໃຈ + ຂໍ ໃບ ສະເໜີ ຫຼາຍ ຮ້ານ ພ້ອມ ກັນ')}</Text>
              </View>
              <Text style={styles.go}>›</Text>
            </Pressable>

            {/* business invoicing + credit */}
            <Pressable style={styles.navBtn} onPress={() => router.push('/billing' as any)}>
              <Text style={styles.navIcon}>🧾</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.navT}>{tt('company', 'ໃບ ບິນ & ເຄຣດິຕ')}</Text>
                <Text style={styles.navSub}>{tt('company', 'ອອກ ໃບ ບິນ · ວົງ ເງິນ ເຄຣດິຕ · ຄ່າ ໃຊ້ ຈ່າຍ ຕໍ່ ອາຄານ')}</Text>
              </View>
              <Text style={styles.go}>›</Text>
            </Pressable>

            {/* buildings */}
            <View style={styles.secHead}><Text style={styles.secT}>🏠 {tt('company', 'ອາຄານ ຂອງ ບໍລິສັທ')}</Text>{isOwner && <Pressable onPress={() => setAssignOpen((v) => !v)}><Text style={styles.link}>＋ {tt('company', 'ເພີ່ມ')}</Text></Pressable>}</View>
            {isOwner && assignOpen && (
              <View style={styles.card}>
                <Text style={styles.cardSub}>{tt('company', 'ເລືອກ ອາຄານ ຂອງ ຂ້ອຍ ເຂົ້າ ບໍລິສັທ:')}</Text>
                {assignable.length === 0 ? <Text style={styles.noneTx}>{tt('company', 'ບໍ່ ມີ — ໄປ ລົງ ທະບຽນ ອາຄານ ກ່ອນ (ໜ້າ "ອາຄານ ຂອງ ຂ້ອຍ")')}</Text> : assignable.map((s) => (
                  <Pressable key={s.id} style={styles.assignRow} onPress={() => assignSiteToOrg(s.id, org.id).catch(() => {})}>
                    <Text style={styles.assignN} numberOfLines={1}>📍 {s.name}</Text><Text style={styles.assignAdd}>＋</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {orgSites.length === 0 ? (
              <View style={styles.card}><Text style={styles.noneTx}>{tt('company', 'ຍັງ ບໍ່ ມີ ອາຄານ ໃນ ບໍລິສັທ')}</Text></View>
            ) : orgSites.map((s) => (
              <Pressable key={s.id} style={styles.bRow} onPress={() => router.push(`/site/${s.id}` as any)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bName} numberOfLines={1}>📍 {s.name}</Text>
                  {!!s.address && <Text style={styles.bAddr} numberOfLines={1}>{s.address}</Text>}
                  <Text style={styles.bStat}>🚪 {(s.rooms?.length ?? 0)} {tt('company', 'ຫ້ອງ')}</Text>
                </View>
                {isOwner && <Pressable onPress={() => unassignSiteFromOrg(s.id).catch(() => {})} hitSlop={8} style={styles.rm}><Text style={{ color: colors.error }}>✕</Text></Pressable>}
                <Text style={styles.go}>›</Text>
              </Pressable>
            ))}

            {/* members (owner) */}
            {isOwner && (
              <>
                <View style={styles.secHead}><Text style={styles.secT}>👥 {tt('company', 'ທີມ')}</Text></View>
                <View style={styles.card}>
                  {org.memberUids.map((m) => (
                    <View key={m} style={styles.mRow}>
                      <Text style={styles.mUid}>{m === fbUser?.uid ? tt('company', 'ຂ້ອຍ (ເຈົ້າ ຂອງ)') : `👤 …${m.slice(-6)}`}</Text>
                      {m !== org.ownerId && <Pressable onPress={() => removeMember(org.id, m).catch(() => {})} hitSlop={6}><Text style={styles.mRm}>{tt('company', 'ເອົາ ອອກ')}</Text></Pressable>}
                    </View>
                  ))}
                  <Text style={styles.hint}>{tt('company', 'ໃຫ້ ທີມ ໃສ່ ລະຫັດ ເຊີນ ຂ້າງເທິງ ໃນ ໜ້າ ນີ້ ເພື່ອ ເຂົ້າ ຮ່ວມ')}</Text>
                </View>
                <Pressable style={styles.delBtn} onPress={async () => { if (confirm(tt('company', 'ລຶບ ບໍລິສັທ? ອາຄານ ຈະ ບໍ່ ຖືກ ລຶບ'))) await deleteOrg(org.id).catch(() => {}); }}>
                  <Text style={styles.delTx}>🗑 {tt('company', 'ລຶບ ບໍລິສັທ')}</Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  topT: { fontSize: 15, fontWeight: '800', color: colors.text },
  body: { padding: 12, paddingBottom: 60, gap: 12 },
  intro: { fontSize: 13, color: colors.text2, lineHeight: 19, backgroundColor: '#e7f0fb', borderRadius: 10, padding: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 10 },
  cardH: { fontSize: 15, fontWeight: '800', color: colors.text },
  cardSub: { fontSize: 12.5, color: colors.text2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnAlt: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  btnTx: { color: '#fff', fontWeight: '800', fontSize: 14 },
  orgHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orgName: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  ownerTag: { fontSize: 12, fontWeight: '800', color: '#1f9d57', backgroundColor: '#e2f6ea', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' },
  orgMeta: { fontSize: 13, color: colors.text2, fontWeight: '600' },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface2, borderRadius: 10, padding: 12 },
  codeLbl: { fontSize: 12, color: colors.text3, fontWeight: '700' },
  code: { fontSize: 20, fontWeight: '900', color: colors.primary, letterSpacing: 3, marginTop: 2 },
  copyBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  copyTx: { color: '#fff', fontSize: 12, fontWeight: '800' },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  switchChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 13, backgroundColor: colors.surface, maxWidth: 200 },
  switchChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  switchTx: { fontSize: 12.5, fontWeight: '800', color: colors.text2 },
  switchTxOn: { color: '#fff' },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  navIcon: { fontSize: 24 },
  navT: { fontSize: 14, fontWeight: '800', color: colors.text },
  navSub: { fontSize: 12, color: colors.text3, marginTop: 2 },
  secHead: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  secT: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  link: { fontSize: 13, fontWeight: '800', color: colors.primary },
  noneTx: { fontSize: 13, color: colors.text3, paddingVertical: 6 },
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.borderLight },
  assignN: { flex: 1, fontSize: 13.5, color: colors.text, fontWeight: '600' },
  assignAdd: { fontSize: 15, fontWeight: '900', color: colors.primary },
  bRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13 },
  bName: { fontSize: 14, fontWeight: '800', color: colors.text },
  bAddr: { fontSize: 12, color: colors.text3, marginTop: 1 },
  bStat: { fontSize: 12, color: colors.text2, marginTop: 3 },
  rm: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#fdecec', alignItems: 'center', justifyContent: 'center' },
  go: { fontSize: 20, color: colors.text3, fontWeight: '800' },
  mRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.borderLight },
  mUid: { flex: 1, fontSize: 13.5, color: colors.text },
  mRm: { fontSize: 12.5, fontWeight: '800', color: colors.error },
  hint: { fontSize: 12, color: colors.text3, marginTop: 4 },
  delBtn: { alignItems: 'center', paddingVertical: 12 },
  delTx: { color: colors.error, fontWeight: '700', fontSize: 13 },
});
