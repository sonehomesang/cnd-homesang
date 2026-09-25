import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useAppSettings } from '@/lib/appSettings';
import { watchMyNotifications } from '@/lib/notifications';
import { isAnyAdmin } from '@/lib/adminTier';
import Brand from '@/components/Brand';
import AppDrawer from '@/components/AppDrawer';
import ProfileMenu from '@/components/ProfileMenu';
import { useTT } from '@/lib/i18n';
import { colors, font, radius } from '@/lib/theme';

/** shared pill sizing so the login button + hero actions line up into one
 *  neat right-hand column (same height, and same width down to the widest label). */
const BTN_H = 34;
const BTN_MIN_W = 96;

export interface HeaderAction {
  label: string;
  onPress: () => void;
}

export interface AppHeaderProps {
  /** section accent (ຊ່າງ=ສົ້ມ, ວຽກ=ຟ້າ, ເຄື່ອງ=ຂຽວ). Omit for a brand-bar-only
   *  header (e.g. the home tab, which has no single section identity). */
  accent?: string;
  /** soft tint of the accent, for the icon chip */
  accentSoft?: string;
  /** hero emoji */
  icon?: string;
  /** accented half of the brand name after "ໂຮມ" (ຊ່າງ / ວຽກ / ເຄື່ອງ). When
   *  omitted the section hero band is not rendered — only the brand bar. */
  nameAccent?: string;
  /** one-line description under the name */
  subtitle?: string;
  /** up to 2 hero buttons — first is the filled primary, second an outline */
  actions?: HeaderAction[];
  /** when set, show a search pill that opens the global search screen */
  searchPlaceholder?: string;
  /** optional extra brand-bar icon (e.g. cart on ໂຮມເຄື່ອງ) */
  extra?: { icon: string; badge?: number; onPress: () => void };
}

/**
 * Standard top-of-screen shell shared by ໂຮມຊ່າງ / ໂຮມວຽກ / ໂຮມເຄື່ອງ.
 * Three bands: (a) the blue brand bar (☰ · wordmark · bell · avatar — identical
 * everywhere, mirrors the home tab), (b) a per-section hero coloured by `accent`,
 * (c) a search pill. Self-contained: it owns the drawer, profile menu and the
 * unread-notification count so a screen only needs to drop it in.
 */
