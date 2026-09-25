import { lazy, Suspense, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
// Admin panels are lazy-loaded: each becomes its own async chunk so regular
// customers (esp. on mobile) never download the admin codebase in entry.js.
const DashboardPanel = lazy(() => import('@/components/admin/DashboardPanel'));
const GrowthPanel = lazy(() => import('@/components/admin/GrowthPanel'));
const UsersHubPanel = lazy(() => import('@/components/admin/UsersHubPanel'));
const TechVerifyPanel = lazy(() => import('@/components/admin/TechVerifyPanel'));
const JobsPanel = lazy(() => import('@/components/admin/JobsPanel'));
const UnitsPanel = lazy(() => import('@/components/admin/UnitsPanel'));
const CategoriesPanel = lazy(() => import('@/components/admin/CategoriesPanel'));
const SettingsPanel = lazy(() => import('@/components/admin/SettingsPanel'));
const OtpSettingsPanel = lazy(() => import('@/components/admin/OtpSettingsPanel'));
const TranslationsPanel = lazy(() => import('@/components/admin/TranslationsPanel'));
const CmsPanel = lazy(() => import('@/components/admin/CmsPanel'));
const SurveyTemplatesPanel = lazy(() => import('@/components/admin/SurveyTemplatesPanel'));
const PriceCatalogPanel = lazy(() => import('@/components/admin/PriceCatalogPanel'));
const BomTemplatesPanel = lazy(() => import('@/components/admin/BomTemplatesPanel'));
const InspectionTemplatesPanel = lazy(() => import('@/components/admin/InspectionTemplatesPanel'));
const FollowUpPanel = lazy(() => import('@/components/admin/FollowUpPanel'));
const ServiceConfigPanel = lazy(() => import('@/components/admin/ServiceConfigPanel'));
const DisputesPanel = lazy(() => import('@/components/admin/DisputesPanel'));
const BannersPanel = lazy(() => import('@/components/admin/BannersPanel'));
const CouponsPanel = lazy(() => import('@/components/admin/CouponsPanel'));
const AuditLogPanel = lazy(() => import('@/components/admin/AuditLogPanel'));
const CommerceHubPanel = lazy(() => import('@/components/admin/CommerceHubPanel'));
const FinancePanel = lazy(() => import('@/components/admin/FinancePanel'));
const QuotationsPanel = lazy(() => import('@/components/admin/QuotationsPanel'));
const BroadcastPanel = lazy(() => import('@/components/admin/BroadcastPanel'));
const ErrorLogsPanel = lazy(() => import('@/components/admin/ErrorLogsPanel'));
const ReviewsPanel = lazy(() => import('@/components/admin/ReviewsPanel'));
const MembershipsPanel = lazy(() => import('@/components/admin/MembershipsPanel'));
const FeedRankingPanel = lazy(() => import('@/components/admin/FeedRankingPanel'));
const LearnClipsPanel = lazy(() => import('@/components/admin/LearnClipsPanel'));
const SitesPanel = lazy(() => import('@/components/admin/SitesPanel'));
const SiteConfigPanel = lazy(() => import('@/components/admin/SiteConfigPanel'));
const AssetsPanel = lazy(() => import('@/components/admin/AssetsPanel'));
import TabbedPanel, { type PanelTab } from '@/components/admin/TabbedPanel';
import { usePermissions } from '@/lib/permissions-context';
import { useAuth } from '@/lib/auth-context';
import { ttStatic, useTT } from '@/lib/i18n';

// Consolidated hubs — several panels under one nav entry, split by inline tabs.
// Each tab keeps its original panel/content unchanged.
const DISPUTES_TABS: PanelTab[] = [
  { key: 'disputes', label: 'ຂໍ້ຂັດແຍ່ງ', Comp: DisputesPanel },
  { key: 'audit', label: 'ບັນທຶກການແກ້ໄຂ', Comp: AuditLogPanel },
];
const REVIEWS_TABS: PanelTab[] = [
  { key: 'reviews', label: 'ຣີວິວ', Comp: ReviewsPanel },
  { key: 'broadcast', label: 'ແຈ້ງເຕືອນລວມ', Comp: BroadcastPanel },
];
const SURVEY_TABS: PanelTab[] = [
  { key: 'survey', label: 'ແບບສຳຫຼວດ', Comp: SurveyTemplatesPanel },
  { key: 'bom', label: 'ຊຸດ BOM', Comp: BomTemplatesPanel },
  { key: 'inspection', label: 'ໃບກວດງານ+ຮັບປະກັນ', Comp: InspectionTemplatesPanel },
  { key: 'servicecfg', label: 'ປະເພດວຽກ+ເງື່ອນໄຂ', Comp: ServiceConfigPanel },
];
const CONTENT_TABS: PanelTab[] = [
  { key: 'cms', label: 'ເນື້ອຫາ', Comp: CmsPanel },
  { key: 'banners', label: 'ປ້າຍ', Comp: BannersPanel },
  { key: 'feedrank', label: 'ຈັດລຽງ Feed', Comp: FeedRankingPanel },
  { key: 'learn', label: 'ຄວາມຮູ້', Comp: LearnClipsPanel },
  { key: 'reviews', label: 'ຣີວິວ', Comp: ReviewsPanel },
  { key: 'broadcast', label: 'ແຈ້ງເຕືອນລວມ', Comp: BroadcastPanel },
];
const MEMBER_COUPON_TABS: PanelTab[] = [
  { key: 'memberships', label: 'ສະມາຊິກ', Comp: MembershipsPanel },
  { key: 'coupons', label: 'ລະຫັດ ສ່ວນ ຫຼຸດ', Comp: CouponsPanel },
];
const UNITS_PRICING_TABS: PanelTab[] = [
  { key: 'units', label: 'ຫົວໜ່ວຍ', Comp: UnitsPanel },
  { key: 'pricing', label: 'ລາຄາກາງ', Comp: PriceCatalogPanel },
];
const SITES_TABS: PanelTab[] = [
  { key: 'records', label: 'ສະຖານທີ່', Comp: SitesPanel },
  { key: 'assets', label: 'ຊັບສິນ', Comp: AssetsPanel },
  { key: 'config', label: 'ໂຄງ ຂໍ້ມູນ', Comp: SiteConfigPanel },
  { key: 'followup', label: 'ຕິດຕາມ-ບຳລຸງ', Comp: FollowUpPanel },
];
const SETTINGS_TABS: PanelTab[] = [
  { key: 'general', label: 'ທົ່ວໄປ', Comp: SettingsPanel },
  { key: 'otp', label: 'OTP / SMS', Comp: OtpSettingsPanel },
  { key: 'translations', label: 'ການແປ', Comp: TranslationsPanel },
  { key: 'errors', label: 'Error logs', Comp: ErrorLogsPanel },
];
const SettingsHub = () => <TabbedPanel tabs={SETTINGS_TABS} />;
const DisputesHub = () => <TabbedPanel tabs={DISPUTES_TABS} />;
const ReviewsHub = () => <TabbedPanel tabs={REVIEWS_TABS} />;
const SurveyBomHub = () => <TabbedPanel tabs={SURVEY_TABS} />;
const ContentHub = () => <TabbedPanel tabs={CONTENT_TABS} />;
const UnitsPricingHub = () => <TabbedPanel tabs={UNITS_PRICING_TABS} />;
const SitesHub = () => <TabbedPanel tabs={SITES_TABS} />;
const MemberCouponHub = () => <TabbedPanel tabs={MEMBER_COUPON_TABS} />;
const USERS_VERIFY_TABS: PanelTab[] = [
  { key: 'users', label: 'ຜູ້ໃຊ້ງານ & ສິດ', Comp: UsersHubPanel },
  { key: 'techverify', label: 'ຢືນຢັນ ຊ່າງ', Comp: TechVerifyPanel },
];
const UsersVerifyHub = () => <TabbedPanel tabs={USERS_VERIFY_TABS} />;

// Overview hub (Dashboard + Growth). Custom (not TabbedPanel) so the Dashboard
// keeps its onNavigate tile drill-down, which TabbedPanel can't forward.
function OverviewHub({ onNavigate }: { onNavigate: (s: string, g: string) => void }) {
  const tt = useTT();
  const [tab, setTab] = useState<'dash' | 'growth'>('dash');
  const TABS: { k: 'dash' | 'growth'; label: string }[] = [
    { k: 'dash', label: '📊 Dashboard' },
    { k: 'growth', label: '📈 ການ ເຕີບ ໂຕ' },
  ];
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ovTabs}>
        {TABS.map((t) => (
          <Pressable key={t.k} style={[styles.ovTab, tab === t.k && styles.ovTabOn]} onPress={() => setTab(t.k)}>
            <Text style={[styles.ovTabText, tab === t.k && styles.ovTabTextOn]}>{tt('admHub', t.label)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.ovBody}>
        <Suspense fallback={<PanelFallback />}>
          {tab === 'dash' ? <DashboardPanel onNavigate={onNavigate} /> : <GrowthPanel />}
        </Suspense>
      </View>
    </View>
  );
}

const PanelFallback = () => (
  <View style={{ paddingVertical: 48, alignItems: 'center' }}>
    <ActivityIndicator size="large" color="#0066CC" />
    <Text style={{ marginTop: 10, color: '#6b7280', fontSize: 13 }}>{ttStatic('admin', 'ກຳລັງໂຫຼດ...')}</Text>
  </View>
);

type Section = 'dash' | 'growth' | 'users' | 'techverify' | 'jobs' | 'units' | 'categories' | 'catalog' | 'disputes' | 'banners' | 'settings' | 'feedrank' | 'translations' | 'cms' | 'survey' | 'pricing' | 'commission' | 'bom' | 'audit' | 'finance' | 'quotations' | 'broadcast' | 'errors' | 'reviews' | 'memberships' | 'coupons' | 'followup' | 'sites';

const NAV: { group: string; items: { key: Section | null; icon: string; label: string; soon?: boolean }[] }[] = [
  {
    group: 'ພາບລວມ',
    items: [
      { key: 'dash', icon: '📊', label: 'ພາບລວມ & ເຕີບໂຕ' },
    ],
  },
  {
    group: 'ຈັດການ',
    items: [
      { key: 'users', icon: '👥', label: 'ສິດຜູ້ໃຊ້ງານ-ການຢືນຢັນ' },
      { key: 'jobs', icon: '📣', label: 'ປະກາດວຽກ' },
      { key: 'quotations', icon: '📝', label: 'ໃບສະເໜີລາຄາ' },
      { key: 'sites', icon: '🏠', label: 'ອາຄານ & ບຳລຸງ' },
      { key: 'catalog', icon: '🛍️', label: 'ສິນຄ້າ-ຮ້ານຄ້າ' },
      { key: 'disputes', icon: '⚠️', label: 'ການແກ້ໄຂ ຂໍ້ຂັດແຍ່ງ' },
    ],
  },
  {
    group: 'ການເງິນ',
    items: [
      { key: 'finance', icon: '💰', label: 'ບໍລິຫານ ການເງິນ' },
    ],
  },
  {
    group: 'ຕັ້ງຄ່າ',
    items: [
      { key: 'categories', icon: '📂', label: 'ໝວດໝູ່' },
      { key: 'survey', icon: '📋', label: 'ແບບສຳຫຼວດ & BOM' },
      { key: 'units', icon: '📏', label: 'ຫົວໜ່ວຍ-ລາຄາກາງ' },
      { key: 'memberships', icon: '🎫', label: 'ສະມາຊິກ & ສ່ວນຫຼຸດ' },
      { key: 'settings', icon: '⚙️', label: 'ການຕັ້ງຄ່າ' },
      { key: 'cms', icon: '📄', label: 'ເນື້ອຫາ & ຣີວິວ' },
    ],
  },
];

export default function AdminConsole() {
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const { canSection } = usePermissions();
  const { profile } = useAuth();
  const tt = useTT();
  const [section, setSection] = useState<Section>('dash');
  const [group, setGroup] = useState<string>(NAV[0].group);
  const [menuOpen, setMenuOpen] = useState(false);

  const profName = profile?.firstName || profile?.name || tt('admin', 'ຜູ້ໃຊ້');
  const profInitial = (profName.trim()[0] ?? '👤').toUpperCase();

  // soon/placeholder items always show (disabled); real items gated by the
  // role's admin-section access (RBAC — editable in ບົດບາດ & ສິດ)
  const allowed = (it: { key: Section | null; soon?: boolean }) => {
    if (it.soon || !it.key) return true;
    return canSection(it.key);
  };
  const visibleGroups = NAV.filter((g) => g.items.some(allowed));

  const Panel =
    section === 'dash'
      ? DashboardPanel
      : section === 'growth'
      ? GrowthPanel
      : section === 'users'
      ? UsersVerifyHub
      : section === 'techverify'
      ? TechVerifyPanel
      : section === 'jobs'
      ? JobsPanel
      : section === 'units'
      ? UnitsPricingHub
      : section === 'catalog'
      ? CommerceHubPanel
      : section === 'disputes'
      ? DisputesHub
      : section === 'banners'
      ? BannersPanel
      : section === 'settings'
      ? SettingsHub
      : section === 'feedrank'
      ? FeedRankingPanel
      : section === 'translations'
      ? TranslationsPanel
      : section === 'cms'
      ? ContentHub
      : section === 'survey'
      ? SurveyBomHub
      : section === 'pricing'
      ? PriceCatalogPanel
      : section === 'bom'
      ? BomTemplatesPanel
      : section === 'audit'
      ? AuditLogPanel
      : section === 'finance'
      ? FinancePanel
      : section === 'quotations'
      ? QuotationsPanel
      : section === 'broadcast'
      ? BroadcastPanel
      : section === 'errors'
      ? ErrorLogsPanel
      : section === 'reviews'
      ? ReviewsHub
      : section === 'memberships'
      ? MemberCouponHub
      : section === 'coupons'
      ? CouponsPanel
      : section === 'followup'
      ? FollowUpPanel
      : section === 'sites'
      ? SitesHub
      : CategoriesPanel;

  const activeGroup = NAV.find((g) => g.group === group) ?? NAV[0];
  const groupItems = activeGroup.items.filter(allowed);

  const selectGroup = (g: string) => {
    setGroup(g);
    const items = (NAV.find((x) => x.group === g)?.items ?? []).filter(allowed).filter((it) => it.key);
    if (items.length && !items.some((it) => it.key === section)) setSection(items[0].key as Section);
  };

  // dashboard drill-down: a tile jumps straight to its section (+ nav group)
  const go = (s: string, g: string) => { setGroup(g); setSection(s as Section); };

  // wide screens keep the classic left sidebar; narrow screens get the
  // two-level tab menu (group tabs + chips) so the rail isn't cramped.
  if (wide) {
    return (
      <View style={styles.root}>
      <View style={styles.topAccent} />
      <View style={styles.rootRow}>
        <View style={styles.sidebar}>
          <Text style={styles.sidebarBrand}>{tt('admin', '👑 ລະບົບຫຼັງບ້ານໂຮມຊ່າງ')}</Text>
          <ScrollView>
            {visibleGroups.map((g) => (
              <View key={g.group}>
                <Text style={styles.navGroup}>{tt('admin', g.group)}</Text>
                {g.items.filter(allowed).map((it, idx) => {
                  const active = it.key === section;
                  return (
                    <Pressable
                      key={g.group + idx}
                      disabled={it.soon || !it.key}
                      onPress={() => it.key && setSection(it.key)}
                      style={[styles.navItem, active && styles.navItemActive, it.soon && styles.chipSoon]}>
                      <Text style={[styles.navText, active && styles.navTextActive]}>
                        {it.icon} {tt('admin', it.label)}{it.soon ? ' ·soon' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.exit} onPress={() => router.replace('/')}>
            <Text style={styles.exitText}>← {tt('admin', 'ກັບແອັບ')}</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <Suspense fallback={<PanelFallback />}>
            {section === 'dash' ? <OverviewHub onNavigate={go} /> : <Panel />}
          </Suspense>
        </ScrollView>
      </View>
      <AdminFooter />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.topAccent} />
      {/* header: 🏠 home · title (center) · profile · 🚪 exit */}
      <View style={styles.hdr}>
        <Pressable style={styles.iconBtn} onPress={() => router.replace('/')} accessibilityLabel={tt('admin', 'ກັບແອັບ')}>
          <Text style={styles.iconTxt}>🏠</Text>
        </Pressable>
        <Text style={styles.hdrTitle} numberOfLines={1}>{tt('admin', '👑 ລະບົບຫຼັງບ້ານ ໂຮມຊ່າງ')}</Text>
        <Pressable style={styles.prof} onPress={() => router.push('/profile' as any)}>
          {profile?.image ? (
            <Image source={{ uri: profile.image }} style={styles.ava} />
          ) : (
            <View style={[styles.ava, styles.avaFallback]}><Text style={styles.avaInitial}>{profInitial}</Text></View>
          )}
          <Text style={styles.pnm} numberOfLines={1}>{profName}</Text>
        </Pressable>
        <Pressable style={[styles.iconBtn, styles.exitBtn]} onPress={() => router.replace('/')} accessibilityLabel={tt('admin', 'ອອກຈາກຫຼັງບ້ານ')}>
          <Text style={styles.iconTxt}>🚪</Text>
        </Pressable>
      </View>

      {/* level-1 tabs: ☰ full menu + work groups */}
      <View style={styles.groupTabs}>
        <Pressable style={styles.burger} onPress={() => setMenuOpen(true)} accessibilityLabel={tt('admin', 'ເມນູ ຫຼັງບ້ານ ທັງໝົດ')}>
          <Text style={styles.burgerText}>☰</Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupTabsScroll} contentContainerStyle={styles.groupTabsRow}>
          {visibleGroups.map((g) => {
            const on = g.group === group;
            return (
              <Pressable key={g.group} style={[styles.groupTab, on && styles.groupTabOn]} onPress={() => selectGroup(g.group)}>
                <Text style={[styles.groupTabText, on && styles.groupTabTextOn]}>{tt('admin', g.group)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* level-2 chips: items in the active group */}
      <View style={styles.chipBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {groupItems.map((it, idx) => {
            const on = it.key === section;
            return (
              <Pressable
                key={group + idx}
                disabled={it.soon || !it.key}
                onPress={() => it.key && setSection(it.key)}
                style={[styles.chip, on && styles.chipOn, it.soon && styles.chipSoon]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {it.icon} {tt('admin', it.label)}{it.soon ? ' ·soon' : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <Suspense fallback={<PanelFallback />}>
          {section === 'dash' ? <DashboardPanel onNavigate={go} /> : <Panel />}
        </Suspense>
      </ScrollView>

      <AdminFooter />

      {/* ☰ full back-office menu (auto-hidden; opens on tap) */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menu} onPress={() => {}}>
            <View style={styles.menuHd}>
              <Text style={styles.menuHdText}>{tt('admin', '👑 ເມນູ ຫຼັງບ້ານ')}</Text>
              <Pressable onPress={() => setMenuOpen(false)} hitSlop={8}><Text style={styles.menuX}>✕</Text></Pressable>
            </View>
            <ScrollView style={styles.menuScroll}>
              {visibleGroups.map((g) => (
                <View key={g.group}>
                  <Text style={styles.menuGrp}>{tt('admin', g.group)}</Text>
                  {g.items.filter(allowed).map((it, idx) => {
                    const active = it.key === section;
                    return (
                      <Pressable
                        key={g.group + idx}
                        disabled={it.soon || !it.key}
                        onPress={() => { if (it.key) { setGroup(g.group); setSection(it.key); } setMenuOpen(false); }}
                        style={[styles.menuItem, active && styles.menuItemOn, it.soon && styles.chipSoon]}>
                        <Text style={[styles.menuItemText, active && styles.menuItemTextOn]}>
                          {it.icon} {tt('admin', it.label)}{it.soon ? ' ·soon' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Slim professional footer bar for the back-office (both layouts). */
function AdminFooter() {
  const tt = useTT();
  return (
    <View style={styles.footer}>
      <View style={styles.footRow}>
        <Text style={styles.footBrand}>👑 <Text style={styles.footBrandO}>ໂຮມຊ່າງ</Text> · {tt('admin', 'ລະບົບ ຫຼັງບ້ານ')}</Text>
        <View style={styles.footRight}>
          <Text style={styles.footMuted}>© 2026</Text>
          <Pressable onPress={() => router.replace('/')} hitSlop={6}>
            <Text style={styles.footLink}>← {tt('admin', 'ກັບແອັບ')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  // brand accent framing the console: orange line at the very top + footer border
  topAccent: { height: 3, backgroundColor: '#FF6B35' },
  footer: { backgroundColor: '#1f2937', borderTopWidth: 2, borderTopColor: '#FF6B35' },
  footRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 4, columnGap: 12, paddingHorizontal: 16, paddingVertical: 9 },
  footBrand: { color: '#e5e7eb', fontSize: 12.5, fontWeight: '700' },
  footBrandO: { color: '#FF6B35' },
  footRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footMuted: { color: '#9ca3af', fontSize: 12 },
  footLink: { color: '#93c5fd', fontSize: 12, fontWeight: '700' },
  // wide-screen left sidebar
  rootRow: { flex: 1, flexDirection: 'row', backgroundColor: '#F8FAFC' },
  sidebar: { width: 210, backgroundColor: '#1f2937', paddingTop: 8 },
  sidebarBrand: { color: '#fff', fontWeight: '600', fontSize: 15, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#374151' },
  navGroup: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2, letterSpacing: 0.5 },
  navItem: { paddingHorizontal: 16, paddingVertical: 4 },
  navItemActive: { backgroundColor: '#0066CC' },
  navText: { color: '#cbd5e1', fontSize: 13 },
  navTextActive: { color: '#fff', fontWeight: '600' },
  exit: { padding: 10, borderTopWidth: 1, borderTopColor: '#374151' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1f2937', paddingHorizontal: 16, paddingVertical: 12 },
  brand: { color: '#fff', fontWeight: '600', fontSize: 15 },
  exitText: { color: '#9ca3af', fontSize: 12 },
  // narrow header (home · title · profile · exit)
  hdr: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1f2937', paddingHorizontal: 10, paddingVertical: 9 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  exitBtn: { backgroundColor: '#4b2b32' },
  iconTxt: { fontSize: 15 },
  hdrTitle: { flex: 1, textAlign: 'center', color: '#fff', fontWeight: '700', fontSize: 14 },
  prof: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#374151', borderRadius: 20, paddingVertical: 3, paddingLeft: 3, paddingRight: 9 },
  ava: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#0b1220' },
  avaFallback: { backgroundColor: '#2f86e0', alignItems: 'center', justifyContent: 'center' },
  avaInitial: { color: '#fff', fontWeight: '700', fontSize: 13 },
  pnm: { color: '#e5e7eb', fontSize: 12, fontWeight: '600', maxWidth: 56 },
  // hamburger + level-1 group tabs
  burger: { paddingHorizontal: 12, paddingVertical: 10, borderRightWidth: 1, borderRightColor: '#2b3648' },
  burgerText: { color: '#fff', fontSize: 20 },
  groupTabsScroll: { flex: 1 },
  groupTabsRow: { alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  groupTabs: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827' },
  groupTab: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  groupTabOn: { borderBottomColor: '#2f86e0' },
  groupTabText: { color: '#cbd5e1', fontSize: 14 },
  groupTabTextOn: { color: '#fff', fontWeight: '600' },
  // level-2 item chips
  chipBar: { backgroundColor: '#F1F5F9', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  chipRow: { gap: 6, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  chipSoon: { opacity: 0.4 },
  chipText: { fontSize: 12, color: '#374151' },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 8, paddingTop: 12, paddingBottom: 60 },
  // Overview hub inline tabs (Dashboard | Growth)
  ovTabs: { gap: 8, paddingBottom: 14, alignItems: 'center' },
  ovTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  ovTabOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  ovTabText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  ovTabTextOn: { color: '#fff' },
  ovBody: { borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 14 },
  // hamburger overlay menu
  backdrop: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)' },
  // snug width — fits the longest menu row (~170) with a little breathing room
  // height wraps the items (capped so it never exceeds the screen), width fits the longest row
  menu: { alignSelf: 'flex-start', maxHeight: '92%', width: 184, maxWidth: '86%', backgroundColor: '#1f2937', borderBottomRightRadius: 14, overflow: 'hidden', paddingBottom: 8 },
  menuScroll: { flexShrink: 1 },
  menuHd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#374151' },
  menuHdText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  menuX: { color: '#9ca3af', fontSize: 15 },
  menuGrp: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 5 },
  menuItemOn: { backgroundColor: '#0066CC' },
  menuItemText: { color: '#cbd5e1', fontSize: 13 },
  menuItemTextOn: { color: '#fff', fontWeight: '600' },
});
