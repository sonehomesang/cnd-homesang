import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, radius } from '@/lib/theme';
import { usePermissions } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';
import {
  saveOtpProvider,
  saveSecureOtp,
  watchOtpProvider,
  watchSecureOtp,
  DEFAULT_OTP_TEMPLATE,
  type OtpProvider,
  type SecureOtp,
} from '@/lib/otpConfig';
import { checkOtpConnection, type OtpConfigReport } from '@/lib/otp';

export default function OtpSettingsPanel() {
  const { isSuperAdmin } = usePermissions();
  const tt = useTT();
  const [provider, setProvider] = useState<OtpProvider>('twilio');
  const [cfg, setCfg] = useState<SecureOtp>({});
  const [accountSid, setAccountSid] = useState('');
  const [messagingSid, setMessagingSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [template, setTemplate] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<'' | 'saving' | 'saved' | string>('');
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<OtpConfigReport | null>(null);
  const [checkErr, setCheckErr] = useState('');

  useEffect(() => watchOtpProvider(setProvider), []);
  useEffect(() => watchSecureOtp((c) => {
    setCfg(c);
    if (!loaded) { setAccountSid(c.twilioAccountSid ?? ''); setMessagingSid(c.twilioMessagingSid ?? ''); setTemplate(c.otpMessageTemplate ?? DEFAULT_OTP_TEMPLATE); setLoaded(true); }
  }), [loaded]);

  if (!isSuperAdmin) {
    return <Text style={styles.gate}>🔒 {tt('admOtp', 'ສະເພາະ super-admin ຈຶ່ງ ຕັ້ງ ຄ່າ OTP ໄດ້')}</Text>;
  }

  const save = async () => {
    setStatus('saving');
    try {
      await saveOtpProvider(provider);
      await saveSecureOtp({ twilioAccountSid: accountSid, twilioMessagingSid: messagingSid, twilioAuthToken: authToken || undefined, otpMessageTemplate: template });
      setAuthToken('');
      setStatus('saved');
    } catch (e: any) { setStatus('err:' + (e?.message ?? e)); }
  };

  const runCheck = async () => {
    setChecking(true); setReport(null); setCheckErr('');
    try { setReport(await checkOtpConnection()); }
    catch (e: any) { setCheckErr(e?.message ?? String(e)); }
    finally { setChecking(false); }
  };

  const twilioReady = !!(accountSid.trim() && messagingSid.trim() && (authToken.trim() || cfg.tokenSet));

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.h1}>📲 {tt('admOtp', 'ຕັ້ງຄ່າ OTP / SMS')}</Text>
      <Text style={styles.sub}>{tt('admOtp', 'ເລືອກ ແຫຼ່ງ ສົ່ງ OTP ຕອນ ສະໝັກ ດ້ວຍ ເບີ ໂທ · creds ເກັບ ແບບ ປອດໄພ (super-admin ເທົ່າ ນັ້ນ)')}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{tt('admOtp', 'ແຫຼ່ງ ສົ່ງ OTP')}</Text>
        <View style={styles.seg}>
          <Pressable style={[styles.opt, provider === 'twilio' && styles.optOn]} onPress={() => setProvider('twilio')}>
            <Text style={[styles.optText, provider === 'twilio' && styles.optTextOn]}>📨 Twilio</Text>
            <Text style={[styles.optSub, provider === 'twilio' && styles.optTextOn]}>{tt('admOtp', 'ຫຼັກ · ບໍ່ ມີ CAPTCHA')}</Text>
          </Pressable>
          <Pressable style={[styles.opt, provider === 'firebase' && styles.optOn]} onPress={() => setProvider('firebase')}>
            <Text style={[styles.optText, provider === 'firebase' && styles.optTextOn]}>🔥 Firebase</Text>
            <Text style={[styles.optSub, provider === 'firebase' && styles.optTextOn]}>{tt('admOtp', 'ສຳຮອງ · ມີ reCAPTCHA')}</Text>
          </Pressable>
        </View>
      </View>

      {provider === 'twilio' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔑 Twilio</Text>
          <Text style={styles.hint}>{tt('admOtp', 'ຈາກ Twilio Console: Account SID + Auth Token (dashboard) · Messaging Service SID (Messaging → Services) — ໃຊ້ ສົ່ງ SMS ຂໍ້ຄວາມ ລາວ')}</Text>

          <Text style={styles.label}>Account SID (AC…)</Text>
          <TextInput value={accountSid} onChangeText={setAccountSid} placeholder="ACxxxxxxxxxxxxxxxx" placeholderTextColor="#999" autoCapitalize="none" style={styles.input} />

          <Text style={styles.label}>Messaging Service SID (MG…)</Text>
          <TextInput value={messagingSid} onChangeText={setMessagingSid} placeholder="MGxxxxxxxxxxxxxxxx" placeholderTextColor="#999" autoCapitalize="none" style={styles.input} />

          <Text style={styles.label}>Auth Token {cfg.tokenSet ? tt('admOtp', '· ✅ ຕັ້ງ ແລ້ວ (ໃສ່ ໃໝ່ ເພື່ອ ປ່ຽນ)') : ''}</Text>
          <TextInput value={authToken} onChangeText={setAuthToken} placeholder={cfg.tokenSet ? tt('admOtp', '•••••••• (ຄ້າງ ໄວ້ ຖ້າ ບໍ່ ປ່ຽນ)') : 'Auth Token'} placeholderTextColor="#999" secureTextEntry autoCapitalize="none" style={styles.input} />
          <Text style={styles.note}>🔒 {tt('admOtp', 'Auth Token ເກັບ ໃນ secureConfig — ຜູ້ໃຊ້ ທົ່ວໄປ ອ່ານ ບໍ່ ໄດ້; Cloud Function ໃຊ້ ຝ່າຍ server')}</Text>

          <Text style={styles.label}>{tt('admOtp', 'ຂໍ້ຄວາມ SMS (ພິມ ພາສາ ລາວ ໄດ້ ຕາມ ໃຈ)')}</Text>
          <TextInput value={template} onChangeText={setTemplate} placeholder={DEFAULT_OTP_TEMPLATE} placeholderTextColor="#999" multiline style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} />
          <Text style={styles.note}>{tt('admOtp', '💬 ໃສ່ ')}<Text style={{ fontWeight: '800' }}>{'{code}'}</Text>{tt('admOtp', ' ບ່ອນ ທີ່ ຢາກ ໃຫ້ ເລກ 6 ຕົວ ຂຶ້ນ · ຖ້າ ບໍ່ ໃສ່ ລະບົບ ຈະ ຕໍ່ ເລກ ທ້າຍ ຂໍ້ຄວາມ ໃຫ້')}</Text>
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>{tt('admOtp', 'ຕົວຢ່າງ ທີ່ ຈະ ສົ່ງ:')}</Text>
            <Text style={styles.previewText}>{(template.trim() || DEFAULT_OTP_TEMPLATE).includes('{code}') ? (template.trim() || DEFAULT_OTP_TEMPLATE).replace(/\{code\}/g, '482913') : `${template.trim() || DEFAULT_OTP_TEMPLATE} 482913`}</Text>
          </View>

          <View style={[styles.readyRow, { backgroundColor: twilioReady ? '#dcfce7' : '#fef3c7' }]}>
            <Text style={[styles.readyText, { color: twilioReady ? '#065f46' : '#92400e' }]}>
              {twilioReady ? tt('admOtp', '✅ Twilio ພ້ອມ ໃຊ້ ງານ') : tt('admOtp', '⚠️ ຕື່ມ ໃຫ້ ຄົບ 3 ຊ່ອງ ຈຶ່ງ ໃຊ້ ໄດ້')}
            </Text>
          </View>
        </View>
      )}

      {provider === 'firebase' && (
        <View style={styles.card}>
          <Text style={styles.hint}>{tt('admOtp', 'Firebase phone auth ໃຊ້ ໄດ້ ເລີຍ (ບໍ່ ຕ້ອງ ໃສ່ creds) — ແຕ່ ມີ reCAPTCHA ຕາມ ທີ່ ທ່ານ ບໍ່ ຢາກ. ໃຊ້ ເປັນ ສຳຮອງ ເທົ່າ ນັ້ນ.')}</Text>
        </View>
      )}

      {!!status && status !== 'saving' && (
        <Text style={[styles.statusMsg, status.startsWith('err') && { color: colors.error }]}>
          {status === 'saved' ? tt('admOtp', '✅ ບັນທຶກ ແລ້ວ') : status}
        </Text>
      )}
      <Pressable style={[styles.saveBtn, status === 'saving' && { opacity: 0.6 }]} onPress={save} disabled={status === 'saving'}>
        <Text style={styles.saveBtnText}>{status === 'saving' ? tt('admOtp', 'ກຳລັງ ບັນທຶກ...') : tt('admOtp', '💾 ບັນທຶກ ຕັ້ງຄ່າ')}</Text>
      </Pressable>

      {provider === 'twilio' && (
        <>
          <Pressable style={[styles.checkBtn, checking && { opacity: 0.6 }]} onPress={runCheck} disabled={checking}>
            <Text style={styles.checkBtnText}>{checking ? tt('admOtp', 'ກຳລັງ ກວດ...') : tt('admOtp', '🔍 ກວດ ການ ເຊື່ອມຕໍ່ Twilio (ບໍ່ ສົ່ງ SMS)')}</Text>
          </Pressable>
          <Text style={styles.note}>{tt('admOtp', 'ບັນທຶກ ກ່ອນ ແລ້ວ ຈຶ່ງ ກົດ ກວດ — ມັນ ຈະ ບອກ ວ່າ ຄ່າ ໃດ ຜິດ ໂດຍ ບໍ່ ຕ້ອງ ສົ່ງ SMS')}</Text>
        </>
      )}

      {!!checkErr && <Text style={[styles.statusMsg, { color: colors.error }]}>{checkErr}</Text>}
      {report && (
        <View style={[styles.card, { borderColor: report.connection.ok ? '#16a34a' : '#f59e0b' }]}>
          <Text style={[styles.reportHead, { color: report.connection.ok ? '#065f46' : '#92400e' }]}>{report.connection.message}</Text>
          <Text style={styles.reportRow}>{report.accountSid.ok ? '✅' : '❌'} Account SID: {report.accountSid.value} {report.accountSid.ok ? '' : tt('admOtp', '(ຕ້ອງ AC…)')}</Text>
          <Text style={styles.reportRow}>{report.messagingSid.ok ? '✅' : '❌'} Messaging SID: {report.messagingSid.value} {report.messagingSid.ok ? '' : tt('admOtp', '(ຕ້ອງ MG…)')}</Text>
          <Text style={styles.reportRow}>{report.authToken.set ? '✅' : '❌'} Auth Token: {report.authToken.set ? `ຕັ້ງ ແລ້ວ (${report.authToken.len} ຕົວ)` : tt('admOtp', 'ຍັງ ບໍ່ ໄດ້ ໃສ່')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  sub: { fontSize: font.xs, color: colors.text2 },
  gate: { padding: 20, color: colors.text2, fontSize: font.sm, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, gap: 4 },
  cardTitle: { fontSize: font.md, fontWeight: '800', color: colors.text },
  hint: { fontSize: font.xs, color: colors.text2, marginBottom: 4 },
  label: { fontSize: font.xs, color: colors.text2, marginTop: 10, marginBottom: 4, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, fontSize: font.md, color: colors.text, backgroundColor: colors.surface },
  note: { fontSize: 12, color: '#9aa4b2', marginTop: 6 },
  seg: { flexDirection: 'row', gap: 10, marginTop: 6 },
  opt: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: 12, alignItems: 'center', backgroundColor: colors.surface },
  optOn: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  optText: { fontSize: font.md, fontWeight: '800', color: colors.text },
  optTextOn: { color: colors.primary },
  optSub: { fontSize: 12, color: colors.text2, marginTop: 2 },
  readyRow: { borderRadius: radius.md, padding: 10, marginTop: 12, alignItems: 'center' },
  readyText: { fontSize: font.sm, fontWeight: '800' },
  statusMsg: { fontSize: font.sm, color: '#059669', fontWeight: '600' },
  saveBtn: { backgroundColor: colors.primary, padding: 14, borderRadius: radius.md, alignItems: 'center' },
  saveBtnText: { color: colors.white, fontWeight: '800', fontSize: font.md },
  checkBtn: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, padding: 13, borderRadius: radius.md, alignItems: 'center', marginTop: 4 },
  checkBtnText: { color: colors.primary, fontWeight: '800', fontSize: font.sm },
  previewBox: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: radius.md, padding: 10, marginTop: 8 },
  previewLabel: { fontSize: 12, color: '#047857', fontWeight: '700', marginBottom: 4 },
  previewText: { fontSize: font.sm, color: '#065f46', lineHeight: 20 },
  reportHead: { fontSize: font.sm, fontWeight: '800', marginBottom: 6 },
  reportRow: { fontSize: font.xs, color: colors.text, lineHeight: 20 },
});
