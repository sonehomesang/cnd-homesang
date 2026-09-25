import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type ClipTopic, type LearnClip, watchLearnClips } from '@/lib/learnClips';
import ClipCard from '@/components/ClipCard';
import { useTT } from '@/lib/i18n';
import AppFooter from '@/components/AppFooter';

const MAX_W = 720;

// Static safety reminders shown alongside the Safety clips.
const TIPS = [
  'ຕັດ ແຫຼ່ງໄຟ ກ່ອນ ແຕະ ອຸປະກອນ ໄຟຟ້າ ສະເໝີ.',
  'ໃສ່ ໝວກ · ຖົງມື · ເຂັມຂັດ ນິລະໄພ ເມື່ອ ເຮັດວຽກ ສູງ.',
  'ກວດ ເຄື່ອງມື ໃຫ້ ພ້ອມ ແລະ ບໍ່ ຊຳລຸດ ກ່ອນ ເລີ່ມ.',
  'ເກັບ ສານເຄມີ / ສີ ໃຫ້ ຫ່າງ ໄຟ ແລະ ເດັກນ້ອຍ.',
  'ມີ ຊຸດ ປະຖົມ ພະຍາບານ ພ້ອມ ໜ້າວຽກ ສະເໝີ.',
];

// Price-transparency guidance — helps customers spot "start-from X" bait pricing.
const PRICE_TIPS: { icon: string; text: string }[] = [
  { icon: '⚠️', text: 'ລະວັງ ລາຄາ "ເລີ່ມ ຕົ້ນ X ກີບ" ທີ່ ບານ ປາຍ — ຖາມ ລາຄາ ລວມ ໃຫ້ ຄົບ ກ່ອນ ຕົກລົງ.' },
  { icon: '🧾', text: 'ຂໍ ໃບ ສະເໜີ ເປັນ ລາຍການ (BOQ) ກ່ອນ ເລີ່ມ ງານ — HomeSang ມີ ໃຫ້ ທຸກ ໃບ.' },
  { icon: '✅', text: 'ຢືນຢັນ ຂອບເຂດ + ລາຄາ ໃນ ແອັບ ກ່ອນ ຊ່າງ ລົງ ມື — ມີ ບັນທຶກ ໄວ້ ຕອນ ມີ ຂໍ້ ຂັດແຍ່ງ.' },
  { icon: '🚩', text: 'ຄ່າ ວັດສະດຸ ແພງ ຜິດ ປົກກະຕິ ຫຼື ບີບ ໃຫ້ ຈ່າຍ ດ່ວນ = ສັນຍານ ອັນຕະລາຍ — ຢຸດ ແລ້ວ ກວດ.' },
  { icon: '⭐', text: 'ເບິ່ງ ຄະແນນ + ຣີວິວ ຊ່າງ ກ່ອນ ເລືອກ — ຣີວິວ ໃນ HomeSang ມາ ຈາກ ຄົນ ທີ່ ຈ້າງ ຈິງ.' },
];

