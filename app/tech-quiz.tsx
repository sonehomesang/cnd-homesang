import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import {
  type PublicQuizQuestion,
  type QuizAttempt,
  submitQuizAttempt,
  watchMyAttempt,
  watchPublicQuiz,
} from '@/lib/techQuiz';
import { useTT } from '@/lib/i18n';
import { colors, font, radius, shadow } from '@/lib/theme';
import BackButton from '@/components/BackButton';

export default function TechQuizScreen() {
  const { fbUser, profile, loading } = useAuth();
  const tt = useTT();
  const trade = (profile as any)?.subType as string | undefined;
  const [questions, setQuestions] = useState<PublicQuizQuestion[]>([]);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [retake, setRetake] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => watchPublicQuiz(trade, setQuestions), [trade]);
  useEffect(() => { if (fbUser) return watchMyAttempt(fbUser.uid, setAttempt); }, [fbUser]);

  if (loading) return <View style={styles.center}><Text style={styles.muted}>{tt('techQuiz', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  if (!fbUser) return <Redirect href={'/sign-in' as any} />;

  const submitted = !!attempt && !retake;

  const submit = async () => {
    setBusy(true);
    try {
      await submitQuizAttempt(fbUser.uid, {
        answers: questions.map((_, i) => answers[i] ?? -1),
        questionIds: questions.map((q) => q.id),
        trade,
      });
      setRetake(false);
    } finally { setBusy(false); }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <BackButton />
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>📝</Text>
          <Text style={styles.heroTitle}>{tt('techQuiz', 'ຂໍ້ ທົດ ສອບ ຊ່າງ')}</Text>
          <Text style={styles.heroSub}>{tt('techQuiz', 'ຕອບ ໃຫ້ ດີ ທີ່ ສຸດ — ທີມ ງານ ຈະ ກວດ ຄະ ແນນ ຕອນ ຢືນ ຢັນ')}</Text>
        </View>

        {questions.length === 0 ? (
          <View style={styles.card}><Text style={styles.muted}>{tt('techQuiz', 'ຍັງ ບໍ່ ມີ ຂໍ້ ທົດ ສອບ ຕອນ ນີ້ — ລໍ ທີມ ງານ ເພີ່ມ')}</Text></View>
        ) : submitted ? (
          <View style={styles.card}>
            <View style={styles.done}><Text style={styles.doneBig}>✅ {tt('techQuiz', 'ສົ່ງ ຄຳ ຕອບ ແລ້ວ!')}</Text><Text style={styles.doneSub}>{tt('techQuiz', 'ທີມ ງານ ຈະ ກວດ ຄະ ແນນ ໃຫ້ ຕອນ ພິ ຈາ ລະ ນາ ຢືນ ຢັນ')}</Text></View>
            <Text style={styles.lock}>🔒 {tt('techQuiz', 'ເຈົ້າ ບໍ່ ເຫັນ ຄຳ ຕອບ ຖືກ · ຄະ ແນນ ຄິດ ຝ່າຍ ທີມ ງານ')}</Text>
            <Pressable style={styles.retakeBtn} onPress={() => { setRetake(true); setIdx(0); setAnswers({}); }}><Text style={styles.retakeT}>{tt('techQuiz', '🔄 ເຮັດ ຄືນ ໃໝ່')}</Text></Pressable>
            <Pressable style={styles.linkBtn} onPress={() => router.back()}><Text style={styles.linkT}>{tt('techQuiz', '← ກັບ')}</Text></Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.prog}>{tt('techQuiz', 'ຂໍ້')} {idx + 1} / {questions.length}</Text>
            <Text style={styles.qq}>{questions[idx].question}</Text>
            {!!questions[idx].standard && <Text style={styles.std}>📖 {questions[idx].standard}</Text>}
            {questions[idx].options.map((o, i) => (
              <Pressable key={i} style={[styles.opt, answers[idx] === i && styles.optOn]} onPress={() => setAnswers((a) => ({ ...a, [idx]: i }))}>
                <View style={[styles.rd, answers[idx] === i && styles.rdOn]} />
                <Text style={styles.optT}>{o}</Text>
              </Pressable>
            ))}
            <View style={styles.nav}>
              {idx > 0 && <Pressable style={[styles.navBtn, styles.back]} onPress={() => setIdx(idx - 1)}><Text style={styles.backT}>← {tt('techQuiz', 'ກັບ')}</Text></Pressable>}
              {idx < questions.length - 1
                ? <Pressable style={[styles.navBtn, styles.next, answers[idx] === undefined && styles.off]} disabled={answers[idx] === undefined} onPress={() => setIdx(idx + 1)}><Text style={styles.nextT}>{tt('techQuiz', 'ຕໍ່ ໄປ')} →</Text></Pressable>
                : <Pressable style={[styles.navBtn, styles.next, (answers[idx] === undefined || busy) && styles.off]} disabled={answers[idx] === undefined || busy} onPress={submit}><Text style={styles.nextT}>{busy ? '...' : tt('techQuiz', 'ສົ່ງ ຄຳ ຕອບ')}</Text></Pressable>}
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 560 },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.text3, fontSize: font.sm },
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: 18, alignItems: 'center', marginTop: 6, ...shadow.card },
  heroEmoji: { fontSize: 30 },
  heroTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 6 },
  heroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, marginTop: 14, ...shadow.card },
  prog: { fontSize: 12, color: colors.text2, fontWeight: '700', marginBottom: 8 },
  qq: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 4 },
  std: { fontSize: 12, color: colors.primary, fontWeight: '700', marginBottom: 10 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 9 },
  optOn: { borderColor: colors.primary, backgroundColor: '#EAF2FB' },
  rd: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#cbd5e1' },
  rdOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  optT: { fontSize: 14, color: colors.text, flex: 1 },
  nav: { flexDirection: 'row', gap: 10, marginTop: 16 },
  navBtn: { flex: 1, borderRadius: radius.md, padding: 13, alignItems: 'center' },
  back: { backgroundColor: '#f1f5f9', flex: 0, paddingHorizontal: 20 }, backT: { color: colors.text2, fontWeight: '800' },
  next: { backgroundColor: colors.primary }, nextT: { color: '#fff', fontWeight: '800' },
  off: { opacity: 0.5 },
  done: { backgroundColor: '#e7f7ee', borderWidth: 1, borderColor: '#bfe6cf', borderRadius: radius.lg, padding: 16, alignItems: 'center' },
  doneBig: { fontSize: 15, fontWeight: '900', color: '#166534' },
  doneSub: { fontSize: 12.5, color: '#166534', marginTop: 4, textAlign: 'center' },
  lock: { fontSize: 12, color: colors.text3, marginTop: 12, textAlign: 'center' },
  retakeBtn: { backgroundColor: '#EAF2FB', borderRadius: radius.md, padding: 12, alignItems: 'center', marginTop: 14 },
  retakeT: { color: '#004a97', fontWeight: '800', fontSize: 13 },
  linkBtn: { padding: 12, alignItems: 'center' },
  linkT: { color: colors.text2, fontWeight: '700' },
});
