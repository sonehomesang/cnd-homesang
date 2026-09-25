import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { sendResetOtp, resetPasswordWithOtp, otpErrorMessage } from '@/lib/otp';
import { sendResetEmailLink } from '@/lib/auth';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow, space } from '@/lib/theme';

type Method = 'phone' | 'email';
type Step = 'entry' | 'code';

// Password reset — TWO ways:
//  • phone  → Twilio OTP (no reCAPTCHA), sets a new password + signs in
//  • email  → Firebase reset link to the account's real inbox
export default function ForgotPasswordScreen() {
  const [method, setMethod] = useState<Method>('phone');
  const [step, setStep] = useState<Step>('entry');   // phone flow only
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const tt = useTT();

  const fullPhone = `+85620${phone}`;
  const reset = () => { setError(''); setInfo(''); };
  const switchMethod = (m: Method) => { setMethod(m); setStep('entry'); setEmailSent(false); reset(); };

  // ── phone: send OTP ────────────────────────────────────────────────────────
  const sendPhone = async () => {
    if (phone.length !== 8) { setError(tt('forgot', 'ໃສ່ ເບີ ໂທ ໃຫ້ ຄົບ 8 ຕົວ (ຫຼັງ 020)')); return; }
    setLoading(true); reset();
    try { await sendResetOtp(fullPhone); setStep('code'); }
    catch (e: any) { setError(otpErrorMessage(e)); }
    finally { setLoading(false); }
  };
  const resendPhone = async () => {
    setLoading(true); reset();
    try { await sendResetOtp(fullPhone); setInfo(tt('forgot', 'ສົ່ງ ລະຫັດ ໃໝ່ ແລ້ວ')); }
    catch (e: any) { setError(otpErrorMessage(e)); }
    finally { setLoading(false); }
  };
  const doReset = async () => {
    if (code.length < 4) { setError(tt('forgot', 'ໃສ່ ລະຫັດ OTP')); return; }
    if (password.length < 6) { setError(tt('forgot', 'ລະຫັດ ຜ່ານ ໃໝ່ ຢ່າງໜ້ອຍ 6 ຕົວ')); return; }
    if (password !== confirm) { setError(tt('forgot', 'ລະຫັດ ຜ່ານ ຢືນຢັນ ບໍ່ ກົງ ກັນ')); return; }
    setLoading(true); reset();
    try {
      await resetPasswordWithOtp(fullPhone, code, password);
      router.replace('/'); // signed in with the new password
    } catch (e: any) { setError(otpErrorMessage(e)); }
    finally { setLoading(false); }
  };

  // ── email: send reset link ─────────────────────────────────────────────────
  const sendEmail = async () => {
    if (!email.includes('@') || email.trim().length < 5) { setError(tt('forgot', 'ໃສ່ ອີເມວ ໃຫ້ ຖືກ ຮູບແບບ')); return; }
    setLoading(true); reset();
    try { await sendResetEmailLink(email); setEmailSent(true); }
    catch (e: any) {
      const c = e?.code ?? '';
      if (c === 'auth/user-not-found') setError(tt('forgot', 'ບໍ່ ພົບ ບັນຊີ ຂອງ ອີເມວ ນີ້'));
      else if (c === 'auth/invalid-email') setError(tt('forgot', 'ອີເມວ ບໍ່ ຖືກ ຮູບແບບ'));
      else setError(e?.message ?? String(e));
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>🔑 {tt('forgot', 'ລືມ ລະຫັດຜ່ານ')}</Text>
        <Text style={styles.subtitle}>{tt('forgot', 'ຣີເຊັດ ດ້ວຍ ເບີ ໂທ (SMS) ຫຼື ອີເມວ')}</Text>

        {/* method toggle */}
        <View style={styles.tog}>
          <Pressable style={[styles.togItem, method === 'phone' && styles.togOn]} onPress={() => switchMethod('phone')}>
            <Text style={[styles.togText, method === 'phone' && styles.togTextOn]}>📱 {tt('forgot', 'ເບີ ໂທ')}</Text>
          </Pressable>
          <Pressable style={[styles.togItem, method === 'email' && styles.togOn]} onPress={() => switchMethod('email')}>
            <Text style={[styles.togText, method === 'email' && styles.togTextOn]}>✉️ {tt('forgot', 'ອີເມວ')}</Text>
          </Pressable>
        </View>

        {/* ---------- EMAIL ---------- */}
        {method === 'email' ? (
          emailSent ? (
            <>
              <Text style={styles.bigIcon}>✉️</Text>
              <Text style={styles.sentText}>{tt('forgot', 'ສົ່ງ ລິ້ງ ຣີເຊັດ ໄປ')} {email.trim()} {tt('forgot', 'ແລ້ວ — ກົດ ລິ້ງ ໃນ ອີເມວ ເພື່ອ ຕັ້ງ ລະຫັດ ໃໝ່')}</Text>
              <Pressable style={styles.btnLink} disabled={loading} onPress={sendEmail}>
                <Text style={styles.btnLinkText}>{tt('forgot', 'ສົ່ງ ລິ້ງ ອີກ ຄັ້ງ')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.label}>{tt('forgot', 'ອີເມວ')}</Text>
              <TextInput value={email} onChangeText={setEmail} placeholder="you@email.com" placeholderTextColor="#999" keyboardType="email-address" autoCapitalize="none" editable={!loading} style={styles.input} />
              <Pressable style={[styles.btn, loading && styles.btnDisabled]} disabled={loading} onPress={sendEmail}>
                <Text style={styles.btnText}>{loading ? tt('forgot', 'ກຳລັງ ສົ່ງ...') : tt('forgot', 'ສົ່ງ ລິ້ງ ຣີເຊັດ')}</Text>
              </Pressable>
            </>
          )
        ) : (
          /* ---------- PHONE ---------- */
          <>
            <Text style={styles.label}>{tt('forgot', 'ເບີ ໂທ')}</Text>
            <View style={styles.phoneRow}>
              <View style={styles.phonePrefix}><Text style={styles.phonePrefixText}>+856 20</Text></View>
              <TextInput
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 8))}
                placeholder="XXXXXXXX" placeholderTextColor="#999"
                keyboardType="number-pad" maxLength={8}
                editable={step === 'entry' && !loading}
                style={[styles.input, styles.phoneInput]}
              />
            </View>

            {step === 'entry' ? (
              <Pressable style={[styles.btn, (phone.length !== 8 || loading) && styles.btnDisabled]} disabled={phone.length !== 8 || loading} onPress={sendPhone}>
                <Text style={styles.btnText}>{loading ? tt('forgot', 'ກຳລັງ ສົ່ງ...') : tt('forgot', 'ສົ່ງ ລະຫັດ ຢືນຢັນ')}</Text>
              </Pressable>
            ) : (
              <>
                <Text style={styles.label}>{tt('forgot', 'ລະຫັດ OTP')}</Text>
                <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} placeholder="······" placeholderTextColor="#ccc" keyboardType="number-pad" maxLength={6} editable={!loading} style={[styles.input, styles.codeInput]} autoFocus />
                <Text style={styles.label}>{tt('forgot', 'ລະຫັດ ຜ່ານ ໃໝ່ (≥6 ຕົວ)')}</Text>
                <View style={styles.pwRow}>
                  <TextInput value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#999" secureTextEntry={!showPw} editable={!loading} style={[styles.input, styles.pwInput]} />
                  <Pressable style={styles.pwToggle} onPress={() => setShowPw((s) => !s)}><Text style={{ fontSize: 16 }}>{showPw ? '🙈' : '👁'}</Text></Pressable>
                </View>
                <TextInput value={confirm} onChangeText={setConfirm} placeholder={tt('forgot', 'ຢືນຢັນ ລະຫັດ ຜ່ານ ໃໝ່')} placeholderTextColor="#999" secureTextEntry={!showPw} editable={!loading} style={[styles.input, { marginTop: 8 }]} />
                <Pressable style={[styles.btn, loading && styles.btnDisabled]} disabled={loading} onPress={doReset}>
                  <Text style={styles.btnText}>{loading ? tt('forgot', 'ກຳລັງ ບັນທຶກ...') : tt('forgot', 'ຕັ້ງ ລະຫັດຜ່ານ ໃໝ່ ແລະ ເຂົ້າ ໃຊ້')}</Text>
                </Pressable>
                <Pressable style={styles.btnLink} disabled={loading} onPress={resendPhone}>
                  <Text style={styles.btnLinkText}>{tt('forgot', 'ຂໍ ລະຫັດ ໃໝ່')}</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {!!info && <View style={styles.infoBox}><Text style={styles.infoText}>{info}</Text></View>}
        {error !== '' && <View style={styles.errorBox}><Text style={styles.errorText}>❌ {error}</Text></View>}

        <Pressable style={styles.btnLink} onPress={() => router.replace('/sign-in')}>
          <Text style={styles.btnLinkText}>← {tt('forgot', 'ກັບ ໄປ ໜ້າ ເຂົ້າ ສູ່ ລະບົບ')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 8, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.surface, padding: 24, borderRadius: radius.xl, width: '100%', maxWidth: 440, ...shadow.card },
  title: { fontSize: font.lg, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: font.xs, color: colors.text2, textAlign: 'center', marginTop: 6, marginBottom: 12 },
  bigIcon: { fontSize: 44, textAlign: 'center', marginTop: 8 },
  sentText: { fontSize: font.sm, color: colors.text2, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  tog: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.md, padding: 4, marginBottom: 6 },
  togItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  togOn: { backgroundColor: colors.surface, ...shadow.card },
  togText: { fontSize: font.sm, fontWeight: '700', color: colors.text2 },
  togTextOn: { color: colors.primary },
  label: { fontSize: font.xs, color: colors.text2, marginTop: space.md, marginBottom: 6 },
  phoneRow: { flexDirection: 'row', gap: 8 },
  phonePrefix: { paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  phonePrefixText: { fontSize: font.sm, color: colors.text2, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, fontSize: font.md, color: colors.text, backgroundColor: colors.surface },
  phoneInput: { flex: 1, letterSpacing: 2 },
  codeInput: { fontSize: 15, letterSpacing: 10, textAlign: 'center', fontWeight: '700', paddingVertical: 12 },
  pwRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  pwInput: { flex: 1 },
  pwToggle: { paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface2 },
  btn: { backgroundColor: colors.primary, padding: 14, borderRadius: radius.md, alignItems: 'center', marginTop: space.md },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: colors.white, fontSize: font.md, fontWeight: '700' },
  btnLink: { padding: 10, alignItems: 'center', marginTop: 6 },
  btnLinkText: { color: colors.primary, fontSize: font.sm },
  infoBox: { marginTop: 12, padding: 10, backgroundColor: '#eff6ff', borderRadius: radius.md, borderWidth: 1, borderColor: '#bfdbfe' },
  infoText: { color: colors.primary, fontSize: font.sm },
  errorBox: { marginTop: 12, padding: 12, backgroundColor: '#FEE2E2', borderRadius: radius.md, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: colors.error, fontSize: font.sm },
});
