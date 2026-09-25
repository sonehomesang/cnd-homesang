import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AmountInput from '@/components/AmountInput';
import {
  type Claim,
  CLAIM_STATUS_LABEL,
  CLAIM_TYPE_LABEL,
  type ClaimStatus,
  resolveClaim,
  seedClaimsIfEmpty,
  watchAllClaims,
} from '@/lib/claims';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';
import type { RecordDoc } from '@/lib/records';
import RecordEditor from './RecordEditor';
import { usePaged } from './Paginator';

type Tab = '' | 'pending' | 'done';

export default function ClaimsPanel() {
  const { canEdit, canDelete } = useSectionPerms('finance');
  const tt = useTT();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [refund, setRefund] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>('');
  const [editRecord, setEditRecord] = useState<RecordDoc | null>(null);

  useEffect(() => {
    seedClaimsIfEmpty().catch((e) => console.error('seed claims:', e));
    return watchAllClaims(setClaims);
  }, []);

  const act = (c: Claim, status: ClaimStatus) => {
    const amt = refund[c.id] ? Number(refund[c.id].replace(/\D/g, '')) : undefined;
    resolveClaim(c.id, { status, refundAmount: status === 'approved' || status === 'resolved' ? amt : undefined });
  };

  const open = claims.filter((c) => c.status === 'pending' || c.status === 'reviewing');
  const shown = tab === '' ? claims : tab === 'pending' ? open : claims.filter((c) => !open.includes(c));
  const pg = usePaged(shown, 8);
  const TABS: { v: Tab; l: string }[] = [
    { v: '', l: `${tt('admClaims','ທັງໝົດ')} (${claims.length})` },
    { v: 'pending', l: `${tt('admClaims','ຮໍ')} (${open.length})` },
    { v: 'done', l: tt('admClaims','ແລ້ວ') },
  ];

  return (
    <View>
      <Text style={styles.title}>↩️ {tt('admClaims', 'ຄືນເງິນ / ສົ່ງຄືນ · Claims')}</Text>
      <Text style={styles.sub}>{tt('admClaims', 'ກວດ ແລະ ແກ້ໄຂ ຄຳຮ້ອງ')}</Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.v} onPress={() => setTab(t.v)} style={styles.tab}>
            <Text style={[styles.tabText, tab === t.v && styles.tabOn]}>{t.l}</Text>
          </Pressable>
        ))}
      </View>

      {shown.length === 0 ? (
        <Text style={styles.empty}>{tt('admClaims', 'ບໍ່ມີຄຳຮ້ອງ')}</Text>
      ) : (
        pg.items.map((c) => (
          <View key={c.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.type}>{tt('claim', CLAIM_TYPE_LABEL[c.type])} · #{c.orderNumber ?? c.orderId.slice(0, 6)}</Text>
              <View style={styles.rowRight}>
                <Text style={styles.status}>{tt('claim', CLAIM_STATUS_LABEL[c.status])}</Text>
                <Pressable style={styles.editBtn} onPress={() => setEditRecord(c as any)}>
                  <Text style={styles.editBtnText}>{canEdit ? '✎' : '👁'}</Text>
                </Pressable>
              </View>
            </View>
            {c.disputeId ? <Text style={styles.fromDispute}>⚠️ {tt('admClaims', 'ຈາກ ຂໍ້ຂັດແຍ່ງ ງານ')}</Text> : null}
            <Text style={styles.reason}>{c.reason}</Text>
            {c.refundAmount ? <Text style={styles.refund}>💰 {c.refundAmount.toLocaleString()} {tt('common', 'ກີບ')}</Text> : null}
            {canEdit ? (
            <>
            <View style={styles.refRow}>
              <AmountInput
                value={refund[c.id] ? Number(refund[c.id]) : 0}
                onChangeValue={(n) => setRefund((p) => ({ ...p, [c.id]: n ? String(n) : '' }))}
                placeholder={tt('admClaims', 'ຈຳນວນຄືນເງິນ (ກີບ)')}
                placeholderTextColor="#999"
                style={styles.input}
              />
            </View>
            <View style={styles.actions}>
              <Pressable style={[styles.btn, { backgroundColor: '#16a34a' }]} onPress={() => act(c, 'approved')}>
                <Text style={styles.btnText}>{tt('admClaims', 'ອະນຸມັດ+ຄືນ')}</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: '#0066CC' }]} onPress={() => act(c, 'resolved')}>
                <Text style={styles.btnText}>{tt('admClaims', 'ແກ້ໄຂແລ້ວ')}</Text>
              </Pressable>
              <Pressable style={[styles.btn, { backgroundColor: '#dc2626' }]} onPress={() => act(c, 'rejected')}>
                <Text style={styles.btnText}>{tt('admClaims', 'ປະຕິເສດ')}</Text>
              </Pressable>
            </View>
            </>
            ) : null}
          </View>
        ))
      )}

      {pg.bar}

      {editRecord && (
        <RecordEditor colName="claims" record={editRecord} canDelete={canDelete} canEdit={canEdit} onClose={() => setEditRecord(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: { backgroundColor: '#0066CC', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  editBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  tabs: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  tab: { paddingVertical: 6 },
  tabText: { fontSize: 12, color: '#6b7280' },
  tabOn: { color: '#0066CC', fontWeight: '700' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontSize: 14, fontWeight: '700', color: '#111' },
  status: { fontSize: 12, fontWeight: '700', color: '#92400e', backgroundColor: '#fde68a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden' },
  fromDispute: { fontSize: 12, color: '#c2410c', fontWeight: '700', marginTop: 6 },
  reason: { fontSize: 12, color: '#374151', marginTop: 6 },
  refund: { fontSize: 12, color: '#16a34a', fontWeight: '700', marginTop: 4 },
  refRow: { marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 12, color: '#111' },
  actions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  btn: { flex: 1, padding: 9, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
