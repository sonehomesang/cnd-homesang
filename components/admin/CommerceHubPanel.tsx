import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { getAdminTier } from '@/lib/adminTier';
import { useTT } from '@/lib/i18n';
import ShopsPanel from './ShopsPanel';
import ProductsPanel from './ProductsPanel';
import OrdersPanel from './OrdersPanel';
import LogisticsProvidersPanel from './LogisticsProvidersPanel';
import RidersPanel from './RidersPanel';

type Tab = 'shops' | 'products' | 'orders' | 'logistics' | 'riders';

// which tiers may see each main tab
const ALL_TABS: { v: Tab; icon: string; label: string; tiers: string[] }[] = [
  { v: 'shops', icon: '🏬', label: 'ຮ້ານຄ້າ', tiers: ['cp', 'super'] },
  { v: 'products', icon: '🛍️', label: 'ສິນຄ້າ', tiers: ['cp', 'super'] },
  { v: 'orders', icon: '📦', label: 'ການສັ່ງຊື້', tiers: ['cs', 'super'] },
  { v: 'logistics', icon: '🚚', label: 'ຂົນສົ່ງ', tiers: ['cp', 'super'] },
  { v: 'riders', icon: '🛵', label: 'ໄຮເດີ້', tiers: ['cs', 'cp', 'super'] },
];

export default function CommerceHubPanel() {
  const { profile } = useAuth();
  const tier = getAdminTier(profile) ?? '';
  const tabs = ALL_TABS.filter((t) => t.tiers.includes(tier));
  const [tab, setTab] = useState<Tab>(tabs[0]?.v ?? 'shops');
  const tt = useTT();
  const [contentW, setContentW] = useState(0);
  const [boxW, setBoxW] = useState(0);
  const [sx, setSx] = useState(0);
  const moreRight = contentW - boxW - sx > 6;
  const moreLeft = sx > 6;

  return (
    <View>
      <Text style={styles.title}>🛍️ {tt('admCommerce','ສິນຄ້າ-ຮ້ານຄ້າ')}</Text>

      <View style={styles.tabBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => setSx(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}
          onContentSizeChange={(w) => setContentW(w)}
          contentContainerStyle={styles.tabRow}>
          {tabs.map((t) => {
            const on = t.v === tab;
            return (
              <Pressable key={t.v} style={[styles.tab, on && styles.tabOn]} onPress={() => setTab(t.v)}>
                <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>{t.icon} {tt('admCommerce', t.label)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {moreLeft && <View style={[styles.chint, styles.chintL]} pointerEvents="none"><Text style={styles.chintTx}>‹</Text></View>}
        {moreRight && <View style={[styles.chint, styles.chintR]} pointerEvents="none"><Text style={styles.chintTx}>›</Text></View>}
      </View>

      <View>
        {tab === 'shops' ? <ShopsPanel /> : tab === 'products' ? <ProductsPanel /> : tab === 'orders' ? <OrdersPanel /> : tab === 'logistics' ? <LogisticsProvidersPanel /> : <RidersPanel />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 12 },
  tabBar: { position: 'relative', borderBottomWidth: 2, borderBottomColor: '#eef0f3', marginBottom: 16 },
  tabRow: { gap: 4, paddingRight: 20 },
  tab: { paddingHorizontal: 11, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -2 },
  tabOn: { borderBottomColor: '#0066CC' },
  tabText: { fontSize: 12.5, color: '#6b7280' },
  tabTextOn: { color: '#0066CC', fontWeight: '700' },
  chint: { position: 'absolute', top: 0, bottom: 2, width: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)' },
  chintL: { left: 0 },
  chintR: { right: 0 },
  chintTx: { fontSize: 15, color: '#0066CC', fontWeight: '900' },
});

