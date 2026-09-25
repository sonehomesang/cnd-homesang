import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { ttStatic, useTT } from '@/lib/i18n';
import { colors, font, radius } from '@/lib/theme';

const INFO: Record<string, { icon: string; title: string; body: string }> = {
  pending: { icon: '⏳', title: ttStatic('pending', 'ກຳລັງລໍອະນຸມັດ'), body: ttStatic('pending', 'ບັນຊີຂອງເຈົ້າ ກຳລັງລໍ admin ກວດ ແລະ ອະນຸມັດ. ໜ້ານີ້ຈະປ່ຽນເອງ ເມື່ອອະນຸມັດແລ້ວ.') },
  suspended: { icon: '🚫', title: ttStatic('pending', 'ບັນຊີຖືກລະງັບ'), body: ttStatic('pending', 'ບັນຊີຂອງເຈົ້າຖືກລະງັບຊົ່ວຄາວ. ກະລຸນາຕິດຕໍ່ ທີມງານ HomeSang.') },
  rejected: { icon: '❌', title: ttStatic('pending', 'ບັນຊີຖືກປະຕິເສດ'), body: ttStatic('pending', 'ການສະໝັກບໍ່ຜ່ານ. ກະລຸນາຕິດຕໍ່ ທີມງານ ສຳລັບລາຍລະອຽດ.') },
};

export default function PendingScreen() {
  const tt = useTT();
  const { profile, loading, signOut } = useAuth();
  const status = (profile as any)?.status as string | undefined;

  useEffect(() => {
    // leave the gate as soon as the account is approved (or status cleared)
    if (!loading && profile && status !== 'pending' && status !== 'suspended' && status !== 'rejected') {
      router.replace('/' as any);
    }
  }, [profile, status, loading]);

  const info = INFO[status ?? 'pending'] ?? INFO.pending;

  return (
    <View style={styles.root}>
      <Text style={styles.icon}>{info.icon}</Text>
      <Text style={styles.title}>{info.title}</Text>
      <Text style={styles.body}>{info.body}</Text>
      <Pressable style={styles.btn} onPress={signOut}>
        <Text style={styles.btnText}>{tt('pending', 'ອອກຈາກລະບົບ')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  icon: { fontSize: 64 },
  title: { fontSize: font.xxl, fontWeight: '700', color: colors.text, marginTop: 8, textAlign: 'center' },
  body: { fontSize: font.md, color: colors.text2, textAlign: 'center', lineHeight: 24, marginTop: 6 },
  btn: { backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: 28, paddingVertical: 12, marginTop: 24 },
  btnText: { color: colors.error, fontSize: font.sm, fontWeight: '600' },
});
