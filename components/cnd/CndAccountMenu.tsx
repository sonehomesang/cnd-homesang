import { useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { cnd } from '@/lib/cnd/theme';
import { CUSTOMER_ROLE, initialOf, roleTone, shortRoleName, type CndIdentity } from '@/lib/cnd/identity';
import { ttStatic, useTT } from '@/lib/i18n';

type TT = (page: string, lo: string) => string;

/** Yes/No confirm that works on web (window.confirm) and native (Alert). */
export function confirmCnd(message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      return Promise.resolve(typeof window === 'undefined' || typeof window.confirm !== 'function' ? true : window.confirm(message));
    } catch { return Promise.resolve(true); }
  }
  return new Promise((resolve) => {
    Alert.alert('', message, [
      { text: ttStatic('cndAccount', 'ຍົກເລີກ'), style: 'cancel', onPress: () => resolve(false) },
      { text: ttStatic('cndAccount', 'ຕົກລົງ'), style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/**
 * Confirmed sign-out for CND. `switchAccount` lands on the matching login —
 * customer OTP for the store, staff sign-in for the admin — instead of the shop.
 */
export function useCndSignOut(variant: 'store' | 'admin') {
  const { signOut } = useAuth();
  const tt = useTT();
  return async (switchAccount: boolean) => {
    const ok = await confirmCnd(switchAccount
      ? tt('cndAccount', 'ອອກ ຈາກ ບັນຊີ ນີ້ ເພື່ອ ເຂົ້າ ດ້ວຍ ບັນຊີ ອື່ນ?')
      : tt('cndAccount', 'ຢືນຢັນ ອອກ ຈາກ ລະບົບ?'));
    if (!ok) return;
    try { await signOut(); } catch { /* leave anyway */ }
    const dest = !switchAccount ? '/cnd' : variant === 'admin' ? '/sign-in?next=/cnd/admin' : '/cnd/my';
    router.replace(dest as any);
  };
}

/** Full role label — customers get a translatable label, staff roles show their stored name. */
export function roleLabelOf(me: CndIdentity, tt: TT): string {
  return me.kind === 'customer' ? `👤 ${tt('cndAccount', CUSTOMER_ROLE)}` : me.roleName;
}

export function CndAvatar({ me, size = 28, ring }: { me: CndIdentity; size?: number; ring?: boolean }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  const ringStyle = ring ? { borderWidth: 3, borderColor: cnd.white } : null;
  if (me.image) return <Image source={{ uri: me.image }} style={[box, ringStyle, { backgroundColor: cnd.surface2 }]} />;
  return (
    <View style={[box, ringStyle, styles.avatar, { backgroundColor: me.kind === 'customer' ? cnd.steel2 : cnd.brand }]}>
      <Text style={[styles.avatarTx, { fontSize: Math.round(size * 0.44) }]}>{initialOf(me.name)}</Text>
    </View>
  );
}

/** Role pill — shared by the menu header and the account page. */
export function CndRolePill({ me, tt, short }: { me: CndIdentity; tt: TT; short?: boolean }) {
  const tone = roleTone(me.roleKey);
  const label = roleLabelOf(me, tt);
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillTx, { color: tone.fg }]} numberOfLines={1}>{short ? shortRoleName(label) : label}</Text>
    </View>
  );
}

/**
 * Signed-in identity + account menu for CND. Guests (store only) get a sign-in
 * button. `layout="card"` is the wide-admin sidebar block; `chip` is the header.
 */
export default function CndAccountMenu({ identity: me, variant, layout = 'chip', align = 'right' }: {
  identity: CndIdentity;
  variant: 'store' | 'admin';
  layout?: 'chip' | 'card';
  align?: 'left' | 'right';
}) {
  const tt = useTT();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const signOutFlow = useCndSignOut(variant);

  if (me.kind === 'guest') {
    if (me.loading || variant === 'admin') return null;          // don't flash a login button while auth restores
    return (
      <Pressable style={styles.login} onPress={() => router.push('/cnd/my' as any)} accessibilityLabel={tt('cndAccount', 'ເຂົ້າ ລະບົບ')}>
        <Text style={styles.loginTx} numberOfLines={1}>👤 {tt('cndAccount', 'ເຂົ້າ ລະບົບ')}</Text>
      </Pressable>
    );
  }

  const label = roleLabelOf(me, tt);
  const roleShort = me.loading && !me.roleName ? '…' : shortRoleName(label);
  // keep name + role visible on normal phones (the whole point); only the tiniest
  // screens drop to avatar-only, and mid phones get a tighter text column
  const compact = layout === 'chip' && width < 340;
  // the store header shares its row with the search bar; the admin header doesn't,
  // so the admin chip can afford the full role name even on a phone
  const textMax = variant === 'admin' || width >= 420 ? 110 : 78;
  const isStaff = me.kind === 'owner' || me.kind === 'staff';
  const canPos = me.kind === 'owner' || !!me.access?.canPos;

  const go = (url: string) => { setOpen(false); setTimeout(() => router.push(url as any), 60); };
  const leave = (switchAccount: boolean) => { setOpen(false); setTimeout(() => { void signOutFlow(switchAccount); }, 80); };

  type Item = { icon: string; label: string; onPress: () => void; tone?: 'danger' | 'muted'; chevron?: boolean };
  const items: Item[] = [
    { icon: '👤', label: tt('cndAccount', 'ໂປຣໄຟລ໌ ຂອງ ຂ້ອຍ'), onPress: () => go('/cnd/account'), chevron: true },
    { icon: '📦', label: tt('cndAccount', 'ອໍເດີ ຂອງ ຂ້ອຍ'), onPress: () => go('/cnd/my'), chevron: true },
  ];
  if (variant === 'store' && isStaff) items.push({ icon: '⚙️', label: tt('cndAccount', 'ຫຼັງບ້ານ CND'), onPress: () => go('/cnd/admin'), chevron: true });
  if (variant === 'admin') items.push({ icon: '🛒', label: tt('cndAccount', 'ໄປ ໜ້າ ຮ້ານ'), onPress: () => go('/cnd'), chevron: true });
  if (canPos) items.push({ icon: '🏬', label: tt('cndAccount', 'ເປີດ POS'), onPress: () => go('/cnd/pos'), chevron: true });
  items.push({ icon: '🔄', label: tt('cndAccount', 'ສະລັບ ບັນຊີ'), onPress: () => leave(true), tone: 'muted' });
  items.push({ icon: '🚪', label: tt('cndAccount', 'ອອກ ຈາກ ລະບົບ'), onPress: () => leave(false), tone: 'danger' });

  const trigger = layout === 'card' ? (
    <Pressable style={styles.card} onPress={() => setOpen(true)} accessibilityLabel={`${me.fullName} · ${label}`}>
      <CndAvatar me={me} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.cardName} numberOfLines={1}>{me.name}</Text>
        <Text style={styles.cardRole} numberOfLines={1}>{roleShort}</Text>
      </View>
      <Text style={styles.caret}>▾</Text>
    </Pressable>
  ) : (
    <Pressable style={[styles.chip, compact && styles.chipCompact]} onPress={() => setOpen(true)} accessibilityLabel={`${me.fullName} · ${label}`}>
      <CndAvatar me={me} size={28} />
      {!compact && (
        <View style={{ maxWidth: textMax }}>
          <Text style={styles.chipName} numberOfLines={1}>{me.name}</Text>
          <Text style={styles.chipRole} numberOfLines={1}>{roleShort}</Text>
        </View>
      )}
      {!compact && <Text style={styles.caret}>▾</Text>}
    </Pressable>
  );

  return (
    <>
      {trigger}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <Pressable style={[styles.panel, align === 'left' ? styles.panelLeft : styles.panelRight]} onPress={() => {}}>
            <View style={styles.head}>
              <CndAvatar me={me} size={52} />
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={styles.headName} numberOfLines={2}>{me.fullName}</Text>
                {!!me.phone && <Text style={styles.headPhone}>{me.phone}</Text>}
                <View style={{ flexDirection: 'row' }}><CndRolePill me={me} tt={tt} /></View>
              </View>
            </View>
            {items.map((it) => (
              <Pressable key={it.icon} style={styles.item} onPress={it.onPress}>
                <Text style={styles.itemIcon}>{it.icon}</Text>
                <Text style={[styles.itemTx, it.tone === 'danger' && styles.itemDanger, it.tone === 'muted' && styles.itemMuted]}>{it.label}</Text>
                {it.chevron && <Text style={styles.chev}>›</Text>}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarTx: { color: cnd.white, fontWeight: '900' },
  login: { backgroundColor: cnd.brand, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 12 },
  loginTx: { color: cnd.white, fontWeight: '800', fontSize: 12.5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 99, paddingVertical: 3, paddingLeft: 3, paddingRight: 9 },
  chipCompact: { paddingRight: 3 },
  chipName: { color: cnd.white, fontSize: 12, fontWeight: '800' },
  chipRole: { color: '#FFD68A', fontSize: 12, fontWeight: '700' },
  caret: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: cnd.steel2, borderRadius: 12, padding: 9 },
  cardName: { color: cnd.white, fontSize: 13, fontWeight: '800' },
  cardRole: { color: '#FFD68A', fontSize: 12, fontWeight: '700', marginTop: 1 },
  pill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3, maxWidth: '100%' },
  pillTx: { fontSize: 12, fontWeight: '800' },
  scrim: { flex: 1, backgroundColor: 'rgba(10,16,26,0.3)' },
  panel: { position: 'absolute', width: 292, maxWidth: '94%', backgroundColor: cnd.surface, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  panelRight: { top: 58, right: 8 },
  panelLeft: { top: 96, left: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, backgroundColor: '#FFF4EE' },
  headName: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  headPhone: { fontSize: 12, color: cnd.ink2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 15, borderTopWidth: 1, borderTopColor: '#F0F2F5' },
  itemIcon: { width: 24, textAlign: 'center', fontSize: 15 },
  itemTx: { flex: 1, fontSize: 14, color: cnd.ink, fontWeight: '600' },
  itemDanger: { color: cnd.error, fontWeight: '800' },
  itemMuted: { color: cnd.ink2, fontSize: 13 },
  chev: { color: cnd.ink3, fontSize: 15 },
});
