import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { CATEGORIES } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import { createInstantJob } from '@/lib/jobs';
import { colors, font, radius, shadow, space } from '@/lib/theme';
import { useTT } from '@/lib/i18n';
import AmountInput from '@/components/AmountInput';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fbUser, profile } = useAuth();
  const [tech, setTech] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [address, setAddress] = useState('');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const tt = useTT();

  useEffect(() => {
    if (!id) return;
    // read the technician's PUBLIC card (name/specialties/image), not their
    // private users doc (phone/address no longer readable cross-user)
    getDoc(doc(db, 'techCards', id)).then((s) => {
      setTech(s.exists() ? s.data() : null);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    // default category to the tech's first specialty
    const sp = tech?.specialties;
    if (Array.isArray(sp) && sp.length && !cat) setCat(sp[0]);
  }, [tech, cat]);

  if (loading) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('book','ກຳລັງໂຫຼດ...')}</Text></View>;
  }
  if (!fbUser) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{tt('book','ກະລຸນາເຂົ້າສູ່ລະບົບ ເພື່ອຈ້າງ')}</Text>
        <Pressable style={styles.primary} onPress={() => router.push('/sign-in' as any)}>
          <Text style={styles.primaryText}>{tt('book','ເຂົ້າສູ່ລະບົບ')}</Text>
        </Pressable>
      </View>
    );
  }
  if (!tech || fbUser.uid === id) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{!tech ? tt('book','ບໍ່ພົບຊ່າງ') : tt('book','ຈ້າງຕົນເອງ ບໍ່ໄດ້')}</Text>
        <BackButton />
      </View>
    );
  }

  const techName = tech.name || [tech.firstName, tech.lastName].filter(Boolean).join(' ') || tt('book','ຊ່າງ');
  const priceNum = Number(price.replace(/[^\d]/g, '')) || 0;

  const submit = async () => {
    if (!cat) { setError(tt('book','ເລືອກ ປະເພດບໍລິການ')); return; }
    if (title.trim().length < 3) { setError(tt('book','ໃສ່ຫົວຂໍ້ງານ')); return; }
    if (priceNum <= 0) { setError(tt('book','ໃສ່ ລາຄາ ທີ່ຕົກລົງ')); return; }
    setSubmitting(true);
    setError('');
    try {
      const jobId = await createInstantJob({
        customerId: fbUser.uid,
        technicianId: id,
        technicianName: techName,
        category: cat,
        title: title.trim(),
        description: desc.trim(),
        address: address.trim() || undefined,
        lat: profile?.lat,
        lng: profile?.lng,
        price: priceNum,
      });
      router.replace(`/jobs/${jobId}` as any);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{tt('book','⚡ ຈ້າງ')} {techName} {tt('book','ໂດຍກົງ')}</Text>
        <Text style={styles.sub}>{tt('book','ສ້າງງານ ມອບໝາຍໃຫ້ຊ່າງນີ້ ທັນທີ ໃນລາຄາທີ່ຕົກລົງກັນ (ບໍ່ຕ້ອງລໍປະມູນ).')}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>{tt('book','ປະເພດບໍລິການ')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
            {CATEGORIES.map((c) => (
              <Pressable key={c.value} style={[styles.chip, cat === c.value && styles.chipOn]} onPress={() => setCat(c.value)}>
                <Text style={[styles.chipText, cat === c.value && styles.chipTextOn]}><CategoryIcon icon={c.icon} size={13} color={cat === c.value ? '#fff' : colors.text2} /> {c.lao}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.label}>{tt('book','ຫົວຂໍ້ງານ')}</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder={tt('book','ເຊັ່ນ: ຕິດຕັ້ງ ໄຟຟ້າ ໃນເຮືອນ')} placeholderTextColor={colors.text3} style={styles.input} />

          <Text style={styles.label}>{tt('book','ລາຍລະອຽດ')}</Text>
          <TextInput value={desc} onChangeText={setDesc} multiline placeholder={tt('book','ອະທິບາຍ ວຽກທີ່ຕ້ອງການ...')} placeholderTextColor={colors.text3} style={[styles.input, styles.textarea]} />

          <Text style={styles.label}>{tt('book','ສະຖານທີ່ (ຖ້າມີ)')}</Text>
          <TextInput value={address} onChangeText={setAddress} placeholder={tt('book','ບ້ານ / ເມືອງ')} placeholderTextColor={colors.text3} style={styles.input} />

          <Text style={styles.label}>{tt('book','ລາຄາ ທີ່ຕົກລົງ (ກີບ)')}</Text>
          <AmountInput value={price ? Number(price) : 0} onChangeValue={(n) => setPrice(n ? String(n) : '')} placeholder="0" placeholderTextColor={colors.text3} style={styles.input} />

          {error !== '' && <Text style={styles.error}>❌ {error}</Text>}
          <Pressable style={[styles.primary, submitting && styles.off]} onPress={submit} disabled={submitting}>
            <Text style={styles.primaryText}>{submitting ? tt('book','ກຳລັງສ້າງ...') : tt('book','⚡ ຢືນຢັນການຈ້າງ')}</Text>
          </Pressable>
        </View>

        <BackButton />
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 640 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 },
  muted: { color: colors.text3, textAlign: 'center' },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.text },
  sub: { fontSize: font.sm, color: colors.text2, marginTop: 4, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, marginTop: space.lg, ...shadow.card },
  label: { fontSize: font.sm, color: colors.text2, fontWeight: '600', marginTop: space.md, marginBottom: 6 },
  cats: { gap: 6, paddingBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.xs, color: colors.text2 },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, fontSize: font.md, color: colors.text, backgroundColor: colors.surface },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  error: { color: colors.error, fontSize: font.sm, marginTop: space.sm },
  primary: { backgroundColor: colors.secondary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: space.lg },
  off: { opacity: 0.6 },
  primaryText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});
