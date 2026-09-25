import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { isAnyAdmin } from '@/lib/adminTier';
import { watchMyRider } from '@/lib/riders';
import { useTT } from '@/lib/i18n';
import { colors, font, space } from '@/lib/theme';

const W = 236;

// The user's personal menu — opens as a slide-out drawer (like AppDrawer),
// NOT a full page. Rows are tight like the back-office menu. Tapping
// "ໂປຣຟາຍ ຂອງ ຂ້ອຍ" navigates to /profile (the locked, editable detail).
export default function ProfileMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const tt = useTT();
  const { profile, signOut } = useAuth();
  const x = useRef(new Animated.Value(W)).current; // off-screen to the right

  useEffect(() => {
    Animated.timing(x, { toValue: visible ? 0 : W, duration: 200, useNativeDriver: true }).start();
  }, [visible, x]);

  const go = (url: string) => { onClose(); setTimeout(() => router.push(url as any), 60); };

  const roles = profile?.roles ?? [];
  const isAdmin = isAnyAdmin(profile);
  const isTech = roles.includes('technician');
  const isShop = roles.includes('shop') || !!(profile as any)?.shopId;
  const name = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();
  const digits = (profile?.phone ?? '').replace(/\D/g, '').slice(-8);
  const phone8 = digits.length === 8 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;

  // rider is an opt-in capability (riders/{uid}) — only watch it while the menu
  // is open so an approved rider gets their dashboard link up top.
  const [isRider, setIsRider] = useState(false);
  useEffect(() => {
    const uid = (profile as any)?.uid;
    if (!visible || !uid) return;
    return watchMyRider(uid, (r) => setIsRider(!!r));
  }, [visible, profile]);

  const items: { icon: string; label: string; onPress: () => void }[] = [
    // ── role dashboards FIRST (each user lands on their own workspace) ──
    ...(isAdmin ? [{ icon: '👑', label: tt('profileMenu', 'ຈັດການລະບົບ ຫຼັງບ້ານ'), onPress: () => go('/admin') }] : []),
    ...(isAdmin || (roles as string[]).includes('marketing') ? [{ icon: '📣', label: tt('profileMenu', 'MK Plan · ການ ຕະຫຼາດ'), onPress: () => go('/mk') }] : []),
    ...(isShop ? [{ icon: '🏪', label: tt('profileMenu', 'ຈັດການ ຮ້ານ (ອໍເດີ · ລາຍຮັບ)'), onPress: () => go('/shop/manage') }] : []),
    ...(isRider ? [{ icon: '🛵', label: tt('profileMenu', 'ໄຣເດີ້ ຈັດສົ່ງ (ລາຍໄດ້)'), onPress: () => go('/rider') }] : []),
    ...(isTech ? [{ icon: '💵', label: tt('profileMenu', 'ລາຍໄດ້ ຂອງ ຂ້ອຍ'), onPress: () => go('/wallet') }] : []),
    // ── everyday ──
    { icon: '👤', label: tt('profileMenu', 'ໂປຣຟາຍ ຂອງ ຂ້ອຍ'), onPress: () => go('/profile') },
    { icon: '🧾', label: tt('profileMenu', 'ປະຫວັດ ການສັ່ງຊື້'), onPress: () => go('/orders') },
    { icon: '📣', label: tt('profileMenu', 'ວຽກ ທີ່ ຂ້ອຍ ປະກາດ'), onPress: () => go('/my-jobs') },
    { icon: '🏠', label: tt('profileMenu', 'ອາຄານ & ເຄື່ອງ ຂອງ ຂ້ອຍ'), onPress: () => go('/my-properties') },
    { icon: '🔁', label: tt('profileMenu', 'ສ້ອມ ບຳຣຸງ ປະຈຳ'), onPress: () => go('/maintenance') },
    { icon: '🏢', label: tt('profileMenu', 'ບໍລິສັທ / ຫຼາຍ ອາຄານ'), onPress: () => go('/company') },
    isTech || isRider
      ? { icon: '🗂️', label: tt('profileMenu', 'ການບໍລິການ ຂອງ ຂ້ອຍ'), onPress: () => go('/service-history?mode=provided') }
      : { icon: '🗂️', label: tt('profileMenu', 'ປະຫວັດ ການຈ້າງຊ່າງ'), onPress: () => go('/service-history') },
    ...(isTech ? [{ icon: '🔧', label: tt('profileMenu', 'ວຽກ ທີ່ ຂ້ອຍ ຮັບ'), onPress: () => go('/my-work') }] : []),
    { icon: '💬', label: tt('profileMenu', 'ຂໍ້ຄວາມ'), onPress: () => go('/messages') },
    { icon: '❤️', label: tt('profileMenu', 'ທີ່ມັກ'), onPress: () => go('/favorites') },
    ...(isTech
      ? [
          { icon: '🗓️', label: tt('profileMenu', 'ຕາຕະລາງວຽກ'), onPress: () => go('/work-schedule') },
          { icon: '🖼️', label: tt('profileMenu', 'ຜົນງານ'), onPress: () => go('/portfolio') },
        ]
      : []),
    { icon: '🧑‍🔧', label: isTech ? tt('profileMenu', 'ໂປຣໄຟລ ຊ່າງ / ຢືນຢັນ') : tt('profileMenu', 'ມາ ເປັນ ຊ່າງ'), onPress: () => go('/become-tech') },
    { icon: '🎁', label: tt('profileMenu', 'ແນະນຳເພື່ອນ'), onPress: () => go('/referral') },
    { icon: '⭐', label: tt('profileMenu', 'ສະມາຊິກ'), onPress: () => go('/membership') },
    { icon: '⚙️', label: tt('profileMenu', 'ຕັ້ງຄ່າ'), onPress: () => go('/settings') },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.panel, { transform: [{ translateX: x }] }]}>
        <View style={styles.head}>
          {profile?.image ? (
            <Image source={{ uri: profile.image }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}><Text style={styles.avatarInit}>👤</Text></View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>{name || tt('profileMenu', 'ຜູ້ໃຊ້')}</Text>
            {!!phone8 && <Text style={styles.phone}>📱 {phone8}</Text>}
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingVertical: 4 }}>
          {items.map((it) => (
            <Pressable key={it.label} style={styles.item} onPress={it.onPress}>
              <Text style={styles.itemIcon}>{it.icon}</Text>
              <Text style={styles.itemLabel} numberOfLines={1}>{it.label}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.item, styles.itemDanger]} onPress={() => { onClose(); setTimeout(() => signOut(), 60); }}>
            <Text style={styles.itemIcon}>🚪</Text>
            <Text style={[styles.itemLabel, styles.itemDangerTx]} numberOfLines={1}>{tt('profileMenu', 'ອອກ ຈາກ ລະບົບ')}</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  // top-anchored panel on the right; height wraps its rows (capped below screen)
  panel: { position: 'absolute', top: 0, right: 0, maxHeight: '92%', width: W, backgroundColor: colors.surface, borderBottomLeftRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: -2, height: 0 }, elevation: 8 },
  scroll: { flexShrink: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e5e7eb' },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  avatarInit: { fontSize: 20 },
  name: { fontSize: font.md, fontWeight: '700', color: colors.text },
  phone: { fontSize: 12, color: colors.text3, marginTop: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemIcon: { fontSize: 15, width: 22, textAlign: 'center' },
  itemLabel: { flex: 1, fontSize: font.md, color: colors.text },
  itemDanger: { borderBottomWidth: 0, marginTop: 2 },
  itemDangerTx: { color: '#dc2626', fontWeight: '700' },
});
