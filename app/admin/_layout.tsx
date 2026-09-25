import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { isAnyAdmin } from '@/lib/adminTier';
import { useTT } from '@/lib/i18n';

const isAdmin = (p: any): boolean => isAnyAdmin(p);

export default function AdminLayout() {
  const { profile, loading, fbUser } = useAuth();
  const tt = useTT();

  useEffect(() => {
    if (loading) return;
    if (!fbUser) router.replace('/sign-in');
    else if (profile && !isAdmin(profile)) router.replace('/');
  }, [profile, loading, fbUser]);

  if (loading || !profile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <Text>{tt('admLayout','ກຳລັງໂຫຼດ...')}</Text>
      </View>
    );
  }
  if (!isAdmin(profile)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 }}>
        <Text style={{ color: '#c00', fontSize: 16 }}>{tt('admLayout','⛔ ສະເພາະຜູ້ບໍລິຫານ')}</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
