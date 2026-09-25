import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  type TechQuizQuestion,
  clearMockQuiz,
  createQuizQuestion,
  deleteQuizQuestion,
  seedQuizIfEmpty,
  setQuizActive,
  watchQuizQuestions,
} from '@/lib/techQuiz';
import MockBadge from '@/components/MockBadge';
import { isMock, useMockEnabled } from '@/lib/mock';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';

const P = 'admTechVerify';
const TRADES = ['ໄຟຟ້າ', 'ປະປາ', 'ແອ', 'ຊ່າງ ໄມ້', 'ທາ ສີ', 'ທົ່ວ ໄປ'];

export default function TechQuizBuilder() {
  const { canCreate, canEdit, canDelete } = useSectionPerms('techverify');
  const tt = useTT();
  const mockEnabled = useMockEnabled();
  const [qs, setQs] = useState<TechQuizQuestion[]>([]);
  const [question, setQuestion] = useState('');
  const [opts, setOpts] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [trade, setTrade] = useState('ທົ່ວ ໄປ');
  const [standard, setStandard] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => watchQuizQuestions(setQs), []);

  const setOpt = (i: number, v: string) => setOpts((cur) => cur.map((o, idx) => (idx === i ? v : o)));
  const add = async () => {
    if (!question.trim() || opts.filter((o) => o.trim()).length < 2) return;
    setBusy(true);
    try {
      await createQuizQuestion({ question, options: opts, correctIndex: correct, trade, standard: standard || undefined });
      setQuestion(''); setOpts(['', '', '', '']); setCorrect(0); setStandard('');
    } finally { setBusy(false); }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.h}>📝 {tt(P, 'ຄັງ ຂໍ້ ທົດ ສอບ')}</Text>
      <Text style={styles.hint}>{tt(P, 'admin ກຳ ນົດ ເອງ ອີງ ມາດ ຕະ ຖານ NFPA · ຊ່າງ ບໍ່ ເຫັນ ຄຳ ຕອບ ຖືກ')}</Text>

      {canCreate && (
        <View style={styles.form}>
          <TextInput value={question} onChangeText={setQuestion} placeholder={tt(P, 'ຄຳ ຖາມ')} placeholderTextColor="#999" style={styles.input} multiline />
          <Text style={styles.lbl}>{tt(P, 'ຕົວ ເລືອກ (ແຕະ ✓ = ຄຳ ຕອບ ຖືກ)')}</Text>
          {opts.map((o, i) => (
            <View key={i} style={styles.optRow}>
              <Pressable style={[styles.mark, correct === i && styles.markOn]} onPress={() => setCorrect(i)}><Text style={styles.markT}>{correct === i ? '✓' : ''}</Text></Pressable>
              <TextInput value={o} onChangeText={(v) => setOpt(i, v)} placeholder={`${tt(P, 'ຕົວ ເລືອກ')} ${i + 1}${i >= 2 ? ` (${tt(P, 'ວ່າງ ໄດ້')})` : ''}`} placeholderTextColor="#999" style={[styles.input, { flex: 1 }]} />
            </View>
          ))}
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lbl}>{tt(P, 'ໝວດ ຊ່າງ')}</Text>
              <View style={styles.chips}>{TRADES.map((t) => (
                <Pressable key={t} style={[styles.chip, trade === t && styles.chipOn]} onPress={() => setTrade(t)}><Text style={[styles.chipT, trade === t && styles.chipTOn]}>{t}</Text></Pressable>
              ))}</View>
            </View>
          </View>
          <Text style={styles.lbl}>{tt(P, 'ອ້າງ ມາດ ຕະ ຖານ')}</Text>
          <TextInput value={standard} onChangeText={setStandard} placeholder="NFPA 70E" placeholderTextColor="#999" style={styles.input} />
          <Pressable style={[styles.btn, busy && styles.off]} onPress={add} disabled={busy}><Text style={styles.btnT}>{busy ? '...' : `＋ ${tt(P, 'ບັນທຶກ ຂໍ້ ຖາມ')}`}</Text></Pressable>
        </View>
      )}

      {mockEnabled && (
        <View style={styles.seedRow}>
          <Pressable style={styles.seed} onPress={() => seedQuizIfEmpty()}><Text style={styles.seedT}>🌱 {tt(P, 'ໃສ່ ຕົວຢ່າງ')}</Text></Pressable>
          <Pressable style={styles.seed} onPress={() => clearMockQuiz()}><Text style={styles.seedT}>{tt(P, 'ລ້າງ ຕົວຢ່າງ')}</Text></Pressable>
        </View>
      )}

      <Text style={styles.count}>{tt(P, 'ຂໍ້ ຖາມ')} ({qs.length})</Text>
      {qs.map((q) => (
        <View key={q.id} style={[styles.qitem, !q.active && styles.qoff]}>
          <View style={{ flex: 1 }}>
            <View style={styles.qhead}><Text style={styles.qtext}>{q.question}</Text>{isMock(q) && <MockBadge small />}</View>
            <Text style={styles.qmeta}>{q.trade || 'ທົ່ວ ໄປ'}{q.standard ? ` · 📖 ${q.standard}` : ''} · ✅ {q.options[q.correctIndex] ?? '—'}</Text>
          </View>
          {canEdit && <Pressable style={[styles.mini, { backgroundColor: q.active ? '#16a34a' : '#64748b' }]} onPress={() => setQuizActive(q.id, !q.active)}><Text style={styles.miniT}>{q.active ? tt(P, 'ເປີດ') : tt(P, 'ປິດ')}</Text></Pressable>}
          {canDelete && <Pressable onPress={() => deleteQuizQuestion(q.id)} hitSlop={6} style={styles.del}><Text style={styles.delT}>✕</Text></Pressable>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 12, padding: 12, backgroundColor: '#fbfcfe' },
  h: { fontSize: 12.5, fontWeight: '800', color: '#111' },
  hint: { fontSize: 12, color: '#8b95a5', marginTop: 2, marginBottom: 8 },
  form: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10, backgroundColor: '#fff' },
  input: { borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 8, padding: 9, fontSize: 13.5, color: '#111', backgroundColor: '#fff', marginBottom: 6 },
  lbl: { fontSize: 12, fontWeight: '800', color: '#556072', marginTop: 6, marginBottom: 5 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  mark: { width: 32, height: 32, borderRadius: 8, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  markOn: { backgroundColor: '#1f9d57', borderColor: '#1f9d57' },
  markT: { color: '#fff', fontWeight: '900', fontSize: 13 },
  row2: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#EAF2FB', borderColor: '#0066CC' },
  chipT: { fontSize: 12, fontWeight: '700', color: '#556072' }, chipTOn: { color: '#004a97' },
  btn: { backgroundColor: '#0066CC', borderRadius: 8, padding: 11, alignItems: 'center', marginTop: 10 },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  off: { opacity: 0.5 },
  seedRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  seed: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 9, alignItems: 'center', backgroundColor: '#fff' },
  seedT: { fontSize: 12, fontWeight: '700', color: '#475569' },
  count: { fontSize: 12, fontWeight: '800', color: '#111', marginTop: 14, marginBottom: 8 },
  qitem: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10, marginBottom: 7, backgroundColor: '#fff' },
  qoff: { opacity: 0.55 },
  qhead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  qtext: { fontSize: 13, fontWeight: '700', color: '#111' },
  qmeta: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  mini: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 },
  miniT: { color: '#fff', fontSize: 12, fontWeight: '700' },
  del: { paddingHorizontal: 4 }, delT: { color: '#dc2626', fontWeight: '900', fontSize: 14 },
});
