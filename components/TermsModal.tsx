import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Bid } from '@/lib/bids';
import type { Job } from '@/lib/jobs';
import { DEFAULT_SERVICE_CONFIG, fillTerms, labelOf, type ServiceConfig, watchServiceConfig } from '@/lib/serviceConfig';
import { fetchInspectionTemplate } from '@/lib/inspectionTemplates';
import { ttStatic, useTT } from '@/lib/i18n';

function paymentText(bid: Bid): string {
  const p: any = bid.paymentPlan;
  if (!p || p.type === 'full') return ttStatic('terms', 'ຈ່າຍ ເຕັມ ຫຼັງ ຮັບ ມອບ ວຽກ');
  if (p.type === 'deposit') return `${ttStatic('terms', 'ມັດຈຳ')} ${p.depositPct ?? 30}% ${ttStatic('terms', 'ກ່ອນ + ສ່ວນ ເຫຼືອ ຫຼັງ ຮັບ ມອບ')}`;
  if (p.type === 'installments') return `${ttStatic('terms', 'ແບ່ງ ຈ່າຍ')} ${p.installmentCount ?? 2} ${ttStatic('terms', 'ງວດ')}`;
  return ttStatic('terms', 'ຈ່າຍ ຕາມ ຕົກລົງ');
}

/** Job-specific service terms the customer must read + accept before choosing a
 * technician — so all three parties agree on the same conditions. */
export default function TermsModal({ bid, job, onCancel, onAccept }: {
  bid: Bid;
  job: Job;
  onCancel: () => void;
  onAccept: () => void;
}) {
  const tt = useTT();
  const [cfg, setCfg] = useState<ServiceConfig>(DEFAULT_SERVICE_CONFIG);
  const [warrantyMonths, setWarrantyMonths] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => watchServiceConfig(setCfg), []);
  useEffect(() => { fetchInspectionTemplate(job.category).then((t) => setWarrantyMonths(t?.warrantyMonths ?? 12)); }, [job.category]);

  const wt = labelOf(cfg.workTypes, bid.workType);
  const vals = {
    price: (bid.total ?? bid.price ?? 0).toLocaleString('en-US'),
    warranty: warrantyMonths != null ? `${warrantyMonths} ${tt('terms', 'ເດືອນ')}` : '—',
    payment: paymentText(bid),
    worktype: wt ? `${wt.icon ?? ''} ${wt.label}`.trim() : '—',
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.head}>
            <Text style={styles.title}>📜 {tt('terms', 'ເງື່ອນໄຂ ການ ບໍລິການ (ສະເພາະ ງານ ນີ້)')}</Text>
            <Pressable onPress={onCancel} hitSlop={8}><Text style={styles.close}>✕</Text></Pressable>
          </View>

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ padding: 14 }}>
            {cfg.terms.map((c, i) => (
              <View key={i} style={styles.clause}>
                <Text style={styles.cTitle}>{i + 1}. {c.title}</Text>
                <Text style={styles.cBody}>{fillTerms(c.body, vals)}</Text>
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.chkRow} onPress={() => setChecked((v) => !v)}>
            <View style={[styles.box, checked && styles.boxOn]}>{checked && <Text style={styles.tick}>✓</Text>}</View>
            <Text style={styles.chkText}>{tt('terms', 'ຂ້າພະເຈົ້າ ໄດ້ ອ່ານ, ຮັບຊາບ ເງື່ອນໄຂ ແລະ ຍອມຮັບ ຂໍ້ຕົກລົງ ຂ້າງເທິງ')}</Text>
          </Pressable>

          <View style={styles.actions}>
            <Pressable style={[styles.accept, !checked && styles.acceptOff]} onPress={() => checked && onAccept()} disabled={!checked}>
              <Text style={styles.acceptText}>{tt('terms', '✓ ຍອມຮັບ ແລະ ເລືອກ ຊ່າງ ນີ້')}</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={onCancel}><Text style={styles.cancelText}>{tt('terms', 'ຍົກເລີກ')}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#eef0f3' },
  title: { fontSize: 14, fontWeight: '800', color: '#111', flex: 1 },
  close: { fontSize: 15, color: '#6b7280', fontWeight: '700' },
  clause: { marginBottom: 12 },
  cTitle: { fontSize: 13, fontWeight: '800', color: '#111', marginBottom: 3 },
  cBody: { fontSize: 13, color: '#374151', lineHeight: 20 },
  chkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 14, padding: 11, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#0066CC', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: '#0066CC' },
  tick: { color: '#fff', fontSize: 13, fontWeight: '800' },
  chkText: { flex: 1, fontSize: 13, color: '#0c4a6e', fontWeight: '600', lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 8, padding: 14 },
  accept: { flex: 1, backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  acceptOff: { opacity: 0.4 },
  acceptText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  cancel: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  cancelText: { color: '#6b7280', fontWeight: '700', fontSize: 13 },
});
