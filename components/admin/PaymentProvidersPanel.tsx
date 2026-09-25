import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { type RecordDoc, saveRecord, watchCollection } from '@/lib/records';
import { PAYMENT_TYPE_LABEL, seedPaymentProvidersIfEmpty } from '@/lib/paymentProviders';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';
import GroupedRecordEditor from './GroupedRecordEditor';
import { PAYMENT_PROVIDER_GROUPS } from '@/lib/adminEditors';

export default function PaymentProvidersPanel() {
  const { canCreate, canEdit, canDelete } = useSectionPerms('finance');
  const tt = useTT();
  const [rows, setRows] = useState<RecordDoc[]>([]);
  const [edit, setEdit] = useState<RecordDoc | 'new' | null>(null);

  useEffect(() => {
    seedPaymentProvidersIfEmpty().catch(() => {});
    return watchCollection('paymentProviders', (docs) => {
      docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setRows(docs);
    });
  }, []);

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.title}>🏦 {tt('admPay', 'ຊ່ອງທາງຈ່າຍເງິນ')} · Payment Providers</Text>
        {canCreate && (
          <Pressable style={styles.createBtn} onPress={() => setEdit('new')}>
            <Text style={styles.createBtnText}>{tt('admPay', '＋ ເພີ່ມ')}</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.sub}>{tt('admPay', 'QR / ໂອນ / ປາຍທາງ — ເປີດ-ປິດ ໄດ້ · ສະແດງໃນໜ້າຊຳລະ')}</Text>

      {rows.map((p) => {
        const type = p.type as keyof typeof PAYMENT_TYPE_LABEL;
        const on = p.enabled !== false;
        return (
          <View key={p.id} style={styles.card}>
            {p.qrImage ? (
              <Image source={{ uri: p.qrImage }} style={styles.qr} />
            ) : (
              <View style={[styles.qr, styles.qrEmpty]}><Text style={{ fontSize: 20 }}>{type === 'cod' ? '💵' : type === 'api' ? '⚡' : '🏦'}</Text></View>
            )}
            <View style={styles.mid}>
              <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.typeBadge}>{tt('admPay', PAYMENT_TYPE_LABEL[type] ?? String(p.type))}</Text>
              {!!p.accountNumber && <Text style={styles.meta} numberOfLines={1}>{p.bankName ? `${p.bankName} · ` : ''}{p.accountNumber}</Text>}
              {(p.minAmount || p.maxAmount) ? (
                <Text style={styles.meta}>{p.minAmount ? Number(p.minAmount).toLocaleString() : '0'} – {p.maxAmount ? Number(p.maxAmount).toLocaleString() : '∞'} {tt('admPay', 'ກີບ')}</Text>
              ) : null}
            </View>
            <View style={styles.right}>
              <Pressable
                disabled={!canEdit}
                onPress={() => saveRecord('paymentProviders', p.id, { enabled: !on })}
                style={[styles.sw, on ? styles.swOn : styles.swOff, !canEdit && { opacity: 0.5 }]}>
                <View style={[styles.knob, on ? styles.knobOn : styles.knobOff]} />
              </Pressable>
              <Pressable style={styles.editBtn} onPress={() => setEdit(p)}>
                <Text style={styles.editBtnText}>{canEdit ? '✏️' : '👁️'}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {rows.length === 0 && <Text style={styles.empty}>{tt('admPay', 'ຍັງບໍ່ມີ ຊ່ອງທາງຈ່າຍ — ກົດ ＋ ເພີ່ມ')}</Text>}

      {edit && (
        <GroupedRecordEditor
          colName="paymentProviders"
          record={edit === 'new' ? null : edit}
          groups={PAYMENT_PROVIDER_GROUPS}
          prefill={{ enabled: true, type: 'qr_static', currencies: ['LAK'] }}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => setEdit(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
  createBtn: { backgroundColor: '#0066CC', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  card: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 8 },
  qr: { width: 46, height: 46, borderRadius: 8, backgroundColor: '#f3f4f6' },
  qrEmpty: { alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 14, fontWeight: '700', color: '#111' },
  typeBadge: { fontSize: 12, color: '#4338ca', backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', overflow: 'hidden' },
  meta: { fontSize: 12, color: '#6b7280' },
  right: { alignItems: 'center', gap: 8 },
  sw: { width: 40, height: 24, borderRadius: 12, padding: 2, flexDirection: 'row' },
  swOn: { backgroundColor: '#16a34a', justifyContent: 'flex-end' },
  swOff: { backgroundColor: '#cbd5e1', justifyContent: 'flex-start' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  knobOn: {}, knobOff: {},
  editBtn: { width: 34, height: 30, borderRadius: 8, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  editBtnText: { fontSize: 15 },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', padding: 24 },
});
