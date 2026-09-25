import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { getAdminTier } from '@/lib/adminTier';
import { useTT } from '@/lib/i18n';
import UsersPanel from './UsersPanel';
import RolesPanel from './RolesPanel';
import UserGroupsPanel from './UserGroupsPanel';

type Tab = 'users' | 'groups' | 'roles';

const ALL_TABS: { v: Tab; icon: string; label: string; superOnly: boolean }[] = [
  { v: 'users', icon: '👥', label: 'ຜູ້ໃຊ້ງານ', superOnly: false },
  { v: 'groups', icon: '👪', label: 'ປະເພດຜູ້ໃຊ້ງານ', superOnly: true },
  { v: 'roles', icon: '🛡️', label: 'ບົດບາດ & ສິດ', superOnly: true },
];

export default function UsersHubPanel() {
  const { profile } = useAuth();
  const isSuper = getAdminTier(profile) === 'super';
  const tabs = ALL_TABS.filter((t) => !t.superOnly || isSuper);
  const [tab, setTab] = useState<Tab>('users');
  const tt = useTT();

  return (
    <View>
      <Text style={styles.title}>👥 {tt('admUsers','ຜູ້ໃຊ້ງານ ແລະ ສິດທິ')}</Text>

      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {tabs.map((t) => {
            const on = t.v === tab;
            return (
              <Pressable key={t.v} style={[styles.tab, on && styles.tabOn]} onPress={() => setTab(t.v)}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.icon} {tt('admUsersHub', t.label)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View>
        {tab === 'users' ? (
          <UsersPanel />
        ) : tab === 'groups' ? (
          <UserGroupsPanel />
        ) : (
          <RolesPanel />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 12 },
  tabBar: { borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginBottom: 16 },
  tabRow: { gap: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: '#0066CC' },
  tabText: { fontSize: 13, color: '#6b7280' },
  tabTextOn: { color: '#0066CC', fontWeight: '700' },
});
