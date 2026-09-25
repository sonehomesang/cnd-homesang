import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { buyerGroup } from '@/lib/memberPricing';
import { type RiderProfile, watchMyRider } from '@/lib/riders';
import { useTT } from '@/lib/i18n';
import { colors, font, radius } from '@/lib/theme';

/**
 * Home CTA nudging technicians (and general users) — who own vehicles and know
 * the roads — to earn extra by delivering, WITHOUT changing their account group
 * (rider is an opt-in capability). Hidden once the user is already a rider or if
 * they aren't a good fit (corporation/admin).
 */
export default function RiderPromo() {
  const { fbUser, profile } = useAuth();
  const tt = useTT();
  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!fbUser) { setLoaded(true); return; }
    return watchMyRider(fbUser.uid, (r) => { setRider(r); setLoaded(true); });
  }, [fbUser]);

  if (!fbUser || !loaded || rider) return null; // not signed in, still loading, or already a rider
  const group = buyerGroup(profile as any);
  if (group !== 'technician' && group !== 'general') return null; // riders best fit these groups

  const forTech = group === 'technician';
  return (
    <Pressable style={styles.card} onPress={() => router.push('/rider' as any)}>
      <Text style={styles.emoji}>🛵</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          {forTech ? tt('riderPromo', 'ຊ່າງ ມີ ລົດ? ຫາ ລາຍໄດ້ ເສີມ!') : tt('riderPromo', 'ຫາ ລາຍໄດ້ ເສີມ ເປັນ ໄຣເດີ້')}
        </Text>
        <Text style={styles.sub}>{tt('riderPromo', 'ຮັບ ງານ ສົ່ງ ໃກ້ ຕົວ · ເລືອກ ເວລາ ເອງ · ບໍ່ ຕ້ອງ ປ່ຽນ ບັນຊີ')}</Text>
      </View>
      <Text style={styles.cta}>{tt('riderPromo', 'ສະໝັກ →')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#eef6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: radius.lg, padding: 14, marginTop: 14 },
  emoji: { fontSize: 30 },
  title: { fontSize: font.sm, fontWeight: '800', color: '#0066CC' },
  sub: { fontSize: font.xs, color: colors.text2, marginTop: 2, lineHeight: 16 },
  cta: { fontSize: font.sm, fontWeight: '800', color: '#0066CC' },
});