export default function AppHeader({
  accent, accentSoft, icon, nameAccent, subtitle,
  actions = [], searchPlaceholder, extra,
}: AppHeaderProps) {
  const { fbUser, profile } = useAuth();
  const settings = useAppSettings();
  const tt = useTT();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!fbUser) { setUnread(0); return; }
    return watchMyNotifications(fbUser.uid, (n) => setUnread(n.filter((x) => !x.read).length));
  }, [fbUser]);

  const isAdmin = isAnyAdmin(profile);
  const primary = actions[0];
  const secondary = actions[1];

  return (
    <View>
      {/* (a) brand bar — identical on every screen */}
      <View style={styles.brandbar}>
        <View style={styles.bbLeft}>
          <Pressable style={styles.ham} onPress={() => setDrawer(true)} hitSlop={6}>
            <Text style={styles.hamIcon}>☰</Text>
          </Pressable>
          <Brand logoUrl={settings?.logoUrl || undefined} size={28} onDark />
        </View>
        <View style={styles.bbRight}>
          {extra && (
            <Pressable style={styles.icoBtn} onPress={extra.onPress}>
              <Text style={styles.icoTxt}>{extra.icon}</Text>
              {!!extra.badge && extra.badge > 0 && (
                <View style={styles.nbadge}><Text style={styles.nbadgeTxt}>{extra.badge > 99 ? '99+' : extra.badge}</Text></View>
              )}
            </Pressable>
          )}
          {fbUser ? (
            <>
              <Pressable style={styles.icoBtn} onPress={() => router.push('/notifications' as any)}>
                <Text style={styles.icoTxt}>🔔</Text>
                {unread > 0 && (
                  <View style={styles.nbadge}><Text style={styles.nbadgeTxt}>{unread > 9 ? '9+' : unread}</Text></View>
                )}
              </Pressable>
              <Pressable onPress={() => setMenu(true)}>
                {profile?.image ? (
                  <Image source={{ uri: profile.image }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarEmpty]}>
                    <Text style={styles.avatarInit}>{profile?.firstName?.[0] ?? '👤'}</Text>
                  </View>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.loginBtn} onPress={() => router.push('/sign-in' as any)}>
              <Text style={styles.loginTxt}>{tt('home', 'ເຂົ້າສູ່ລະບົບ')}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <AppDrawer visible={drawer} onClose={() => setDrawer(false)} isAdmin={!!isAdmin} logoUrl={settings?.logoUrl || undefined} />
      <ProfileMenu visible={menu} onClose={() => setMenu(false)} />

      {/* (b) section hero — per-screen accent, same structure. Omitted on a
             brand-bar-only header (no nameAccent, e.g. the home tab). */}
      {!!nameAccent && (
        <View style={styles.hero}>
          <View style={[styles.heroIc, { backgroundColor: accentSoft }]}>
            <Text style={styles.heroIcTxt}>{icon}</Text>
          </View>
          <View style={styles.heroTx}>
            <Text style={styles.heroName} numberOfLines={1}>ໂຮມ<Text style={{ color: accent }}>{nameAccent}</Text></Text>
            {!!subtitle && <Text style={styles.heroSub} numberOfLines={1}>{subtitle}</Text>}
          </View>
          {(primary || secondary) && (
            <View style={styles.heroActions}>
              {primary && (
                <Pressable style={[styles.ctaPrimary, { backgroundColor: accent }]} onPress={primary.onPress}>
                  <Text style={styles.ctaPrimaryTxt} numberOfLines={1}>{primary.label}</Text>
                </Pressable>
              )}
              {secondary && (
                <Pressable style={[styles.ctaGhost, { borderColor: accent }]} onPress={secondary.onPress}>
                  <Text style={[styles.ctaGhostTxt, { color: accent }]} numberOfLines={1}>{secondary.label}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {/* (c) search pill → global search */}
      {!!searchPlaceholder && (
        <Pressable style={styles.searchWrap} onPress={() => router.push('/search' as any)}>
          <View style={styles.search}>
            <Text style={styles.searchIc}>🔍</Text>
            <Text style={styles.searchPh} numberOfLines={1}>{searchPlaceholder}</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  brandbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10,
  },
  bbLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ham: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  hamIcon: { fontSize: 15, color: '#fff' },
  bbRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icoBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  icoTxt: { fontSize: 15 },
  nbadge: {
    position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 2, borderColor: colors.primary,
  },
  nbadgeTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', backgroundColor: colors.surface2 },
  avatarEmpty: { backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center' },
  avatarInit: { color: '#fff', fontSize: font.md, fontWeight: '800' },
  loginBtn: { backgroundColor: colors.secondary, borderRadius: radius.full, paddingHorizontal: 14, height: BTN_H, minWidth: BTN_MIN_W, alignItems: 'center', justifyContent: 'center' },
  loginTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  heroIc: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  heroIcTxt: { fontSize: 22 },
  heroTx: { flex: 1, minWidth: 0 },
  heroName: { fontSize: font.md, fontWeight: '800', letterSpacing: -0.2, color: colors.text },
  heroSub: { fontSize: 12, color: colors.text2, marginTop: 2 },
  // stacked hero buttons: same fixed height, and stretch so both share the
  // width of the wider label (no ragged right edge, filled == outline).
  heroActions: { alignItems: 'stretch', gap: 6 },
  ctaPrimary: { borderRadius: 11, paddingHorizontal: 14, height: BTN_H, minWidth: BTN_MIN_W, alignItems: 'center', justifyContent: 'center' },
  ctaPrimaryTxt: { color: '#fff', fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
  ctaGhost: { borderRadius: 11, paddingHorizontal: 14, height: BTN_H, minWidth: BTN_MIN_W, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ctaGhostTxt: { fontSize: 12.5, fontWeight: '700', textAlign: 'center' },

  searchWrap: { backgroundColor: colors.surface, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, paddingHorizontal: 13, paddingVertical: 11,
  },
  searchIc: { fontSize: 15, opacity: 0.6 },
  searchPh: { fontSize: font.sm, color: colors.text3, flex: 1 },
});
