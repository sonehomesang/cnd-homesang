import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { colors } from '@/lib/theme';
import { useT } from '@/lib/i18n';
import { useCart } from '@/lib/cart-context';
import { isCndHost } from '@/lib/cnd/host';

export default function TabLayout() {
  const t = useT();
  const { count } = useCart();
  // On the CND subdomain the root renders the CND storefront (its own header/nav),
  // so the HomeSang tab bar must not show.
  const cndHost = isCndHost();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.72)',
        tabBarStyle: cndHost ? { display: 'none' } : {
          backgroundColor: colors.primary,
          borderTopColor: colors.primaryDark,
          borderTopWidth: 1,
          height: 66,
          paddingTop: 4,
          paddingBottom: 4,
        },
        tabBarIconStyle: { marginTop: 0, marginBottom: -2 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', lineHeight: 17, paddingBottom: 2 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('tab.home'), tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="find-tech"
        options={{ title: t('tab.findTech'), tabBarIcon: ({ color, size }) => <Ionicons name="construct" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: t('tab.jobs'), tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: t('tab.shop'),
          tabBarIcon: ({ color, size }) => <Ionicons name="cart" size={size} color={color} />,
          tabBarBadge: count > 0 ? (count > 99 ? '99+' : count) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.secondary, fontSize: 12, fontWeight: '700' },
        }}
      />
      <Tabs.Screen
        name="community"
        options={{ title: t('tab.community'), tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
