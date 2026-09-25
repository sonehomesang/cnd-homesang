import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { cnd } from '@/lib/cnd/theme';
import { useCndIdentity } from '@/lib/cnd/identity';
import { CND_SECTIONS } from '@/lib/cnd/staff';
import { watchMyCndOrders, type CndOrder } from '@/lib/cnd/orders';
import { updateUserProfile } from '@/lib/users';
import PhotoPicker from '@/components/PhotoPicker';
import { CndAvatar, CndRolePill, useCndSignOut } from '@/components/cnd/CndAccountMenu';
import { useTT } from '@/lib/i18n';

const ACTIVE = new Set(['new', 'confirmed', 'packing', 'delivering']);
const fmtDate = (ms?: number) => {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// CND account page — who you are, what role you hold, what that role can reach,
// plus name/photo edit and a clear sign-out. Phone is the login and is read-only.
export default function CndAccount() {
  const tt = useTT();
  const { profile } = useAuth();
  const me = useCndIdentity({ verify: true });
  const signOutFlow = useCndSignOut('store');
  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [orders, setOrders] = useState<CndOrder[] | null>(null);

  useEffect(() => { if (me.uid && me.kind === 'customer') return watchMyCndOrders(me.uid, setOrders); }, [me.uid, me.kind]);

  const stats = useMemo(() => {
    const list = orders ?? [];
    return { total: list.length, active: list.filter((o) => ACTIVE.has(o.status)).length, install: list.filter((o) => !!o.install).length };
  }, [orders]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/cnd' as any));

  const startEdit = () => {
    setFirst(profile?.firstName ?? '');
    setLast(profile?.lastName ?? '');
    setErr('');
    setEditing(true);
  };
  const saveName = async () => {
    if (!me.uid || !first.trim()) return;
    setBusy(true); setErr('');
    try {
      await updateUserProfile(me.uid, { firstName: first.trim(), lastName: last.trim() });
      setEditing(false);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setBusy(false); }
  };

  const top = (
    <View style={styles.top}>
      <Pressable onPress={back} hitSlop={10}><Text style={styles.topBack}>‹</Text></Pressable>
      <Text style={styles.topT}>{tt('cndAccount', 'ໂປຣໄຟລ໌ ຂອງ ຂ້ອຍ')}</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  if (me.kind === 'guest' && !me.loading) {
    return (
      <View style={styles.root}>
        {top}
        <View style={styles.center}>
          <View style={styles.gateCard}>
            <Text style={{ fontSize: 44 }}>👤</Text>
            <Text style={styles.gateT}>{tt('cndAccount', 'ຍັງ ບໍ່ ໄດ້ ເຂົ້າ ລະບົບ')}</Text>
            <Text style={styles.gateS}>{tt('cndAccount', 'ເຂົ້າ ລະບົບ ເພື່ອ ເບິ່ງ ໂປຣໄຟລ໌, ອໍເດີ ແລະ ບົດບາດ ຂອງ ທ່ານ')}</Text>
            <Pressable style={styles.primary} onPress={() => router.replace('/cnd/my' as any)}>
              <Text style={styles.primaryTx}>📱 {tt('cndAccount', 'ເຂົ້າ ລະບົບ ດ້ວຍ ເບີ ໂທ')}</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={() => router.push('/sign-in?next=/cnd/account' as any)}>
              <Text style={styles.linkTx}>🔑 {tt('cndAccount', 'ພະນັກງານ ເຂົ້າ ລະບົບ')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (me.loading) {
    return <View style={styles.root}>{top}<View style={styles.center}><ActivityIndicator color={cnd.brand} /></View></View>;
  }

  const isStaff = me.kind === 'owner' || me.kind === 'staff';
  const accountType = me.kind === 'owner'
    ? tt('cndAccount', 'ເຈົ້າ ຂອງ ຮ້ານ')
    : me.kind === 'staff' ? tt('cndAccount', 'ພະນັກງານ CND') : tt('cndAccount', 'ລູກຄ້າ');
  const sections = CND_SECTIONS.filter((s) => me.access?.sections.has(s.k));
  const caps = [
    { label: tt('cndAccount', '🏬 ໃຊ້ POS'), ok: me.kind === 'owner' || !!me.access?.canPos },
    { label: tt('cndAccount', '💸 ຄືນ ເງິນ'), ok: me.kind === 'owner' || !!me.access?.canRefund },
    { label: tt('cndAccount', '👥 ຈັດການ ພະນັກງານ'), ok: me.kind === 'owner' || !!me.access?.canManageStaff },
  ];

  return (
    <View style={styles.root}>
      {top}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          {editing && me.uid ? (
            <PhotoPicker
              mode="avatarCompact"
              size={76}
              aspect={[1, 1]}
              photos={me.image ? [me.image] : []}
              pathPrefix={`users/${me.uid}`}
              onChange={async (urls) => { await updateUserProfile(me.uid!, { image: urls[0] ?? '' }); }}
            />
          ) : (
            <CndAvatar me={me} size={76} ring />
          )}
          <Text style={styles.name}>{me.fullName}</Text>
          <CndRolePill me={me} tt={tt} />
        </View>

        {editing && (
          <View style={styles.card}>
            <Text style={styles.secH}>✏️ {tt('cndAccount', 'ແກ້ ຊື່')}</Text>
            <TextInput style={styles.input} value={first} onChangeText={setFirst} placeholder={tt('cndAccount', 'ຊື່')} placeholderTextColor={cnd.ink3} />
            <TextInput style={styles.input} value={last} onChangeText={setLast} placeholder={tt('cndAccount', 'ນາມສະກຸນ (ບໍ່ ບັງຄັບ)')} placeholderTextColor={cnd.ink3} />
            <Text style={styles.hint}>{tt('cndAccount', '📷 ກົດ ຮູບ ດ້ານ ເທິງ ເພື່ອ ປ່ຽນ ຮູບ ໂປຣໄຟລ໌ · ເບີ ໂທ ປ່ຽນ ບໍ່ ໄດ້')}</Text>
            {!!err && <Text style={styles.err}>{err}</Text>}
            <View style={styles.rowBtns}>
              <Pressable style={[styles.btn, styles.btnGhost, { flex: 1 }]} onPress={() => setEditing(false)}><Text style={styles.btnGhostTx}>{tt('cndAccount', 'ຍົກເລີກ')}</Text></Pressable>
              <Pressable style={[styles.btn, styles.btnBrand, { flex: 1 }, (busy || !first.trim()) && { opacity: 0.5 }]} disabled={busy || !first.trim()} onPress={saveName}>
                <Text style={styles.btnBrandTx}>{busy ? '…' : tt('cndAccount', '💾 ບັນທຶກ')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {me.kind === 'customer' && (
          <View style={styles.stats}>
            <View style={styles.stat}><Text style={styles.statN}>{orders ? stats.total : '…'}</Text><Text style={styles.statL}>{tt('cndAccount', 'ອໍເດີ')}</Text></View>
            <View style={styles.stat}><Text style={styles.statN}>{orders ? stats.active : '…'}</Text><Text style={styles.statL}>{tt('cndAccount', 'ກຳລັງ ດຳເນີນ')}</Text></View>
            <View style={styles.stat}><Text style={styles.statN}>{orders ? stats.install : '…'}</Text><Text style={styles.statL}>{tt('cndAccount', 'ມີ ຕິດຕັ້ງ')}</Text></View>
          </View>
        )}

        <View style={styles.card}>
          <Row k={`📱 ${tt('cndAccount', 'ເບີ ໂທ')}`} v={me.phone || '—'} />
          <Row k={`🏷️ ${tt('cndAccount', 'ປະເພດ ບັນຊີ')}`} v={accountType} />
          {me.kind === 'customer' && <Row k={`📍 ${tt('cndAccount', 'ທີ່ ຢູ່ ທີ່ ບັນທຶກ')}`} v={`${profile?.savedAddresses?.length ?? 0} ${tt('cndAccount', 'ບ່ອນ')}`} />}
          <Row k={`📅 ${tt('cndAccount', 'ເປັນ ສະມາຊິກ ແຕ່')}`} v={fmtDate(me.createdAt)} last />
        </View>

        {isStaff && (
          <>
            <Text style={styles.secOut}>🔐 {tt('cndAccount', 'ສິດ ການ ເຂົ້າ ເຖິງ')}</Text>
            <View style={styles.card}>
              {me.kind === 'owner' && <Text style={styles.allAccess}>✅ {tt('cndAccount', 'ເຂົ້າ ໄດ້ ທຸກ ບ່ອນ')}</Text>}
              <View style={styles.chips}>
                {sections.map((s) => <Text key={s.k} style={styles.chip}>{tt('cndAccount', s.label)}</Text>)}
                {sections.length === 0 && <Text style={styles.hint}>{tt('cndAccount', 'ຍັງ ບໍ່ ມີ ສ່ວນ ທີ່ ເຂົ້າ ໄດ້ — ຕິດ ຕໍ່ ເຈົ້າ ຂອງ ຮ້ານ')}</Text>}
              </View>
              <View style={styles.caps}>
                {caps.map((c) => (
                  <View key={c.label} style={styles.capRow}>
                    <Text style={styles.capL}>{c.label}</Text>
                    <Text style={c.ok ? styles.ok : styles.no}>{c.ok ? '✓' : '✗'}</Text>
                  </View>
                ))}
              </View>
              {me.kind === 'staff' && <Text style={styles.hint}>{tt('cndAccount', 'ສິດ ປ່ຽນ ໄດ້ ແຕ່ ເຈົ້າ ຂອງ ຮ້ານ ໃນ ພະນັກງານ & ສິດ')}</Text>}
            </View>
          </>
        )}

        {me.kind === 'customer' && (
          <Pressable style={[styles.btn, styles.btnOutline]} onPress={() => router.push('/cnd/my' as any)}>
            <Text style={styles.btnOutlineTx}>📦 {tt('cndAccount', 'ອໍເດີ ຂອງ ຂ້ອຍ')} ›</Text>
          </Pressable>
        )}
        {isStaff && (
          <Pressable style={[styles.btn, styles.btnOutline]} onPress={() => router.push('/cnd/admin' as any)}>
            <Text style={styles.btnOutlineTx}>⚙️ {tt('cndAccount', 'ຫຼັງບ້ານ CND')} ›</Text>
          </Pressable>
        )}
        {!editing && (
          <Pressable style={[styles.btn, styles.btnOutline]} onPress={startEdit}>
            <Text style={styles.btnOutlineTx}>✏️ {tt('cndAccount', 'ແກ້ ຊື່ / ຮູບ')}</Text>
          </Pressable>
        )}
        <Pressable style={[styles.btn, styles.btnOutline]} onPress={() => { void signOutFlow(true); }}>
          <Text style={[styles.btnOutlineTx, { color: cnd.ink2 }]}>🔄 {tt('cndAccount', 'ສະລັບ ບັນຊີ')}</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnDanger]} onPress={() => { void signOutFlow(false); }}>
          <Text style={styles.btnDangerTx}>🚪 {tt('cndAccount', 'ອອກ ຈາກ ລະບົບ')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.rowK}>{k}</Text>
      <Text style={styles.rowV} numberOfLines={1}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cnd.steel, paddingHorizontal: 12, paddingVertical: 12 },
  topBack: { color: cnd.white, fontSize: 26, fontWeight: '700', width: 24 },
  topT: { color: cnd.white, fontSize: 15, fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  body: { padding: 10, paddingBottom: 30, gap: 8, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { alignItems: 'center', gap: 6, paddingVertical: 14, backgroundColor: cnd.surface, borderRadius: 14 },
  name: { fontSize: 15, fontWeight: '900', color: cnd.ink, marginTop: 4, textAlign: 'center' },
  card: { backgroundColor: cnd.surface, borderRadius: 14, padding: 14, gap: 8 },
  secH: { fontSize: 14, fontWeight: '900', color: cnd.ink },
  secOut: { fontSize: 12.5, fontWeight: '900', color: cnd.ink2, marginTop: 6, marginLeft: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F2F5' },
  rowK: { fontSize: 13, color: cnd.ink2 },
  rowV: { fontSize: 13.5, fontWeight: '800', color: cnd.ink, flexShrink: 1, textAlign: 'right' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: cnd.surface, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  statN: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  statL: { fontSize: 12, color: cnd.ink2, marginTop: 2 },
  allAccess: { fontSize: 13, fontWeight: '800', color: cnd.green },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { fontSize: 12, backgroundColor: cnd.surface2, color: cnd.ink, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  caps: { marginTop: 4, gap: 6 },
  capRow: { flexDirection: 'row', justifyContent: 'space-between' },
  capL: { fontSize: 13, color: cnd.ink },
  ok: { fontSize: 14, fontWeight: '900', color: cnd.green },
  no: { fontSize: 14, fontWeight: '900', color: cnd.ink3 },
  hint: { fontSize: 12, color: cnd.ink3, lineHeight: 17 },
  err: { fontSize: 12, color: cnd.error, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: cnd.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: cnd.ink, backgroundColor: cnd.white },
  rowBtns: { flexDirection: 'row', gap: 8 },
  btn: { borderRadius: 11, paddingVertical: 12, alignItems: 'center' },
  btnBrand: { backgroundColor: cnd.brand },
  btnBrandTx: { color: cnd.white, fontWeight: '900', fontSize: 14 },
  btnGhost: { backgroundColor: cnd.surface2 },
  btnGhostTx: { color: cnd.ink, fontWeight: '800', fontSize: 14 },
  btnOutline: { backgroundColor: cnd.surface, borderWidth: 1.5, borderColor: cnd.line },
  btnOutlineTx: { color: cnd.ink, fontWeight: '800', fontSize: 14 },
  btnDanger: { backgroundColor: cnd.surface, borderWidth: 1.5, borderColor: '#F6C9C9', marginTop: 4 },
  btnDangerTx: { color: cnd.error, fontWeight: '900', fontSize: 14 },
  gateCard: { backgroundColor: cnd.surface, borderRadius: 16, padding: 22, alignItems: 'center', gap: 8, width: '100%', maxWidth: 380 },
  gateT: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  gateS: { fontSize: 13, color: cnd.ink2, textAlign: 'center', lineHeight: 19 },
  primary: { backgroundColor: cnd.brand, borderRadius: 11, paddingVertical: 12, alignSelf: 'stretch', alignItems: 'center', marginTop: 8 },
  primaryTx: { color: cnd.white, fontWeight: '900', fontSize: 14 },
  linkBtn: { paddingVertical: 8 },
  linkTx: { color: cnd.ink2, fontWeight: '700', fontSize: 13 },
});
