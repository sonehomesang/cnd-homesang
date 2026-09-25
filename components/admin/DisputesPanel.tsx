import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import AmountInput from '@/components/AmountInput';
import {
  type Dispute,
  DISPUTE_STATUS_LABEL,
  type DisputeStatus,
  resolveDispute,
  seedDisputesIfEmpty,
  watchAllDisputes,
} from '@/lib/disputes';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';
import type { RecordDoc } from '@/lib/records';
import RecordEditor from './RecordEditor';
import { usePaged } from './Paginator';

type Tab = '' | 'open' | 'done';

export default function DisputesPanel() {
  const { canEdit, canDelete } = useSectionPerms('disputes');
  const tt = useTT();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [refund, setRefund] = useState<Record<string, string>>({});
  const [payout, setPayout] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>('open');
  const [editRecord, setEditRecord] = useState<RecordDoc | null>(null);

  useEffect(() => {
    seedDisputesIfEmpty().catch((e) => console.error('seed disputes:', e));
    return watchAllDisputes(setDisputes);
  }, []);

  // guard against a double-tap settling (and paying out) twice — the lib is
  // idempotent too, this just keeps the button from firing while in flight
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const act = async (d: Dispute, status: DisputeStatus) => {
    if (busy[d.id]) return;
    setBusy((b) => ({ ...b, [d.id]: true }));
    const amt = refund[d.id] ? Number(refund[d.id].replace(/\D/g, '')) : undefined;
    const pay = payout[d.id] ? Number(payout[d.id].replace(/\D/g, '')) : undefined;
    try {
      await resolveDispute(d, {
        status,
        adminNote: note[d.id]?.trim() || undefined,
        refundAmount: status === 'resolved' ? amt : undefined,
        techPayout: status === 'resolved' ? pay : undefined,
      });
    } catch (e) {
      console.error('resolveDispute:', e);
    } finally {
      setBusy((b) => ({ ...b, [d.id]: false }));
    }
  };

  const open = disputes.filter((d) => d.status === 'open');
  const shown = tab === '' ? disputes : tab === 'open' ? open : disputes.filter((d) => d.status !== 'open');
  const pg = usePaged(shown, 8);
  const TABS: { v: Tab; l: string }[] = [
    { v: 'open', l: `${tt('admDisputes','ຮໍ')} (${open.length})` },
    { v: 'done', l: tt('admDisputes','ແລ້ວ') },
    { v: '', l: `${tt('admDisputes','ທັງໝົດ')} (${disputes.length})` },
  ];

  return (
    <View>
      <Text style={styles.title}>{tt('admDisputes','⚠️ ຂໍ້ຂັດແຍ່ງ · Disputes')}</Text>
      <Text style={styles.sub}>{tt('admDisputes','ກວດ ແລະ ຕັດສິນ ບັນຫາ ລະຫວ່າງ ລູກຄ້າ ກັບ ຊ່າງ')}</Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.v} onPress={() => setTab(t.v)} style={styles.tab}>
            <Text style={[styles.tabText, tab === t.v && styles.tabOn]}>{t.l}</Text>
          </Pressable>
        ))}
      </View>

      {shown.length === 0 ? (
        <Text style={styles.empty}>{tt('admDisputes','ບໍ່ມີຂໍ້ຂັດແຍ່ງ')}</Text>
      ) : (
        pg.items.map((d) => (
          <View key={d.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.who}>
                {d.raiserRole === 'customer' ? tt('admDisputes','🙋 ລູກຄ້າ') : tt('admDisputes','👷 ຊ່າງ')} · {d.raiserName ?? ''}
              </Text>
              <View style={styles.rowRight}>
                <Text style={[styles.status, d.status === 'open' ? styles.sOpen : d.status === 'resolved' ? styles.sOk : styles.sNo]}>
                  {tt('disputeStatus', DISPUTE_STATUS_LABEL[d.status])}
                </Text>
                <Pressable style={styles.editBtn} onPress={() => setEditRecord(d as any)}>
                  <Text style={styles.editBtnText}>{canEdit ? '✎' : '👁'}</Text>
                </Pressable>
              </View>
            </View>
            <Pressable onPress={() => router.push(`/jobs/${d.jobId}` as any)}>
              <Text style={styles.jobLink}>🛠️ {d.jobTitle ?? d.jobId} ›</Text>
            </Pressable>
            <Text style={styles.reason}>{d.reason}</Text>
            {d.photos && d.photos.length > 0 && (
              <View style={styles.photos}>
                {d.photos.map((u) => <Image key={u} source={{ uri: u }} style={styles.photo} />)}
              </View>
            )}
            {!!d.adminNote && <Text style={styles.adminNote}>👑 {d.adminNote}</Text>}
            {d.refundAmount ? (
              <Text style={styles.refund}>{tt('admDisputes','↩️ ຄືນເງິນ ລູກຄ້າ')} {d.refundAmount.toLocaleString()} {tt('admDisputes','ກີບ')} {d.refundClaimId ? tt('admDisputes','· ສ້າງ refund ແລ້ວ') : ''}</Text>
            ) : null}
            {d.techPayout ? (
              <Text style={styles.refund}>{tt('admDisputes','👷 ຈ່າຍ ຄ່າແຮງ ຊ່າງ')} {d.techPayout.toLocaleString()} {tt('admDisputes','ກີບ')}</Text>
            ) : null}
            {canEdit && d.status === 'open' && (
              <>
                <TextInput
                  value={note[d.id] ?? ''}
                  onChangeText={(v) => setNote((p) => ({ ...p, [d.id]: v }))}
                  placeholder={tt('admDisputes','ບັນທຶກ ການຕັດສິນ (ສົ່ງໃຫ້ ທັງສອງຝ່າຍ)')}
                  placeholderTextColor="#999"
                  style={styles.input}
                />
                <Text style={styles.settleLabel}>{tt('admDisputes','ໄກ່ເກ່ຍ ແບ່ງສ່ວນ (ໃສ່ ຖ້າ ຕ້ອງ — ມີ ຜົນ ຕອນ ກົດ «ແກ້ໄຂແລ້ວ»)')}</Text>
                <AmountInput
                  value={refund[d.id] ? Number(refund[d.id]) : 0}
                  onChangeValue={(n) => setRefund((p) => ({ ...p, [d.id]: n ? String(n) : '' }))}
                  placeholder={tt('admDisputes','↩️ ຄືນເງິນ ລູກຄ້າ (ກີບ) — ສ້າງ refund ໃຫ້ ອັຕໂນມັດ')}
                  placeholderTextColor="#999"
                  style={styles.input}
                />
                <AmountInput
                  value={payout[d.id] ? Number(payout[d.id]) : 0}
                  onChangeValue={(n) => setPayout((p) => ({ ...p, [d.id]: n ? String(n) : '' }))}
                  placeholder={tt('admDisputes','👷 ຈ່າຍ ຄ່າແຮງ ຊ່າງ (ກີບ) — ເຂົ້າ wallet ຊ່າງ')}
                  placeholderTextColor="#999"
                  style={styles.input}
                />
                <View style={styles.actions}>
                  <Pressable style={[styles.btn, { backgroundColor: '#16a34a' }]} onPress={() => act(d, 'resolved')}>
                    <Text style={styles.btnText}>{tt('admDisputes','ແກ້ໄຂແລ້ວ')}</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, { backgroundColor: '#dc2626' }]} onPress={() => act(d, 'rejected')}>
                    <Text style={styles.btnText}>{tt('admDisputes','ປະຕິເສດ')}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        ))
      )}

      {pg.bar}

      {editRecord && (
        <RecordEditor colName="disputes" record={editRecord} canDelete={canDelete} canEdit={canEdit} onClose={() => setEditRecord(null)} />
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
  who: { fontSize: 14, fontWeight: '700', color: '#111' },
  status: { fontSize: 12, fontWeight: '700', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden' },
  sOpen: { color: '#92400e', backgroundColor: '#fde68a' },
  sOk: { color: '#065f46', backgroundColor: '#a7f3d0' },
  sNo: { color: '#991b1b', backgroundColor: '#fecaca' },
  jobLink: { fontSize: 12, color: '#0066CC', marginTop: 4 },
  reason: { fontSize: 12, color: '#374151', marginTop: 6 },
  photos: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  photo: { width: 60, height: 60, borderRadius: 8 },
  adminNote: { fontSize: 12, color: '#0066CC', marginTop: 6 },
  refund: { fontSize: 12, color: '#16a34a', fontWeight: '700', marginTop: 6 },
  settleLabel: { fontSize: 12, color: '#92400e', marginTop: 10, marginBottom: 2 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 12, color: '#111', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  btn: { flex: 1, padding: 9, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
