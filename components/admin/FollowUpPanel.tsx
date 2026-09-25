import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type Job } from '@/lib/jobs';
import { getCategory } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import { warrantyStatus, watchExpiringWarranties } from '@/lib/serviceHistory';
import { useTT } from '@/lib/i18n';

const WINDOWS = [30, 60, 90];

export default function FollowUpPanel() {
  const tt = useTT();
  const [days, setDays] = useState(60);
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => watchExpiringWarranties(setJobs, days), [days]);

  return (
    <View>
      <Text style={styles.title}>🔔 {tt('admFollow', 'ຕິດຕາມ / ເຕືອນ ບຳລຸງ')}</Text>
      <Text style={styles.sub}>{tt('admFollow', 'ວຽກ ທີ່ ຮັບປະກັນ ໃກ້ ໝົດ — ໂອກາດ ຕິດຕໍ່ ລູກຄ້າ ຫາ ງານ ຊ້ຳ / ບຳລຸງ')}</Text>

      <View style={styles.tabs}>
        {WINDOWS.map((w) => (
          <Pressable key={w} style={[styles.tab, days === w && styles.tabOn]} onPress={() => setDays(w)}>
            <Text style={[styles.tabText, days === w && styles.tabTextOn]}>{tt('admFollow', 'ພາຍໃນ')} {w} {tt('admFollow', 'ມື້')}</Text>
          </Pressable>
        ))}
      </View>

      {jobs.length === 0 ? (
        <Text style={styles.empty}>{tt('admFollow', 'ບໍ່ ມີ ຮັບປະກັນ ໃກ້ ໝົດ ໃນ ໄລຍະ ນີ້')}</Text>
      ) : (
        jobs.map((j) => {
          const cat = getCategory(j.category);
          const w = warrantyStatus(j, days);
          return (
            <View key={j.id} style={styles.row}>
              <View style={styles.icon}><CategoryIcon icon={cat?.icon} size={16} color="#0066CC" /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.jt} numberOfLines={1}>{j.title}</Text>
                <Text style={styles.jm} numberOfLines={1}>👤 {j.customerName ?? j.customerId.slice(0, 6)}{j.address ? ` · 📍 ${j.address}` : ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <View style={styles.badge}><Text style={styles.badgeText}>🛡️ {w.daysLeft}{tt('admFollow', 'ມື້')}</Text></View>
                <Pressable onPress={() => router.push(`/service-history?uid=${j.customerId}` as any)}>
                  <Text style={styles.link}>{tt('admFollow', 'ປະຫວັດ ›')}</Text>
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  tabOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  tabText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  tabTextOn: { color: '#fff' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, marginBottom: 8, backgroundColor: '#fff' },
  icon: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  jt: { fontSize: 13, fontWeight: '700', color: '#111' },
  jm: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  badge: { backgroundColor: '#fef3c7', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#92400e' },
  link: { fontSize: 12, color: '#0066CC', fontWeight: '700' },
});
