import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Plan, type Subscription, watchAllPlans, watchAllSubscriptions, setSubscriptionStatus } from '@/lib/membership';
import { type Referral, watchAllReferrals } from '@/lib/referrals';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';
import type { RecordDoc } from '@/lib/records';
import GroupedRecordEditor, { type FieldGroup } from './GroupedRecordEditor';
import { usePaged } from './Paginator';

const PLAN_GROUPS: FieldGroup[] = [
  {
    key: 'main',
    label: 'ແພັກ',
    fields: [
      { key: 'nameLao', label: 'ຊື່ (ລາວ)', kind: 'text' },
      { key: 'name', label: 'ຊື່ (EN)', kind: 'text' },
      [
        { key: 'price', label: 'ລາຄາ (ກີບ, 0=ຟຣີ)', kind: 'money' },
        { key: 'durationDays', label: 'ໄລຍະ (ມື້)', kind: 'number' },
      ],
      { key: 'features', label: 'ຄຸນສົມບັດ', kind: 'chips' },
      [
        { key: 'order', label: 'ລຳດັບ', kind: 'number' },
        { key: 'active', label: 'ເປີດໃຊ້', kind: 'bool' },
      ],
    ],
  },
];

const SUB_STATUS: Record<string, { l: string; c: string; bg: string }> = {
  trial: { l: 'ທົດລອງ', c: '#0f766e', bg: '#ccfbf1' },
  pending: { l: 'ຮໍ ຢືນຢັນ', c: '#92400e', bg: '#fde68a' },
  active: { l: 'ໃຊ້ງານ', c: '#065f46', bg: '#d1fae5' },
  expired: { l: 'ໝົດອາຍຸ', c: '#991b1b', bg: '#fee2e2' },
};

type Tab = 'plans' | 'subs' | 'refs';

function shortDate(ms: number): string {
  return ms ? new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
}

