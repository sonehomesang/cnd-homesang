import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import {
  applyReferral,
  ensureMyCode,
  type Referral,
  ReferralError,
  watchMyReferrals,
} from '@/lib/referrals';
import { useAppSettings } from '@/lib/appSettings';
import { inviteUrl } from '@/lib/share';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow } from '@/lib/theme';
import SharePlatforms from '@/components/SharePlatforms';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

function displayName(p: any): string {
  return p?.name || [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'ຜູ້ໃຊ້';
}
const fmt = (n: number) => (Math.round(n || 0)).toLocaleString('en-US');

export default function ReferralScreen() {
  const { fbUser, profile, loading } = useAuth();
  const tt = useTT();
  const settings = useAppSettings();
  const [code, setCode] = useState('');
  const [refs, setRefs] = useState<Referral[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState<'' | 'code' | 'link'>('');

  useEffect(() => {
    if (!fbUser) return;
    ensureMyCode(fbUser.uid).then(setCode).catch(() => {});
    return watchMyReferrals(fbUser.uid, setRefs);
  }, [fbUser]);

  const referredBy = (profile as any)?.referredBy as string | undefined;
  const rewardKip = (settings as any)?.referralRewardKip ?? 0;
  const refereeKip = (settings as any)?.referralRefereeRewardKip ?? 0;
  const link = code ? inviteUrl(code) : '';
  const shareText = tt('referral', 'ມາ ໃຊ້ ໂຮມຊ່າງ ນຳ ກັນ! ຫາ ຊ່າງ + ຊື້ ວັດສະດຸ ຄົບ ບ່ອນ ດຽວ 🏠');
  const totalEarned = refs.length * rewardKip;

  const copyTo = (what: 'code' | 'link') => {
    const val = what === 'code' ? code : link;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(val).then(() => { setCopied(what); setTimeout(() => setCopied(''), 1500); });
    }
  };

  const apply = async () => {
    if (!fbUser) return;
    setBusy(true); setMsg('');
    try {
      await applyReferral(input, fbUser.uid, displayName(profile));
      setMsg(tt('referral', '✓ ໃຊ້ລະຫັດສຳເລັດ — ຂອບໃຈ!'));
      setInput('');
    } catch (e: any) {
      setMsg('❌ ' + (e instanceof ReferralError ? e.message : e?.message ?? String(e)));
    } finally { setBusy(false); }
  };

  if (loading) return <View style={styles.center}><Text style={styles.muted}>{tt('referral', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  if (!fbUser) return <Redirect href={'/sign-in' as any} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <BackButton />

        {/* hero + rewards */}
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🎁</Text>
          <Text style={styles.heroTitle}>{tt('referral', 'ຊວນ ໝູ່ ມາ ໃຊ້ ໂຮມຊ່າງ')}</Text>
          <Text style={styles.heroSub}>{refereeKip > 0
            ? tt('referral', 'ໝູ່ ສະໝັກ ຜ່ານ ລິ້ງ ຂອງ ເຈົ້າ — ໄດ້ ລາງ ວັນ ທັງ ສອງ ຝ່າຍ!')
            : tt('referral', 'ໝູ່ ສະໝັກ ຜ່ານ ລິ້ງ ຂອງ ເຈົ້າ — ເຈົ້າ ໄດ້ ລາງ ວັນ!')}</Text>
          {(rewardKip > 0 || refereeKip > 0) && (
            <View style={styles.rewardRow}>
              <View style={styles.rewardBox}><Text style={styles.rewardK}>🙌 {tt('referral', 'ເຈົ້າ ໄດ້')}</Text><Text style={styles.rewardV}>{fmt(rewardKip)} {tt('referral', 'ກີບ')}</Text></View>
              {refereeKip > 0 && <View style={styles.rewardBox}><Text style={styles.rewardK}>🎉 {tt('referral', 'ໝູ່ ໄດ້')}</Text><Text style={styles.rewardV}>{fmt(refereeKip)} {tt('referral', 'ກີບ')}</Text></View>}
            </View>
          )}
        </View>

        {/* code + link + share */}
        <View style={styles.card}>
          <Text style={styles.cardLbl}>{tt('referral', 'ລະຫັດ ຊວນ ຂອງ ເຈົ້າ')}</Text>
          <View style={styles.codeBox}>
            <Text style={styles.code}>{code}</Text>
            <Pressable style={styles.copyBtn} onPress={() => copyTo('code')}><Text style={styles.copyText}>{copied === 'code' ? tt('referral', '✓ ກັອບ ແລ້ວ') : tt('referral', '📋 ກັອບ')}</Text></Pressable>
          </View>
          <View style={styles.linkRow}>
            <Text style={styles.linkText} numberOfLines={1}>{link}</Text>
            <Pressable style={styles.linkBtn} onPress={() => copyTo('link')}><Text style={styles.linkBtnT}>{copied === 'link' ? tt('referral', '✓') : tt('referral', 'ກັອບ ລິ້ງ')}</Text></Pressable>
          </View>
          {!!link && <SharePlatforms url={link} text={shareText} label={tt('referral', '📤 ແຊ ໄປ ໃຫ້ ໝູ່')} />}
        </View>

        {/* how it works */}
        <View style={styles.card}>
          <Text style={styles.cardLbl}>{tt('referral', 'ວິ ທີ ໄດ້ ລາງ ວັນ')}</Text>
          {[
            [tt('referral', 'ແຊ ລິ້ງ/ລະຫັດ ໃຫ້ ໝູ່'), tt('referral', 'ຜ່ານ ປຸ່ມ ຂ້າງ ເທິງ')],
            [tt('referral', 'ໝູ່ ສະໝັກ ຜ່ານ ລິ້ງ (ຫຼື ໃສ່ ລະຫັດ)'), refereeKip > 0 ? tt('referral', 'ໝູ່ ໄດ້ ເຄຣດິດ ຕ້ອນ ຮັບ ທັນ ທີ') : tt('referral', 'ນັບ ເປັນ ໝູ່ ທີ່ ເຈົ້າ ຊວນ')],
            [tt('referral', 'ເຈົ້າ ໄດ້ ລາງ ວັນ ເຂົ້າ ກະ ເປົາ'), tt('referral', 'ເບິ່ງ ໄດ້ ໃນ ໜ້າ ກະ ເປົາ ເງິນ')],
          ].map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.snum}><Text style={styles.snumT}>{i + 1}</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.stepT}>{s[0]}</Text><Text style={styles.stepD}>{s[1]}</Text></View>
            </View>
          ))}
        </View>

        {/* stats */}
        <View style={styles.statRow}>
          <View style={styles.stat}><Text style={styles.statK}>👥 {tt('referral', 'ຊວນ ໄດ້')}</Text><Text style={styles.statV}>{refs.length} {tt('referral', 'ຄົນ')}</Text></View>
          {rewardKip > 0 && <View style={styles.stat}><Text style={styles.statK}>💰 {tt('referral', 'ໄດ້ ລາງ ວັນ ລວມ')}</Text><Text style={styles.statV}>{fmt(totalEarned)} {tt('referral', 'ກີບ')}</Text></View>}
        </View>

        <Text style={styles.section}>{tt('referral', 'ໝູ່ ທີ່ ເຈົ້າ ຊວນ')} ({refs.length})</Text>
        {refs.length === 0 ? (
          <Text style={styles.muted}>{tt('referral', 'ຍັງ ບໍ່ ມີ — ແຊ ລິ້ງ ໃຫ້ ໝູ່ ເລີຍ!')}</Text>
        ) : (
          refs.map((r) => (
            <View key={r.id} style={styles.refRow}>
              <Text style={styles.refName}>👤 {r.refereeName ?? tt('referral', 'ຜູ້ໃຊ້ໃໝ່')}</Text>
              {rewardKip > 0 && <Text style={styles.refBadge}>+{fmt(rewardKip)}</Text>}
              <Text style={styles.refDate}>{new Date(r.createdAt).toLocaleDateString('lo-LA')}</Text>
            </View>
          ))
        )}

        {/* apply a friend's code (referee) */}
        {!referredBy && (
          <View style={styles.applyCard}>
            <Text style={styles.applyLabel}>🎟️ {tt('referral', 'ມີ ລະຫັດ ຊວນ ຈາກ ໝູ່ ບໍ?')}</Text>
            {refereeKip > 0 && <Text style={styles.applyHint}>{tt('referral', 'ໃສ່ ລະຫັດ ໝູ່ ຊວນ ເພື່ອ ຮັບ ເຄຣດິດ ຕ້ອນ ຮັບ')} {fmt(refereeKip)} {tt('referral', 'ກີບ (ໃສ່ ໄດ້ ຄັ້ງ ດຽວ)')}</Text>}
            <View style={styles.applyRow}>
              <TextInput value={input} onChangeText={(v) => setInput(v.toUpperCase())} placeholder={tt('referral', 'ເຊັ່ນ RABC123')} placeholderTextColor="#999" autoCapitalize="characters" style={styles.input} />
              <Pressable style={[styles.applyBtn, busy && styles.btnOff]} onPress={apply} disabled={busy}><Text style={styles.applyBtnText}>{busy ? '...' : tt('referral', 'ຮັບ')}</Text></Pressable>
            </View>
            {msg !== '' && <Text style={styles.msg}>{msg}</Text>}
          </View>
        )}
        {referredBy && <Text style={styles.referredNote}>{tt('referral', '✓ ເຈົ້າ ຖືກ ແນະນຳ ມາ ແລ້ວ')}</Text>}
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 560 },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.text3, marginTop: 6 },
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: 20, alignItems: 'center', marginTop: 6, ...shadow.card },
  heroEmoji: { fontSize: 34 },
  heroTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 6, textAlign: 'center' },
  heroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 13, marginTop: 4, textAlign: 'center' },
  rewardRow: { flexDirection: 'row', gap: 10, marginTop: 14, alignSelf: 'stretch' },
  rewardBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.lg, padding: 10, alignItems: 'center' },
  rewardK: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },
  rewardV: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginTop: 14, ...shadow.card },
  cardLbl: { fontSize: font.sm, color: colors.text2, fontWeight: '700', marginBottom: 8 },
  codeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', backgroundColor: '#EAF2FB', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  code: { fontSize: 22, fontWeight: '900', letterSpacing: 3, color: '#004a97' },
  copyBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8 },
  copyText: { color: '#fff', fontSize: font.sm, fontWeight: '700' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  linkText: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 9, fontSize: 12, color: colors.text2, backgroundColor: '#f8fafc' },
  linkBtn: { backgroundColor: '#EAF2FB', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 9 },
  linkBtnT: { color: '#004a97', fontSize: 12, fontWeight: '800' },
  step: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', marginTop: 10 },
  snum: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EAF2FB', alignItems: 'center', justifyContent: 'center' },
  snumT: { color: '#004a97', fontWeight: '900', fontSize: 13 },
  stepT: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  stepD: { fontSize: 12, color: colors.text2 },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: { flex: 1, backgroundColor: '#e7f7ee', borderWidth: 1, borderColor: '#bfe6cf', borderRadius: radius.lg, padding: 12, alignItems: 'center' },
  statK: { fontSize: 12, color: '#166534', fontWeight: '700' },
  statV: { fontSize: 15, fontWeight: '900', color: '#166534', marginTop: 2 },
  section: { fontSize: font.lg, fontWeight: '700', color: colors.text, marginTop: 22, marginBottom: 10 },
  refRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 8, ...shadow.card },
  refName: { fontSize: font.sm, fontWeight: '600', color: colors.text, flex: 1 },
  refBadge: { fontSize: 12, fontWeight: '800', color: '#166534', backgroundColor: '#e7f7ee', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  refDate: { fontSize: font.xs, color: colors.text3 },
  applyCard: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#ffd9b0', borderRadius: radius.lg, padding: 14, marginTop: 16 },
  applyLabel: { fontSize: font.sm, color: '#7c4a1e', fontWeight: '800' },
  applyHint: { fontSize: 12, color: '#7c4a1e', marginTop: 2 },
  applyRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#e5c9a8', borderRadius: radius.md, padding: 11, fontSize: font.md, color: colors.text, letterSpacing: 2, backgroundColor: '#fff' },
  applyBtn: { backgroundColor: '#E8551E', borderRadius: radius.md, paddingHorizontal: 20, justifyContent: 'center' },
  btnOff: { backgroundColor: '#f0b596' },
  applyBtnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  msg: { fontSize: font.sm, color: colors.text2, marginTop: 10 },
  referredNote: { fontSize: font.sm, color: colors.success, marginTop: 12, fontWeight: '600' },
});
