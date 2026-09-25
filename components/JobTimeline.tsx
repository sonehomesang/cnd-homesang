import { StyleSheet, Text, View } from 'react-native';
import { type Job, PAYMENT_METHOD_LABEL } from '@/lib/jobs';
import { useTT } from '@/lib/i18n';

type StepState = 'done' | 'now' | 'todo';

function shortDate(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit' });
}

/** 5-stage workflow stepper for an assigned job. */
export default function JobTimeline({ job }: { job: Job }) {
  const tt = useTT();
  const s = job.status;
  const assigned = s === 'assigned' || s === 'in_progress' || s === 'pending_payment' || s === 'completed';
  const working = s === 'in_progress' || s === 'pending_payment' || s === 'completed';
  const paying = s === 'pending_payment' || s === 'completed'; // work confirmed
  const done = s === 'completed';
  const methodLao = job.paymentMethod ? tt('payment', PAYMENT_METHOD_LABEL[job.paymentMethod].lao) : '';

  const steps: { title: string; sub: string; state: StepState }[] = [
    {
      title: tt('jobTimeline', 'ໂພສງານ'),
      sub: shortDate(job.createdAt),
      state: 'done',
    },
    {
      title: tt('jobTimeline', 'ຮັບໃບສະເໜີ'),
      sub: assigned ? `${job.assignedProviderName ?? tt('jobTimeline', 'ຊ່າງ')} · ${shortDate(job.assignedAt)}` : tt('jobTimeline', 'ລໍເລືອກຊ່າງ'),
      state: assigned ? 'done' : 'todo',
    },
    {
      title: tt('jobTimeline', 'ກຳລັງເຮັດ'),
      sub: paying
        ? `${tt('jobTimeline', 'ງານຮຽບຮ້ອຍ')} · ${shortDate(job.startedAt)}`
        : working
        ? job.techDoneAt
          ? tt('jobTimeline', 'ຊ່າງແຈ້ງສຳເລັດ · ລໍຢືນຢັນ')
          : `${tt('jobTimeline', 'ເລີ່ມ')} ${shortDate(job.startedAt)}`
        : tt('jobTimeline', 'ລໍຊ່າງເລີ່ມງານ'),
      state: paying ? 'done' : working ? 'now' : 'todo',
    },
    {
      title: tt('jobTimeline', 'ຊຳລະເງິນ'),
      sub: done
        ? `${methodLao ? methodLao + ' · ' : ''}${shortDate(job.paymentConfirmedAt)}`
        : s === 'pending_payment'
        ? job.paidByCustomerAt
          ? `${tt('jobTimeline', 'ລູກຄ້າຈ່າຍແລ້ວ')}${methodLao ? ' (' + methodLao + ')' : ''} · ${tt('jobTimeline', 'ລໍຢືນຢັນ')}`
          : tt('jobTimeline', 'ລໍລູກຄ້າຊຳລະ')
        : tt('jobTimeline', 'ລໍຊຳລະ'),
      state: done ? 'done' : s === 'pending_payment' ? 'now' : 'todo',
    },
    {
      title: tt('jobTimeline', 'ສຳເລັດ'),
      sub: done ? shortDate(job.completedAt) : tt('jobTimeline', 'ລໍຊຳລະສຳເລັດ'),
      state: done ? 'done' : 'todo',
    },
  ];

  return (
    <View style={styles.wrap}>
      {steps.map((st, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={i} style={styles.step}>
            <View style={styles.gutter}>
              <View
                style={[
                  styles.dot,
                  st.state === 'done' && styles.dotDone,
                  st.state === 'now' && styles.dotNow,
                ]}>
                <Text style={styles.dotText}>
                  {st.state === 'done' ? '✓' : st.state === 'now' ? '●' : ''}
                </Text>
              </View>
              {!last && (
                <View style={[styles.line, st.state === 'done' && styles.lineDone]} />
              )}
            </View>
            <View style={styles.body}>
              <Text style={[styles.title, st.state === 'todo' && styles.titleTodo]}>
                {st.title}
              </Text>
              {!!st.sub && <Text style={styles.sub}>{st.sub}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  step: { flexDirection: 'row', gap: 12 },
  gutter: { alignItems: 'center', width: 22 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  dotNow: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  dotText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  line: { width: 2, flex: 1, minHeight: 18, backgroundColor: '#e5e7eb', marginVertical: 2 },
  lineDone: { backgroundColor: '#16a34a' },
  body: { flex: 1, paddingBottom: 18 },
  title: { fontSize: 14, fontWeight: '600', color: '#111' },
  titleTodo: { color: '#9ca3af', fontWeight: '500' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
});
