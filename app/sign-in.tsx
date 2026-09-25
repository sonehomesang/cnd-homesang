import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { hasPasswordSet, signInUnified, signInWithFacebook, signInWithGoogle } from '@/lib/auth';
import { isAnyAdmin } from '@/lib/adminTier';
import { type AppSettings, watchAppSettings } from '@/lib/appSettings';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow, space } from '@/lib/theme';

const LOGO = require('../assets/images/logo.png');

// Sign IN only — password (phone or email) + social. Sign UP lives on /sign-up.
// No phone-OTP button and no reCAPTCHA here by design.
export default function SignInScreen() {
  const { fbUser, profile, needsProfileSetup } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const tt = useTT();
  // context: a login started from the CND surface passes ?next=/cnd/... — brand it
  // as the CND back-office and send the user back there after login.
  const { next } = useLocalSearchParams<{ next?: string }>();
  const isCnd = typeof next === 'string' && next.startsWith('/cnd');

  useEffect(() => watchAppSettings(setSettings), []);

  useEffect(() => {
    if (!fbUser) return;
    if (needsProfileSetup) router.replace('/profile-setup' as any);
    else if (!hasPasswordSet(fbUser) && !!fbUser.phoneNumber) router.replace('/set-password' as any);
    else if (profile) router.replace((isCnd ? next : (isAnyAdmin(profile) ? '/admin' : '/')) as any);
  }, [fbUser, profile, needsProfileSetup]);

  const doPasswordLogin = async () => {
    if (!identifier.trim() || password.length < 6) { setError(tt('signin', 'ໃສ່ ເບີໂທ/ອີເມວ + ລະຫັດຜ່ານ (ຢ່າງໜ້ອຍ 6 ຕົວ)')); return; }
    setLoading(true); setError('');
    try {
      await signInUnified(identifier, password);
    } catch (e: any) {
      const c = e?.code ?? '';
      if (c === 'auth/invalid-credential' || c === 'auth/user-not-found' || c === 'auth/wrong-password') setError(tt('signin', 'ເບີໂທ/ອີເມວ ຫຼື ລະຫັດຜ່ານ ຜິດ — ຫຼື ຍັງ ບໍ່ ມີ ບັນຊີ'));
      else if (c === 'auth/too-many-requests') setError(tt('signin', 'ລອງ ຫຼາຍ ຄັ້ງ ເກີນ — ລໍ ຈັກໜຶ່ງ'));
      else setError(e?.message ?? String(e));
    } finally { setLoading(false); }
  };

  const doSocial = async (kind: 'facebook' | 'google') => {
    setLoading(true); setError('');
    try {
      if (kind === 'facebook') await signInWithFacebook();
      else await signInWithGoogle();
    } catch (e: any) {
      const c = e?.code ?? '';
      if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') { /* user closed the popup */ }
      else if (c === 'auth/operation-not-allowed') setError(tt('signin', 'ຍັງ ບໍ່ ໄດ້ ເປີດ ໃຊ້ — ຕັ້ງຄ່າ Firebase console ກ່ອນ'));
      else if (c === 'auth/account-exists-with-different-credential') setError(tt('signin', 'ບັນຊີ ນີ້ ມີ ຢູ່ ແລ້ວ ດ້ວຍ ວິທີ ອື່ນ — ເຂົ້າ ດ້ວຍ ວິທີ ເກົ່າ'));
      else setError(e?.message ?? String(e));
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Image source={settings?.logoUrl ? { uri: settings.logoUrl } : LOGO} style={styles.logo} resizeMode="contain" />
        {isCnd ? (
          <>
            <View style={styles.cndBadge}><Text style={styles.cndBadgeTx}>🔧 CND-HomeSang</Text></View>
            <Text style={styles.h2}>{tt('signin', 'ເຂົ້າ ສູ່ ລະບົບ ຫຼັງ ບ້ານ CND-HomeSang')}</Text>
            <Text style={styles.welcome}>{tt('signin', 'ຮ້ານ ຄູ່ ຮ່ວມ · ໃຊ້ ບັນຊີ ໂຮມຊ່າງ ຂອງ ທ່ານ')}</Text>
          </>
        ) : (
          <>
            <Text style={styles.wordmark}><Text style={styles.wmB}>ໂຮມ</Text><Text style={styles.wmO}>ຊ່າງ</Text></Text>
            <Text style={styles.h2}>{tt('signin', 'ເຂົ້າ ສູ່ ລະບົບ')}</Text>
            <Text style={styles.welcome}>{tt('signin', 'ຍິນດີ ຕ້ອນຮັບ ກັບ ມາ')}</Text>
          </>
        )}

        <Text style={styles.label}>{tt('signin', 'ເບີໂທ ຫຼື ອີເມວ')}</Text>
        <TextInput
          value={identifier}
          onChangeText={setIdentifier}
          placeholder={tt('signin', '020xxxxxxxx  ຫຼື  you@email.com')}
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
          style={styles.input}
        />

        <Text style={styles.label}>{tt('signin', 'ລະຫັດຜ່ານ')}</Text>
        <View style={styles.pwRow}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            editable={!loading}
            style={[styles.input, styles.pwInput]}
            onSubmitEditing={doPasswordLogin}
          />
          <Pressable style={styles.pwToggle} onPress={() => setShowPassword((s) => !s)}>
            <Text style={styles.pwToggleText}>{showPassword ? '🙈' : '👁'}</Text>
          </Pressable>
        </View>

        <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, loading && styles.btnDisabled]} disabled={loading} onPress={doPasswordLogin}>
          <Text style={styles.btnText}>{loading ? tt('signin', 'ກຳລັງ ເຂົ້າ...') : tt('signin', 'ເຂົ້າສູ່ ລະບົບ')}</Text>
        </Pressable>

        <Pressable style={({ pressed }) => [styles.forgotLink, pressed && styles.linkPressed]} onPress={() => router.push('/forgot-password' as any)}>
          <Text style={styles.forgotText}>{tt('signin', 'ລືມ ລະຫັດຜ່ານ?')}</Text>
        </Pressable>

        {/* social login — icon-only (Facebook · Google) */}
        <View style={styles.divider}>
          <View style={styles.dline} />
          <Text style={styles.dtext}>{tt('signin', 'ຫຼື ເຂົ້າ ດ້ວຍ')}</Text>
          <View style={styles.dline} />
        </View>
        <View style={styles.socialRow}>
          <Pressable style={({ pressed }) => [styles.socialBtn, styles.fbBtn, pressed && styles.btnPressed, loading && styles.btnDisabled]} disabled={loading} onPress={() => doSocial('facebook')} accessibilityLabel="Facebook">
            <Text style={styles.fbIcon}>f</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.socialBtn, styles.googleBtn, pressed && styles.btnPressed, loading && styles.btnDisabled]} disabled={loading} onPress={() => doSocial('google')} accessibilityLabel="Google">
            <Text style={styles.googleIcon}>G</Text>
          </Pressable>
        </View>

        {error !== '' && <View style={styles.errorBox}><Text style={styles.errorText}>❌ {error}</Text></View>}

        {/* clear separation from sign-up */}
        <View style={styles.signupBox}>
          <Text style={styles.signupPrompt}>{tt('signin', 'ຍັງ ບໍ່ ມີ ບັນຊີ?')}</Text>
          <Pressable style={({ pressed }) => [styles.signupBtn, pressed && styles.outlinePressed]} onPress={() => router.replace('/sign-up' as any)}>
            <Text style={styles.signupBtnText}>📝 {tt('signin', 'ສະໝັກ ສະມາຊິກ')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 8, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, padding: 24, borderRadius: radius.xl, width: '100%', maxWidth: 440, gap: 2, ...shadow.card },
  logo: { width: 56, height: 56, alignSelf: 'center', marginTop: 4 },
  wordmark: { fontSize: font.xxl, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center', marginBottom: 2 },
  cndBadge: { alignSelf: 'center', backgroundColor: '#E8551E', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginTop: 6, marginBottom: 2 },
  cndBadgeTx: { color: '#fff', fontSize: font.md, fontWeight: '900', letterSpacing: 0.2 },
  wmB: { color: colors.primary },
  wmO: { color: colors.secondary },
  h2: { fontSize: font.lg, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 2 },
  welcome: { fontSize: font.xs, color: colors.text2, textAlign: 'center', marginBottom: 6 },
  label: { fontSize: font.xs, color: colors.text2, marginTop: space.md, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: font.md, color: colors.text, backgroundColor: colors.surface },
  pwRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  pwInput: { flex: 1 },
  pwToggle: { paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface2 },
  pwToggleText: { fontSize: 15 },
  btn: { backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: space.lg },
  btnPressed: { opacity: 0.55 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.white, fontSize: font.md, fontWeight: '700', textAlign: 'center' },
  forgotLink: { alignSelf: 'center', paddingVertical: 10, marginTop: 2 },
  forgotText: { color: colors.primary, fontSize: font.sm, fontWeight: '600' },
  linkPressed: { opacity: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.md },
  dline: { flex: 1, height: 1, backgroundColor: colors.border },
  dtext: { fontSize: font.xs, color: colors.text2 },
  socialRow: { flexDirection: 'row', gap: 14, justifyContent: 'center', marginTop: space.md },
  socialBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  fbBtn: { backgroundColor: '#1877F2' },
  fbIcon: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: -2 },
  googleBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  googleIcon: { color: '#4285F4', fontSize: 26, fontWeight: '800' },
  errorBox: { marginTop: space.md, padding: 12, backgroundColor: '#FEE2E2', borderRadius: radius.md, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: colors.error, fontSize: font.sm },
  signupBox: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center', gap: 8 },
  signupPrompt: { fontSize: font.sm, color: colors.text2 },
  signupBtn: { backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#16a34a', borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 12, alignItems: 'center', width: '100%' },
  outlinePressed: { backgroundColor: '#dcfce7' },
  signupBtnText: { color: '#15803d', fontSize: font.md, fontWeight: '800' },
});
