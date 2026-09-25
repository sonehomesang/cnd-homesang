import { useEffect, useRef } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/lib/auth-context';
import { auth } from '@/lib/firebase';
import { installGlobalErrorLogging } from '@/lib/errorLog';
import { I18nProvider } from '@/lib/i18n';
import { colors } from '@/lib/theme';

// This is the STANDALONE CND app. The root layout wires only the providers the
// CND surface actually uses (Auth + i18n + navigation theme) — the HomeSang
// cart / permissions / maintenance providers and its dozens of screens are gone.

const CND_TITLE = 'CND-HomeSang';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const baseTitle = useRef<string>('');

  // Preload the vector-icon fonts before first paint (iOS Safari otherwise paints
  // icon glyphs as empty "tofu" boxes and never repaints after the font loads).
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    ...MaterialIcons.font,
  });

  useEffect(() => {
    installGlobalErrorLogging(() => auth.currentUser?.uid ?? undefined);
    if (typeof window !== 'undefined') {
      try {
        // capture a shared link's ?ref= referral code for later attribution
        const ref = new URLSearchParams(window.location.search).get('ref');
        if (ref) window.localStorage?.setItem('hs_ref', ref);
      } catch { /* ignore */ }
      try {
        // scope /admin to the CND back-office
        const path = window.location.pathname;
        if (path === '/admin' || path.startsWith('/admin/')) router.replace('/cnd/admin' as any);
      } catch { /* ignore */ }
    }
  }, []);

  // Keep the browser tab titled for the CND store.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    try {
      if (!baseTitle.current) baseTitle.current = document.title;
      if (document.title !== CND_TITLE) document.title = CND_TITLE;
    } catch { /* ignore */ }
  }, [pathname]);

  // hold first paint until icon fonts load (fall through on error so a font
  // failure never blanks the app permanently)
  if (!fontsLoaded && !fontError) return null;

  return (
    <AuthProvider>
    <I18nProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.white,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}>
          {/* CND storefront at the clean root */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          {/* CND screens (own headers) */}
          <Stack.Screen name="cnd/index" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/admin" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/account" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/product/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/cart" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/checkout" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/order/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/track/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/book" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/urgent" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/my" options={{ headerShown: false }} />
          <Stack.Screen name="cnd/pos" options={{ headerShown: false }} />
          {/* shared auth flow (CND account uses /sign-in?next=…) */}
          <Stack.Screen name="sign-in" options={{ headerTitle: () => null }} />
          <Stack.Screen name="sign-up" options={{ headerTitle: () => null }} />
          <Stack.Screen name="set-password" options={{ title: 'ຕັ້ງລະຫັດຜ່ານ' }} />
          <Stack.Screen name="forgot-password" options={{ title: 'ລືມລະຫັດຜ່ານ' }} />
          <Stack.Screen name="profile-setup" options={{ title: 'ສ້າງ Profile' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </I18nProvider>
    </AuthProvider>
  );
}
