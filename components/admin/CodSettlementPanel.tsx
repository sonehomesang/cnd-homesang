import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  confirmCodRemit,
  confirmTip,
  type DeliveryTask,
  type RiderProfile,
  watchAllDeliveryTasks,
  watchRiders,
} from '@/lib/riders';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';

const fmt = (n: number) => Math.round(n || 0).toLocaleString('en-US');

/**
 * COD cash reconciliation. A rider who delivers a cash-on-delivery order is
 * holding the platform's money until admin confirms it arrived — without this
 * ledger the cash simply vanishes (and the rider still gets paid the delivery
 * fee). Groups outstanding cash by rider, shows their remittance declarations
 * with proof, and lets admin confirm or reject.
 */
export default function CodSettlementPanel() {
  const { canEdit } = useSectionPerms('finance');
  const tt = useTT();
  const [tasks, setTasks] = useState<DeliveryTask[]>([]);
  const [riders, setRiders] = useState<RiderProfile[]>([]);
  const [proof, setProof] = useState<string | null>(null);

  useEffect(() => {
    const u1 = watchAllDeliveryTasks(setTasks);
    const u2 = watchRiders(setRiders);
    return () => { u1(); u2(); };
  }, []);

  // delivered COD tasks that are not yet confirmed remitted = cash owed
  const groups = useMemo(() => {
    const owed = tasks.filter((t) =>
      t.status === 'delivered' && !t.codRemitted && (t.codAmount ?? 0) > 0 && t.assignedRiderId);
    const byRider = new Map<string, { rider?: RiderProfile; name: string; tasks: DeliveryTask[]; total: number; declared: boolean }>();
    for (const t of owed) {
      const id = t.assignedRiderId!;
      const cur = byRider.get(id) ?? {
        rider: riders.find((r) => r.uid === id),
        name: t.assignedRiderName ?? id.slice(0, 8),
        tasks: [], total: 0, declared: false,
      };
      cur.tasks.push(t);
      cur.total += t.codAmount ?? 0;
      if (t.remitRequested) cur.declared = true;
      byRider.set(id, cur);
    }
    return [...byRider.entries()].map(([uid, g]) => ({ uid, ...g })).sort((a, b) => b.total - a.total);
  }, [tasks, riders]);

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  // customer tips awaiting confirmation — HomeSang never holds funds, so a tip
  // only becomes withdrawable once admin confirms the money actually arrived.
  const pendingTips = tasks.filter((t) => (t.tip ?? 0) > 0 && t.tipConfirmed !== true);
  const settled = tasks.filter((t) => t.codRemitted).reduce((s, t) => s + (t.codAmount ?? 0), 0);

  const confirmAll = async (g: { tasks: DeliveryTask[] }, received: boolean) => {
    for (const t of g.tasks) await confirmCodRemit(t.id, received);
  };

  return (
    <View>
      <Text style={styles.title}>💵 {tt('admCod', 'ເງິນສົດ COD · ກະທົບຍອດ')}</Text>
      <Text style={styles.sub}>{tt('admCod', 'ໄຣເດີ້ ເກັບ ເງິນສົດ ແທນ ຮ້ານ — ຕ້ອງ ນຳສົ່ງ ຄືນ. ຢືນຢັນ ເມື່ອ ໄດ້ຮັບ ເງິນ ຈິງ.')}</Text>

      <View style={styles.cards}>
        <View style={styles.metric}><Text style={styles.mLabel}>{tt('admCod', 'ຄ້າງ ນຳສົ່ງ')}</Text><Text style={styles.mBig}>{fmt(grandTotal)}</Text></View>
        <View style={styles.metric}><Text style={styles.mLabel}>{tt('admCod', 'ຮັບ ຄືນ ແລ້ວ')}</Text><Text style={styles.mOk}>{fmt(settled)}</Text></View>
        <View style={styles.metric}><Text style={styles.mLabel}>{tt('admCod', 'ໄຣເດີ້ ຕິດ')}</Text><Text style={styles.mVal}>{groups.length}</Text></View>
      </View>

      {groups.length === 0 ? (
        <Text style={styles.empty}>{tt('admCod', '✓ ບໍ່ມີ ເງິນສົດ ຄ້າງ — ທຸກ ຢ່າງ ກະທົບ ຍອດ ຄົບ')}</Text>
      ) : groups.map((g) => (
        <View key={g.uid} style={[styles.card, g.declared && styles.cardDeclared]}>
          <View style={styles.head}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>🛵 {g.name}{g.rider?.plate ? ` · 🚗 ${g.rider.plate}` : ''}</Text>
              <Text style={styles.meta}>{g.rider?.phone ?? '—'} · {g.tasks.length} {tt('admCod', 'ອໍເດີ')}</Text>
            </View>
            <Text style={styles.owed}>{fmt(g.total)} ₭</Text>
          </View>

          {g.tasks.map((t) => (
            <View key={t.id} style={styles.trow}>
              <Text style={styles.tnum}>#{t.orderNumber ?? t.id.slice(0, 6)}</Text>
              <Text style={styles.tamt}>{fmt(t.codAmount ?? 0)}</Text>
              {t.remitRequested
                ? <Text style={[styles.pill, styles.pPend]}>{tt('admCod', 'ແຈ້ງແລ້ວ')}</Text>
                : <Text style={[styles.pill, styles.pOwe]}>{tt('admCod', 'ຕິດ')}</Text>}
            </View>
          ))}

          {g.declared && (
            <View style={styles.declBox}>
              <Text style={styles.declText}>
                📤 {tt('admCod', 'ແຈ້ງ ນຳສົ່ງ')}: {g.tasks.find((t) => t.remitMethod)?.remitMethod || tt('admCod', 'ບໍ່ໄດ້ລະບຸ')}
              </Text>
              {(() => {
                const p = g.tasks.find((t) => t.remitProof)?.remitProof;
                return p ? (
                  <Pressable onPress={() => setProof(proof === p ? null : p)}>
                    <Text style={styles.proofLink}>📎 {proof === p ? tt('admCod', 'ເຊື່ອງ ຫຼັກຖານ') : tt('admCod', 'ເບິ່ງ ຫຼັກຖານ')}</Text>
                  </Pressable>
                ) : null;
              })()}
            </View>
          )}
          {(() => {
            const p = g.tasks.find((t) => t.remitProof)?.remitProof;
            return p && proof === p ? <Image source={{ uri: p }} style={styles.proofImg} /> : null;
          })()}

          {canEdit && (
            <View style={styles.actions}>
              <Pressable style={[styles.btn, { backgroundColor: '#16a34a' }]} onPress={() => confirmAll(g, true)}>
                <Text style={styles.btnText}>✓ {tt('admCod', 'ຮັບ ເງິນ ແລ້ວ')}</Text>
              </Pressable>
              {g.declared && (
                <Pressable style={[styles.btn, { backgroundColor: '#dc2626' }]} onPress={() => confirmAll(g, false)}>
                  <Text style={styles.btnText}>✗ {tt('admCod', 'ປະຕິເສດ')}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      ))}

      {pendingTips.length > 0 && (
        <>
          <Text style={styles.tipHead}>💝 {tt('admCod', 'ທິບ ລໍ ຢືນຢັນ')} ({pendingTips.length})</Text>
          {pendingTips.map((t) => (
            <View key={t.id} style={styles.tipRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.tipName} numberOfLines={1}>🛵 {t.assignedRiderName ?? '—'} · #{t.orderNumber ?? t.id.slice(0, 6)}</Text>
                <Text style={styles.tipMeta}>{tt('admCod', 'ລູກຄ້າ ໃຫ້ ທິບ')} {fmt(t.tip ?? 0)} ₭ — {tt('admCod', 'ຢືນຢັນ ເມື່ອ ໄດ້ຮັບ ເງິນ ຈິງ')}</Text>
              </View>
              {canEdit && (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable style={[styles.btn, { flex: 0, paddingHorizontal: 12, backgroundColor: '#16a34a' }]} onPress={() => confirmTip(t.id, true)}>
                    <Text style={styles.btnText}>✓</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, { flex: 0, paddingHorizontal: 12, backgroundColor: '#dc2626' }]} onPress={() => confirmTip(t.id, false)}>
                    <Text style={styles.btnText}>✗</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </>
      )}

      <Text style={styles.note}>{tt('admCod', 'ໝາຍເຫດ: ເງິນສົດ ທີ່ ຄ້າງ ຈະ ຫັກ ອອກ ຈາກ ຍອດ ຖອນ ໄດ້ ຂອງ ໄຣເດີ້ ອັດຕະໂນມັດ — ຖອນ ເກີນ ບໍ່ ໄດ້.')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14, lineHeight: 17 },
  cards: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metric: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 10, padding: 12 },
  mLabel: { fontSize: 12, color: '#6b7280' },
  mBig: { fontSize: 15, fontWeight: '800', color: '#dc2626', marginTop: 4 },
  mOk: { fontSize: 15, fontWeight: '700', color: '#16a34a', marginTop: 4 },
  mVal: { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 4 },
  empty: { fontSize: 13, color: '#16a34a', fontWeight: '600', paddingVertical: 16, textAlign: 'center' },
  card: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fffbfb', borderRadius: 12, padding: 12, marginBottom: 10 },
  cardDeclared: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 14, fontWeight: '700', color: '#111' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  owed: { fontSize: 15, fontWeight: '900', color: '#dc2626' },
  trow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 6 },
  tnum: { fontSize: 12, color: '#0066CC', fontWeight: '700', flex: 1 },
  tamt: { fontSize: 12, color: '#111', fontWeight: '700' },
  pill: { fontSize: 12, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  pOwe: { backgroundColor: '#fee2e2', color: '#991b1b' },
  pPend: { backgroundColor: '#fef3c7', color: '#92400e' },
  declBox: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#fde68a' },
  declText: { fontSize: 12, color: '#92400e' },
  proofLink: { fontSize: 12, color: '#0066CC', fontWeight: '700', marginTop: 4 },
  proofImg: { width: '100%', height: 220, borderRadius: 8, marginTop: 8, backgroundColor: '#f3f4f6' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  note: { fontSize: 12, color: '#9ca3af', marginTop: 14, lineHeight: 18 },
  tipHead: { fontSize: 13, fontWeight: '700', color: '#111', marginTop: 18, marginBottom: 8 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', borderRadius: 10, padding: 11, marginBottom: 6 },
  tipName: { fontSize: 13, fontWeight: '700', color: '#111' },
  tipMeta: { fontSize: 12, color: '#166534', marginTop: 2 },
});
