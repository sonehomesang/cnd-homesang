import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth, type Role } from '@/lib/auth-context';
import { createUserProfile } from '@/lib/users';
import { type UserGroup, watchUserGroups } from '@/lib/userGroups';
import { useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import AppFooter from '@/components/AppFooter';

// account-type group key (userGroups) → primary RBAC role for a new account
const GROUP_TO_ROLE: Record<string, Role> = {
  general: 'customer',
  technician: 'technician',
  corporation: 'shop',
};

export default function ProfileSetupScreen() {
  const { fbUser, profile, loading } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [groupKey, setGroupKey] = useState('general');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const tt = useTT();

  // account-type options pulled from the back-office taxonomy, minus admin
  useEffect(() => watchUserGroups(setGroups), []);
  const typeOptions = groups.filter((g) => g.key !== 'admin' && g.active !== false);

  useEffect(() => {
    if (!loading && !fbUser) {
      router.replace('/sign-in');
    } else if (profile?.firstName) {
      router.replace('/');
    }
  }, [fbUser, profile, loading]);

  const submit = async () => {
    if (!fbUser || !firstName || !lastName) return;
    setSubmitting(true);
    setError('');
    try {
      await createUserProfile(fbUser.uid, {
        phone: fbUser.phoneNumber ?? '',
        email: fbUser.email ?? undefined,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        group: groupKey,
        primaryRole: GROUP_TO_ROLE[groupKey] ?? 'customer',
        language: 'lo',
      });
      router.replace('/');
    } catch (e: any) {
      console.error('createUserProfile:', e);
      setError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>{tt('profileSetup','ກຳລັງໂຫຼດ...')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{tt('profileSetup','ສ້າງ Profile')}</Text>
        <Text style={styles.subtitle}>
          {tt('profileSetup','ຄັ້ງທຳອິດ — ບອກຂໍ້ມູນສ່ວນຕົວ')}
        </Text>

        <View style={styles.row2}>
          <View style={styles.col}>
            <Text style={styles.label}>
              {tt('profileSetup','ຊື່')}
            </Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder={tt('profileSetup','ຄຳສອນ')}
              placeholderTextColor="#999"
              style={styles.input}
              editable={!submitting}
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>
              {tt('profileSetup','ນາມສະກຸນ')}
            </Text>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder={tt('profileSetup','ແປງມະນີວົງ')}
              placeholderTextColor="#999"
              style={styles.input}
              editable={!submitting}
            />
          </View>
        </View>

        <Text style={styles.label}>
          {tt('profileSetup','ປະເພດ ຜູ້ໃຊ້ງານ')}
        </Text>
        <View style={styles.roleGrid}>
          {typeOptions.map((g) => (
            <Pressable
              key={g.key}
              style={[styles.roleCard, groupKey === g.key && styles.roleCardActive]}
              onPress={() => setGroupKey(g.key)}>
              <Text style={styles.roleIcon}>{g.icon}</Text>
              <Text style={[styles.roleTitle, groupKey === g.key && styles.roleTitleActive]}>
                {g.nameLao}
              </Text>
              {!!g.desc && <Text style={styles.roleDesc} numberOfLines={2}>{g.desc}</Text>}
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[
            styles.btn,
            (!firstName || !lastName || submitting) && styles.btnDisabled,
          ]}
          disabled={!firstName || !lastName || submitting}
          onPress={submit}>
          <Text style={styles.btnText}>
            {submitting ? tt('profileSetup','ກຳລັງບັນທຶກ...') : tt('profileSetup','ເລີ່ມໃຊ້')}
          </Text>
        </Pressable>

        {error !== '' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>❌ {error}</Text>
          </View>
        )}
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  center: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    padding: 28,
    borderRadius: 10,
    width: '100%',
    maxWidth: 680,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    color: '#4b5563',
    marginTop: 16,
    marginBottom: 6,
  },
  labelEn: {
    color: '#9ca3af',
    fontWeight: 'normal',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fff',
  },
  row2: {
    flexDirection: 'row',
    gap: 12,
  },
  col: { flex: 1 },
  roleGrid: {
    gap: 8,
    marginTop: 4,
  },
  roleCard: {
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#fff',
  },
  roleCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#EAF2FB',
  },
  roleIcon: { fontSize: 24, marginBottom: 4 },
  roleTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  roleTitleActive: { color: colors.primary },
  roleDesc: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  btn: {
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  btnDisabled: { backgroundColor: '#A8CAEE' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  errorBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fee',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fcc',
  },
  errorText: { color: '#c00', fontSize: 12 },
});
