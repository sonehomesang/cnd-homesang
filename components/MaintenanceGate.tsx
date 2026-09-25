import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { isAnyAdmin } from '@/lib/adminTier';
import { isRootAdminPhone } from '@/lib/rootAdmin';
import { fetchPublicIp } from '@/lib/clientIp';
import { type AppSettings, DEFAULT_SETTINGS, watchAppSettings } from '@/lib/appSettings';
import { useTT } from '@/lib/i18n';

// Auth routes stay reachable even during maintenance — otherwise turning on
// maintenance locks EVERYONE out, admins included: a logged-out user can't sign
// in to prove they're an admin, so they can never reach the console to turn it
// back off. These screens must always render.
const ALWAYS_ON = ['/sign-in', '/forgot-password', '/set-password', '/profile-setup', '/onboarding'];
const PREVIEW_KEY = 'hs_preview_ok';

/**
 * When maintenance mode is on, everyone sees a hold screen EXCEPT:
 *  - admins / the root-owner phone (via login) — always, in every situation
 *  - the auth screens (so anyone can still sign in)
 *  - a device whose public IP is on the allowlist
 *  - a visitor who enters the preview code
 */
export default function MaintenanceGate({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  const pathname = usePathname();
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => watchAppSettings(setS), []);

  const [ip, setIp] = useState<string | null>(null);
  useEffect(() => { fetchPublicIp().then(setIp); }, []);

  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    try { if (typeof localStorage !== 'undefined' && localStorage.getItem(PREVIEW_KEY) === '1') setUnlocked(true); } catch {}
  }, []);
  const tt = useTT();

  const isAdmin = isAnyAdmin(profile) || isRootAdminPhone(profile?.phone);
  const onAuthRoute = ALWAYS_ON.some((r) => (pathname ?? '').startsWith(r));
  const ipAllowed = !!ip && (s.maintenanceAllowedIps ?? []).includes(ip);

  const tryCode = () => {
    if (s.maintenancePreviewCode && code.trim() === s.maintenancePreviewCode) {
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(PREVIEW_KEY, '1'); } catch {}
      setUnlocked(true);
    } else {
      setCodeErr(true);
    }
  };

  if (!loading && s.maintenanceMode && !isAdmin && !onAuthRoute && !ipAllowed && !unlocked) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.icon}>🛠️</Text>
        <Text style={styles.title}>{tt('maintenance','ກຳລັງ ປັບປຸງ ລະບົບ')}</Text>
        <Text style={styles.msg}>{s.maintenanceMessage}</Text>

        {!!s.maintenancePreviewCode && (
          <View style={styles.codeBox}>
            <TextInput
              value={code}
              onChangeText={(v) => { setCode(v); setCodeErr(false); }}
              placeholder={tt('maintenance','ໃສ່ ລະຫັດ preview')}
              placeholderTextColor="#9ca3af"
              secureTextEntry
              onSubmitEditing={tryCode}
              style={styles.codeInput}
            />
            <Pressable style={styles.codeBtn} onPress={tryCode}>
              <Text style={styles.codeBtnText}>{tt('maintenance','ເຂົ້າ')}</Text>
            </Pressable>
          </View>
        )}
        {codeErr && <Text style={styles.codeErr}>{tt('maintenance','ລະຫັດ ບໍ່ ຖືກຕ້ອງ')}</Text>}
        {!!ip && <Text style={styles.ipHint}>{tt('maintenance','IP ຂອງ ເຈົ້າ:')} {ip}{'\n'}{tt('maintenance','(ສົ່ງ ໃຫ້ admin ເພື່ອ ເພີ່ມ ໃນ ລາຍການ)')}</Text>}
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  icon: { fontSize: 56 },
  title: { fontSize: 15, fontWeight: '800', color: '#111' },
  msg: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
  codeBox: { flexDirection: 'row', gap: 8, marginTop: 16, width: '100%', maxWidth: 320 },
  codeInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  codeBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingHorizontal: 18, justifyContent: 'center' },
  codeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  codeErr: { color: '#dc2626', fontSize: 12 },
  ipHint: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