export default function MembershipsPanel() {
  const { canCreate, canEdit, canDelete } = useSectionPerms('memberships');
  const [tab, setTab] = useState<Tab>('plans');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [refs, setRefs] = useState<Referral[]>([]);
  const [editRecord, setEditRecord] = useState<RecordDoc | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => watchAllPlans(setPlans), []);
  useEffect(() => watchAllSubscriptions(setSubs), []);
  useEffect(() => watchAllReferrals(setRefs), []);

  const subPg = usePaged(subs, 10);
  const refPg = usePaged(refs, 12);
  const tt = useTT();

  const TABS: { v: Tab; l: string }[] = [
    { v: 'plans', l: `${tt('admMemberships','ແພັກ')} (${plans.length})` },
    { v: 'subs', l: `${tt('admMemberships','ການສະໝັກ')} (${subs.length})` },
    { v: 'refs', l: `${tt('admMemberships','ແນະນຳ')} (${refs.length})` },
  ];

  return (
    <View>
      <Text style={styles.title}>{tt('admMemberships', '🎫 ສະມາຊິກ · Memberships')}</Text>
      <Text style={styles.sub}>{tt('admMemberships', 'ຈັດການ ແພັກ · ຢືນຢັນ ການສະໝັກ · ເບິ່ງ ການແນະນຳ')}</Text>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.v} onPress={() => setTab(t.v)} style={styles.tab}>
            <Text style={[styles.tabText, tab === t.v && styles.tabOn]}>{t.l}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'plans' && (
        <>
          {canCreate && <Pressable style={styles.createBtn} onPress={() => setCreating(true)}><Text style={styles.createBtnText}>{tt('admMemberships', '＋ ສ້າງ ແພັກ')}</Text></Pressable>}
          {plans.length === 0 ? <Text style={styles.empty}>{tt('admMemberships', 'ຍັງບໍ່ມີ ແພັກ')}</Text> : plans.map((p) => (
            <View key={p.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.pName}>{p.nameLao || p.name}{p.active === false ? tt('admMemberships', ' · ປິດ') : ''}</Text>
                <Text style={styles.pPrice}>{p.price === 0 ? tt('admMemberships', 'ຟຣີ') : `${(p.price ?? 0).toLocaleString()} ${tt('common','ກີບ')}`}</Text>
              </View>
              <Text style={styles.pMeta}>{p.durationDays} {tt('admMemberships', 'ມື້')} · {(p.features?.length ?? 0)} {tt('admMemberships', 'ຄຸນສົມບັດ')}</Text>
              <Pressable style={styles.editBtn} onPress={() => setEditRecord(p as any)}><Text style={styles.editText}>{canEdit ? tt('admMemberships', '✎ ແກ້ໄຂ') : tt('admMemberships', '👁 ເບິ່ງ')}</Text></Pressable>
            </View>
          ))}
        </>
      )}

      {tab === 'subs' && (
        subs.length === 0 ? <Text style={styles.empty}>{tt('admMemberships', 'ຍັງບໍ່ມີ ການສະໝັກ')}</Text> : subPg.items.map((s) => {
          const st = SUB_STATUS[s.status] ?? SUB_STATUS.pending;
          return (
            <View key={s.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.pName} numberOfLines={1}>{s.planName} · 👤 {s.userId.slice(0, 6)}</Text>
                <Text style={[styles.pill, { color: st.c, backgroundColor: st.bg }]}>{tt('admMemberships', st.l)}</Text>
              </View>
              <Text style={styles.pMeta}>{tt('admMemberships', 'ເລີ່ມ')} {shortDate(s.startAt)} · {tt('admMemberships', 'ໝົດ')} {shortDate(s.endAt ?? 0)}</Text>
              {canEdit && s.status === 'pending' && (
                <View style={styles.actions}>
                  <Pressable style={[styles.btn, { borderColor: '#16a34a' }]} onPress={() => setSubscriptionStatus(s.id, 'active')}><Text style={{ color: '#16a34a', fontSize: 12, fontWeight: '700' }}>{tt('admMemberships', '✓ ຢືນຢັນ')}</Text></Pressable>
                  <Pressable style={[styles.btn, { borderColor: '#dc2626' }]} onPress={() => setSubscriptionStatus(s.id, 'expired')}><Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '700' }}>{tt('admMemberships', '✗ ປະຕິເສດ')}</Text></Pressable>
                </View>
              )}
            </View>
          );
        })
      )}
      {tab === 'subs' && subPg.bar}

      {tab === 'refs' && (
        refs.length === 0 ? <Text style={styles.empty}>{tt('admMemberships', 'ຍັງບໍ່ມີ ການແນະນຳ')}</Text> : refPg.items.map((r) => (
          <View key={r.id} style={styles.refRow}>
            <Text style={styles.refCode}>{r.code}</Text>
            <Text style={styles.refText} numberOfLines={1}>👤 {r.referrerId.slice(0, 6)} → {r.refereeName || r.refereeId.slice(0, 6)}</Text>
            <Text style={styles.date}>{shortDate(r.createdAt)}</Text>
          </View>
        ))
      )}
      {tab === 'refs' && refPg.bar}

      {(editRecord || creating) && (
        <GroupedRecordEditor
          colName="membershipPlans"
          record={editRecord}
          groups={PLAN_GROUPS}
          canDelete={canDelete}
          canEdit={canEdit}
          canCreate={canCreate}
          onClose={() => { setEditRecord(null); setCreating(false); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  tabs: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  tab: { paddingVertical: 6 },
  tabText: { fontSize: 12, color: '#6b7280' },
  tabOn: { color: '#0066CC', fontWeight: '700' },
  empty: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 12 },
  createBtn: { alignSelf: 'flex-start', backgroundColor: '#16a34a', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 12 },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pName: { fontSize: 14, fontWeight: '700', color: '#111', flex: 1 },
  pPrice: { fontSize: 14, fontWeight: '700', color: '#0066CC' },
  pMeta: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  pill: { fontSize: 12, fontWeight: '700', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  editBtn: { alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editText: { color: '#0066CC', fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 8, padding: 10, marginBottom: 6 },
  refCode: { fontFamily: 'monospace' as any, fontSize: 12, fontWeight: '700', color: '#0066CC', backgroundColor: '#EAF2FB', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden' },
  refText: { flex: 1, minWidth: 0, fontSize: 12, color: '#374151' },
  date: { fontSize: 12, color: '#9ca3af' },
});
