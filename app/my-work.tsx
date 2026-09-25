import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { getCategory } from '@/lib/categories';
import { type Job, JOB_STATUS_LABEL, watchAssignedJobs } from '@/lib/jobs';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open: { bg: '#d1fae5', fg: '#065f46' },
  assigned: { bg: '#fef3c7', fg: '#92400e' },
  in_progress: { bg: '#dbeafe', fg: '#1e40af' },
  completed: { bg: '#f3f4f6', fg: '#374151' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b' },
  pending_payment: { bg: '#ede9fe', fg: '#5b21b6' },
};

export default function MyWorkScreen() {
  const { fbUser, loading } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const tt = useTT();

  useEffect(() => { if (!loading && !fbUser) router.replace('/sign-in'); }, [fbUser, loading]);
  useEffect(() => { if (!fbUser) return; return watchAssignedJobs(fbUser.uid, setJobs); }, [fbUser]);

  const active = jobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        <Text style={styles.title}>🔧 {tt('myWork', 'ວຽກ ທີ່ ຂ້ອຍ ຮັບ')}</Text>
        <Text style={styles.sub}>{tt('myWork', 'ຕິດຕາມ ວຽກ ຕັ້ງແຕ່ ຮັບ → ເລີ່ມ → ສົ່ງມອບ → ຮັບເງິນ')}{active ? ` · ${tt('myWork', 'ກຳລັງ ດຳເນີນ')} ${active}` : ''}</Text>

        <Pressable style={styles.trainCard} onPress={() => router.push('/safety' as any)}>
          <Text style={styles.trainIcon}>🎓</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.trainTitle}>{tt('myWork', 'ຝຶກ ຊ່າງ & ຄວາມ ຮູ້')}</Text>
            <Text style={styles.trainSub}>{tt('myWork', 'ຄລິບ ທັກສະ ຊ່າງ · ຄວາມ ປອດໄພ · ວິທີ ໃຊ້ ແອັບ')}</Text>
          </View>
          <Text style={styles.trainArrow}>›</Text>
        </Pressable>

        {jobs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 40 }}>🔧</Text>
            <Text style={styles.emptyText}>{tt('myWork', 'ຍັງ ບໍ່ ມີ ວຽກ ທີ່ ຮັບ — ຫາ ວຽກ ໃໝ່')}</Text>
            <Pressable style={styles.postBtn} onPress={() => router.push('/(tabs)/explore' as any)}>
              <Text style={styles.postBtnText}>🔎 {tt('myWork', 'ຫາ ວຽກ')}</Text>
            </Pressable>
          </View>
        ) : (
          jobs.map((j) => {
            const c = STATUS_COLORS[j.status] ?? STATUS_COLORS.completed;
            return (
              <Pressable key={j.id} style={styles.row} onPress={() => router.push(`/jobs/${j.id}` as any)}>
                <View style={styles.top}>
                  <Text style={styles.jt} numberOfLines={1}>{j.title}</Text>
                  <View style={[styles.pill, { backgroundColor: c.bg }]}>
                    <Text style={[styles.pillText, { color: c.fg }]}>{tt('jobStatus', JOB_STATUS_LABEL[j.status]?.lao ?? j.status)}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {getCategory(j.category)?.lao ?? j.category}
                  {j.finalPrice ? ` · 💰 ${j.finalPrice.toLocaleString()} ${tt('myWork', 'ກີບ')}` : j.budget ? ` · 💰 ${j.budget.toLocaleString()} ${tt('myWork', 'ກີບ')}` : ''}
                </Text>
                {!!j.customerName && <Text style={styles.assigned}>👤 {tt('myWork', 'ລູກຄ້າ')}: {j.customerName}</Text>}
                {!!j.address && <Text style={styles.addr} numberOfLines={1}>📍 {j.address}</Text>}
              </Pressable>
            );
          })
        )}
        <BackButton />
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 8, alignItems: 'center', paddingBottom: 60 },
  wrap: { width: '100%', maxWidth: 640 },
  title: { fontSize: 15, fontWeight: '800', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  trainCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 12, padding: 12, marginBottom: 12 },
  trainIcon: { fontSize: 24 },
  trainTitle: { fontSize: 14, fontWeight: '800', color: '#1e40af' },
  trainSub: { fontSize: 12, color: '#3b5b82', marginTop: 2 },
  trainArrow: { fontSize: 22, color: '#1e40af', fontWeight: '800' },
  empty: { backgroundColor: '#fff', padding: 32, borderRadius: 12, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  postBtn: { backgroundColor: '#0066CC', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 11, marginTop: 4 },
  postBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  row: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 14, marginBottom: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  jt: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  assigned: { fontSize: 12, color: '#0066CC', fontWeight: '600', marginTop: 4 },
  addr: { fontSize: 12, color: '#6b7280', marginTop: 2 },
});
