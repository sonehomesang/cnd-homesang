import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useT, useTT } from '@/lib/i18n';
import { type AppSettings, watchAppSettings } from '@/lib/appSettings';
import { enablePush, pushSupported } from '@/lib/push';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

// App-wide settings (language, notifications, support contact, legal). These are
// app-level concerns for every user — NOT admin functions — so they live on
// their own page reached from the ☰ menu, not buried in the profile editor.
export default function SettingsScreen() {
  const { fbUser } = useAuth();
  const t = useT();
  const tt = useTT();
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  useEffect(() => watchAppSettings(setAppSettings), []);
  const [pushState, setPushState] = useState<'idle' | 'working' | 'on' | 'error'>('idle');
  const [pushMsg, setPushMsg] = useState('');

  const turnOnPush = async () => {
    if (!fbUser) return;
    setPushState('working');
    setPushMsg('');
    try {
      const token = await enablePush(fbUser.uid, appSettings?.vapidKey ?? '');
      if (token) setPushState('on');
      else { setPushState('error'); setPushMsg(tt('settings','ບໍ່ໄດ້ token')); }
    } catch (e: any) {
      setPushState('error');
      setPushMsg(e?.message ?? String(e));
    }
  };

  const openUrl = (url: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { marginBottom: 12 }]}>{tt('settings','⚙️ ຕັ້ງຄ່າ')}</Text>

      <Text style={styles.groupLabel}>🌐 {t('profile.language')}</Text>
      <LanguageSwitcher />

      {pushSupported() && !!appSettings?.vapidKey && (
        <>
          <Text style={styles.groupLabel}>{tt('settings','🔔 ການແຈ້ງເຕືອນ')}</Text>
          <Pressable
            style={[styles.pushBtn, pushState === 'on' && styles.pushBtnOn]}
            onPress={turnOnPush}
            disabled={pushState === 'working' || pushState === 'on'}>
            <Text style={[styles.pushBtnText, pushState === 'on' && styles.pushBtnTextOn]}>
              {pushState === 'on' ? tt('settings','🔔 ເປີດແຈ້ງເຕືອນແລ້ວ') : pushState === 'working' ? '...' : tt('settings','🔔 ເປີດ ການແຈ້ງເຕືອນ')}
            </Text>
          </Pressable>
          {pushState === 'error' && <Text style={styles.pushErr}>❌ {pushMsg}</Text>}
        </>
      )}

      {!!(appSettings?.supportPhone || appSettings?.supportEmail) && (
        <>
          <Text style={styles.groupLabel}>{tt('settings','📞 ຕິດຕໍ່ ທີມງານ')}</Text>
          <View style={styles.supportBox}>
            {!!appSettings?.supportPhone && (
              <Pressable onPress={() => openUrl(`tel:${appSettings.supportPhone}`)}>
                <Text style={styles.supportLink}>📱 {appSettings.supportPhone}</Text>
              </Pressable>
            )}
            {!!appSettings?.supportEmail && (
              <Pressable onPress={() => openUrl(`mailto:${appSettings.supportEmail}`)}>
                <Text style={styles.supportLink}>✉️ {appSettings.supportEmail}</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      <View style={styles.legalRow}>
        <Pressable onPress={() => router.push('/legal/terms' as any)}>
          <Text style={styles.legalLink}>{tt('settings','ຂໍ້ກຳນົດການນຳໃຊ້')}</Text>
        </Pressable>
        <Text style={styles.legalDot}>·</Text>
        <Pressable onPress={() => router.push('/legal/privacy' as any)}>
          <Text style={styles.legalLink}>{tt('settings','ຄວາມເປັນສ່ວນຕົວ')}</Text>
        </Pressable>
      </View>
      <BackButton />
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -80 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 8, gap: 4, paddingBottom: 80, maxWidth: 640, width: '100%', alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 15, fontWeight: 'bold', color: '#111' },
  backSpacer: { width: 60 },
  groupLabel: { fontSize: 12, fontWeight: '700', color: '#0066CC', marginTop: 14, marginBottom: 2 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 },
  legalLink: { color: '#6b7280', fontSize: 12, textDecorationLine: 'underline' },
  legalDot: { color: '#9ca3af' },
  supportBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 12, marginTop: 4, alignItems: 'center', gap: 4 },
  supportLink: { fontSize: 14, color: '#0066CC', fontWeight: '600', paddingVertical: 2 },
  pushBtn: { marginTop: 4, backgroundColor: '#fff', borderWidth: 1, borderColor: '#0066CC', borderRadius: 10, padding: 12, alignItems: 'center' },
  pushBtnOn: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  pushBtnText: { color: '#0066CC', fontSize: 14, fontWeight: '600' },
  pushBtnTextOn: { color: '#065f46' },
  pushErr: { color: '#dc2626', fontSize: 12, marginTop: 6 },
});
