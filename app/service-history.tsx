import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { isAnyAdmin } from '@/lib/adminTier';
import ServiceHistory from '@/components/ServiceHistory';
import { useTT } from '@/lib/i18n';
import { colors, space } from '@/lib/theme';

/** A customer's service history. Viewed by the customer themselves, or by an
 * admin passing ?uid=<customerId>. */
export default function ServiceHistoryScreen() {
  const { uid, mode } = useLocalSearchParams<{ uid?: string; mode?: string }>();
  const { fbUser, profile } = useAuth();
  const tt = useTT();

  const target = uid || fbUser?.uid || '';
  const allowed = !!target && (target === fbUser?.uid || isAnyAdmin(profile));
  const viewingOther = !!uid && uid !== fbUser?.uid;
  // admin viewing another user always sees their hired (customer) history
  const svcMode: 'hired' | 'provided' = !viewingOther && mode === 'provided' ? 'provided' : 'hired';

  const title = svcMode === 'provided'
    ? tt('history', 'ການບໍລິການ ຂອງ ຂ້ອຍ')
    : viewingOther
    ? tt('history', 'ປະຫວັດ ການຈ້າງຊ່າງ ຂອງ ລູກຄ້າ')
    : tt('history', 'ປະຫວັດ ການຈ້າງຊ່າງ');

  if (!allowed) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('history', 'ບໍ່ ມີ ສິດ ເບິ່ງ')}</Text></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🗂️ {title}</Text>
      <Text style={styles.sub}>{tt('history', 'ວຽກ ທຸກ ອັນ ຈັດ ຕາມ ສະຖານທີ່ + ສະຖານະ ຮັບປະກັນ')}</Text>
      <ServiceHistory uid={target} mode={svcMode} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  muted: { color: colors.text3 },
  title: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 2 },
  sub: { fontSize: 12, color: colors.text3, marginBottom: 14 },
});
