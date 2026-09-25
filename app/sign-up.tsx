import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth, type Role } from '@/lib/auth-context';
import { looksLikeEmail, signUpWithEmail } from '@/lib/auth';
import { sendSignupOtp, verifySignupOtp, otpErrorMessage } from '@/lib/otp';
import { createUserProfile } from '@/lib/users';
import { watchUserGroups, type UserGroup } from '@/lib/userGroups';
import { fetchOtpProvider } from '@/lib/otpConfig';
import { type AppSettings, watchAppSettings } from '@/lib/appSettings';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow, space } from '@/lib/theme';

const LOGO = require('../assets/images/logo.png');

// account-type group key (userGroups) → primary RBAC role for a new account
const GROUP_TO_ROLE: Record<string, Role> = {
  general: 'customer',
  technician: 'technician',
  corporation: 'shop',
};

type Step = 'form' | 'otp' | 'emailSent';
type Method = 'phone' | 'email';

export default function SignUpScreen() {
  const { fbUser, profile } = useAuth();
  const tt = useTT();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [step, setStep] = useState<Step>('form');
  const [method, setMethod] = useState<Method>('phone');

  const [groupKey, setGroupKey] = useState('general');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => watchAppSettings(setSettings), []);
  // account-type options from the back-office taxonomy, minus the admin group
  useEffect(() => watchUserGroups(setGroups), []);
  const typeOptions = groups.filter((g) => g.key !== 'admin' && g.active !== false);

  // already signed in with a complete profile → no need to sign up
  useEffect(() => {
    if (fbUser && profile?.firstName) router.replace('/');
  }, [fbUser, profile]);

  const e164 = `+85620${phone}`;          // fixed +856 20 prefix + 8 subscriber digits
  const phoneValid = phone.length === 8;
  const emailValid = looksLikeEmail(email) && email.trim().length > 4;
  const nameOk = firstName.trim().length > 0 && lastName.trim().length > 0;
  const pwOk = password.length >= 6 && password === confirm;

  const validate = (): string => {
    if (!nameOk) return tt('signup', 'ໃສ່ ຊື່ ແລະ ນາມສະກຸນ');
    if (method === 'phone' && !phoneValid) return tt('signup', 'ໃສ່ ເບີ ໂທ ໃຫ້ ຄົບ 8 ຕົວ (ຫຼັງ 020)');
    if (method === 'email' && !emailValid) return tt('signup', 'ໃສ່ ອີເມວ ໃຫ້ ຖືກ ຮູບແບບ');
    if (password.length < 6) return tt('signup', 'ລະຫັດ ຜ່ານ ຢ່າງໜ້ອຍ 6 ຕົວ');
    if (password !== confirm) return tt('signup', 'ລະຫັດ ຜ່ານ ຢືນຢັນ ບໍ່ ກົງ ກັນ');
    return '';
  };

  const primaryRole = GROUP_TO_ROLE[groupKey] ?? 'customer';

  const submit = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setLoading(true); setError(''); setInfo('');
    try {
      if (method === 'phone') {
        const provider = await fetchOtpProvider();
        if (provider !== 'twilio') {
          setError(tt('signup', 'ລະບົບ OTP ຍັງ ບໍ່ ພ້ອມ — ຕິດຕໍ່ ຜູ້ ດູແລ ລະບົບ')); return;
        }
        await sendSignupOtp(e164);   // Twilio Verify → SMS (no reCAPTCHA)
        setStep('otp');
      } else {
        const cred = await signUpWithEmail(email, password);
        try { await sendEmailVerification(cred.user); } catch { /* non-fatal */ }
        await createUserProfile(cred.user.uid, {
          phone: '', email: email.trim().toLowerCase(),
          firstName: firstName.trim(), lastName: lastName.trim(),
          group: groupKey, primaryRole, language: 'lo',
        });
        setStep('emailSent');
      }
    } catch (e: any) {
      const c = e?.code ?? '';
      if (c === 'auth/email-already-in-use') setError(tt('signup', 'ອີເມວ ນີ້ ມີ ບັນຊີ ແລ້ວ — ກະລຸນາ ເຂົ້າ ສູ່ ລະບົບ'));
      else if (c === 'auth/invalid-email') setError(tt('signup', 'ອີເມວ ບໍ່ ຖືກ ຮູບແບບ'));
      else if (c === 'auth/weak-password') setError(tt('signup', 'ລະຫັດ ຜ່ານ ອ່ອນ ເກີນ (ຢ່າງໜ້ອຍ 6 ຕົວ)'));
      else setError(otpErrorMessage(e));
    } finally { setLoading(false); }
  };

  const doVerifyOtp = async () => {
    if (code.length < 4) return;
    setLoading(true); setError('');
    try {
      const { uid } = await verifySignupOtp(e164, code, password);
      await createUserProfile(uid, {
        phone: e164, firstName: firstName.trim(), lastName: lastName.trim(),
        group: groupKey, primaryRole, language: 'lo',
      });
      router.replace('/');
    } catch (e: any) {
      setError(otpErrorMessage(e));
    } finally { setLoading(false); }
  };

  const resendOtp = async () => {
    setLoading(true); setError(''); setInfo('');
    try { await sendSignupOtp(e164); setInfo(tt('signup', 'ສົ່ງ ລະຫັດ ໃໝ່ ແລ້ວ')); }
    catch (e: any) { setError(otpErrorMessage(e)); }
    finally { setLoading(false); }
  };

  const reloadEmail = async () => {
    setLoading(true); setError(''); setInfo('');
    try {
      await auth.currentUser?.reload();
      if (auth.currentUser?.emailVerified) router.replace('/');
      else setInfo(tt('signup', 'ຍັງ ບໍ່ ທັນ ຢືນຢັນ — ກົດ ລິ້ງ ໃນ ອີເມວ ກ່ອນ'));
    } finally { setLoading(false); }
  };

  const resendEmail = async () => {
    setLoading(true); setError(''); setInfo('');
    try { if (auth.currentUser) { await sendEmailVerification(auth.currentUser); setInfo(tt('signup', 'ສົ່ງ ລິ້ງ ຢືນຢັນ ໃໝ່ ແລ້ວ')); } }
    catch { setError(tt('signup', 'ສົ່ງ ບໍ່ ສຳເລັດ — ລອງ ໃໝ່')); }
    finally { setLoading(false); }
  };

  const Header = (
    <>
      <Image source={settings?.logoUrl ? { uri: settings.logoUrl } : LOGO} style={styles.logo} resizeMode="contain" />
      <Text style={styles.wordmark}><Text style={styles.wmB}>ໂຮມ</Text><Text style={styles.wmO}>ຊ່າງ</Text></Text>
    </>
  );

  // ── email-sent confirmation ────────────────────────────────────────────────
  if (step === 'emailSent') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          {Header}
          <Text style={styles.bigIcon}>✉️</Text>
          <Text style={styles.h2}>{tt('signup', 'ຢືນຢັນ ອີເມວ ຂອງ ທ່ານ')}</Text>
          <Text style={styles.sub}>{tt('signup', 'ສົ່ງ ລິ້ງ ຢືນຢັນ ໄປ ທີ່')} {email.trim()} {tt('signup', 'ແລ້ວ — ກົດ ລິ້ງ ນັ້ນ ເພື່ອ ໃຊ້ ງານ ຄົບ')}</Text>
          {!!info && <View style={styles.infoBox}><Text style={styles.infoText}>{info}</Text></View>}
          {!!error && <View style={styles.errorBox}><Text style={styles.errorText}>❌ {error}</Text></View>}
          <Pressable style={[styles.btn, styles.btnGreen, loading && styles.btnDisabled]} disabled={loading} onPress={reloadEmail}>
            <Text style={styles.btnText}>{loading ? '...' : tt('signup', 'ຂ້ອຍ ຢືນຢັນ ແລ້ວ — ໂຫຼດ ຄືນ')}</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnOutline]} disabled={loading} onPress={resendEmail}>
            <Text style={styles.btnOutlineText}>{tt('signup', 'ສົ່ງ ລິ້ງ ອີກ ຄັ້ງ')}</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={() => router.replace('/')}>
            <Text style={styles.linkText}>{tt('signup', 'ເລີ່ມ ໃຊ້ ເລີຍ →')}</Text>
          </Pressable>
          <Text style={styles.note}>{tt('signup', 'ບັນຊີ ໃຊ້ ໄດ້ ແລ້ວ — ບາງ ຢ່າງ (ໂພສ/ຈ່າຍ) ອາດ ຕ້ອງ ຢືນຢັນ ກ່ອນ')}</Text>
        </View>
      </View>
    );
  }

  // ── OTP entry (phone signup) ───────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          {Header}
          <Text style={styles.h2}>{tt('signup', 'ໃສ່ ລະຫັດ OTP')}</Text>
          <Text style={styles.sub}>{tt('signup', 'ສົ່ງ ລະຫັດ ໄປ ທີ່')} {e164} {tt('signup', 'ຜ່ານ SMS')}</Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="······" placeholderTextColor="#ccc"
            keyboardType="number-pad" maxLength={6} editable={!loading}
            style={[styles.input, styles.codeInput]} autoFocus
          />
          {!!info && <View style={styles.infoBox}><Text style={styles.infoText}>{info}</Text></View>}
          {!!error && <View style={styles.errorBox}><Text style={styles.errorText}>❌ {error}</Text></View>}
          <Pressable style={[styles.btn, styles.btnPrimary, (code.length < 4 || loading) && styles.btnDisabled]} disabled={code.length < 4 || loading} onPress={doVerifyOtp}>
            <Text style={styles.btnText}>{loading ? tt('signup', 'ກຳລັງ ກວດ...') : tt('signup', 'ຢືນຢັນ ແລະ ສ້າງ ບັນຊີ')}</Text>
          </Pressable>
          <View style={styles.rowLinks}>
            <Pressable onPress={() => { setStep('form'); setCode(''); setError(''); }}>
              <Text style={styles.linkText}>← {tt('signup', 'ປ່ຽນ ເບີ')}</Text>
            </Pressable>
            <Pressable disabled={loading} onPress={resendOtp}>
              <Text style={styles.linkText}>{tt('signup', 'ຂໍ ລະຫັດ ໃໝ່')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── main sign-up form ──────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        {Header}
        <Text style={styles.h2}>{tt('signup', 'ສະໝັກ ສະມາຊິກ')}</Text>
        <Text style={styles.sub}>{tt('signup', 'ສ້າງ ບັນຊີ ໃໝ່ — ໃຊ້ ເບີ ໂທ ຫຼື ອີເມວ')}</Text>

        {/* 1 · account type (from DB, admin hidden) */}
        <Text style={styles.lab}>1 · {tt('signup', 'ເລືອກ ປະເພດ ຜູ້ໃຊ້ງານ')}</Text>
        <View style={styles.seg}>
          {typeOptions.map((g) => (
            <Pressable key={g.key} style={[styles.opt, groupKey === g.key && styles.optOn]} onPress={() => setGroupKey(g.key)}>
              <Text style={[styles.optText, groupKey === g.key && styles.optTextOn]}>{g.icon} {g.nameLao}</Text>
            </Pressable>
          ))}
        </View>

        {/* 2 · account details */}
        <Text style={styles.lab}>2 · {tt('signup', 'ຂໍ້ມູນ ບັນຊີ')}</Text>
        <View style={styles.row2}>
          <TextInput value={firstName} onChangeText={setFirstName} placeholder={tt('signup', 'ຊື່')} placeholderTextColor="#999" editable={!loading} style={[styles.input, styles.col]} />
          <TextInput value={lastName} onChangeText={setLastName} placeholder={tt('signup', 'ນາມສະກຸນ')} placeholderTextColor="#999" editable={!loading} style={[styles.input, styles.col]} />
        </View>

        <View style={styles.tog}>
          <Pressable style={[styles.togItem, method === 'phone' && styles.togOn]} onPress={() => setMethod('phone')}>
            <Text style={[styles.togText, method === 'phone' && styles.togTextOn]}>📱 {tt('signup', 'ເບີ ໂທ')}</Text>
          </Pressable>
          <Pressable style={[styles.togItem, method === 'email' && styles.togOn]} onPress={() => setMethod('email')}>
            <Text style={[styles.togText, method === 'email' && styles.togTextOn]}>✉️ {tt('signup', 'ອີເມວ')}</Text>
          </Pressable>
        </View>

        {method === 'phone' ? (
          <View style={[styles.phoneRow, { marginTop: 8 }]}>
            <View style={styles.phonePrefix}><Text style={styles.phonePrefixText}>+856 20</Text></View>
            <TextInput
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 8))}
              placeholder="XXXXXXXX" placeholderTextColor="#999"
              keyboardType="number-pad" maxLength={8} editable={!loading}
              style={[styles.input, styles.phoneInput]}
            />
          </View>
        ) : (
          <TextInput value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor="#999" keyboardType="email-address" autoCapitalize="none" editable={!loading} style={[styles.input, { marginTop: 8 }]} />
        )}

        <View style={[styles.pwRow, { marginTop: 8 }]}>
          <TextInput value={password} onChangeText={setPassword} placeholder={tt('signup', 'ລະຫັດ ຜ່ານ (≥6 ຕົວ)')} placeholderTextColor="#999" secureTextEntry={!showPw} editable={!loading} style={[styles.input, styles.pwInput]} />
          <Pressable style={styles.pwToggle} onPress={() => setShowPw((s) => !s)}>
            <Text style={{ fontSize: 16 }}>{showPw ? '🙈' : '👁'}</Text>
          </Pressable>
        </View>
        <TextInput value={confirm} onChangeText={setConfirm} placeholder={tt('signup', 'ຢືນຢັນ ລະຫັດ ຜ່ານ')} placeholderTextColor="#999" secureTextEntry={!showPw} editable={!loading} style={[styles.input, { marginTop: 8 }]} />

        {!!error && <View style={styles.errorBox}><Text style={styles.errorText}>❌ {error}</Text></View>}

        <Pressable style={[styles.btn, styles.btnPrimary, loading && styles.btnDisabled]} disabled={loading} onPress={submit}>
          <Text style={styles.btnText}>{loading ? tt('signup', 'ກຳລັງ ດຳເນີນ...') : tt('signup', 'ສ້າງ ບັນຊີ →')}</Text>
        </Pressable>

        <View style={styles.hint}>
          <Text style={styles.hintText}>
            {method === 'phone'
              ? tt('signup', '🔒 ສົ່ງ OTP ຢືນຢັນ ຜ່ານ Twilio SMS (ບໍ່ ມີ CAPTCHA)')
              : tt('signup', '🔒 ສົ່ງ ລິ້ງ ຢືນຢັນ (verify) ໄປ ກ່ອງ ຈົດໝາຍ ຂອງ ທ່ານ')}
          </Text>
        </View>

        <Pressable style={styles.linkBtn} onPress={() => router.replace('/sign-in' as any)}>
          <Text style={styles.linkText}>{tt('signup', 'ມີ ບັນຊີ ແລ້ວ?')} <Text style={styles.linkStrong}>{tt('signup', 'ເຂົ້າ ສູ່ ລະບົບ')}</Text></Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 8, paddingBottom: 48, alignItems: 'center' },
  card: { backgroundColor: colors.surface, padding: 24, borderRadius: radius.xl, width: '100%', maxWidth: 440, gap: 2, ...shadow.card },
  logo: { width: 56, height: 56, alignSelf: 'center', marginTop: 4 },
  wordmark: { fontSize: font.xxl, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center', marginBottom: 4 },
  wmB: { color: colors.primary },
  wmO: { color: colors.secondary },
  h2: { fontSize: font.lg, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 2 },
  sub: { fontSize: font.xs, color: colors.text2, textAlign: 'center', marginBottom: 6 },
  bigIcon: { fontSize: 44, textAlign: 'center', marginTop: 8 },
  lab: { fontSize: font.xs, color: colors.text2, fontWeight: '700', marginTop: space.md, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: font.md, color: colors.text, backgroundColor: colors.surface },
  phoneRow: { flexDirection: 'row', gap: 8 },
  phonePrefix: { paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  phonePrefixText: { fontSize: font.sm, color: colors.text2, fontWeight: '700' },
  phoneInput: { flex: 1, letterSpacing: 2 },
  codeInput: { fontSize: 15, letterSpacing: 10, textAlign: 'center', fontWeight: '700', marginTop: 12 },
  row2: { flexDirection: 'row', gap: space.sm },
  col: { flex: 1 },
  seg: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  opt: { flexGrow: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', backgroundColor: colors.surface },
  optOn: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  optText: { fontSize: font.xs, fontWeight: '700', color: colors.text2 },
  optTextOn: { color: colors.primary },
  tog: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.md, padding: 4, marginTop: 10 },
  togItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  togOn: { backgroundColor: colors.surface, ...shadow.card },
  togText: { fontSize: font.sm, fontWeight: '700', color: colors.text2 },
  togTextOn: { color: colors.primary },
  pwRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  pwInput: { flex: 1 },
  pwToggle: { paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface2 },
  btn: { paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: space.md },
  btnPrimary: { backgroundColor: colors.primary },
  btnGreen: { backgroundColor: '#0a7d33' },
  btnOutline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: colors.white, fontSize: font.md, fontWeight: '800' },
  btnOutlineText: { color: colors.primary, fontSize: font.md, fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  linkText: { color: colors.text2, fontSize: font.sm },
  linkStrong: { color: colors.primary, fontWeight: '800' },
  rowLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 4 },
  hint: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: radius.md, padding: 10, marginTop: 10 },
  hintText: { fontSize: font.xs, color: '#166534', lineHeight: 18 },
  note: { fontSize: 12, color: '#9aa4b2', marginTop: 10, textAlign: 'center', lineHeight: 17 },
  infoBox: { marginTop: 10, padding: 10, backgroundColor: '#eff6ff', borderRadius: radius.md, borderWidth: 1, borderColor: '#bfdbfe' },
  infoText: { color: colors.primary, fontSize: font.sm },
  errorBox: { marginTop: 10, padding: 12, backgroundColor: '#FEE2E2', borderRadius: radius.md, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: colors.error, fontSize: font.sm },
});
