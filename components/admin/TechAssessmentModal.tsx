import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppSettings } from '@/lib/appSettings';
import { type TechAssessment } from '@/lib/techOnboarding';
import { gradeAttempt } from '@/lib/techQuiz';
import { useTT } from '@/lib/i18n';

const P = 'admTechVerify';

export interface AssessDecision { verify: boolean; tier?: string; assessment: TechAssessment; }

/**
 * The 3-step technician verification wizard, driven ENTIRELY by the admin-defined
 * config (checklist criteria + standards, pass threshold, tiers — see
 * appSettings.techAssess*). Reused for HomeSang + CND techs.
 */
export default function TechAssessmentModal({ visible, name, uid, onApprove, onReject, onClose }: {
  visible: boolean;
  name: string;
  uid?: string;
  onApprove: (d: AssessDecision) => void;
  onReject: () => void;
  onClose: () => void;
}) {
  const tt = useTT();
  const s = useAppSettings() as any;
  const criteria: { id: string; label: string; standard?: string }[] = s?.techAssessCriteria ?? [];
  const passPct: number = s?.techAssessPassPct ?? 70;
  const tiers: { key: string; label: string }[] = s?.techAssessTiers ?? [{ key: 'new', label: 'ໃໝ່' }];

  const [step, setStep] = useState(1);
  const [type, setType] = useState<'new' | 'experienced' | ''>('');
  const [score, setScore] = useState('');
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [tier, setTier] = useState(tiers[0]?.key ?? 'new');
  const [quizGrade, setQuizGrade] = useState<{ score: number; correct: number; total: number } | null>(null);

  useEffect(() => { if (visible) { setStep(1); setType(''); setScore(''); setChecks({}); setTier(tiers[0]?.key ?? 'new'); setQuizGrade(null); } }, [visible]);
  // pull the applicant's in-app quiz result (graded admin-side) → prefill the score
  useEffect(() => {
    if (!visible || !uid) return;
    let alive = true;
    gradeAttempt(uid).then((g) => { if (alive && g) { setQuizGrade(g); setScore((cur) => cur || String(g.score)); } }).catch(() => {});
    return () => { alive = false; };
  }, [visible, uid]);

  const passed = type === 'experienced' || (parseInt(score || '0', 10) >= passPct);
  const safePass = criteria.filter((c) => checks[c.id]).length;

  const approve = () => {
    const assessment: TechAssessment = {
      type: type || undefined,
      testScore: type === 'new' && score ? parseInt(score, 10) : undefined,
      passed,
      checklist: checks,
      safePass,
      safeTotal: criteria.length,
      tier,
    };
    onApprove({ verify: true, tier, assessment });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.headRow}>
          <Text style={styles.title}>🧑‍🔧 {tt(P, 'ປະ ເມີນ ຊ່າງ')} · {name}</Text>
          <Pressable onPress={onClose} hitSlop={8}><Text style={styles.close}>✕</Text></Pressable>
        </View>

        {/* stepper */}
        <View style={styles.steps}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={styles.stp}>
              <View style={[styles.dot, step === n && styles.dotOn, step > n && styles.dotDone]}><Text style={[styles.dotT, (step >= n) && styles.dotTOn]}>{n}</Text></View>
              <Text style={styles.cap}>{n === 1 ? tt(P, 'ຄັດ') : n === 2 ? tt(P, 'ປະ ເມີນ') : tt(P, 'ຄຸນ ນະ ພາບ')}</Text>
            </View>
          ))}
        </View>

        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {step === 1 && (
            <View>
              <Text style={styles.lbl}>{tt(P, 'ຜູ້ ສະໝັກ ເປັນ ປະ ເພດ ໃດ?')}</Text>
              <View style={styles.pick}>
                <Pressable style={[styles.opt, type === 'new' && styles.optOn]} onPress={() => setType('new')}>
                  <Text style={styles.optE}>🌱</Text><Text style={styles.optT}>{tt(P, 'ໃໝ່ / ຈົບ ໃໝ່')}</Text><Text style={styles.optD}>{tt(P, 'ທົດ ສอບ + ກວດ ປະ ຫວັດ')}</Text>
                </Pressable>
                <Pressable style={[styles.opt, type === 'experienced' && styles.optOn]} onPress={() => setType('experienced')}>
                  <Text style={styles.optE}>🛠️</Text><Text style={styles.optT}>{tt(P, 'ເກົ່າ / ມີ ປະສົບ ການ')}</Text><Text style={styles.optD}>{tt(P, 'ກວດ ຜົນ ງານ + ອ້າງ ອີງ')}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === 2 && type === 'new' && (
            <View>
              <Text style={styles.lbl}>{tt(P, 'ຄະ ແນນ ທົດ ສอບ')} (0–100) · {tt(P, 'ເກນ ຜ່ານ')} ≥ {passPct}</Text>
              <View style={styles.scoreRow}>
                <TextInput value={score} onChangeText={(v) => setScore(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor="#999" style={styles.input} />
                <Text style={[styles.pass, passed ? styles.passOk : styles.passNo]}>{passed ? tt(P, 'ຜ່ານ ✓') : tt(P, 'ບໍ່ ຜ່ານ')}</Text>
              </View>
              {quizGrade
                ? <Text style={styles.quizNote}>📝 {tt(P, 'ຄະ ແນນ quiz ໃນ ແອັບ')}: {quizGrade.score}% ({quizGrade.correct}/{quizGrade.total}) · {tt(P, 'ແກ້ ໄດ້')}</Text>
                : <Text style={styles.hint}>{tt(P, '💡 ໃສ່ ຄະ ແນນ manual · ຫຼື ຖ້າ ຊ່າງ ເຮັດ quiz ໃນ ແອັບ ຄະ ແນນ ຈະ ຂຶ້ນ ເອງ')}</Text>}
            </View>
          )}
          {step === 2 && type === 'experienced' && (
            <Text style={styles.hint}>{tt(P, '📷 ກວດ ຜົນ ງານ + ອ້າງ ອີງ ຂອງ ຊ່າງ (ເບິ່ງ ຮູບ ໃນ ໃບ ສະໝັກ) ແລ້ວ ໄປ ຂັ້ນ ຄຸນ ນະ ພາບ')}</Text>
          )}
          {step === 2 && !type && <Text style={styles.hint}>{tt(P, 'ເລືອກ ປະ ເພດ ຜູ້ ສະໝັກ ກ່ອນ')}</Text>}

          {step === 3 && (
            <View>
              <Text style={styles.lbl}>✅ {tt(P, 'ຄຸນ ນະ ພາບ & ຄວາມ ປອດ ໄພ')} ({safePass}/{criteria.length})</Text>
              {criteria.map((c) => (
                <Pressable key={c.id} style={styles.chk} onPress={() => setChecks((cur) => ({ ...cur, [c.id]: !cur[c.id] }))}>
                  <View style={[styles.box, checks[c.id] && styles.boxOn]}><Text style={styles.boxT}>{checks[c.id] ? '✓' : ''}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chkT}>{c.label}</Text>
                    {!!c.standard && <Text style={styles.std}>📖 {c.standard}</Text>}
                  </View>
                </Pressable>
              ))}
              <Text style={styles.lbl}>{tt(P, 'ຈັດ ລະດັບ (tier)')}</Text>
              <View style={styles.tierRow}>
                {tiers.map((t) => (
                  <Pressable key={t.key} style={[styles.tchip, tier === t.key && styles.tchipOn]} onPress={() => setTier(t.key)}>
                    <Text style={[styles.tchipT, tier === t.key && styles.tchipTOn]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* nav */}
        <View style={styles.nav}>
          {step > 1 && <Pressable style={[styles.btn, styles.back]} onPress={() => setStep(step - 1)}><Text style={styles.backT}>← {tt(P, 'ກັບ')}</Text></Pressable>}
          {step < 3
            ? <Pressable style={[styles.btn, styles.next, step === 1 && !type && styles.btnOff]} disabled={step === 1 && !type} onPress={() => setStep(step + 1)}><Text style={styles.nextT}>{tt(P, 'ຕໍ່ ໄປ')} →</Text></Pressable>
            : <>
                <Pressable style={[styles.btn, styles.verify]} onPress={approve}><Text style={styles.nextT}>✔️ {tt(P, 'ຢືນ ຢັນ + ອະນຸ ມັດ')}</Text></Pressable>
                <Pressable style={[styles.btn, styles.reject]} onPress={onReject}><Text style={styles.rejectT}>{tt(P, 'ປະ ຕິ ເສດ')}</Text></Pressable>
              </>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxWidth: 560, alignSelf: 'center', width: '100%' },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '900', color: '#111', flex: 1 },
  close: { fontSize: 15, color: '#8b95a5', fontWeight: '800', paddingHorizontal: 6 },
  steps: { flexDirection: 'row', marginVertical: 14 },
  stp: { flex: 1, alignItems: 'center', gap: 4 },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: '#0066CC' }, dotDone: { backgroundColor: '#1f9d57' },
  dotT: { fontWeight: '900', color: '#94a3b8', fontSize: 13 }, dotTOn: { color: '#fff' },
  cap: { fontSize: 12, color: '#556072', fontWeight: '700' },
  lbl: { fontSize: 12.5, fontWeight: '800', color: '#111', marginTop: 10, marginBottom: 8 },
  pick: { flexDirection: 'row', gap: 10 },
  opt: { flex: 1, borderWidth: 2, borderColor: '#e6eaf0', borderRadius: 12, padding: 14, alignItems: 'center' },
  optOn: { borderColor: '#0066CC', backgroundColor: '#EAF2FB' },
  optE: { fontSize: 24 }, optT: { fontWeight: '800', fontSize: 13, marginTop: 4, textAlign: 'center' }, optD: { fontSize: 12, color: '#556072', marginTop: 2, textAlign: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 9, padding: 11, fontSize: 15, color: '#111' },
  pass: { fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' },
  passOk: { backgroundColor: '#e7f7ee', color: '#166534' }, passNo: { backgroundColor: '#fdecec', color: '#dc2626' },
  hint: { fontSize: 12, color: '#8b95a5', marginTop: 8 },
  quizNote: { fontSize: 12, color: '#166534', fontWeight: '700', marginTop: 8, backgroundColor: '#e7f7ee', borderRadius: 8, padding: 8 },
  chk: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#eef0f3' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: '#1f9d57', borderColor: '#1f9d57' },
  boxT: { color: '#fff', fontSize: 13, fontWeight: '900' },
  chkT: { fontSize: 13, fontWeight: '600', color: '#111' },
  std: { fontSize: 12, color: '#0066CC', fontWeight: '700', marginTop: 1 },
  tierRow: { flexDirection: 'row', gap: 8 },
  tchip: { flex: 1, borderWidth: 1, borderColor: '#e6eaf0', borderRadius: 9, padding: 10, alignItems: 'center' },
  tchipOn: { borderColor: '#0066CC', backgroundColor: '#EAF2FB' },
  tchipT: { fontSize: 12.5, fontWeight: '800', color: '#556072' }, tchipTOn: { color: '#004a97' },
  nav: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, borderRadius: 11, padding: 13, alignItems: 'center' },
  back: { backgroundColor: '#f1f5f9', flex: 0, paddingHorizontal: 18 }, backT: { color: '#556072', fontWeight: '800', fontSize: 13 },
  next: { backgroundColor: '#0066CC' }, nextT: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnOff: { backgroundColor: '#A8CAEE' },
  verify: { backgroundColor: '#1f9d57' },
  reject: { backgroundColor: '#fdecec', flex: 0, paddingHorizontal: 16 }, rejectT: { color: '#dc2626', fontWeight: '800', fontSize: 13 },
});
