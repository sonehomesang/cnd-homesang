import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { watchUserActivity, ACTIVITY_META, type UserActivity } from '@/lib/userActivity';
import {
  type AdminUser,
  setUserRoles,
  setUserStatus,
  watchAllUsers,
} from '@/lib/admin';
import { backfillTechCards, seedMockUsersIfEmpty } from '@/lib/seedUsers';
import { type Role, watchRoles } from '@/lib/rbac';
import { getAdminTier } from '@/lib/adminTier';
import { useSectionPerms } from '@/lib/permissions-context';
import { ttStatic, useTT } from '@/lib/i18n';
import { formatLaoPhone } from '@/lib/format';
import { seedUserGroupsIfEmpty } from '@/lib/userGroups';
import { watchRiders } from '@/lib/riders';
import type { RecordDoc } from '@/lib/records';
import GroupedRecordEditor from './GroupedRecordEditor';
import { usePaged } from './Paginator';
import { USER_GROUPS } from '@/lib/adminEditors';

const ROLE_BADGE: Record<string, { bg: string; fg: string }> = {
  customer: { bg: '#dbeafe', fg: '#1e40af' },
  technician: { bg: '#d1fae5', fg: '#065f46' },
  shop: { bg: '#ede9fe', fg: '#5b21b6' },
  admin: { bg: '#fde68a', fg: '#92400e' },
  cs_admin: { bg: '#cffafe', fg: '#155e75' },
  cp_admin: { bg: '#fce7f3', fg: '#9d174d' },
};

type Tab = 'all' | 'pending' | 'technician' | 'shop' | 'rider' | 'suspended';

const GROUP_META: Record<string, { icon: string; label: string; bg: string }> = {
  admin: { icon: '👑', label: ttStatic('admUsers', 'ແອັດມິນ'), bg: '#faf5ff' },
  corporation: { icon: '🏢', label: ttStatic('admUsers', 'ນິຕິບຸກຄົນ'), bg: '#eff6ff' },
  technician: { icon: '🔧', label: ttStatic('admUsers', 'ຊ່າງ'), bg: '#f0fdf4' },
  general: { icon: '👤', label: ttStatic('admUsers', 'ທົ່ວໄປ'), bg: '#fffbeb' },
};

/** Derive how a user account came to exist (creationMethod, with legacy fallbacks). */
function sourceOf(u: any): { icon: string; label: string; bg: string; fg: string } {
  const m = u?.creationMethod
    ?? (typeof u?.uid === 'string' && u.uid.startsWith('mock-') ? 'seed' : undefined);
  if (m === 'signup') return { icon: '✍️', label: 'ສະໝັກ ເອງ', bg: '#dcfce7', fg: '#065f46' };
  if (m === 'admin') return { icon: '👑', label: 'admin ສ້າງ', bg: '#ede9fe', fg: '#5b21b6' };
  if (m === 'seed') return { icon: '🌱', label: 'seed', bg: '#f1f5f9', fg: '#475569' };
  return { icon: '❔', label: 'ບໍ່ ຮູ້ (legacy)', bg: '#f1f5f9', fg: '#6b7280' };
}

function fmtDateTime(ms?: number): string {
  if (!ms) return '—';
  try { return new Date(ms).toLocaleString('lo-LA'); } catch { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }
}