export default function SafetyScreen() {
  const tt = useTT();
  const [clips, setClips] = useState<LearnClip[]>([]);
  const [filter, setFilter] = useState<'all' | ClipTopic>('all');
  useEffect(() => watchLearnClips(setClips), []);

  const shown = filter === 'all' ? clips : clips.filter((c) => c.topic === filter);
  const FILTERS: { key: 'all' | ClipTopic; label: string }[] = [
    { key: 'all', label: tt('learn', 'ທັງໝົດ') },
    { key: 'trade', label: tt('learn', '🔧 ທັກສະຊ່າງ') },
    { key: 'safety', label: tt('learn', '🦺 ຄວາມປອດໄພ') },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.wrap}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backT}>← {tt('learn', 'ໜ້າຫຼັກ')}</Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.heroT}>🦺 {tt('learn', 'ຄວາມປອດໄພ')}</Text>
          <Text style={styles.heroP}>
            {tt('learn', 'ຄວາມຮູ້ ແລະ ຄລິບ ກ່ຽວກັບ ຄວາມປອດໄພ ໃນການເຮັດວຽກຊ່າງ — ໄຟຟ້າ, ວຽກສູງ, ເຄື່ອງມື, ສານເຄມີ.')}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable key={f.key} style={[styles.fchip, on && styles.fchipOn]} onPress={() => setFilter(f.key)}>
                <Text style={[styles.fchipT, on && styles.fchipTOn]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {shown.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyIcon}>📭</Text><Text style={styles.emptyT}>{tt('learn', 'ຍັງບໍ່ມີ ຄລິບ')}</Text></View>
        ) : (
          <View style={styles.grid}>
            {shown.map((c) => <View key={c.id} style={styles.gcell}><ClipCard clip={c} /></View>)}
          </View>
        )}

        <View style={styles.priceHero}>
          <Text style={styles.priceHeroT}>🚩 {tt('learn', 'ລະວັງ ລາຄາ ຫຼອກ')}</Text>
          <Text style={styles.priceHeroP}>{tt('learn', 'ວິທີ ຈັບ ຜິດ ການ ຄິດ ເງິນ ເກີນ ກ່ອນ ຈ້າງ ຊ່າງ')}</Text>
        </View>
        <View style={styles.tips}>
          {PRICE_TIPS.map((t, i) => (
            <View key={i} style={[styles.tip, i === PRICE_TIPS.length - 1 && styles.tipLast]}>
              <Text style={styles.tipIcon}>{t.icon}</Text>
              <Text style={styles.tipT}>{tt('learn', t.text)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.subh}>{tt('learn', 'ຂໍ້ຄວນລະວັງ (Tips)')}</Text>
        <View style={styles.tips}>
          {TIPS.map((t, i) => (
            <View key={i} style={[styles.tip, i === TIPS.length - 1 && styles.tipLast]}>
              <Text style={styles.tipN}>{i + 1}.</Text>
              <Text style={styles.tipT}>{tt('learn', t)}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: MAX_W },
  back: { paddingVertical: 8 },
  backT: { color: '#0066CC', fontWeight: '700', fontSize: 13 },
  hero: { backgroundColor: '#c2410c', borderRadius: 14, padding: 16, marginBottom: 14 },
  heroT: { color: '#fff', fontSize: 15, fontWeight: '800' },
  heroP: { color: '#fff', fontSize: 12, opacity: 0.95, marginTop: 4, lineHeight: 19 },
  filters: { gap: 6, paddingBottom: 12 },
  fchip: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  fchipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  fchipT: { fontSize: 12, color: '#475569' },
  fchipTOn: { color: '#fff', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  gcell: { width: '48.5%' },
  subh: { fontSize: 14, fontWeight: '800', color: '#111', marginTop: 20, marginBottom: 10 },
  tips: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12 },
  tip: { flexDirection: 'row', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'flex-start' },
  tipLast: { borderBottomWidth: 0 },
  tipN: { color: '#c2410c', fontWeight: '800', fontSize: 13 },
  tipIcon: { fontSize: 15, width: 20, textAlign: 'center' },
  tipT: { flex: 1, fontSize: 13, color: '#334155', lineHeight: 20 },
  priceHero: { backgroundColor: '#9a3412', borderRadius: 14, padding: 14, marginTop: 20, marginBottom: 10 },
  priceHeroT: { color: '#fff', fontSize: 15, fontWeight: '800' },
  priceHeroP: { color: '#fff', fontSize: 12, opacity: 0.95, marginTop: 3 },
  empty: { backgroundColor: '#fff', padding: 32, borderRadius: 12, alignItems: 'center' },
  emptyIcon: { fontSize: 40 },
  emptyT: { fontSize: 14, color: '#6b7280', marginTop: 8 },
});
