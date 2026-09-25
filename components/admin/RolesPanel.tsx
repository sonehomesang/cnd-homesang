import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  ADMIN_ACTIONS,
  ADMIN_SECTIONS,
  APP_CAPS,
  createRole,
  deleteRole,
  DOMAIN_CAP,
  type OwnAction,
  OWN_ACTIONS,
  OWN_DOMAINS,
  reconcileRoles,
  type Role,
  seedRolesIfEmpty,
  watchRoles,
} from '@/lib/rbac';
import { saveRecord } from '@/lib/records';
import { useTT } from '@/lib/i18n';

const ACTION_LABEL: Record<string, string> = { view: '👁 ດູ', create: '➕ ສ້າງ', edit: '✎ ແກ້', delete: '🗑 ລົບ' };
const OWN_ACTION_LABEL: Record<OwnAction, string> = { create: '➕ ສ້າງ', edit: '✎ ແກ້', delete: '🗑 ລົບ', onoff: '🔘 ເປີດ/ປິດ' };

export default function RolesPanel() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [sel, setSel] = useState<Role | null>(null);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const tt = useTT();

  const reconcile = async () => {
    if (typeof confirm === 'function' && !confirm(tt('admRoles', 'ຈັດ ບົດບາດ ມາດຕະຖານ ໃຫ້ ຄົບ (customer/technician/shop/cs_admin/cp_admin/marketing/admin) ແລະ ລຶບ ບົດບາດ ອື່ນ ທີ່ ບໍ່ ຢູ່ ໃນ ນີ້? ຊື່ ລາວ ຈະ ຖືກ ຈັດ ໃຫ້ ຕົງ ກັບ ປະເພດຜູ້ໃຊ້. (ຕ້ອງ ໃຊ້ ເພື່ອ ສ້າງ ບົດບາດ Marketing — MK Plan)'))) return;
    setSyncing(true);
    setSyncMsg('');
    try {
      const r = await reconcileRoles();
      setSyncMsg(`✓ ${tt('admRoles','ເພີ່ມ')} ${r.added} · ${tt('admRoles','ອັບເດດ')} ${r.updated} · ${tt('admRoles','ລຶບ')} ${r.removed}`);
    } catch (e: any) {
      setSyncMsg('❌ ' + (e?.message ?? String(e)));
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    seedRolesIfEmpty().catch((e) => console.error('seed roles:', e));
    const unsub = watchRoles((r) => {
      setRoles(r);
      setSel((cur) => (cur ? r.find((x) => x.id === cur.id) ?? r[0] ?? null : r[0] ?? null));
    });
    return unsub;
  }, []);

  // Super Admin role is locked to all-permissions
  const locked = sel?.name === 'admin';

  const newRole = async () => {
    const caps: Record<string, boolean> = {};
    APP_CAPS.forEach((c) => (caps[c.key] = false));
    const perms: Record<string, any> = {};
    ADMIN_SECTIONS.forEach((s) => (perms[s.key] = { view: false, create: false, edit: false, delete: false }));
    await createRole({ name: `role_${Date.now().toString(36)}`, nameLao: 'ບົດບາດໃໝ່', icon: '🔖', type: 'admin', active: true, order: 99, capabilities: caps, adminPerms: perms });
  };

  const patch = (p: Partial<Role>) => {
    if (!sel) return;
    setSel({ ...sel, ...p });
    saveRecord('roles', sel.id, p as any);
  };
  const toggleCap = (key: string) => {
    if (!sel) return;
    patch({ capabilities: { ...sel.capabilities, [key]: !sel.capabilities?.[key] } });
  };
  const togglePerm = (section: string, action: string) => {
    if (!sel || locked) return;
    const cur = sel.adminPerms?.[section] ?? { view: false, create: false, edit: false, delete: false };
    const next = { ...cur, [action]: !cur[action as keyof typeof cur] };
    // ticking create/edit/delete implies view (can't act without seeing)
    if ((action === 'create' || action === 'edit' || action === 'delete') && next[action as keyof typeof next]) next.view = true;
    patch({ adminPerms: { ...sel.adminPerms, [section]: next } });
  };
  // toggle a whole row (section): if all on -> off, else all on
  const toggleRow = (section: string) => {
    if (!sel || locked) return;
    const cur = sel.adminPerms?.[section] ?? { view: false, create: false, edit: false, delete: false };
    const allOn = ADMIN_ACTIONS.every((a) => (cur as any)[a]);
    const next: any = {};
    ADMIN_ACTIONS.forEach((a) => (next[a] = !allOn));
    patch({ adminPerms: { ...sel.adminPerms, [section]: next } });
  };
  const isOn = (section: string, action: string) => locked || !!(sel?.adminPerms?.[section] as any)?.[action];

  // own-content CRUD matrix (user roles). Ticking derives the coarse app
  // capability from the row (any action on → capability on) so `can()` stays
  // enforced while ownCan() reads the fine-grained action.
  const capsFromOwn = (own: Record<string, Record<OwnAction, boolean>>) => {
    const c = { ...(sel?.capabilities ?? {}) };
    for (const [dom, cap] of Object.entries(DOMAIN_CAP)) c[cap] = OWN_ACTIONS.some((a) => own[dom]?.[a]);
    return c;
  };
  const patchOwn = (own: Record<string, Record<OwnAction, boolean>>) =>
    patch({ ownPerms: own, capabilities: capsFromOwn(own) });
  const emptyRow = (): Record<OwnAction, boolean> => ({ create: false, edit: false, delete: false, onoff: false });
  const toggleOwn = (domain: string, action: OwnAction) => {
    if (!sel || locked) return;
    const cur = sel.ownPerms?.[domain] ?? emptyRow();
    patchOwn({ ...sel.ownPerms, [domain]: { ...cur, [action]: !cur[action] } });
  };
  const toggleOwnRow = (domain: string) => {
    if (!sel || locked) return;
    const cur = sel.ownPerms?.[domain] ?? emptyRow();
    const allOn = OWN_ACTIONS.every((a) => cur[a]);
    const next = {} as Record<OwnAction, boolean>;
    OWN_ACTIONS.forEach((a) => (next[a] = !allOn));
    patchOwn({ ...sel.ownPerms, [domain]: next });
  };
  const isOwnOn = (domain: string, action: OwnAction) => locked || !!sel?.ownPerms?.[domain]?.[action];

  return (
    <View>
      <Text style={styles.title}>{tt('admRoles', '🛡️ ບົດບາດ & ສິດ')}</Text>
      <Text style={styles.sub}>{tt('admRoles', 'ຜູ້ໃຊ້ = ສິດ ໃຊ້ ແອັບ · ແອັດມິນ = ຕິກ ສິດ ຕໍ່ ສ່ວນ (ດູ/ສ້າງ/ແກ້/ລົບ ແຍກ ກັນ)')}</Text>

      <View style={styles.syncRow}>
        <Pressable style={[styles.syncBtn, syncing && { opacity: 0.6 }]} onPress={reconcile} disabled={syncing}>
          <Text style={styles.syncText}>{syncing ? '...' : tt('admRoles', '🔄 ຈັດ ໃຫ້ ຄົບ/ຕົງ ກັບ ປະເພດຜູ້ໃຊ້')}</Text>
        </Pressable>
        {syncMsg !== '' && <Text style={styles.syncMsg}>{syncMsg}</Text>}
      </View>

      {/* role selector */}
      <View style={styles.chips}>
        {roles.map((r) => (
          <Pressable key={r.id} style={[styles.chip, sel?.id === r.id && styles.chipOn]} onPress={() => setSel(r)}>
            <Text style={[styles.chipText, sel?.id === r.id && styles.chipTextOn]}>{r.icon} {r.nameLao}</Text>
          </Pressable>
        ))}
        <Pressable style={styles.newChip} onPress={newRole}><Text style={styles.newChipText}>{tt('admRoles', '+ ໃໝ່')}</Text></Pressable>
      </View>

      {!sel ? (
        <Text style={styles.empty}>{tt('admRoles', 'ບໍ່ມີ ບົດບາດ')}</Text>
      ) : (
        <>
          {/* meta */}
          <View style={styles.meta}>
            <TextInput value={sel.icon} onChangeText={(v) => patch({ icon: v })} style={[styles.input, { width: 50, textAlign: 'center' }]} />
            <TextInput value={sel.nameLao} onChangeText={(v) => patch({ nameLao: v })} style={[styles.input, { flex: 1 }]} />
            {(['user', 'admin'] as const).map((t) => (
              <Pressable key={t} style={[styles.typeBtn, sel.type === t && styles.typeBtnSel]} onPress={() => patch({ type: t })}>
                <Text style={[styles.typeText, sel.type === t && styles.typeTextSel]}>{t}</Text>
              </Pressable>
            ))}
          </View>

          {locked && <Text style={styles.lockNote}>{tt('admRoles', '👑 Super Admin — ມີ ທຸກສິດ (ລັອກ, ແກ້ບໍ່ໄດ້)')}</Text>}

          {/* admin roles → app-usage chips + admin console CRUD matrix;
              user roles → tickable own-content responsibility list */}
          {sel.type === 'admin' ? (
            <>
              <Text style={styles.secLabel}>{tt('admRoles', 'ສິດໃຊ້ງານ ໃນແອັບ')}</Text>
              <View style={styles.chips}>
                {APP_CAPS.map((c) => {
                  const on = locked || !!sel.capabilities?.[c.key];
                  return (
                    <Pressable key={c.key} style={[styles.capChip, on && styles.capChipOn]} onPress={() => !locked && toggleCap(c.key)}>
                      <Text style={[styles.capChipText, on && styles.capChipTextOn]}>{on ? '✓ ' : ''}{c.lao}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.secLabel}>{tt('admRoles', 'ສິດ admin console — ຕິກ ຕໍ່ ສ່ວນ ຕໍ່ ການ ກະທຳ')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.thead}>
                    <Text style={[styles.thSec, { width: 150 }]}>{tt('admRoles', 'ສ່ວນ')}</Text>
                    {ADMIN_ACTIONS.map((a) => (
                      <Text key={a} style={styles.th}>{tt('roleAction', ACTION_LABEL[a])}</Text>
                    ))}
                  </View>
                  {ADMIN_SECTIONS.map((s) => (
                    <View key={s.key} style={styles.trow}>
                      <Pressable style={{ width: 150 }} onPress={() => toggleRow(s.key)} disabled={locked}>
                        <Text style={styles.tdSec} numberOfLines={1}>{s.lao}</Text>
                      </Pressable>
                      {ADMIN_ACTIONS.map((a) => {
                        const on = isOn(s.key, a);
                        return (
                          <Pressable key={a} style={styles.tdc} onPress={() => togglePerm(s.key, a)} disabled={locked}>
                            <View style={[styles.sq, on && styles.sqOn, locked && styles.sqLocked]}>
                              {on && <Text style={styles.sqCheck}>✓</Text>}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
              <Text style={styles.hint}>{tt('admRoles', '👁ດູ=ເຫັນເມນູ · ➕ສ້າງ · ✎ແກ້ · 🗑ລົບ · ກົດ ຊື່ ສ່ວນ = ເປີດ/ປິດ ໝົດ ແຖວ (ຕິກ ສ້າງ/ແກ້/ລົບ ຈະ ເປີດ ດູ ໃຫ້ ເອງ)')}</Text>
            </>
          ) : (
            <>
              <Text style={styles.secLabel}>{tt('admRoles', 'ພາລະບົດບາດ — ຕິກ ຕໍ່ ໜ້າ ທີ່ ຕໍ່ ການ ກະທຳ (CRUD ຂໍ້ມູນ ຕົນເອງ)')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View>
                  <View style={styles.thead}>
                    <Text style={[styles.thSec, { width: 150 }]}>{tt('admRoles', 'ໜ້າ ທີ່')}</Text>
                    {OWN_ACTIONS.map((a) => (
                      <Text key={a} style={styles.th}>{tt('roleAction', OWN_ACTION_LABEL[a])}</Text>
                    ))}
                  </View>
                  {OWN_DOMAINS.map((d) => (
                    <View key={d.key} style={styles.trow}>
                      <Pressable style={{ width: 150 }} onPress={() => toggleOwnRow(d.key)} disabled={locked}>
                        <Text style={styles.tdSec} numberOfLines={1}>{d.lao}</Text>
                      </Pressable>
                      {OWN_ACTIONS.map((a) => {
                        const on = isOwnOn(d.key, a);
                        return (
                          <Pressable key={a} style={styles.tdc} onPress={() => toggleOwn(d.key, a)} disabled={locked}>
                            <View style={[styles.sq, on && styles.sqOn, locked && styles.sqLocked]}>
                              {on && <Text style={styles.sqCheck}>✓</Text>}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
              <Text style={styles.hint}>{tt('admRoles', '➕ສ້າງ · ✎ແກ້ · 🗑ລົບ · 🔘ເປີດ/ປິດ(ຍົກເລີກ) · ກົດ ຊື່ ໜ້າ ທີ່ = ເປີດ/ປິດ ໝົດ ແຖວ · ຕິກ ຂໍ້ ໃດ = ເປີດ ຄວາມສາມາດ ນັ້ນ ໃຫ້ ເອງ · ບໍ່ ເຂົ້າ admin console')}</Text>
            </>
          )}

          {!locked && (
            <Pressable style={styles.delBtn} onPress={async () => { if (typeof confirm === 'function' && !confirm(tt('admRoles', 'ລົບ ບົດບາດ ນີ້?'))) return; await deleteRole(sel.id); setSel(null); }}>
              <Text style={styles.delText}>{tt('admRoles', '🗑️ ລົບ ບົດບາດ')}</Text>
            </Pressable>
          )}
          <Text style={styles.note}>{tt('admRoles', '✓ ບັນທຶກ ອັດຕະໂນມັດ · ກົດ ຊື່ ສ່ວນ = ເປີດ/ປິດ ໝົດ ແຖວ')}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  syncBtn: { borderWidth: 1, borderColor: '#0066CC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  syncText: { color: '#0066CC', fontSize: 12, fontWeight: '700' },
  syncMsg: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  chipText: { fontSize: 12, color: '#374151' },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  newChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#16a34a' },
  newChipText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  empty: { color: '#9ca3af', padding: 24, textAlign: 'center' },
  meta: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  typeBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  typeBtnSel: { backgroundColor: '#1f2937', borderColor: '#1f2937' },
  typeText: { fontSize: 12, color: '#374151' },
  typeTextSel: { color: '#fff', fontWeight: '600' },
  lockNote: { fontSize: 12, color: '#92400e', backgroundColor: '#fef3c7', borderRadius: 8, padding: 8, marginBottom: 8 },
  secLabel: { fontSize: 12, fontWeight: '700', color: '#0066CC', marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 6, fontStyle: 'italic' },
  capChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  capChipOn: { backgroundColor: '#EAF2FB', borderColor: '#0066CC' },
  capChipText: { fontSize: 12, color: '#374151' },
  capChipTextOn: { color: '#0066CC', fontWeight: '600' },
  thead: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 8 },
  thSec: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  th: { width: 58, textAlign: 'center', fontSize: 12, color: '#6b7280', fontWeight: '600' },
  trow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 7 },
  tdSec: { fontSize: 13, color: '#111' },
  tdc: { width: 58, alignItems: 'center' },
  sq: { width: 26, height: 26, borderRadius: 6, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  sqOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  sqCheck: { color: '#fff', fontSize: 14, fontWeight: '800' },
  sqLocked: { opacity: 0.6 },
  delBtn: { borderWidth: 1, borderColor: '#dc2626', borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 18 },
  delText: { color: '#dc2626', fontWeight: '600', fontSize: 12 },
  note: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8, marginBottom: 20 },
});
