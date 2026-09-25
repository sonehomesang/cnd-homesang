import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { db } from '@/lib/firebase';
import { useTT } from '@/lib/i18n';
import { getCategory } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import { type Job, JOB_STATUS_LABEL } from '@/lib/jobs';
import { useAuth } from '@/lib/auth-context';
import { useSectionPerms } from '@/lib/permissions-context';
import { type RecordDoc, saveRecord } from '@/lib/records';
import GroupedRecordEditor from './GroupedRecordEditor';
import { JOB_GROUPS } from '@/lib/adminEditors';
import ShareSheet from './ShareSheet';
import { usePaged } from './Paginator';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open: { bg: '#d1fae5', fg: '#065f46' },
  assigned: { bg: '#fef3c7', fg: '#92400e' },
  in_progress: { bg: '#dbeafe', fg: '#1e40af' },
  completed: { bg: '#f3f4f6', fg: '#374151' },
  cancelled: { bg: '#fee', fg: '#991b1b' },
  pending_payment: { bg: '#ede9fe', fg: '#5b21b6' },
};

type Tab = '' | 'open' | 'assigned' | 'in_progress' | 'pending_payment' | 'completed' | 'cancelled';

export default function JobsPanel() {
  const { fbUser, profile } = useAuth();
  const { canCreate, canEdit, canDelete } = useSectionPerms('jobs');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tab, setTab] = useState<Tab>('');
  const [editRecord, setEditRecord] = useState<RecordDoc | 'new' | null>(null);
  const [shareJob, setShareJob] = useState<Job | null>(null);
  const authorName = profile?.firstName || (profile as any)?.name || 'Admin';
  const tt = useTT();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'jobs'), (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as any;
        const createdAt =
          typeof data.createdAt?.toMillis === 'function'
            ? data.createdAt.toMillis()
            : data.createdAt ?? 0;
        return { id: d.id, ...data, createdAt } as Job;
      });
      list.sort((a, b) => b.createdAt - a.createdAt);
      setJobs(list);
    });
    return unsub;
  }, []);

  const count = (s: string) => jobs.filter((j) => j.status === s).length;
  const TABS: { value: Tab; label: string }[] = [
    { value: '', label: `${tt('admJobs','ທັງໝົດ')} (${jobs.length})` },
    { value: 'open', label: `${tt('admJobs','ເປີດ')} (${count('open')})` },
    { value: 'assigned', label: `${tt('admJobs','ມີຊ່າງ')} (${count('assigned')})` },
    { value: 'in_progress', label: `${tt('admJobs','ກຳລັງເຮັດ')} (${count('in_progress')})` },
    { value: 'pending_payment', label: `${tt('admJobs','ລໍຊຳລະ')} (${count('pending_payment')})` },
    { value: 'completed', label: `${tt('admJobs','ສຳເລັດ')} (${count('completed')})` },
    { value: 'cancelled', label: `${tt('admJobs','ຍົກເລີກ')} (${count('cancelled')})` },
  ];
  const shown = tab ? jobs.filter((j) => j.status === tab) : jobs;
  const pg = usePaged(shown, 8);

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.title}>📣 {tt('admJobs','ປະກາດວຽກ · Jobs')}</Text>
        {canCreate && (
          <Pressable style={styles.createBtn} onPress={() => setEditRecord('new')}>
            <Text style={styles.createBtnText}>＋ {tt('admJobs','ສ້າງ ປະກາດວຽກ')}</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.sub}>{tt('admJobs','ຕິດຕາມ / ສ້າງ / ແກ້ ປະກາດວຽກ ທັງໝົດ')}</Text>

      <View style={styles.subtabs}>
        {TABS.map((t) => (
          <Pressable key={t.value} onPress={() => setTab(t.value)} style={styles.subtab}>
            <Text style={[styles.subtabText, tab === t.value && styles.subtabActive]}>
              {t.label}
            </Text>
            {tab === t.value && <View style={styles.subtabBar} />}
          </Pressable>
        ))}
      </View>

      {pg.items.map((job) => {
        const c = getCategory(job.category);
        const label = JOB_STATUS_LABEL[job.status];
        const color = STATUS_COLORS[job.status] ?? STATUS_COLORS.completed;
        const featured = (job as any).featured;
        const closed = (job as any).closed;
        return (
          <View key={job.id} style={styles.row}>
            <Pressable onPress={() => router.push(`/jobs/${job.id}` as any)}>
              <View style={styles.rowTop}>
                <Text style={styles.cat}><CategoryIcon icon={c?.icon} size={12} color="#0066CC" /> {c?.lao ?? job.category}</Text>
                <View style={styles.rowRight}>
                  {featured && <View style={[styles.pill, { backgroundColor: '#fef3c7' }]}><Text style={[styles.pillText, { color: '#92400e' }]}>📌 {tt('admJobs','ເດ່ນ')}</Text></View>}
                  {closed && <View style={[styles.pill, { backgroundColor: '#fee2e2' }]}><Text style={[styles.pillText, { color: '#991b1b' }]}>{tt('admJobs','ປິດ')}</Text></View>}
                  <View style={[styles.pill, { backgroundColor: color.bg }]}>
                    <Text style={[styles.pillText, { color: color.fg }]}>{label ? tt('jobStatus', label.lao) : job.status}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.jtitle}>{job.title}</Text>
              <View style={styles.meta}>
                {job.finalPrice !== undefined ? (
                  <Text style={[styles.metaText, styles.metaPrice]}>🧾 {job.finalPrice.toLocaleString()} LAK</Text>
                ) : job.budget !== undefined ? (
                  <Text style={styles.metaText}>💰 {job.budget.toLocaleString()} LAK</Text>
                ) : null}
                {job.assignedProviderName && <Text style={styles.metaText} numberOfLines={1}>👷 {job.assignedProviderName}</Text>}
                {job.address && <Text style={styles.metaText} numberOfLines={1}>📍 {job.address}</Text>}
              </View>
            </Pressable>
            <View style={styles.actions}>
              {canEdit && <Pressable style={[styles.mini, { backgroundColor: closed ? '#0066CC' : '#1f2937' }]} onPress={() => saveRecord('jobs', job.id, { closed: !closed })}>
                <Text style={styles.miniText}>{closed ? tt('admJobs','ເປີດ') : tt('admJobs','ປິດ')}</Text>
              </Pressable>}
              {canEdit && <Pressable style={[styles.mini, { backgroundColor: featured ? '#f59e0b' : '#e5e7eb' }]} onPress={() => saveRecord('jobs', job.id, { featured: !featured })}>
                <Text style={[styles.miniText, !featured && { color: '#374151' }]}>📌 {tt('admJobs','ປັກໝຸດ')}</Text>
              </Pressable>}
              <Pressable style={[styles.mini, { backgroundColor: '#0066CC' }]} onPress={() => setEditRecord(job as any)}>
                <Text style={styles.miniText}>{canEdit ? tt('admJobs','✎ ແກ້') : tt('admJobs','👁 ເບິ່ງ')}</Text>
              </Pressable>
              <Pressable style={[styles.mini, { backgroundColor: '#0ea5e9' }]} onPress={() => setShareJob(job)}>
                <Text style={styles.miniText}>🔗 {tt('admJobs','ແຊຣ໌')}</Text>
              </Pressable>
              <Pressable style={[styles.mini, { backgroundColor: '#7c3aed' }]} onPress={() => router.push(`/jobs/${job.id}` as any)}>
                <Text style={styles.miniText}>✏️ {tt('admJobs','ຣີວິວ')}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {pg.bar}

      {editRecord && (
        <GroupedRecordEditor
          colName="jobs"
          record={editRecord === 'new' ? null : editRecord}
          groups={JOB_GROUPS}
          canDelete={canDelete}
          canEdit={canEdit}
          canCreate={canCreate}
          onClose={() => setEditRecord(null)}
        />
      )}
      {shareJob && (
        <ShareSheet kind="jobs" id={shareJob.id} title={shareJob.title} image={shareJob.photos?.[0]} authorId={fbUser?.uid ?? ''} authorName={authorName} onClose={() => setShareJob(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  createBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: { backgroundColor: '#0066CC', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  editBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  subtabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderBottomWidth: 2, borderBottomColor: '#f0f0f0', marginBottom: 14 },
  subtab: { paddingHorizontal: 12, paddingVertical: 8 },
  subtabText: { fontSize: 12, color: '#6b7280' },
  subtabActive: { color: '#0066CC', fontWeight: '700' },
  subtabBar: { height: 2, backgroundColor: '#0066CC', marginTop: 6, marginHorizontal: -12, marginBottom: -10 },
  row: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 14, marginBottom: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cat: { fontSize: 12, fontWeight: '700', color: '#0066CC', textTransform: 'uppercase' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { fontSize: 12, fontWeight: '700' },
  jtitle: { fontSize: 14, fontWeight: '600', color: '#111', marginTop: 4 },
  meta: { flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  metaText: { fontSize: 12, color: '#6b7280' },
  metaPrice: { color: '#0a7d33', fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10 },
  mini: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  miniText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
