import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type Job, watchAssignedJobs, watchMyJobs } from '@/lib/jobs';
import { getCategory } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import { groupByLocation, summarise, warrantyStatus, type WarrantyState } from '@/lib/serviceHistory';
import { useTT } from '@/lib/i18n';

const W_STYLE: Record<WarrantyState, { box: any; text: string }> = {
  active: { box: { backgroundColor: '#dcfce7' }, text: '#065f46' },
  expiring: { box: { backgroundColor: '#fef3c7' }, text: '#92400e' },
  expired: { box: { backgroundColor: '#f3f4f6' }, text: '#6b7280' },
  none: { box: { backgroundColor: '#f3f4f6' }, text: '#9ca3af' },
};

function shortDate(ms?: number) {
  return ms ? new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
}

/** Past-service history grouped by site, with warranty state.
 * `mode='hired'` = jobs the user hired (as customer);
 * `mode='provided'` = jobs the user serviced (as technician). */
export default function ServiceHistory({ uid, mode = 'hired' }: { uid: string; mode?: 'hired' | 'provided' }) {
  const tt = useTT();
  const provided = mode === 'provided';
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    if (!uid) return;
    return provided ? watchAssignedJobs(uid, setJobs) : watchMyJobs(uid, setJobs);
  }, [uid, provided]);

  // only jobs that reached the workflow (assigned onward) count as "service"
  const service = jobs.filter((j) => j.status !== 'open' && j.status !== 'cancelled');
  const s = summarise(service);
  const groups = groupByLocation(service);

  if (service.length === 0) {
    return <Text style={styles.empty}>{tt('history', 'ຍັງ ບໍ່ ມີ ປະຫວັດ ບໍລິການ')}</Text>;
  }

  return (
    <View>
      <View style={styles.stats}>
        <Stat n={String(s.count)} label={tt('history', 'ວຽກ')} />
        <Stat n={`${Math.round(s.totalSpend / 1000)}${tt('history', 'ກ')}`} label={provided ? tt('history', 'ລາຍຮັບ ລວມ') : tt('history', 'ໃຊ້ ຈ່າຍ ລວມ')} />
        <Stat n={String(s.activeWarranties)} label={tt('history', 'ຮັບປະກັນ ໃຊ້ ຢູ່')} />
      </View>

      {groups.map((g) => (
        <View key={g.location} style={styles.locBlock}>
          <Text style={styles.loc}>📍 {g.location}</Text>
          {g.jobs.map((j) => {
            const cat = getCategory(j.category);
            const w = warrantyStatus(j);
            const ws = W_STYLE[w.state];
            const label =
              w.state === 'active' ? `🛡️ ${tt('history', 'ຮອດ')} ${shortDate(w.endMs)}`
              : w.state === 'expiring' ? `🛡️ ${tt('history', 'ໝົດ ໃນ')} ${w.daysLeft}${tt('history', 'ມື້')}`
              : w.state === 'expired' ? tt('history', 'ຮັບປະກັນ ໝົດ')
              : '';
            return (
              <Pressable key={j.id} style={styles.job} onPress={() => router.push(`/jobs/${j.id}` as any)}>
                <View style={styles.jIcon}><CategoryIcon icon={cat?.icon} size={16} color="#0066CC" /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.jTitle} numberOfLines={1}>{j.title}</Text>
                  <Text style={styles.jMeta} numberOfLines={1}>{shortDate(j.completedAt ?? j.assignedAt ?? j.createdAt)} · {provided ? (j.customerName ?? tt('history', 'ລູກຄ້າ')) : (j.assignedProviderName ?? tt('history', 'ຊ່າງ'))}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {j.finalPrice != null && <Text style={styles.jPrice}>{j.finalPrice.toLocaleString()}</Text>}
                  {!!label && <View style={[styles.wBadge, ws.box]}><Text style={[styles.wText, { color: ws.text }]}>{label}</Text></View>}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 16, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 10, alignItems: 'center' },
  statN: { fontSize: 15, fontWeight: '800', color: '#0066CC' },
  statL: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  locBlock: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 14, padding: 12, marginBottom: 12 },
  loc: { fontSize: 13, fontWeight: '800', color: '#334155', marginBottom: 4 },
  job: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  jIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  jTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  jMeta: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  jPrice: { fontSize: 13, fontWeight: '700', color: '#0a7d33' },
  wBadge: { borderRadius: 20, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 },
  wText: { fontSize: 12, fontWeight: '800' },
});
