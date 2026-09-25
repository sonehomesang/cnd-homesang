import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import {
  type TechApplication,
  saveTechProfile,
  submitTechApplication,
  watchMyTechApplication,
} from '@/lib/techOnboarding';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow } from '@/lib/theme';
import PhotoPicker from '@/components/PhotoPicker';
import BackButton from '@/components/BackButton';
import AppFooter from '@/components/AppFooter';

const TRADES = ['ໄຟຟ້າ', 'ປະປາ', 'ແອ', 'ຊ່າງ ໄມ້', 'ທາ ສີ', 'ວິສະວະກອນ', 'ອື່ນໆ'];
const SPECIALTIES = ['ຕິດ ຕັ້ງ ໄຟ', 'ສ້ອມ ໄຟ', 'ຕິດ ແອ', 'ລ້າງ ແອ', 'ຕໍ່ ທໍ່ ນ້ຳ', 'ສ້ອມ ປໍ້າ ນ້ຳ', 'ຕິດ ກ້ອງ', 'ຕິດ ເຄື່ອງ ໃຊ້ ໄຟ', 'ທາ ສີ', 'ວຽກ ໄມ້'];

function displayName(p: any): string {
  return p?.name || [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'ຜູ້ໃຊ້';
}

export default function BecomeTechScreen() {
  const { fbUser, profile, loading } = useAuth();
  const tt = useTT();
  const isTech = ((profile as any)?.roles ?? []).includes('technician');
  const verified = (profile as any)?.verified === true;
  const listed = (profile as any)?.techListed !== false;

  const [app, setApp] = useState<TechApplication | null>(null);
  const [trade, setTrade] = useState('');
  const [specs, setSpecs] = useState<string[]>([]);
  const [desc, setDesc] = useState('');
  const [area, setArea] = useState('');
  const [years, setYears] = useState('');
  const [portfolio, setPortfolio] = useState<string[]>([]);
  const [idDocs, setIdDocs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!fbUser) return;
    // prefill from the existing profile (for a technician editing) or application
    const p = profile as any;
    setTrade(p?.subType || '');
    setSpecs(Array.isArray(p?.specialties) ? p.specialties : []);
    setDesc(p?.roleDescription || '');
    setArea(p?.address || '');
    setPortfolio(Array.isArray(p?.portfolio) ? p.portfolio : []);
    return watchMyTechApplication(fbUser.uid, setApp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbUser]);

  const toggleSpec = (s: string) => setSpecs((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const data = () => ({
    subType: trade || undefined,
    specialties: specs.length ? specs : undefined,
    roleDescription: desc.trim() || undefined,
    address: area.trim() || undefined,
    years: years ? Number(years.replace(/\D/g, '')) || undefined : undefined,
    portfolio: portfolio.length ? portfolio : undefined,
    idDocs: idDocs.length ? idDocs : undefined,
  });

  const submit = async () => {
    if (!fbUser) return;
    if (!trade) { setMsg(tt('becomeTech', '⚠️ ເລືອກ ປະ ເພດ ຊ່າງ ກ່ອນ')); return; }
    setBusy(true); setMsg('');
    try {
      if (isTech) {
        await saveTechProfile(fbUser.uid, data());
        setMsg(tt('becomeTech', '✓ ບັນທຶກ ໂປຣ ໄຟລ ຊ່າງ ແລ້ວ'));
      } else {
        await submitTechApplication(fbUser.uid, displayName(profile), data());
        setMsg(tt('becomeTech', '✓ ສົ່ງ ໃບ ສະໝັກ ແລ້ວ — ລໍ ທີມ ງານ ອະນຸ ມັດ'));
      }
    } catch (e: any) { setMsg('❌ ' + (e?.message ?? String(e))); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.center}><Text style={styles.muted}>{tt('becomeTech', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  if (!fbUser) return <Redirect href={'/sign-in' as any} />;

  const pending = !isTech && app?.status === 'pending';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <BackButton />

        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>🧑‍🔧</Text>
          <Text style={styles.heroTitle}>{isTech ? tt('becomeTech', 'ໂປຣ ໄຟລ ຊ່າງ ຂອງ ຂ້ອຍ') : tt('becomeTech', 'ມາ ເປັນ ຊ່າງ ກັບ ໂຮມຊ່າງ')}</Text>
          <Text style={styles.heroSub}>{tt('becomeTech', 'ຮັບ ວຽກ ໃກ້ ບ້ານ · ໃບ ສະ ເໜີ ລາຄາ · ຮັບ ເງິນ ຜ່ານ ລະບົບ')}</Text>
        </View>

        {/* status banner for existing techs */}
        {isTech && (
          <View style={[styles.statusB, verified ? styles.stOk : listed ? styles.stInfo : styles.stWarn]}>
            <Text style={styles.statusT}>
              {verified ? tt('becomeTech', '✔️ ບັນຊີ ຊ່າງ ຢືນ ຢັນ ແລ້ວ — ໂຊ badge')
                : listed ? tt('becomeTech', '🟢 ປະກົດ ໃນ ໜ້າ ຫາ ຊ່າງ ແລ້ວ · ລໍ ຢືນ ຢັນ badge')
                  : tt('becomeTech', '⏳ ລໍ ທີມ ງານ ເປີດ ໃຊ້ ກ່ອນ ຈຶ່ງ ປະກົດ')}
            </Text>
          </View>
        )}
        {pending && (
          <View style={[styles.statusB, styles.stWarn]}>
            <Text style={styles.statusT}>{tt('becomeTech', '⏳ ໃບ ສະໝັກ ຂອງ ເຈົ້າ ລໍ ອະນຸ ມັດ — ຈະ ແຈ້ງ ເມື່ອ ເປີດ ໃຊ້')}</Text>
          </View>
        )}

        {(isTech || pending) && (
          <Pressable style={styles.quizBtn} onPress={() => router.push('/tech-quiz' as any)}>
            <Text style={styles.quizBtnT}>📝 {tt('becomeTech', 'ເຮັດ ຂໍ້ ທົດ ສອບ ຢືນ ຢັນ')}</Text>
            <Text style={styles.quizBtnD}>{tt('becomeTech', 'ຊ່ວຍ ໃຫ້ ຢືນ ຢັນ ໄວ ຂຶ້ນ')}</Text>
          </Pressable>
        )}

        <View style={styles.card}>
          <Text style={styles.lbl}>{tt('becomeTech', 'ປະ ເພດ ຊ່າງ')}</Text>
          <View style={styles.chips}>
            {TRADES.map((t) => (
              <Pressable key={t} style={[styles.chip, trade === t && styles.chipOn]} onPress={() => setTrade(t)}>
                <Text style={[styles.chipT, trade === t && styles.chipTOn]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.lbl}>{tt('becomeTech', 'ຄວາມ ຊຳ ນານ (ເລືອກ ໄດ້ ຫຼາຍ)')}</Text>
          <View style={styles.chips}>
            {SPECIALTIES.map((s) => (
              <Pressable key={s} style={[styles.chip, specs.includes(s) && styles.chipOn]} onPress={() => toggleSpec(s)}>
                <Text style={[styles.chipT, specs.includes(s) && styles.chipTOn]}>{s}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.lbl}>{tt('becomeTech', 'ແນະນຳ ຕົນ ເອງ')}</Text>
          <TextInput value={desc} onChangeText={setDesc} multiline placeholder={tt('becomeTech', 'ເຊັ່ນ: ຊ່າງ ໄຟ ປະສົບ ການ 8 ປີ ຮັບ ຕິດ ຕັ້ງ-ສ້ອມ ທົ່ວ ນະຄອນຫຼວງ')} placeholderTextColor="#999" style={[styles.input, styles.textarea]} />

          <View style={styles.row2}>
            <View style={{ flex: 2 }}>
              <Text style={styles.lbl}>{tt('becomeTech', 'ພື້ນ ທີ່ ໃຫ້ ບໍລິການ')}</Text>
              <TextInput value={area} onChangeText={setArea} placeholder={tt('becomeTech', 'ເມືອງ, ແຂວງ')} placeholderTextColor="#999" style={styles.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lbl}>{tt('becomeTech', 'ປະສົບ ການ (ປີ)')}</Text>
              <TextInput value={years} onChangeText={(v) => setYears(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor="#999" style={styles.input} />
            </View>
          </View>
          <Text style={styles.hint}>📍 {tt('becomeTech', 'ໂຊ ລູກຄ້າ ພຽງ ເມືອງ/ແຂວງ — ບໍ່ ໂຊ ທີ່ ຢູ່ ເຕັມ')}</Text>

          <Text style={styles.lbl}>{tt('becomeTech', 'ຮູບ ຜົນ ງານ (ທາງ ເລືອກ)')}</Text>
          <PhotoPicker photos={portfolio} onChange={setPortfolio} pathPrefix={`tech/${fbUser.uid}/portfolio`} max={6} />

          <Text style={styles.lbl}>{tt('becomeTech', 'ບັດ ປະ ຈຳ ຕົວ / ໃບ ຢັ້ງ ຢືນ (ທາງ ເລືອກ — ຊ່ວຍ ຢືນ ຢັນ ໄວ)')}</Text>
          <PhotoPicker photos={idDocs} onChange={setIdDocs} pathPrefix={`tech/${fbUser.uid}/id`} max={3} />
          <Text style={styles.hint}>🔒 {tt('becomeTech', 'ໃຊ້ ສະ ເພາະ ຢືນ ຢັນ ຕົວ ຕົນ ໂດຍ ທີມ ງານ — ບໍ່ ໂຊ ໃຫ້ ລູກຄ້າ')}</Text>

          {msg !== '' && <Text style={styles.msg}>{msg}</Text>}
          <Pressable style={[styles.btn, busy && styles.btnOff]} onPress={submit} disabled={busy}>
            <Text style={styles.btnText}>{busy ? '...' : isTech ? tt('becomeTech', 'ບັນທຶກ ໂປຣ ໄຟລ ຊ່າງ') : tt('becomeTech', 'ສົ່ງ ໃບ ສະໝັກ ເປັນ ຊ່າງ')}</Text>
          </Pressable>
        </View>
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
  muted: { color: colors.text3, marginTop: 6 },
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: 18, alignItems: 'center', marginTop: 6, ...shadow.card },
  heroEmoji: { fontSize: 30 },
  heroTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 6, textAlign: 'center' },
  heroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, marginTop: 4, textAlign: 'center' },
  statusB: { borderRadius: radius.lg, padding: 12, marginTop: 12 },
  stOk: { backgroundColor: '#e7f7ee', borderWidth: 1, borderColor: '#bfe6cf' },
  stInfo: { backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#bcd6f5' },
  stWarn: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#ffd9b0' },
  statusT: { fontSize: 13, fontWeight: '700', color: colors.text },
  quizBtn: { backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#bcd6f5', borderRadius: radius.lg, padding: 14, marginTop: 12, alignItems: 'center' },
  quizBtnT: { fontSize: 14, fontWeight: '800', color: '#004a97' },
  quizBtnD: { fontSize: 12, color: '#004a97', marginTop: 2, opacity: 0.8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 15, marginTop: 12, ...shadow.card },
  lbl: { fontSize: 12.5, fontWeight: '700', color: colors.text2, marginTop: 12, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#EAF2FB', borderColor: colors.primary },
  chipT: { fontSize: 12.5, fontWeight: '700', color: colors.text2 },
  chipTOn: { color: '#004a97' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 11, fontSize: font.md, color: colors.text, backgroundColor: '#fff' },
  textarea: { minHeight: 60, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 8 },
  hint: { fontSize: 12, color: colors.text3, marginTop: 5 },
  msg: { fontSize: font.sm, color: colors.text2, marginTop: 12 },
  btn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: 13, alignItems: 'center', marginTop: 14 },
  btnOff: { backgroundColor: '#A8CAEE' },
  btnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});
