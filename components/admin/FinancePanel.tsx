import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { getAdminTier } from '@/lib/adminTier';
import WalletPanel from './WalletPanel';
import PaymentsPanel from './PaymentsPanel';
import PaymentProvidersPanel from './PaymentProvidersPanel';
import FeeRatesPanel from './FeeRatesPanel';
import PlatformFeesPanel from './PlatformFeesPanel';
import MemberPricingPanel from './MemberPricingPanel';
import CodSettlementPanel from './CodSettlementPanel';
import CommissionPanel from './CommissionPanel';
import CommissionsPanel from './CommissionsPanel';
import ClaimsPanel from './ClaimsPanel';

type Tab = 'wallet' | 'payments' | 'payproviders' | 'feerates' | 'vafees' | 'members' | 'cod' | 'commission' | 'income' | 'claims';

// which tiers may see each tab
const ALL_TABS: { v: Tab; icon: string; label: string; tiers: string[] }[] = [
  { v: 'wallet', icon: '👛', label: 'ກະເປົາ admin', tiers: ['super'] },
  { v: 'payments', icon: '💳', label: 'ການຈ່າຍເງິນ', tiers: ['super'] },
  { v: 'payproviders', icon: '🏦', label: 'ຊ່ອງທາງຈ່າຍ', tiers: ['super'] },
  { v: 'feerates', icon: '🧾', label: 'ຄ່າທຳນຽມ', tiers: ['super'] },
  { v: 'vafees', icon: '🧾', label: 'ຄ່າບໍລິການ VA', tiers: ['super'] },
  { v: 'members', icon: '👥', label: 'ລາຄາສະມາຊິກ', tiers: ['super'] },
  { v: 'cod', icon: '💵', label: 'ເງິນສົດ COD', tiers: ['super'] },
  { v: 'commission', icon: '💰', label: 'ຄອມມິຊັ່ນ', tiers: ['super'] },
  { v: 'income', icon: '💵', label: 'ຄອມ ເຂົ້າ', tiers: ['super'] },
  { v: 'claims', icon: '↩️', label: 'ຄືນເງິນ', tiers: ['cs', 'super'] },
];

export default function FinancePanel() {
  const { profile } = useAuth();
  const tt = useTT();
  const tier = getAdminTier(profile) ?? '';
  const tabs = ALL_TABS.filter((t) => t.tiers.includes(tier));
  const [tab, setTab] = useState<Tab>(tabs[0]?.v ?? 'claims');
  const [contentW, setContentW] = useState(0);
  const [boxW, setBoxW] = useState(0);
  const [sx, setSx] = useState(0);
  const moreRight = contentW - boxW - sx > 6;
  const moreLeft = sx > 6;

  return (
    <View>
      <Text style={styles.title}>{tt('admFinance','💰 ບໍລິຫານ ການເງິນ · Finance')}</Text>

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
                <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>{t.icon} {tt('admFinance', t.label)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {moreLeft && <View style={[styles.fhint, styles.fhintL]} pointerEvents="none"><Text style={styles.fhintTx}>‹</Text></View>}
        {moreRight && <View style={[styles.fhint, styles.fhintR]} pointerEvents="none"><Text style={styles.fhintTx}>›</Text></View>}
      </View>

      <View style={styles.body}>
        {tab === 'wallet' ? (
          <WalletPanel />
        ) : tab === 'payments' ? (
          <PaymentsPanel />
        ) : tab === 'payproviders' ? (
          <PaymentProvidersPanel />
        ) : tab === 'feerates' ? (
          <FeeRatesPanel />
        ) : tab === 'vafees' ? (
          <PlatformFeesPanel />
        ) : tab === 'members' ? (
          <MemberPricingPanel />
        ) : tab === 'cod' ? (
          <CodSettlementPanel />
        ) : tab === 'commission' ? (
          <CommissionPanel />
        ) : tab === 'income' ? (
          <CommissionsPanel />
        ) : (
          <ClaimsPanel />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 12 },
  tabBar: { position: 'relative', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginBottom: 16 },
  tabRow: { gap: 4, paddingBottom: 0, paddingRight: 20 },
  tab: { paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: '#0066CC' },
  tabText: { fontSize: 12.5, color: '#6b7280' },
  tabTextOn: { color: '#0066CC', fontWeight: '700' },
  fhint: { position: 'absolute', top: 0, bottom: 1, width: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)' },
  fhintL: { left: 0 },
  fhintR: { right: 0 },
  fhintTx: { fontSize: 15, color: '#0066CC', fontWeight: '900' },
  body: {},
});
