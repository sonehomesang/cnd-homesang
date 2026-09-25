import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow } from '@/lib/theme';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

const DAYS: { key: string; lao: string }[] = [
  { key: 'mon', lao: 'ຈັນ' },
  { key: 'tue', lao: 'ອັງຄານ' },
  { key: 'wed', lao: 'ພຸດ' },
  { key: 'thu', lao: 'ພະຫັດ' },
  { key: 'fri', lao: 'ສຸກ' },
  { key: 'sat', lao: 'ເສົາ' },
  { key: 'sun', lao: 'ອາທິດ' },
];

type Day = { available: boolean; open: string; close: string };
type Schedule = Record<string, Day>;

function defaults(): Schedule {
  const s: Schedule = {};
  DAYS.forEach((d) => {
    s[d.key] = { available: d.key !== 'sun', open: '08:00', close: '17:00' };
  });
  return s;
}

export default function WorkScheduleScreen() {
  const { fbUser, profile, loading } = useAuth();
  const tt = useTT();
  const [sched, setSched] = useState<Schedule>(defaults());
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    if (!loading && !fbUser) router.replace('/sign-in' as any);
  }, [fbUser, loading]);

  useEffect(() => {
    const existing = (profile as any)?.workSchedule as Schedule | undefined;
    if (existing) setSched({ ...defaults(), ...existing });
  }, [profile]);

  const setDay = (key: string, patch: Partial<Day>) =>
    setSched((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  const save = async () => {
    if (!fbUser) return;
    setStatus('saving');
    try {
      await setDoc(doc(db, 'users', fbUser.uid), { workSchedule: sched, updatedAt: serverTimestamp() }, { merge: true });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1800);
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? String(e)));
      setStatus('idle');
    }
  };

  if (loading || !fbUser) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('workSchedule','ກຳລັງໂຫຼດ...')}</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{tt('workSchedule','🗓️ ຕາຕະລາງເຮັດວຽກ')}</Text>
        <Text style={styles.sub}>{tt('workSchedule','ຕັ້ງເວລາວ່າງ ໃຫ້ລູກຄ້າຮູ້ ມື້/ເວລາ ທີ່ຮັບງານ')}</Text>

        {DAYS.map((d) => {
          const day = sched[d.key];
          return (
            <View key={d.key} style={styles.row}>
              <Pressable
                style={[styles.dayToggle, day.available ? styles.on : styles.off]}
                onPress={() => setDay(d.key, { available: !day.available })}>
                <Text style={[styles.dayLabel, day.available && styles.dayLabelOn]}>{d.lao}</Text>
              </Pressable>
              {day.available ? (
                <View style={styles.times}>
                  <TextInput value={day.open} onChangeText={(v) => setDay(d.key, { open: v })} placeholder="08:00" placeholderTextColor="#999" style={styles.timeInput} />
                  <Text style={styles.dash}>–</Text>
                  <TextInput value={day.close} onChangeText={(v) => setDay(d.key, { close: v })} placeholder="17:00" placeholderTextColor="#999" style={styles.timeInput} />
                </View>
              ) : (
                <Text style={styles.closed}>{tt('workSchedule','ປິດ / ບໍ່ວ່າງ')}</Text>
              )}
            </View>
          );
        })}

        <Pressable style={[styles.btn, status === 'saving' && styles.btnOff]} onPress={save} disabled={status === 'saving'}>
          <Text style={styles.btnText}>{status === 'saving' ? tt('workSchedule','ກຳລັງບັນທຶກ...') : status === 'saved' ? tt('workSchedule','✓ ບັນທຶກແລ້ວ') : tt('workSchedule','💾 ບັນທຶກ')}</Text>
        </Pressable>

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
  sub: { fontSize: font.sm, color: colors.text2, marginTop: 2, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12, marginBottom: 8, ...shadow.card },
  dayToggle: { width: 70, paddingVertical: 9, borderRadius: radius.md, alignItems: 'center', borderWidth: 1 },
  on: { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  off: { backgroundColor: colors.surface2, borderColor: colors.border },
  dayLabel: { fontSize: font.sm, color: colors.text3, fontWeight: '600' },
  dayLabelOn: { color: '#15803d' },
  times: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  timeInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 9, fontSize: font.sm, color: colors.text, textAlign: 'center' },
  dash: { color: colors.text3 },
  closed: { flex: 1, color: colors.text3, fontSize: font.sm },
  btn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: 14, alignItems: 'center', marginTop: 16 },
  btnOff: { backgroundColor: '#A8CAEE' },
  btnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
});
