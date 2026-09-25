import { useEffect, useRef } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/lib/auth-context';
import { auth } from '@/lib/firebase';
import { installGlobalErrorLogging } from '@/lib/errorLog';
import MaintenanceGate from '@/components/MaintenanceGate';
import Brand from '@/components/Brand';
import CartToast from '@/components/CartToast';
import { startServiceCategories } from '@/lib/categories';
import { CartProvider, useCart } from '@/lib/cart-context';
import { PermissionsProvider } from '@/lib/permissions-context';
import { I18nProvider, useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';

// header link on the sign-in screen → go to the guest-visible home (translatable)
function GuestHeaderBack() {
  const tt = useTT();
  return (
    <Pressable onPress={() => router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={{ color: colors.white, fontSize: 20, fontWeight: '700' }}>←</Text>
      <Text style={{ color: colors.white, fontSize: 15, fontWeight: '700' }}>{tt('signin', 'ໄປ ໜ້າ ເວັບ ໂດຍ ບໍ່ ລ໋ອກອິນ')}</Text>
    </Pressable>
  );
}

/** Home + cart quick actions for branded standalone-page headers. */
function SiteHeaderRight() {
  const { count } = useCart();
  const btn = { width: 34, height: 34, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(255,255,255,0.16)' };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 }}>
      <Pressable onPress={() => router.push('/' as any)} style={btn} hitSlop={6}>
        <Text style={{ fontSize: 16 }}>🏠</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/cart' as any)} style={btn} hitSlop={6}>
        <Text style={{ fontSize: 16 }}>🛒</Text>
        {count > 0 && (
          <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: colors.primary }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{count > 9 ? '9+' : count}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

/** Back-to-home button shown on the right of every stack-page header. */
function HomeHeaderRight() {
  return (
    <Pressable
      onPress={() => router.push('/' as any)}
      hitSlop={6}
      accessibilityLabel="ໜ້າຫຼັກ"
      style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)', marginRight: 12 }}>
      <Ionicons name="home" size={18} color={colors.white} />
    </Pressable>
  );
}

export const unstable_settings = {
  anchor: '(tabs)',
};

const CND_TITLE = 'CND-HomeSang';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const baseTitle = useRef<string>('');

  // Preload the vector-icon fonts before first paint. iOS Safari otherwise
  // paints icon glyphs as empty "tofu" boxes and never repaints them after the
  // font finishes loading (desktop Chrome repaints, which hid this on web).
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    ...MaterialIcons.font,
  });

  useEffect(() => {
    installGlobalErrorLogging(() => auth.currentUser?.uid ?? undefined);
    startServiceCategories();
    // capture a shared link's ?ref= referral code for later attribution (Slice 6)
    if (typeof window !== 'undefined') {
      try {
        const ref = new URLSearchParams(window.location.search).get('ref');
        if (ref) window.localStorage?.setItem('hs_ref', ref);
      } catch { /* ignore */ }
      // The MK Plan marketing platform lives on the mkplan.* subdomain — land the
      // subdomain root straight on /mk. Never fires on homesang.pro (main app).
      try {
        const host = window.location.hostname;
        const path = window.location.pathname;
        if (/^mkplan\./i.test(host) && path === '/') router.replace('/mk' as any);
        // CND partner hardware store lives on the cnd.* subdomain. The root (/) now
        // RENDERS the storefront in place (see (tabs)/index) so the URL stays clean —
        // no /cnd redirect. Still scope /admin to the CND admin so it never opens the
        // HomeSang back-office.
        else if (/^cnd\./i.test(host)) {
          if (path === '/admin' || path.startsWith('/admin/')) router.replace('/cnd/admin' as any);
        }
      } catch { /* ignore */ }
    }
  }, []);

  // index.html carries ONE baked-in SEO title (HomeSang), but the CND partner
  // store shares the same bundle — so its tab would read "ໂຮມຊ່າງ …". Retitle
  // the CND surface, reached either by the cnd.* subdomain or a /cnd path, and
  // restore the HomeSang title on the way back out.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    try {
      if (!baseTitle.current) baseTitle.current = document.title;
      const onCnd = /^cnd\./i.test(window.location.hostname)
        || pathname === '/cnd' || pathname.startsWith('/cnd/');
      const next = onCnd ? CND_TITLE : baseTitle.current;
      if (next && document.title !== next) document.title = next;
    } catch { /* ignore */ }
  }, [pathname]);

  // hold first paint until icon fonts load (fall through on error so a font
  // failure never blanks the app permanently)
  if (!fontsLoaded && !fontError) return null;

  return (
    <AuthProvider>
    <I18nProvider>
    <PermissionsProvider>
    <CartProvider>
      <MaintenanceGate>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.white,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
            // every stack page gets a back-to-home button (screens may override)
            headerRight: () => <HomeHeaderRight />,
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="sign-in"
            options={{
              headerTitle: () => null,
              headerLeft: () => <GuestHeaderBack />,
            }}
          />
          <Stack.Screen
            name="sign-up"
            options={{
              headerTitle: () => null,
              headerLeft: () => <GuestHeaderBack />,
            }}
          />
          <Stack.Screen name="set-password" options={{ title: 'ຕັ້ງລະຫັດຜ່ານ' }} />
          <Stack.Screen name="forgot-password" options={{ title: 'ລືມລະຫັດຜ່ານ' }} />
          <Stack.Screen name="profile-setup" options={{ title: 'ສ້າງ Profile' }} />
          <Stack.Screen name="profile" options={{ title: 'ຂໍ້ມູນສ່ວນຕົວ' }} />
          <Stack.Screen name="become-tech" options={{ title: 'ມາເປັນຊ່າງ' }} />
          <Stack.Screen name="tech-quiz" options={{ title: 'ຂໍ້ທົດສອບຊ່າງ' }} />
          <Stack.Screen name="post-job" options={{ title: 'ໂພສງານໃໝ່' }} />
          <Stack.Screen name="jobs/[id]" options={{ title: 'ລາຍລະອຽດງານ' }} />
          <Stack.Screen name="site/[id]" options={{ title: 'ຂໍ້ມູນ ສະຖານທີ່' }} />
          <Stack.Screen name="invoice/[id]" options={{ title: 'ໃບເກັບເງິນ' }} />
          <Stack.Screen name="dispute/[id]" options={{ title: 'ແຈ້ງບັນຫາ' }} />
          <Stack.Screen name="book/[id]" options={{ title: 'ຈ້າງໂດຍກົງ' }} />
          <Stack.Screen name="community/[id]" options={{ title: 'ໂພສ' }} />
          <Stack.Screen name="users/[id]" options={{ title: 'ໂປຣໄຟລ໌' }} />
          <Stack.Screen
            name="products/[id]"
            options={{ headerTitleAlign: 'center', headerTitle: () => <Brand size={24} onDark />, headerRight: () => <SiteHeaderRight /> }}
          />
          <Stack.Screen name="shop/manage" options={{ title: 'ຈັດການຮ້ານ' }} />
          <Stack.Screen name="shops" options={{ title: 'ຮ້ານຄ້າ' }} />
          <Stack.Screen name="shop/[id]" options={{ title: 'ຮ້ານ' }} />
          <Stack.Screen name="cart" options={{ title: 'ກະຕ່າ' }} />
          <Stack.Screen name="checkout" options={{ title: 'ຊຳລະເງິນ' }} />
          <Stack.Screen name="orders" options={{ title: 'ການສັ່ງຊື້ ຂອງຂ້ອຍ' }} />
          <Stack.Screen name="orders/[id]" options={{ title: 'ລາຍລະອຽດການສັ່ງຊື້' }} />
          <Stack.Screen name="my-jobs" options={{ title: 'ວຽກ ທີ່ ຂ້ອຍ ປະກາດ' }} />
          <Stack.Screen name="my-properties" options={{ title: '🏠 ອາຄານ & ເຄື່ອງ ຂອງ ຂ້ອຍ' }} />
          <Stack.Screen name="my-work" options={{ title: 'ວຽກ ທີ່ ຂ້ອຍ ຮັບ' }} />
          <Stack.Screen name="wallet" options={{ title: 'ກະເປົາເງິນ' }} />
          <Stack.Screen name="rider" options={{ title: '🛵 ໄຮເດີ້ ຈັດສົ່ງ' }} />
          <Stack.Screen name="reels" options={{ title: '🎬 ວິດີໂອ ຂາຍ' }} />
          <Stack.Screen name="broker" options={{ title: '🤝 ນາຍໜ້າ' }} />
          <Stack.Screen name="messages" options={{ title: 'ຂໍ້ຄວາມ' }} />
          <Stack.Screen name="notifications" options={{ title: 'ການແຈ້ງເຕືອນ' }} />
          <Stack.Screen name="referral" options={{ title: 'ແນະນຳເພື່ອນ' }} />
          <Stack.Screen name="membership" options={{ title: 'ສະມາຊິກ' }} />
          <Stack.Screen name="legal/[doc]" options={{ title: 'ຂໍ້ກຳນົດ & ນະໂຍບາຍ' }} />
          <Stack.Screen name="favorites" options={{ title: 'ລາຍການທີ່ມັກ' }} />
          <Stack.Screen name="search" options={{ title: 'ຄົ້ນຫາ' }} />
          <Stack.Screen name="work-schedule" options={{ title: 'ຕາຕະລາງເຮັດວຽກ' }} />
          <Stack.Screen name="portfolio" options={{ title: 'ຜົນງານ' }} />
          <Stack.Screen name="compare" options={{ title: 'ປຽບທຽບສິນຄ້າ' }} />
          <Stack.Screen name="map" options={{ title: 'ແຜນທີ່' }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="pending" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="admin" options={{ headerShown: false }} />
          <Stack.Screen name="mk/index" options={{ headerShown: false }} />
          <Stack.Screen name="maintenance" options={{ headerShown: false }} />
          <Stack.Screen name="company" options={{ headerShown: false }} />
          <Stack.Screen name="vendors" options={{ headerShown: false }} />
          <Stack.Screen name="billing" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/index" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/admin" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/account" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/product/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/cart" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/checkout" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/order/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/pos" options={{ headerShown: false }} />
          <Stack.Screen name="statement" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
        <CartToast />
      </ThemeProvider>
      </MaintenanceGate>
    </CartProvider>
    </PermissionsProvider>
    </I18nProvider>
    </AuthProvider>
  );
}
