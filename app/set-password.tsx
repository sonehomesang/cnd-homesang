import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { setOrUpdatePassword, hasPasswordSet } from '@/lib/auth';
import { isAnyAdmin } from '@/lib/adminTier';
import { useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';

export default function SetPasswordScreen() {
  const { fbUser, profile, needsProfileSetup, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const tt = useTT();

  useEffect(() => {
    if (!loading && !fbUser) {
      router.replace('/sign-in');
    }
  }, [fbUser, loading]);

  const nextScreen = () =>
    needsProfileSetup
      ? router.replace('/profile-setup' as any)
      : router.replace(profile && isAnyAdmin(profile) ? ('/admin' as any) : '/');

  const save = async () => {
    if (!fbUser) return;
    if (password.length < 6) {
      setError(tt('setPassword','ລະຫັດຜ່ານຕ້ອງມີ 6 ໂຕຂຶ້ນໄປ'));
      return;
    }
    if (password !== confirm) {
      setError(tt('setPassword','ລະຫັດຜ່ານບໍ່ກົງກັນ'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await setOrUpdatePassword(fbUser, password);
      nextScreen();
    } catch (e: any) {
      console.error('setPassword:', e);
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    nextScreen();
  };

  const strength = (() => {
    if (password.length === 0) return null;
    if (password.length < 6) return { label: tt('setPassword','ສັ້ນເກີນ'), color: '#dc2626', width: '20%' };
    if (password.length < 10) return { label: tt('setPassword','ປານກາງ'), color: '#f59e0b', width: '60%' };
    return { label: tt('setPassword','ດີ'), color: '#10b981', width: '100%' };
  })();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{tt('setPassword','ຕັ້ງລະຫັດຜ່ານ')}</Text>
        <Text style={styles.subtitle}>
          {tt('setPassword','ໃຊ້ ລະຫັດ ຜ່ານ ນີ້ ເຂົ້າ ລະບົບ ຄັ້ງ ຕໍ່ ໄປ')}
          {'\n'}
          Used to sign in next time
        </Text>

        {fbUser && hasPasswordSet(fbUser) && (
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>
              {tt('setPassword','⚠️ ເຈົ້າມີລະຫັດຜ່ານແລ້ວ — ການບັນທຶກຈະ replace ລະຫັດເກົ່າ')}
            </Text>
          </View>
        )}

        <Text style={styles.label}>
          {tt('setPassword','ລະຫັດຜ່ານໃໝ່')}
        </Text>
        <View style={styles.pwRow}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={tt('setPassword','ຢ່າງໜ້ອຍ 6 ໂຕ')}
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            editable={!saving}
            style={[styles.input, styles.pwInput]}
          />
          <Pressable
            style={styles.pwToggle}
            onPress={() => setShowPassword((s) => !s)}>
            <Text style={styles.pwToggleText}>{showPassword ? '🙈' : '👁'}</Text>
          </Pressable>
        </View>
        {strength && (
          <>
            <View style={styles.strengthBg}>
              <View
                style={[
                  styles.strengthBar,
                  { backgroundColor: strength.color, width: strength.width as any },
                ]}
              />
            </View>
            <Text style={[styles.strengthText, { color: strength.color }]}>
              {strength.label}
            </Text>
          </>
        )}

        <Text style={styles.label}>{tt('setPassword','ຢືນຢັນລະຫັດຜ່ານ')}</Text>
        <View style={styles.pwRow}>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder={tt('setPassword','ໃສ່ຄືນ')}
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            editable={!saving}
            style={[styles.input, styles.pwInput]}
          />
          <Pressable
            style={styles.pwToggle}
            onPress={() => setShowPassword((s) => !s)}>
            <Text style={styles.pwToggleText}>{showPassword ? '🙈' : '👁'}</Text>
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.btn,
            (password.length < 6 || password !== confirm || saving) &&
              styles.btnDisabled,
          ]}
          disabled={password.length < 6 || password !== confirm || saving}
          onPress={save}>
          <Text style={styles.btnText}>
            {saving ? tt('setPassword','ກຳລັງບັນທຶກ...') : tt('setPassword','ບັນທຶກ + ສືບຕໍ່')}
          </Text>
        </Pressable>

        <Pressable style={styles.btnLink} onPress={skip} disabled={saving}>
          <Text style={styles.btnLinkText}>
            {tt('setPassword','ຂ້າມ ໄປ ກ່ອນ')}
          </Text>
        </Pressable>

        {error !== '' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>❌ {error}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#fff',
    padding: 28,
    borderRadius: 10,
    width: '100%',
    maxWidth: 440,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
  },
  noticeBox: {
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  noticeText: { color: '#92400e', fontSize: 12 },
  label: { fontSize: 12, color: '#4b5563', marginTop: 14, marginBottom: 6 },
  labelEn: { color: '#9ca3af', fontWeight: 'normal' },
  pwRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pwInput: { flex: 1 },
  pwToggle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  pwToggleText: { fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 11,
    fontSize: 14,
    color: '#111',
    backgroundColor: '#fff',
  },
  strengthBg: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  strengthBar: { height: '100%' },
  strengthText: { fontSize: 12, marginTop: 4 },
  btn: {
    backgroundColor: colors.primary,
    padding: 13,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  btnDisabled: { backgroundColor: '#A8CAEE' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  btnLink: { padding: 10, alignItems: 'center' },
  btnLinkText: { color: '#6b7280', fontSize: 12 },
  errorBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fee',
    borderRadius: 8,
  },
  errorText: { color: '#c00', fontSize: 12 },
});
