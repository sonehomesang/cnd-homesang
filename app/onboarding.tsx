import { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTT, ttStatic } from '@/lib/i18n';
import { colors, font, radius } from '@/lib/theme';

const SLIDES = [
  { icon: '👋', title: ttStatic('onboarding', 'ຍິນດີຕ້ອນຮັບ'), body: ttStatic('onboarding', 'ໂຮມຊ່າງ — ຕະຫຼາດ ບໍລິການ ແລະ ສິນຄ້າ ສຳລັບເຮືອນ ຄົບໃນບ່ອນດຽວ'), bg: '#0066CC' },
  { icon: '🛠️', title: ttStatic('onboarding', 'ໂຮມຊ່າງ'), body: ttStatic('onboarding', 'ໂພສງານ → ຊ່າງສະເໜີລາຄາ → ເລືອກຊ່າງ ໃກ້ຕົວ ທີ່ມີຄະແນນດີ'), bg: '#FF6B35' },
  { icon: '🛒', title: ttStatic('onboarding', 'ໂຮມຊ໊ອບ'), body: ttStatic('onboarding', 'ຊື້ວັດສະດຸ ກໍ່ສ້າງ ໄຟຟ້າ ປະປາ ແອ — ສົ່ງເຖິງບ້ານ'), bg: '#10B981' },
  { icon: '🫂', title: ttStatic('onboarding', 'ໂຮມເພື່ອນ'), body: ttStatic('onboarding', 'ຊຸມຊົນ ຊ່າງ ແລະ ລູກຄ້າ — ແບ່ງປັນ ຖາມ-ຕອບ ຊື້-ຂາຍ'), bg: '#0066CC' },
  { icon: '🚀', title: ttStatic('onboarding', 'ເລີ່ມໃຊ້ ຟຣີ'), body: ttStatic('onboarding', 'ສະໝັກງ່າຍໆ ດ້ວຍເບີໂທ — ບໍ່ມີຄ່າໃຊ້ຈ່າຍ'), bg: '#004A99' },
];

function done() {
  if (Platform.OS === 'web') {
    try { localStorage.setItem('hs_onboarded', '1'); } catch {}
  }
}

export default function OnboardingScreen() {
  const tt = useTT();
  const { width } = useWindowDimensions();
  const w = Math.min(width, 560);
  const [idx, setIdx] = useState(0);
  const ref = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIdx(Math.round(e.nativeEvent.contentOffset.x / w));
  };
  const finish = () => { done(); router.replace('/sign-in' as any); };
  const skip = () => { done(); router.replace('/' as any); };
  const next = () => {
    if (idx >= SLIDES.length - 1) return finish();
    ref.current?.scrollTo({ x: (idx + 1) * w, animated: true });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.carousel, { width: w, alignSelf: 'center' }]}>
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}>
          {SLIDES.map((s, i) => (
            <View key={i} style={[styles.slide, { width: w }]}>
              <View style={[styles.iconWrap, { backgroundColor: s.bg }]}>
                <Text style={styles.icon}>{s.icon}</Text>
              </View>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === idx && styles.dotOn]} />
        ))}
      </View>

      <View style={[styles.actions, { width: w, alignSelf: 'center' }]}>
        <Pressable onPress={skip}><Text style={styles.skip}>{tt('onboarding', 'ຂ້າມ')}</Text></Pressable>
        <Pressable style={styles.next} onPress={next}>
          <Text style={styles.nextText}>{idx >= SLIDES.length - 1 ? tt('onboarding', '🚀 ເລີ່ມ') : tt('onboarding', 'ຕໍ່ໄປ →')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, justifyContent: 'center', paddingVertical: 24 },
  carousel: { flexGrow: 0 },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  iconWrap: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  icon: { fontSize: 56 },
  title: { fontSize: font.xxl, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: font.md, color: colors.text2, textAlign: 'center', marginTop: 12, lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.primary, width: 22 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, paddingHorizontal: 24 },
  skip: { color: colors.text3, fontSize: font.md, padding: 8 },
  next: { backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 28, paddingVertical: 13 },
  nextText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});
