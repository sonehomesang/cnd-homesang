import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import {
  type Plan,
  seedPlansIfEmpty,
  type Subscription,
  subscribe,
  watchMySubscription,
  watchPlans,
} from '@/lib/membership';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow } from '@/lib/theme';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

const SUB_LABEL: Record<string, string> = {
  trial: 'ທົດລອງ', pending: 'ລໍຢືນຢັນ', active: 'ໃຊ້ງານ', expired: 'ໝົດອາຍຸ',
};

export default function MembershipScreen() {
  const { fbUser, loading } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const tt = useTT();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!loading && !fbUser) router.replace('/sign-in' as any);
  }, [fbUser, loading]);

  useEffect(() => {
    if (isSuperAdmin) seedPlansIfEmpty().catch(() => {});
    return watchPlans(setPlans);
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!fbUser) return;
    return watchMySubscription(fbUser.uid, setSub);
  }, [fbUser]);

  const choose = async (p: Plan) => {
    if (!fbUser) return;
    setBusy(p.id);
    try {
      await subscribe(fbUser.uid, p);
      if (p.price > 0) alert(tt('membership', 'ສ້າງແພັກແລ້ວ — ໂອນເງິນ ແລ້ວ admin ຈະຢືນຢັນ'));
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
    } finally {
      setBusy('');
    }
  };

  if (loading || !fbUser) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('membership', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{tt('membership', '⭐ ສະມາຊິກ')}</Text>
        <Text style={styles.sub}>{tt('membership', 'ເລືອກແພັກ ເພື່ອໃຊ້ງານ HomeSang ເຕັມຮູບແບບ')}</Text>

        {sub && (
          <View style={styles.current}>
            <Text style={styles.currentLabel}>{tt('membership', 'ແພັກປັດຈຸບັນ')}</Text>
            <View style={styles.currentRow}>
              <Text style={styles.currentName}>{sub.planName}</Text>
              <Text style={styles.currentStatus}>{SUB_LABEL[sub.status] ? tt('membership', SUB_LABEL[sub.status]) : sub.status}</Text>
            </View>
            {sub.endAt ? <Text style={styles.currentEnd}>{tt('membership', 'ຮອດ')} {new Date(sub.endAt).toLocaleDateString('lo-LA')}</Text> : null}
          </View>
        )}

        {plans.map((p) => {
          const isCurrent = sub?.planId === p.id && (sub.status === 'active' || sub.status === 'trial' || sub.status === 'pending');
          return (
            <View key={p.id} style={[styles.card, isCurrent && styles.cardCurrent]}>
              <View style={styles.cardHead}>
                <Text style={styles.planName}>{p.nameLao}</Text>
                <Text style={styles.price}>{p.price === 0 ? tt('membership', 'ຟຣີ') : `${p.price.toLocaleString()} ${tt('common', 'ກີບ')}`}</Text>
              </View>
              <Text style={styles.dur}>{p.durationDays} {tt('membership', 'ມື້')}</Text>
              {p.features.map((f, i) => (
                <Text key={i} style={styles.feature}>✓ {f}</Text>
              ))}
              <Pressable
                style={[styles.btn, isCurrent && styles.btnOff, busy === p.id && styles.btnOff]}
                disabled={isCurrent || busy === p.id}
                onPress={() => choose(p)}>
                <Text style={styles.btnText}>
                  {isCurrent ? tt('membership', '✓ ແພັກປັດຈຸບັນ') : busy === p.id ? '...' : p.price === 0 ? tt('membership', 'ເລີ່ມທົດລອງ') : tt('membership', 'ເລືອກແພັກນີ້')}
                </Text>
              </Pressable>
            </View>
          );
        })}

        <BackButton />
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 560 },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.text3 },
  title: { fontSize: font.xl, fontWeight: '700', color: colors.text },
  sub: { fontSize: font.sm, color: colors.text2, marginTop: 2, marginBottom: 14 },
  current: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: 14, marginBottom: 14, ...shadow.card },
  currentLabel: { color: 'rgba(255,255,255,0.85)', fontSize: font.xs },
  currentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  currentName: { color: '#fff', fontSize: font.lg, fontWeight: '700' },
  currentStatus: { color: '#fff', fontSize: font.xs, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  currentEnd: { color: 'rgba(255,255,255,0.9)', fontSize: font.xs, marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cardCurrent: { borderColor: colors.primary, borderWidth: 2 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  price: { fontSize: font.lg, fontWeight: '800', color: colors.primary },
  dur: { fontSize: font.xs, color: colors.text3, marginTop: 2, marginBottom: 8 },
  feature: { fontSize: font.sm, color: colors.text2, marginTop: 3 },
  btn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: 12, alignItems: 'center', marginTop: 12 },
  btnOff: { backgroundColor: '#A8CAEE' },
  btnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});
