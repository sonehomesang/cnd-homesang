import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type RecordDoc, saveRecord, watchCollection } from '@/lib/records';
import {
  assignTaskToRider,
  cancelTask,
  type DeliveryTask,
  DELIVERY_TASK_STATUS_LABEL,
  reopenTask,
  riderStats,
  type RiderProfile,
  setRiderApproved,
  watchAllDeliveryTasks,
  watchRiders,
} from '@/lib/riders';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';

const TASK_COLOR: Record<string, { bg: string; fg: string }> = {
  open: { bg: '#dbeafe', fg: '#1e40af' },
  accepted: { bg: '#ede9fe', fg: '#5b21b6' },
  picked_up: { bg: '#fef3c7', fg: '#92400e' },
  delivered: { bg: '#d1fae5', fg: '#065f46' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b' },
};

export default function RidersPanel() {
  const { canEdit } = useSectionPerms('catalog');
  const tt = useTT();
  const [riders, setRiders] = useState<RecordDoc[]>([]);
  const [tasks, setTasks] = useState<DeliveryTask[]>([]);
  const [riderList, setRiderList] = useState<RiderProfile[]>([]);
  const [assignFor, setAssignFor] = useState<string | null>(null); // task id awaiting rider pick

  useEffect(() => {
    const u1 = watchCollection('riders', (docs) => { docs.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)); setRiders(docs); });
    const u2 = watchAllDeliveryTasks(setTasks);
    const u3 = watchRiders(setRiderList);
    return () => { u1(); u2(); u3(); };
  }, []);

  // a task whose rider is no longer approved/active is stranded — admin must act
  const strandedIds = new Set(
    tasks.filter((t) => (t.status === 'accepted' || t.status === 'picked_up') && t.assignedRiderId
      && !riderList.some((r) => r.uid === t.assignedRiderId && r.approved === true && r.active !== false))
      .map((t) => t.id),
  );
  const eligible = riderList.filter((r) => r.approved === true && r.active !== false);

  const statsFor = (uid: string) => riderStats(tasks.filter((t) => t.assignedRiderId === uid));

  return (
    <View>
      <Text style={styles.title}>🛵 {tt('admRider', 'ໄຮເດີ້ & ການຈັດສົ່ງ')} · HomeSang Express</Text>
      <Text style={styles.sub}>{tt('admRider', 'ຜູ້ໃຊ້ ທີ່ ສະໝັກ ເປັນ rider + ຄິວ ຈັດສົ່ງ')}</Text>

      <Text style={styles.section}>🛵 {tt('admRider', 'Riders')} ({riders.length})</Text>
      {riders.length === 0 ? (
        <Text style={styles.empty}>{tt('admRider', 'ຍັງບໍ່ມີ rider')}</Text>
      ) : riders.map((r) => {
        const on = r.active !== false;
        const approved = r.approved === true;
        return (
          <View key={r.id} style={styles.card}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{r.vehicle ? `${String(r.vehicle).split(' ')[0]} ` : '🛵 '}{r.name}</Text>
                <Text style={[styles.vbadge, approved ? styles.vOk : styles.vPend]}>{approved ? tt('admRider', '✓ ຢືນຢັນແລ້ວ') : tt('admRider', '⏳ ລໍກວດ')}</Text>
              </View>
              <Text style={styles.meta} numberOfLines={1}>{r.phone ?? '—'}{r.zone ? ` · 📍 ${r.zone}` : ''}</Text>
              <Text style={styles.meta} numberOfLines={1}>🪪 {r.licenseNo || tt('admRider', 'ບໍ່ໄດ້ໃສ່ໃບຂັບຂີ່')}{r.plate ? ` · 🚗 ${r.plate}` : ''}{r.licenseImage ? ' · 📎' : ''}</Text>
              {(() => {
                const st = statsFor(r.id);
                return (
                  <Text style={styles.meta}>
                    ✅ {tt('admRider', 'ສົ່ງສຳເລັດ')} {st.delivered}
                    {st.avgMinutes != null ? ` · ⏱ ${st.avgMinutes} ${tt('admRider', 'ນາທີ')}` : ''}
                    {st.active > 0 ? ` · 🛵 ${tt('admRider', 'ກຳລັງເຮັດ')} ${st.active}` : ''}
                    {st.tips > 0 ? ` · 💝 ${st.tips.toLocaleString()}` : ''}
                  </Text>
                );
              })()}
              {canEdit && (
                <Pressable
                  onPress={() => setRiderApproved(r.id, !approved)}
                  style={[styles.appBtn, approved ? styles.appBtnOff : styles.appBtnOn]}>
                  <Text style={[styles.appText, approved ? styles.appTextOff : styles.appTextOn]}>{approved ? tt('admRider', '↩ ຖອນ ຢືນຢັນ') : tt('admRider', '✓ ອະນຸມັດ ໄຣເດີ້')}</Text>
                </Pressable>
              )}
            </View>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={styles.swLabel}>{on ? tt('admRider', 'ເປີດ') : tt('admRider', 'ປິດ')}</Text>
              <Pressable
                disabled={!canEdit}
                onPress={() => saveRecord('riders', r.id, { active: !on })}
                style={[styles.sw, on ? styles.swOn : styles.swOff, !canEdit && { opacity: 0.5 }]}>
                <View style={styles.knob} />
              </Pressable>
            </View>
          </View>
        );
      })}

      <Text style={styles.section}>📦 {tt('admRider', 'ຄິວ ຈັດສົ່ງ')} ({tasks.length})</Text>
      {tasks.length === 0 ? (
        <Text style={styles.empty}>{tt('admRider', 'ຍັງບໍ່ມີ task — ເກີດ ຕອນ ລູກຄ້າ ເລືອກ HomeSang Express')}</Text>
      ) : (
        <View style={styles.tbl}>
          <View style={[styles.trow, styles.thead]}>
            <Text style={[styles.th, { flex: 1.2 }]}>Order</Text>
            <Text style={[styles.th, { flex: 1.3 }]}>Rider</Text>
            <Text style={[styles.th, { flex: 1 }]}>{tt('admRider', 'ຄ່າສົ່ງ')}</Text>
            <Text style={[styles.th, { flex: 1.1 }]}>{tt('admRider', 'ສະຖານະ')}</Text>
          </View>
          {tasks.map((t) => {
            const c = TASK_COLOR[t.status] ?? TASK_COLOR.open;
            const stranded = strandedIds.has(t.id);
            const live = t.status !== 'delivered' && t.status !== 'cancelled';
            return (
              <View key={t.id}>
                <View style={styles.trow}>
                  <Text style={[styles.td, { flex: 1.2 }]} numberOfLines={1}>{t.orderNumber ? `#${t.orderNumber}` : t.id.slice(0, 6)}</Text>
                  <Text style={[styles.td, { flex: 1.3 }]} numberOfLines={1}>{t.assignedRiderName ?? '—'}{t.riderPlate ? ` · 🚗${t.riderPlate}` : ''}</Text>
                  <Text style={[styles.td, { flex: 1 }]}>{(t.fee ?? 0).toLocaleString()}</Text>
                  <View style={{ flex: 1.1 }}>
                    <Text style={[styles.badge, { backgroundColor: c.bg, color: c.fg }]}>{tt('deliveryTask', DELIVERY_TASK_STATUS_LABEL[t.status])}</Text>
                  </View>
                </View>
                {stranded && (
                  <Text style={styles.stranded}>⚠️ {tt('admRider', 'ໄຣເດີ້ ຖືກ ປິດ/ຖອນ ຢືນຢັນ ແຕ່ ຍັງ ຖື ວຽກ ນີ້ — ໂອນ ຫຼື ເປີດ ຄືນ')}</Text>
                )}
                {canEdit && live && (
                  <View style={styles.tactions}>
                    {t.status === 'open' ? (
                      <Pressable style={[styles.mini, { backgroundColor: '#0066CC' }]} onPress={() => setAssignFor(assignFor === t.id ? null : t.id)}>
                        <Text style={styles.miniText}>👤 {tt('admRider', 'ມອບ ໃຫ້ rider')}</Text>
                      </Pressable>
                    ) : (
                      <>
                        <Pressable style={[styles.mini, { backgroundColor: '#475569' }]} onPress={() => setAssignFor(assignFor === t.id ? null : t.id)}>
                          <Text style={styles.miniText}>🔄 {tt('admRider', 'ໂອນ')}</Text>
                        </Pressable>
                        <Pressable style={[styles.mini, { backgroundColor: '#f59e0b' }]} onPress={() => reopenTask(t.id)}>
                          <Text style={styles.miniText}>↩ {tt('admRider', 'ເປີດ ຄືນ ຄິວ')}</Text>
                        </Pressable>
                      </>
                    )}
                    <Pressable style={[styles.mini, { backgroundColor: '#dc2626' }]} onPress={() => {
                      if (typeof confirm !== 'function' || confirm(tt('admRider', 'ຍົກເລີກ ວຽກ ຈັດສົ່ງ ນີ້?'))) cancelTask(t.id);
                    }}>
                      <Text style={styles.miniText}>✗ {tt('admRider', 'ຍົກເລີກ')}</Text>
                    </Pressable>
                  </View>
                )}
                {assignFor === t.id && (
                  <View style={styles.assignBox}>
                    <Text style={styles.assignLabel}>{tt('admRider', 'ເລືອກ ໄຣເດີ້ (ອະນຸມັດ ແລ້ວ):')}</Text>
                    {eligible.length === 0 ? (
                      <Text style={styles.empty}>{tt('admRider', 'ບໍ່ມີ ໄຣເດີ້ ທີ່ ອະນຸມັດ ແລ້ວ')}</Text>
                    ) : eligible.map((r) => (
                      <Pressable key={r.uid} style={styles.assignChip} onPress={async () => { await assignTaskToRider(t.id, r.uid); setAssignFor(null); }}>
                        <Text style={styles.assignChipText}>🛵 {r.name}{r.plate ? ` · ${r.plate}` : ''}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 4 },
  section: { fontSize: 13, fontWeight: '700', color: '#111', marginTop: 16, marginBottom: 8 },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14, fontWeight: '700', color: '#111', flexShrink: 1 },
  vbadge: { fontSize: 12, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  vOk: { backgroundColor: '#d1fae5', color: '#065f46' },
  vPend: { backgroundColor: '#fef3c7', color: '#92400e' },
  meta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  appBtn: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, marginTop: 8, borderWidth: 1 },
  appBtnOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  appBtnOff: { backgroundColor: '#fff', borderColor: '#dc2626' },
  appText: { fontSize: 12, fontWeight: '700' },
  appTextOn: { color: '#fff' },
  appTextOff: { color: '#dc2626' },
  swLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  sw: { width: 40, height: 24, borderRadius: 12, padding: 2, flexDirection: 'row' },
  swOn: { backgroundColor: '#16a34a', justifyContent: 'flex-end' },
  swOff: { backgroundColor: '#cbd5e1', justifyContent: 'flex-start' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  tbl: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, overflow: 'hidden' },
  trow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f3f6', gap: 6 },
  thead: { backgroundColor: '#f9fafb' },
  th: { fontSize: 12, color: '#6b7280', fontWeight: '700' },
  td: { fontSize: 12, color: '#374151' },
  badge: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' },
  stranded: { fontSize: 12, color: '#991b1b', backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 5, fontWeight: '600' },
  tactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 8, paddingBottom: 8 },
  mini: { borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5 },
  miniText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  assignBox: { backgroundColor: '#f8fafc', padding: 10, gap: 6 },
  assignLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  assignChip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, alignSelf: 'flex-start' },
  assignChipText: { fontSize: 12, color: '#0066CC', fontWeight: '700' },
});