export default function UsersPanel() {
  const { profile } = useAuth();
  const tt = useTT();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  // uid → approved? — derived rider status (single source of truth = riders/{uid})
  const [riderMap, setRiderMap] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<Tab>('all');
  const [editRolesFor, setEditRolesFor] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState<RecordDoc | 'new' | null>(null);
  const [detailFor, setDetailFor] = useState<AdminUser | null>(null);

  useEffect(() => {
    seedMockUsersIfEmpty()
      .then(() => backfillTechCards())
      .catch((e) => console.error('seed users:', e));
    seedUserGroupsIfEmpty().catch((e) => console.error('seed userGroups:', e));
    const unsub = watchAllUsers(setUsers);
    const unsub2 = watchRoles(setAllRoles);
    const unsub3 = watchRiders((rs) => setRiderMap(Object.fromEntries(rs.map((r) => [r.uid, r.approved === true]))));
    return () => { unsub(); unsub2(); unsub3(); };
  }, []);

  const toggleRole = (u: AdminUser, roleName: string) => {
    const cur = (u.roles ?? []) as string[];
    const next = cur.includes(roleName) ? cur.filter((r) => r !== roleName) : [...cur, roleName];
    setUserRoles(u.uid, next);
  };

  const myTier = getAdminTier(profile);
  const isSuper = myTier === 'super';
  const { canCreate, canEdit, canDelete } = useSectionPerms('users');

  const count = (t: Tab) => {
    if (t === 'all') return users.length;
    if (t === 'pending') return users.filter((u) => u.status === 'pending').length;
    if (t === 'suspended') return users.filter((u) => u.status === 'suspended').length;
    if (t === 'rider') return users.filter((u) => u.uid in riderMap).length;
    return users.filter((u) => (u.roles ?? []).includes(t)).length;
  };

  const TABS: { value: Tab; label: string }[] = [
    { value: 'all', label: `${tt('admUsers', 'ທັງໝົດ')} (${count('all')})` },
    { value: 'pending', label: `${tt('admUsers', 'ຮໍ')} (${count('pending')})` },
    { value: 'technician', label: `${tt('admUsers', 'ຊ່າງ')} (${count('technician')})` },
    { value: 'shop', label: `${tt('admUsers', 'ຮ້ານ')} (${count('shop')})` },
    { value: 'rider', label: `🛵 ${tt('admUsers', 'ໄຣເດີ້')} (${count('rider')})` },
    { value: 'suspended', label: `${tt('admUsers', 'ລະງັບ')} (${count('suspended')})` },
  ];

  const shown = users.filter((u) => {
    if (tab === 'all') return true;
    if (tab === 'pending') return u.status === 'pending';
    if (tab === 'suspended') return u.status === 'suspended';
    if (tab === 'rider') return u.uid in riderMap;
    return (u.roles ?? []).includes(tab);
  });
  const pg = usePaged(shown, 8);

  return (
    <View>
      <Text style={styles.title}>{tt('admUsers', '👥 ຜູ້ໃຊ້ · Users')}</Text>
      <Text style={styles.sub}>{tt('admUsers', 'ຈັດການບັນຊີ — approve · suspend · ✎ ແກ້ທຸກ field')}{isSuper ? tt('admUsers', ' · ກຳນົດ admin tier') : ''}</Text>

      {canCreate && (
        <Pressable style={styles.createBtn} onPress={() => setEditRecord('new')}>
          <Text style={styles.createBtnText}>{tt('admUsers', '+ ສ້າງ / ເພີ່ມ ຜູ້ໃຊ້ໃໝ່')}</Text>
        </Pressable>
      )}

      <UserStats users={users} riderMap={riderMap} />

      <View style={styles.subtabs}>
        {TABS.map((t) => (
          <Pressable key={t.value} onPress={() => setTab(t.value)} style={styles.subtab}>
            <Text style={[styles.subtabText, tab === t.value && styles.subtabActive]}>
              {t.label}
            </Text>
            {tab === t.value && <View style={styles.subtabBar} />}
          </Pressable>
        ))}
      </View>

      {pg.items.map((u) => {
        return (
        <View key={u.uid} style={styles.rowWrap}>
          <View style={styles.row}>
          {u.image ? (
            <Image source={{ uri: u.image }} style={styles.av} />
          ) : (
            <View style={[styles.av, styles.avEmpty]}><Text style={{ fontSize: 16 }}>👤</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{u.name || u.firstName || '(ບໍ່ມີຊື່)'}</Text>
            <Text style={styles.usub}>
              {formatLaoPhone(u.phone) || u.email || '—'}
              {u.rating !== undefined ? ` · ⭐${u.rating.toFixed(1)}` : ''}
            </Text>
            <View style={styles.badges}>
              {(u.roles ?? []).map((r) => {
                const c = ROLE_BADGE[r] ?? ROLE_BADGE.customer;
                return (
                  <Text key={r} style={[styles.badge, { backgroundColor: c.bg, color: c.fg }]}>
                    {r === 'admin' ? '👑 admin' : r}
                  </Text>
                );
              })}
              {!!(u as any).group && (
                <Text style={[styles.badge, { backgroundColor: '#e0e7ff', color: '#3730a3' }]}>
                  👪 {(u as any).group}
                </Text>
              )}
              {(() => { const s = sourceOf(u); return (
                <Text style={[styles.badge, { backgroundColor: s.bg, color: s.fg }]}>{s.icon} {s.label}</Text>
              ); })()}
              {u.uid in riderMap && (
                <Text style={[styles.badge, { backgroundColor: '#e0f2fe', color: '#075985' }]}>
                  🛵 {riderMap[u.uid] ? tt('admUsers', 'ໄຣເດີ້ ✓') : tt('admUsers', 'ໄຣເດີ້ ⏳')}
                </Text>
              )}
              {u.status && u.status !== 'approved' && (
                <Text style={[styles.badge, { backgroundColor: '#fee', color: '#991b1b' }]}>
                  {u.status}
                </Text>
              )}
            </View>
          </View>
          </View>
          {canEdit ? (
          <View style={styles.actions}>
            {u.status !== 'approved' && (
              <Pressable style={[styles.mini, { backgroundColor: '#16a34a' }]} onPress={() => setUserStatus(u.uid, 'approved')}>
                <Text style={styles.miniText}>Approve</Text>
              </Pressable>
            )}
            {u.status !== 'suspended' && (
              <Pressable style={[styles.mini, { backgroundColor: '#dc2626' }]} onPress={() => setUserStatus(u.uid, 'suspended')}>
                <Text style={styles.miniText}>Suspend</Text>
              </Pressable>
            )}
            <Pressable style={[styles.mini, { backgroundColor: '#0066CC' }]} onPress={() => setEditRecord({ ...u, id: u.uid })}>
              <Text style={styles.miniText}>{tt('admUsers', '✎ ແກ້')}</Text>
            </Pressable>
            <Pressable style={[styles.mini, { backgroundColor: '#475569' }]} onPress={() => setEditRolesFor(editRolesFor === u.uid ? null : u.uid)}>
              <Text style={styles.miniText}>{tt('admUsers', '🛡️ ບົດບາດ')}</Text>
            </Pressable>
            <Pressable style={[styles.mini, { backgroundColor: '#7c3aed' }]} onPress={() => setDetailFor(u)}>
              <Text style={styles.miniText}>{tt('admUsers', '👁️ ລາຍລະອຽດ')}</Text>
            </Pressable>
          </View>
          ) : (
            <View style={styles.actions}>
              <Pressable style={[styles.mini, { backgroundColor: '#7c3aed' }]} onPress={() => setDetailFor(u)}>
                <Text style={styles.miniText}>{tt('admUsers', '👁️ ລາຍລະອຽດ')}</Text>
              </Pressable>
            </View>
          )}

          {editRolesFor === u.uid && (
            <View style={styles.roleAssign}>
              <Text style={styles.roleAssignLabel}>{tt('admUsers', 'ກຳນົດບົດບາດ:')}</Text>
              {allRoles.map((r) => {
                const on = ((u.roles ?? []) as string[]).includes(r.name);
                return (
                  <Pressable key={r.id} style={[styles.roleChip, on && styles.roleChipOn]} onPress={() => toggleRole(u, r.name)}>
                    <Text style={[styles.roleChipText, on && styles.roleChipTextOn]}>{r.icon} {r.nameLao}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
        );
      })}

      {pg.bar}

      {detailFor && <UserDetailModal user={detailFor} onClose={() => setDetailFor(null)} />}

      {editRecord && (
        <GroupedRecordEditor
          colName="users"
          record={editRecord === 'new' ? null : editRecord}
          groups={USER_GROUPS}
          pathPrefix={editRecord !== 'new' ? `users/${editRecord.id}` : undefined}
          canDelete={canDelete}
          canEdit={canEdit}
          canCreate={canCreate}
          canTier={isSuper}
          onClose={() => setEditRecord(null)}
        />
      )}
    </View>
  );
}

/** Counts overview: by group (tiles), by role/status/source (bars). */
function UserStats({ users, riderMap }: { users: AdminUser[]; riderMap: Record<string, boolean> }) {
  const tt = useTT();
  const total = users.length || 1;
  const groupCounts: Record<string, number> = {};
  for (const u of users) { const g = (u as any).group || 'general'; groupCounts[g] = (groupCounts[g] ?? 0) + 1; }
  const roleCount = (r: string) => users.filter((u) => ((u as any).roles ?? []).includes(r)).length;
  const roles = [
    { key: 'customer', label: tt('admUsers', '🛒 ລູກຄ້າ'), color: '#0066CC', n: roleCount('customer') },
    { key: 'technician', label: tt('admUsers', '🔧 ຊ່າງ'), color: '#16a34a', n: roleCount('technician') },
    { key: 'shop', label: tt('admUsers', '🏬 ຮ້ານຄ້າ'), color: '#f59e0b', n: roleCount('shop') },
    { key: 'rider', label: tt('admUsers', '🛵 ໄຮເດີ້'), color: '#dc2626', n: users.filter((u) => u.uid in riderMap).length },
  ];
  const active = users.filter((u) => !u.status || u.status === 'approved').length;
  const suspended = users.filter((u) => u.status === 'suspended').length;
  const pending = users.filter((u) => u.status === 'pending').length;
  const srcCount = (m: string) => users.filter((u) => sourceOf(u).label === m).length;
  const misc = [
    { label: tt('admUsers', '🟢 ໃຊ້ງານ'), color: '#16a34a', n: active },
    { label: tt('admUsers', '🔴 ລະງັບ'), color: '#dc2626', n: suspended },
    { label: tt('admUsers', '⏳ ຮໍ'), color: '#f59e0b', n: pending },
    { label: tt('admUsers', '✍️ ສະໝັກ ເອງ'), color: '#0066CC', n: srcCount('ສະໝັກ ເອງ') },
    { label: tt('admUsers', '👑 admin ສ້າງ'), color: '#7c3aed', n: srcCount('admin ສ້າງ') },
    { label: '🌱 seed', color: '#9ca3af', n: srcCount('seed') },
    { label: '❔ legacy', color: '#9ca3af', n: srcCount('ບໍ່ ຮູ້ (legacy)') },
  ];
  const Bar = ({ label, color, n }: { label: string; color: string; n: number }) => (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.round((n / total) * 100)}%`, backgroundColor: color }]} /></View>
      <Text style={styles.barVal}>{n}</Text>
    </View>
  );
  return (
    <View style={styles.statsWrap}>
      <View style={styles.tiles}>
        {['admin', 'corporation', 'technician', 'general'].map((g) => {
          const m = GROUP_META[g];
          return (
            <View key={g} style={[styles.tile, { backgroundColor: m.bg }]}>
              <Text style={styles.tileN}>{groupCounts[g] ?? 0}</Text>
              <Text style={styles.tileL}>{m.icon} {m.label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.barsRow}>
        <View style={styles.barsCol}>
          <Text style={styles.statsH}>{tt('admUsers', 'ຕາມ ປະເພດ (roles)')}</Text>
          {roles.map((r) => <Bar key={r.key} label={r.label} color={r.color} n={r.n} />)}
        </View>
        <View style={styles.barsCol}>
          <Text style={styles.statsH}>{tt('admUsers', 'ສະຖານະ · ແຫຼ່ງ ທີ່ ມາ')}</Text>
          {misc.map((m, i) => <Bar key={i} label={m.label} color={m.color} n={m.n} />)}
        </View>
      </View>
    </View>
  );
}

/** Per-user detail + activity timeline. */
function UserDetailModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const tt = useTT();
  const [acts, setActs] = useState<UserActivity[]>([]);
  useEffect(() => watchUserActivity(user.uid, setActs), [user.uid]);
  const u: any = user;
  const s = sourceOf(u);
  const creator = u.createdByName || u.createdBy;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.mBackdrop}>
        <View style={styles.mSheet}>
          <View style={styles.mHead}>
            <Text style={styles.mTitle}>👁️ {u.name || u.firstName || '(ບໍ່ມີຊື່)'}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={styles.mX}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 14 }}>
            <View style={styles.kvRow}><Text style={styles.kvK}>{tt('admUsers', 'ເບີ / ອີເມວ')}</Text><Text style={styles.kvV}>{formatLaoPhone(u.phone) || u.email || '—'}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvK}>{tt('admUsers', 'ກຸ່ມ / ປະເພດ')}</Text><Text style={styles.kvV}>{u.group || '—'} · {((u.roles ?? []) as string[]).join(', ') || '—'}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvK}>{tt('admUsers', 'ແຫຼ່ງ ທີ່ ມາ')}</Text><Text style={[styles.kvV, { color: s.fg }]}>{s.icon} {s.label}{creator ? ` · ${tt('admUsers', 'ໂດຍ')} ${creator}` : ''}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvK}>{tt('admUsers', 'ສ້າງ ເມື່ອ')}</Text><Text style={styles.kvV}>{fmtDateTime(u.createdAt)}</Text></View>
            <View style={styles.kvRow}><Text style={styles.kvK}>{tt('admUsers', 'ເຂົ້າ ລະບົບ ຫຼ້າສຸດ')}</Text><Text style={styles.kvV}>{fmtDateTime(u.lastLoginAt)}{typeof u.loginCount === 'number' ? ` · ${tt('admUsers', 'ລວມ')} ${u.loginCount} ${tt('admUsers', 'ຄັ້ງ')}` : ''}</Text></View>

            <Text style={styles.mLogHead}>📜 Activity Log ({acts.length})</Text>
            {acts.length === 0 && <Text style={styles.mEmpty}>{tt('admUsers', 'ຍັງ ບໍ່ ມີ ບັນທຶກ (ບັນຊີ ເກົ່າ ຫຼື ຍັງ ບໍ່ ໄດ້ ເຄື່ອນ ໄຫວ ຫຼັງ ອັບເດດ)')}</Text>}
            {acts.map((a) => {
              const m = ACTIVITY_META[a.type] ?? ACTIVITY_META.other;
              return (
                <View key={a.id} style={styles.actRow}>
                  <Text style={styles.actTitle}>{m.icon} {m.label}{a.detail ? ` · ${a.detail}` : ''}</Text>
                  <Text style={styles.actMeta}>{fmtDateTime(a.ts)}{a.actorUid ? tt('admUsers', ' · ໂດຍ admin') : ''}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 10 },
  createBtn: { backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 12 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  subtabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderBottomWidth: 2, borderBottomColor: '#f0f0f0', marginBottom: 14 },
  subtab: { paddingHorizontal: 12, paddingVertical: 8 },
  subtabText: { fontSize: 12, color: '#6b7280' },
  subtabActive: { color: '#0066CC', fontWeight: '700' },
  subtabBar: { height: 2, backgroundColor: '#0066CC', marginTop: 6, marginHorizontal: -12, marginBottom: -10 },
  rowWrap: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  tierLabel: { fontSize: 12, color: '#6b7280' },
  tierChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  tierChipOn: { backgroundColor: '#1f2937', borderColor: '#1f2937' },
  tierChipText: { fontSize: 12, color: '#374151' },
  tierChipTextOn: { color: '#fff', fontWeight: '700' },
  roleAssign: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: 12, paddingTop: 0, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  roleAssignLabel: { fontSize: 12, color: '#6b7280', width: '100%', marginBottom: 2, marginTop: 8 },
  roleChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  roleChipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  roleChipText: { fontSize: 12, color: '#374151' },
  roleChipTextOn: { color: '#fff', fontWeight: '600' },
  av: { width: 38, height: 38, borderRadius: 19 },
  avEmpty: { backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '600', color: '#111' },
  usub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  badge: { fontSize: 12, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 2 },
  mini: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  miniText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  roHint: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  // stats overview
  statsWrap: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 12, marginTop: 10, marginBottom: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tile: { flexGrow: 1, minWidth: 100, borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10 },
  tileN: { fontSize: 15, fontWeight: '800', color: '#111' },
  tileL: { fontSize: 12, color: '#6b7280', fontWeight: '700' },
  barsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  barsCol: { flexGrow: 1, minWidth: 220 },
  statsH: { fontSize: 13, fontWeight: '800', color: '#334155', marginBottom: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  barLabel: { width: 110, fontSize: 12, color: '#334155', fontWeight: '700' },
  barTrack: { flex: 1, height: 9, backgroundColor: '#f1f5f9', borderRadius: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  barVal: { width: 30, textAlign: 'right', fontSize: 12, fontWeight: '800', color: '#111' },
  // detail modal
  mBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  mSheet: { backgroundColor: '#f8fafc', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '92%' },
  mHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  mTitle: { fontSize: 15, fontWeight: '800', color: '#111' },
  mX: { fontSize: 15, color: '#6b7280' },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#eef2ff', gap: 10 },
  kvK: { fontSize: 13, color: '#6b7280' },
  kvV: { fontSize: 13, color: '#111', fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  mLogHead: { fontSize: 14, fontWeight: '800', color: '#334155', marginTop: 16, marginBottom: 6 },
  mEmpty: { fontSize: 12, color: '#9ca3af', paddingVertical: 10, textAlign: 'center' },
  actRow: { paddingVertical: 6, borderLeftWidth: 2, borderLeftColor: '#dbeafe', paddingLeft: 10, marginLeft: 4 },
  actTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  actMeta: { fontSize: 12, color: '#6b7280', marginTop: 1 },
});
