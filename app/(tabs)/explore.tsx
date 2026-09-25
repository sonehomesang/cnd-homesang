import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { CAT_ICON, getCategory, useServiceCategories } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import { distanceKm, type Job, JOB_STATUS_LABEL, watchOpenJobs } from '@/lib/jobs';
import { isFresh, rankByFreshness } from '@/lib/freshness';
import { useAppSettings, useFeedConfig } from '@/lib/appSettings';
import AppHeader from '@/components/AppHeader';
import SortBar from '@/components/SortBar';
import AppFooter from '@/components/AppFooter';
import { colors, useResponsive } from '@/lib/theme';

/** dd/mm/yyyy in Buddhist-era-free Gregorian (compact, locale-agnostic). */
function fmtDate(ms?: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open: { bg: '#d1fae5', fg: '#065f46' },
  assigned: { bg: '#fef3c7', fg: '#92400e' },
  in_progress: { bg: '#dbeafe', fg: '#1e40af' },
  completed: { bg: '#f3f4f6', fg: '#374151' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b' },
  pending_payment: { bg: '#ede9fe', fg: '#5b21b6' },
};

export default function BrowseJobsScreen() {
  const { fbUser, profile, loading } = useAuth();
  const { cat: catParam } = useLocalSearchParams<{ cat?: string }>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [cat, setCat] = useState<string>(typeof catParam === 'string' ? catParam : '');
  const [sort, setSort] = useState('recommended');
  const serviceCats = useServiceCategories();
  const tt = useTT();
  const jobCfg = useFeedConfig('jobs'); // freshness: new-first, then keep distance
  const settings = useAppSettings();
  const { maxWidth } = useResponsive(); // shared responsive content width (phone full / tablet 720 / desktop 960)

  useEffect(() => {
    if (typeof catParam === 'string') setCat(catParam);
  }, [catParam]);

  useEffect(() => {
    setJobsLoading(true);
    const unsub = watchOpenJobs(fbUser?.uid ?? '', (j) => {
      setJobs(j);
      setJobsLoading(false);
    });
    return unsub;
  }, [fbUser]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>{tt('explore', 'ກຳລັງໂຫຼດ...')}</Text>
      </View>
    );
  }

  const myLat = profile?.lat;
  const myLng = profile?.lng;
  const nowMs = Date.now();
  // radius gate: only when admin enabled it AND we know the viewer's location
  const gateKm = settings.radiusVisibilityEnabled && myLat !== undefined && myLng !== undefined ? settings.searchRadiusKm : 0;

  const byDistance = (a: { dist?: number }, b: { dist?: number }) => {
    if (a.dist === undefined && b.dist === undefined) return 0;
    if (a.dist === undefined) return 1;
    if (b.dist === undefined) return -1;
    return a.dist - b.dist;
  };
  const jobPool = jobs
    .filter((j) => !cat || j.category === cat)
    .map((j) => {
      let dist: number | undefined;
      if (myLat !== undefined && myLng !== undefined && j.lat !== undefined && j.lng !== undefined) {
        dist = distanceKm(myLat, myLng, j.lat, j.lng);
      }
      return { job: j, dist };
    })
    // when the radius gate is on, drop jobs beyond it (unknown distance = shown)
    .filter((x) => gateKm === 0 || x.dist === undefined || x.dist <= gateKm);
  // user-chosen sort overrides the default freshness ranking
  const withDist =
    sort === 'newest' ? [...jobPool].sort((a, b) => (b.job.createdAt ?? 0) - (a.job.createdAt ?? 0))
    : sort === 'budget' ? [...jobPool].sort((a, b) => (b.job.budget ?? 0) - (a.job.budget ?? 0))
    : sort === 'near' ? [...jobPool].sort(byDistance)
    // default: new jobs (< N days) first newest-first; older jobs keep nearest-first
    : rankByFreshness(jobPool, jobCfg, { createdAt: (x) => x.job.createdAt, oldCompare: byDistance });

  return (
    <View style={styles.screen}>
      <AppHeader
        accent={colors.primary}
        accentSoft="#E3F0FF"
        icon="💼"
        nameAccent="ວຽກ"
        subtitle={tt('explore', 'ງານ ເປີດ ຮັບ ໃກ້ຕົວ — ຮັບ ວຽກ ໄດ້ ເລີຍ')}
        searchPlaceholder={tt('explore', 'ຄົ້ນຫາ ງານ ຕາມ ປະເພດ / ເຂດ…')}
        actions={[{ label: tt('explore', '🗺️ ແຜນທີ່'), onPress: () => router.push('/map' as any) }]}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.wrap, { maxWidth }]}>
        <View style={styles.pageBody}>
      {gateKm > 0 && <Text style={styles.radiusNote}>📍 {tt('explore', 'ສະແດງ ສະເພາະ ໃນ')} {gateKm} {tt('explore', 'ກມ')}</Text>}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        <Pressable
          style={[styles.chip, cat === '' && styles.chipActive]}
          onPress={() => setCat('')}>
          <Text style={[styles.chipText, cat === '' && styles.chipTextActive]}>
            {tt('explore', 'ທັງໝົດ')}
          </Text>
        </Pressable>
        {serviceCats.map((c) => (
          <Pressable
            key={c.value}
            style={[styles.chip, cat === c.value && styles.chipActive]}
            onPress={() => setCat(c.value)}>
            <Text style={[styles.chipText, cat === c.value && styles.chipTextActive]}>
              <CategoryIcon icon={c.icon} size={13} color={cat === c.value ? '#fff' : '#4b5563'} /> {c.lao}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <SortBar
        value={sort}
        onChange={setSort}
        options={[
          { key: 'recommended', label: tt('explore', 'ແນະນຳ') },
          { key: 'newest', label: tt('explore', '🆕 ໃໝ່ ສຸດ') },
          { key: 'budget', label: tt('explore', '💰 ງົບ ສູງ') },
          { key: 'near', label: tt('explore', '📍 ໃກ້ ຂ້ອຍ') },
        ]}
      />

      {jobsLoading ? (
        <Text style={styles.empty}>{tt('explore', 'ກຳລັງໂຫຼດ...')}</Text>
      ) : withDist.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyText}>{tt('explore', 'ບໍ່ມີງານເປີດຮັບ')}</Text>
          {myLat === undefined && (
            <Text style={styles.emptyHint}>
              {tt('explore', 'ໃສ່ຕຳແໜ່ງໃນ profile ເພື່ອເຫັນໄລຍະທາງ')}
            </Text>
          )}
        </View>
      ) : (
        withDist.map(({ job, dist }) => {
          const c = getCategory(job.category);
          const ci = CAT_ICON[job.category];
          const accent = ci?.color ?? '#0066CC';
          const sLabel = JOB_STATUS_LABEL[job.status];
          const sColor = STATUS_COLORS[job.status] ?? STATUS_COLORS.open;
          const bids = job.bidCount ?? 0;
          const fresh = isFresh(job.createdAt, jobCfg.freshDays);
          return (
            <Pressable
              key={job.id}
              style={styles.card}
              onPress={() => router.push(`/jobs/${job.id}` as any)}>
              <View style={styles.row}>
                {job.photos && job.photos.length > 0 ? (
                  <Image source={{ uri: job.photos[0] }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPh, { backgroundColor: accent + '18' }]}>
                    <Ionicons name={(ci?.name ?? 'construct') as any} size={30} color={accent} />
                  </View>
                )}
                <View style={styles.body}>
                  <View style={styles.topRow}>
                    <View style={styles.topLeft}>
                      <View style={[styles.catPill, { backgroundColor: accent + '18' }]}>
                        <Ionicons name={(ci?.name ?? 'construct') as any} size={12} color={accent} />
                        <Text style={[styles.catPillText, { color: accent }]}>{c?.lao ?? job.category}</Text>
                      </View>
                      {fresh && (
                        <View style={styles.newBadge}><Text style={styles.newBadgeText}>{tt('feed', 'ໃໝ່')}</Text></View>
                      )}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sColor.bg }]}>
                      <Text style={[styles.statusText, { color: sColor.fg }]}>{tt('jobStatus', sLabel.lao)}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>{job.title}</Text>
                  <Text style={styles.cardDesc} numberOfLines={2}>{job.description}</Text>
                  <View style={styles.metaRow}>
                    {job.budget !== undefined && (
                      <Text style={styles.budget}>💰 {job.budget.toLocaleString()} {tt('explore', 'ກີບ')}</Text>
                    )}
                    {dist !== undefined && <Text style={styles.dist}>📍 {dist.toFixed(1)} km</Text>}
                  </View>
                </View>
              </View>

              <View style={styles.footer}>
                <View style={styles.footLeft}>
                  {job.customerName ? <Text style={styles.footText}>👤 {job.customerName}</Text> : null}
                  <Text style={styles.footText}>📅 {fmtDate(job.createdAt)}</Text>
                  {job.closeAt ? (
                    <Text style={[styles.footText, job.closeAt < nowMs && styles.closedText]}>
                      {tt('explore', '⏰ ປິດຮັບ')} {fmtDate(job.closeAt)}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.bidsPill, bids > 0 && styles.bidsOn]}>
                  <Text style={[styles.bidsText, bids > 0 && styles.bidsTextOn]}>
                    {bids > 0 ? `🙋 ${bids} ${tt('explore', 'ຊ່າງສະເໜີ')}` : tt('explore', '🙋 ຍັງບໍ່ມີຊ່າງສະເໜີ')}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })
      )}
        </View>
        <AppFooter page="explore" />
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { alignItems: 'center', paddingBottom: 0 },
  wrap: { width: '100%' },
  pageBody: { paddingHorizontal: 8, paddingTop: 8 },
  radiusNote: { fontSize: 12, color: colors.text2, marginBottom: 8, paddingHorizontal: 4 },
  center: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 15, fontWeight: 'bold', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  filterRow: { gap: 6, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  chipActive: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  chipText: { fontSize: 12, color: '#4b5563' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eef0f3',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  row: { flexDirection: 'row', gap: 12 },
  thumb: { width: 84, height: 84, borderRadius: 10 },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  newBadge: { backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  newBadgeText: { fontSize: 12, color: '#fff', fontWeight: '800' },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  catPillText: { fontSize: 12, fontWeight: '700' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '700' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginTop: 6 },
  cardDesc: { fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap' },
  budget: { fontSize: 12, color: '#065f46', fontWeight: '700' },
  dist: { fontSize: 12, color: '#0066CC', fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  footLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 1 },
  footText: { fontSize: 12, color: '#6b7280' },
  closedText: { color: '#b91c1c', fontWeight: '600' },
  bidsPill: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  bidsOn: { backgroundColor: '#EAF2FB' },
  bidsText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  bidsTextOn: { color: '#0066CC' },
  empty: { textAlign: 'center', color: '#9ca3af', padding: 24 },
  emptyBox: { backgroundColor: '#fff', padding: 32, borderRadius: 12, alignItems: 'center' },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 14, color: '#4b5563', marginTop: 8 },
  emptyHint: { fontSize: 12, color: '#9ca3af', marginTop: 4, textAlign: 'center' },
  btn: { backgroundColor: '#0066CC', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
