import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type RecordDoc, saveRecord, watchCollection } from '@/lib/records';
import { type LogisticsTier, LOGISTICS_TIER_LABEL, resolveDeliveryFee, seedLogisticsProvidersIfEmpty } from '@/lib/logisticsProviders';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';
import GroupedRecordEditor from './GroupedRecordEditor';
import { LOGISTICS_PROVIDER_GROUPS } from '@/lib/adminEditors';

const TIER_SHORT: Record<LogisticsTier, string> = { job: 'A · job', rider: 'B · rider', parcel: 'C · parcel', own: 'D · own' };

export default function LogisticsProvidersPanel() {
  const { canCreate, canEdit, canDelete } = useSectionPerms('catalog');
  const tt = useTT();
  const [rows, setRows] = useState<RecordDoc[]>([]);
  const [edit, setEdit] = useState<RecordDoc | 'new' | null>(null);

  useEffect(() => {
    seedLogisticsProvidersIfEmpty().catch(() => {});
    return watchCollection('logisticsProviders', (docs) => {
      docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setRows(docs);
    });
  }, []);

  const feeLabel = (p: RecordDoc) => {
    if (p.tier === 'job') return tt('admLogi', 'ຟຣີ');
    if (p.flatFee != null) return `${Number(p.flatFee).toLocaleString()} ${tt('common', 'ກີບ')}`;
    if (Array.isArray(p.deliveryRates) && p.deliveryRates.length) return tt('admLogi', 'ຕາມ ໄລຍະ (km)');
    return '—';
  };

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.title}>🚚 {tt('admLogi', 'ຜູ້ຂົນສົ່ງ')} · Logistics</Text>
        {canCreate && (
          <Pressable style={styles.createBtn} onPress={() => setEdit('new')}>
            <Text style={styles.createBtnText}>{tt('admLogi', '＋ ເພີ່ມ')}</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.sub}>{tt('admLogi', '4 ຊັ້ນ: ຊ່າງຖືໄປ · rider · ພັດສະດຸ · ຂອງເຮົາເອງ — ເປີດ-ປິດ ໄດ້')}</Text>

      {rows.map((p) => {
        const tier = p.tier as LogisticsTier;
        const on = p.enabled !== false;
        void resolveDeliveryFee;
        return (
          <View key={p.id} style={styles.card}>
            <View style={styles.mid}>
              <Text style={styles.name} numberOfLines={1}>{LOGISTICS_TIER_LABEL[tier]?.split(' ')[0] ?? '📦'} {p.name}</Text>
              <View style={styles.badgeRow}>
                <Text style={styles.tierBadge}>{TIER_SHORT[tier] ?? p.tier}</Text>
                <Text style={styles.typeBadge}>{p.type === 'api' ? '⚡ API' : '✍️ manual'}</Text>
                {p.codSupported ? <Text style={styles.codBadge}>COD</Text> : null}
              </View>
              <Text style={styles.meta} numberOfLines={1}>📍 {p.coverage ?? '—'} · 💰 {feeLabel(p)}</Text>
            </View>
            <View style={styles.right}>
              <Pressable
                disabled={!canEdit}
                onPress={() => saveRecord('logisticsProviders', p.id, { enabled: !on })}
                style={[styles.sw, on ? styles.swOn : styles.swOff, !canEdit && { opacity: 0.5 }]}>
                <View style={styles.knob} />
              </Pressable>
              <Pressable style={styles.editBtn} onPress={() => setEdit(p)}>
                <Text style={styles.editBtnText}>{canEdit ? '✏️' : '👁️'}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {rows.length === 0 && <Text style={styles.empty}>{tt('admLogi', 'ຍັງບໍ່ມີ ຜູ້ຂົນສົ່ງ — ກົດ ＋ ເພີ່ມ')}</Text>}

      {edit && (
        <GroupedRecordEditor
          colName="logisticsProviders"
          record={edit === 'new' ? null : edit}
          groups={LOGISTICS_PROVIDER_GROUPS}
          prefill={{ enabled: true, type: 'manual', tier: 'parcel', codSupported: true }}
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
  mid: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 14, fontWeight: '700', color: '#111' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tierBadge: { fontSize: 12, color: '#4338ca', backgroundColor: '#eef2ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  typeBadge: { fontSize: 12, color: '#374151', backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  codBadge: { fontSize: 12, color: '#065f46', backgroundColor: '#d1fae5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  meta: { fontSize: 12, color: '#6b7280' },
  right: { alignItems: 'center', gap: 8 },
  sw: { width: 40, height: 24, borderRadius: 12, padding: 2, flexDirection: 'row' },
  swOn: { backgroundColor: '#16a34a', justifyContent: 'flex-end' },
  swOff: { backgroundColor: '#cbd5e1', justifyContent: 'flex-start' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  editBtn: { width: 34, height: 30, borderRadius: 8, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  editBtnText: { fontSize: 15 },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', padding: 24 },
});
