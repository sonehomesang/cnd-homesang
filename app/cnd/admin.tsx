import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { isAnyAdmin } from '@/lib/adminTier';
import { cnd, kip, kipT, unitT } from '@/lib/cnd/theme';
import { isMock } from '@/lib/mock';
import {
  branchStock, clearCndCatalog, deleteCndCategory, deleteCndProduct, deMojibakeCndCatalog, importCndProducts, importCndFullTree, organizeCndTree, refreshCndProductImages, repairCndCatalog, seedCndMaterialSamples, seedCndHomeSamples, seedCndCatalog, upgradeCndServiceProducts, updateCndCategory, watchCndCategories, watchCndProducts,
  catChildren, catProductCount,
  type CndCategory, type CndProduct,
} from '@/lib/cnd/catalog';
import {
  addCndBranch, deleteCndBranch, getActiveBranchId, pickActiveBranch, seedCndBranches, setActiveBranchId, updateCndBranch, watchCndBranches, type CndBranch,
} from '@/lib/cnd/branches';
import {
  addCndUnit, addMissingUnits, type CndUnit, DEFAULT_CND_UNITS, deleteCndUnit,
  dedupeCndUnits, duplicateUnits, missingUnitsFromProducts, normalizeUnitName,
  renameUnitEverywhere, seedCndUnits,
  UNIT_ALIASES, unitExists, unmarkCndUnitsMock, updateCndUnit, watchCndUnits,
} from '@/lib/cnd/units';
import { transferStock } from '@/lib/cnd/inventory';
import CategoryEditor from '@/components/cnd/CategoryEditor';
import { saveCndConfig, useCndConfig, type CndConfig } from '@/lib/cnd/config';
import { bookingDays } from '@/lib/cnd/booking';
import { addCndTech, clearCndTechs, rebuildCndTechStats, removeCndTech, seedCndTechs, setCndTechActive, updateCndTech, watchCndTechs, type CndTech } from '@/lib/cnd/techs';
import TechBadge from '@/components/ninesang/TechBadge';
import { markCndOrderReviewed, setCndOrderPaid, setCndOrderStatus, updateCndInstall, watchCndOrders, type CndOrder, type CndOrderStatus } from '@/lib/cnd/orders';
import { tierFor } from '@/lib/cnd/loyalty';
import { watchCndShifts, type CndShift } from '@/lib/cnd/shifts';
import { adjustStock, MOVE_LABEL, receiveStock, watchCndStockMoves, type CndStockMove } from '@/lib/cnd/inventory';
import { clearCndDemo, seedCndDemo } from '@/lib/cnd/mockSeed';
import ProductEditor from '@/components/cnd/ProductEditor';
import {
  accessForRole, addCndStaff, CND_SECTIONS, clearCndStaff, ownerAccess, removeCndStaff, saveCndRole,
  seedCndRoles, seedCndStaff, syncCndRoleNames, updateCndStaff, watchCndRoles, watchCndStaff,
  type CndAccess, type CndRole, type CndSection, type CndStaff,
} from '@/lib/cnd/staff';
import { createCndReturn, watchCndReturns, type CndReturn, type CndReturnLine } from '@/lib/cnd/returns';
import { addCndSupplier, clearCndSuppliers, removeCndSupplier, seedCndSuppliers, updateCndSupplier, watchCndSuppliers, type CndSupplier } from '@/lib/cnd/suppliers';
import { cancelCndPO, createCndPO, PO_STATUS, receiveCndPO, setCndPoPaid, watchCndPurchaseOrders, type CndPoLine, type CndPurchaseOrder } from '@/lib/cnd/purchaseOrders';
import { addCndExpense, EXPENSE_CATS, removeCndExpense, watchCndExpenses, type CndExpense } from '@/lib/cnd/expenses';
import { deriveCustomers, type CndCustomer } from '@/lib/cnd/crm';
import { addCndCoupon, checkCouponInput, clearCndCoupons, parseCouponDate, removeCndCoupon, seedCndCoupons, updateCndCoupon, watchCndCoupons, type CndCoupon, type CndCouponAudience, type CndCouponType } from '@/lib/cnd/coupons';
import { addCndBanner, clearCndBanners, removeCndBanner, seedCndBanners, updateCndBanner, watchCndBanners, type CndBanner } from '@/lib/cnd/banners';
import { downloadCsv, parseCsv, pickCsvFile, toCsv } from '@/lib/cnd/csv';
import { rebuildCndPublicCards } from '@/lib/cnd/publicCards';
import { logCndAudit, setCndAuditActor, watchCndAuditLogs, type CndAuditLog } from '@/lib/cnd/audit';
import { addCndZone, clearCndZones, removeCndZone, seedCndZones, updateCndZone, watchCndZones, type CndZone } from '@/lib/cnd/zones';
import { code128DataUri, printCndLabels } from '@/lib/cnd/barcode';
import { addCndBank, clearCndBanks, removeCndBank, seedCndBanks, updateCndBank, watchCndBanks, type CndBank } from '@/lib/cnd/banks';
import PhotoPicker from '@/components/PhotoPicker';
import TechAssessmentModal, { type AssessDecision } from '@/components/admin/TechAssessmentModal';
import CndTranslations from '@/components/CndTranslations';
import CndAccountMenu, { useCndSignOut } from '@/components/cnd/CndAccountMenu';
import { useCndIdentity } from '@/lib/cnd/identity';
import { useTT, ttStatic } from '@/lib/i18n';
import { groupThousands } from '@/lib/format';

type Tab = 'report' | 'orders' | 'returns' | 'customers' | 'products' | 'cats' | 'units' | 'inventory' | 'branches' | 'suppliers' | 'labels' | 'techs' | 'schedule' | 'install' | 'reviews' | 'promos' | 'finance' | 'banks' | 'delivery' | 'settings' | 'staff' | 'audit' | 'i18n';

// CND admin nav — mirrors the HomeSang back-office shell (grouped sidebar on wide
// screens; group-tabs + chips + ☰ menu on narrow). Only CND-relevant sections.
const NAV: { group: string; items: { k: Tab; icon: string; label: string }[] }[] = [
  { group: 'ພາບລວມ', items: [{ k: 'report', icon: '📊', label: 'Dashboard' }] },
  { group: 'ຂາຍ', items: [
    { k: 'orders', icon: '🧾', label: 'ອໍເດີ / ບິນ' },
    { k: 'returns', icon: '↩️', label: 'ຮັບ ຄືນ / ຄືນ ເງິນ' },
    { k: 'customers', icon: '👤', label: 'ລູກຄ້າ' },
  ] },
  { group: 'ສິນຄ້າ & ສາງ', items: [
    { k: 'products', icon: '📦', label: 'ສິນຄ້າ' },
    { k: 'cats', icon: '🗂️', label: 'ໝວດໝູ່' },
    { k: 'units', icon: '📏', label: 'ຫົວໜ່ວຍ' },
    { k: 'inventory', icon: '📥', label: 'ສາງ / stock' },
    { k: 'branches', icon: '🏬', label: 'ສາຂາ' },
    { k: 'suppliers', icon: '🏭', label: 'ຜູ້ຂາຍ + PO' },
    { k: 'labels', icon: '🏷️', label: 'ພິມ ປ້າຍ ລາຄາ' },
  ] },
  { group: 'ຊ່າງ & ບໍລິການ', items: [
    { k: 'techs', icon: '👷', label: 'ຊ່າງ' },
    { k: 'schedule', icon: '📅', label: 'ຕາຕະລາງ ຊ່າງ' },
    { k: 'install', icon: '🔧', label: 'ຄ່າ ຕິດຕັ້ງ' },
    { k: 'reviews', icon: '⭐', label: 'ຣີວິວ' },
  ] },
  { group: 'ການເງິນ & ໂປຣ', items: [
    { k: 'promos', icon: '🎯', label: 'ໂປຣ / ຄູປອງ / banner' },
    { k: 'finance', icon: '💰', label: 'ບໍລິຫານ ການເງິນ' },
  ] },
  { group: 'ຕັ້ງຄ່າ', items: [
    { k: 'settings', icon: '⚙️', label: 'ຂໍ້ມູນ ຮ້ານ' },
    { k: 'banks', icon: '💳', label: 'ທະນາຄານ / QR' },
    { k: 'delivery', icon: '🚚', label: 'ຂົນ ສົ່ງ (ເຂດ/ຄ່າ)' },
    { k: 'staff', icon: '🔐', label: 'ພະນັກງານ & ສິດ' },
    { k: 'audit', icon: '📋', label: 'Audit log' },
    { k: 'i18n', icon: '🌐', label: 'ແປ / ແກ້ ຄຳ' },
  ] },
];

// CND admin — INDEPENDENT from the HomeSang back-office.
export default function CndAdmin() {
  const { profile, loading, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const [tab, setTab] = useState<Tab>('report');
  const [group, setGroup] = useState<string>(NAV[0].group);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cats, setCats] = useState<CndCategory[]>([]);
  const [products, setProducts] = useState<CndProduct[]>([]);
  const [orders, setOrders] = useState<CndOrder[]>([]);
  const [techs, setTechs] = useState<CndTech[]>([]);
  const [roles, setRoles] = useState<CndRole[]>([]);
  const [staff, setStaff] = useState<CndStaff[]>([]);
  const [returns, setReturns] = useState<CndReturn[]>([]);
  const [suppliers, setSuppliers] = useState<CndSupplier[]>([]);
  const [pos, setPos] = useState<CndPurchaseOrder[]>([]);
  const [expenses, setExpenses] = useState<CndExpense[]>([]);
  const [coupons, setCoupons] = useState<CndCoupon[]>([]);
  const [banners, setBanners] = useState<CndBanner[]>([]);
  const [auditLogs, setAuditLogs] = useState<CndAuditLog[]>([]);
  const [zones, setZones] = useState<CndZone[]>([]);
  const [banks, setBanks] = useState<CndBank[]>([]);
  const tt = useTT();                                          // fix/translate hardcoded strings
  const [viewAs, setViewAs] = useState<string | null>(null);   // owner previews a role's access
  // self-resolution now comes from the custom claim (token.cnd.role), NOT from reading
  // cndStaff — staff PII (names/phones) is no longer world-readable by any signed-in user.
  const [claim, setClaim] = useState<{ role?: string; resolved: boolean }>({ resolved: false });
  const config = useCndConfig();

  // access: HomeSang admin = owner (super); else a CND staff member identified by their claim
  const isOwner = isAnyAdmin(profile);
  const allowed = isOwner || !!claim.role;

  // non-owner: ask the server to (re)issue the claim by phone match, then read the fresh role
  useEffect(() => {
    if (isOwner) { setClaim({ resolved: true }); return; }
    if (!profile) return;
    let alive = true;
    (async () => {
      try {
        const r: any = await httpsCallable(functions, 'claimCndStaff')({});
        await auth.currentUser?.getIdToken(true);
        if (alive) setClaim({ role: r?.data?.role || undefined, resolved: true });
      } catch { if (alive) setClaim({ resolved: true }); }
    })();
    return () => { alive = false; };
  }, [isOwner, profile?.uid]);

  useEffect(() => { if (!loading && claim.resolved && !allowed) router.replace('/cnd' as any); }, [loading, claim.resolved, allowed]);
  useEffect(() => watchCndCategories(setCats), []);
  useEffect(() => watchCndProducts(setProducts), []);
  useEffect(() => watchCndOrders(setOrders), []);
  useEffect(() => watchCndTechs(setTechs), []);
  useEffect(() => watchCndRoles(setRoles), []);
  useEffect(() => watchCndReturns(setReturns), []);
  useEffect(() => watchCndSuppliers(setSuppliers), []);
  useEffect(() => watchCndPurchaseOrders(setPos), []);
  useEffect(() => watchCndExpenses(setExpenses), []);
  useEffect(() => watchCndCoupons(setCoupons), []);
  useEffect(() => watchCndBanners(setBanners), []);
  useEffect(() => watchCndAuditLogs(setAuditLogs), []);
  useEffect(() => watchCndZones(setZones), []);
  useEffect(() => watchCndBanks(setBanks), []);
  useEffect(() => { setCndAuditActor(profile?.firstName || profile?.name || profile?.phone); }, [profile]);
  // StaffPanel (owner-only) is the only place that needs the staff roster — read it lazily there.
  useEffect(() => { if (isOwner) return watchCndStaff(setStaff); }, [isOwner]);

  // who is signed in, for the header chip + account menu. Reuses the access resolved
  // above (no second claim round-trip) and deliberately ignores the owner's "view as".
  const meAccess: CndAccess | null = isOwner ? ownerAccess() : (claim.role ? accessForRole(roles.find((r) => r.key === claim.role)) : null);
  const me = useCndIdentity({ access: meAccess });
  const signOutFlow = useCndSignOut('admin');

  if (!allowed) {
    const busy = loading || (!!profile && !claim.resolved);
    return (
      <View style={styles.gate}>
        <View style={styles.gateCard}>
          <Text style={styles.gateLogo}>🔧 CND-HomeSang</Text>
          {busy ? (
            <Text style={styles.gateMsg}>{tt('cndAdmin', 'ກຳລັງ ໂຫຼດ…')}</Text>
          ) : !profile ? (
            <>
              <Text style={styles.gateTitle}>{tt('cndAdmin', 'ເຂົ້າ ສູ່ ລະບົບ ຫຼັງ ບ້ານ')}</Text>
              <Text style={styles.gateMsg}>{tt('cndAdmin', 'ກະລຸນາ ເຂົ້າ ສູ່ ລະບົບ ເພື່ອ ຈັດການ ຮ້ານ CND')}</Text>
              <Pressable style={styles.gateBtn} onPress={() => router.push('/sign-in?next=/cnd/admin' as any)}>
                <Text style={styles.gateBtnTx}>🔑 {tt('cndAdmin', 'ເຂົ້າ ສູ່ ລະບົບ')}</Text>
              </Pressable>
              <Pressable style={styles.gateLink} onPress={() => router.replace('/cnd' as any)}>
                <Text style={styles.gateLinkTx}>← {tt('cndAdmin', 'ກັບ ໜ້າ ຮ້ານ')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.gateTitle}>{tt('cndAdmin', 'ບໍ່ ມີ ສິດ ເຂົ້າ ເຖິງ')}</Text>
              <Text style={styles.gateMsg}>{tt('cndAdmin', 'ບັນຊີ ນີ້ ບໍ່ ແມ່ນ ພະນັກງານ CND — ຕິດ ຕໍ່ ຜູ້ ຈັດການ ຮ້ານ')}</Text>
              <Pressable style={styles.gateBtn} onPress={() => router.replace('/cnd' as any)}>
                <Text style={styles.gateBtnTx}>← {tt('cndAdmin', 'ກັບ ໜ້າ ຮ້ານ')}</Text>
              </Pressable>
              <Pressable style={styles.gateLink} onPress={() => signOut()}>
                <Text style={styles.gateLinkTx}>{tt('cndAdmin', 'ອອກ ຈາກ ລະບົບ (ສະລັບ ບັນຊີ)')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  const myRoleKey = isOwner ? undefined : claim.role;
  const myAccess: CndAccess = isOwner ? ownerAccess() : accessForRole(roles.find((r) => r.key === myRoleKey));
  const access: CndAccess = (isOwner && viewAs) ? accessForRole(roles.find((r) => r.key === viewAs)) : myAccess;
  const visibleNav = NAV
    .map((g) => ({ ...g, items: g.items.filter((it) => access.sections.has(it.k as CndSection)) }))
    .filter((g) => g.items.length > 0);
  const enterViewAs = (roleKey: string) => {
    if (!isOwner) return;
    const a = accessForRole(roles.find((r) => r.key === roleKey));
    setViewAs(roleKey);
    const g = NAV.find((x) => x.items.some((it) => a.sections.has(it.k as CndSection)));
    if (g) { setGroup(g.group); const it = g.items.find((i) => a.sections.has(i.k as CndSection)); if (it) setTab(it.k); }
  };

  const count = (k: Tab): string =>
    k === 'products' ? ` (${products.length})` : k === 'cats' ? ` (${cats.length})` :
    k === 'orders' ? ` (${orders.length})` : k === 'techs' ? ` (${techs.length})` :
    k === 'returns' ? ` (${returns.length})` : k === 'staff' ? ` (${staff.length})` : '';

  const Body = (
    <ScrollView style={styles.content} contentContainerStyle={styles.body}>
      {viewAs && (
        <Pressable style={styles.viewAsBar} onPress={() => setViewAs(null)}>
          <Text style={styles.viewAsTx}>{ttStatic('cndAdmin', '👁️ ກຳລັງ ເບິ່ງ ໃນ ນາມ')}: {access.roleName}</Text>
          <Text style={styles.viewAsBack}>{ttStatic('cndAdmin', '← ກັບ ເປັນ ເຈົ້າ ຂອງ')}</Text>
        </Pressable>
      )}
      {tab === 'report' && <Report orders={orders} products={products} onGo={setTab} />}
      {tab === 'orders' && <Orders orders={orders} staffName={profile?.firstName || profile?.name || profile?.phone} />}
      {tab === 'returns' && <Returns orders={orders} returns={returns} access={access} staffName={profile?.firstName || profile?.name} />}
      {tab === 'customers' && <Customers orders={orders} />}
      {tab === 'products' && <Products cats={cats} products={products} />}
      {tab === 'cats' && <Categories cats={cats} products={products} />}
      {tab === 'units' && <Units products={products} />}
      {tab === 'inventory' && <Inventory products={products} />}
      {tab === 'branches' && <Branches />}
      {tab === 'techs' && <Techs techs={techs} orders={orders} />}
      {tab === 'schedule' && <TechSchedule orders={orders} techs={techs} />}
      {tab === 'install' && <InstallCfg cats={cats} globalPct={config.installFeeDefaultPct} deliveryFee={config.deliveryFee} />}
      {tab === 'reviews' && <Reviews orders={orders} />}
      {tab === 'suppliers' && <Suppliers suppliers={suppliers} pos={pos} products={products} />}
      {tab === 'labels' && <Labels products={products} storeName={config.storeName} />}
      {tab === 'promos' && <Promos coupons={coupons} banners={banners} />}
      {tab === 'finance' && <Finance orders={orders} returns={returns} products={products} pos={pos} expenses={expenses} config={config} />}
      {tab === 'settings' && <Settings config={config} />}
      {tab === 'banks' && <Banks banks={banks} />}
      {tab === 'delivery' && <DeliveryZones zones={zones} />}
      {tab === 'staff' && <StaffPanel roles={roles} staff={staff} onViewAs={enterViewAs} />}
      {tab === 'audit' && <AuditPanel logs={auditLogs} />}
      {tab === 'i18n' && <CndTranslations />}
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const activeGroup = visibleNav.find((g) => g.group === group) ?? visibleNav[0] ?? NAV[0];
  const selectGroup = (g: string) => {
    setGroup(g);
    const items = visibleNav.find((x) => x.group === g)?.items ?? [];
    if (items.length && !items.some((it) => it.k === tab)) setTab(items[0].k);
  };

  // in-page tab bar for the active group's sub-items (shown when a group has >1) —
  // keeps the sidebar/top short (groups only) instead of one long scrolling list.
  const PageTabs = activeGroup.items.length > 1 ? (
    <View style={styles.pageTabs}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pageTabsRow}>
        {activeGroup.items.map((it) => {
          const on = it.k === tab;
          return (
            <Pressable key={it.k} style={[styles.pageTab, on && styles.pageTabOn]} onPress={() => setTab(it.k)}>
              <Text style={[styles.pageTabTx, on && styles.pageTabTxOn]}>{it.icon} {tt('cndNav', it.label)}{count(it.k)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  ) : null;

  // wide screens: compact left sidebar of GROUPS only; the active group's items
  // render as tabs at the top of the page (two-level nav, no tall sidebar).
  if (wide) {
    return (
      <View style={styles.root}>
        <View style={styles.topAccent} />
        <View style={styles.rootRow}>
          <View style={styles.sidebar}>
            <Text style={styles.sidebarBrand}>🧰 CND Admin</Text>
            <View style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 }}><CndAccountMenu identity={me} variant="admin" layout="card" align="left" /></View>
            <ScrollView>
              {visibleNav.map((g) => {
                const on = g.group === group;
                return (
                  <Pressable key={g.group} onPress={() => selectGroup(g.group)} style={[styles.sideGroup, on && styles.sideGroupOn]}>
                    <Text style={[styles.sideGroupTx, on && styles.sideGroupTxOn]}>{tt('cndNav', g.group)}</Text>
                    <Text style={[styles.sideGroupN, on && styles.sideGroupTxOn]}>{g.items.length}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.posSide} onPress={() => router.push('/cnd/pos' as any)}><Text style={styles.posSideTx}>{ttStatic('cndAdmin', '🏬 ເປີດ POS')}</Text></Pressable>
            <Pressable style={styles.exit} onPress={() => router.replace('/cnd' as any)}><Text style={styles.exitText}>{ttStatic('cndAdmin', '← ກັບ ຮ້ານ')}</Text></Pressable>
            <Pressable style={styles.exit} onPress={() => { void signOutFlow(false); }}><Text style={styles.exitText}>{ttStatic('cndAdmin', '🚪 ອອກ ຈາກ ລະບົບ')}</Text></Pressable>
          </View>
          <View style={styles.contentCol}>
            {PageTabs}
            {Body}
          </View>
        </View>
        <CndAdminFooter />
      </View>
    );
  }

  // narrow screens: header + level-1 group tabs + level-2 chips + ☰ menu
  return (
    <View style={styles.root}>
      <View style={styles.topAccent} />
      <View style={styles.hdr}>
        <Pressable style={styles.iconBtn} onPress={() => router.replace('/cnd' as any)} accessibilityLabel="ກັບ ຮ້ານ"><Text style={styles.iconTxt}>🏪</Text></Pressable>
        <Text style={styles.hdrTitle} numberOfLines={1}>{width < 420 ? '🧰 CND' : '🧰 CND Admin'}</Text>
        <Pressable style={styles.posBtn} onPress={() => router.push('/cnd/pos' as any)}><Text style={styles.posTx}>🏬 POS</Text></Pressable>
        <CndAccountMenu identity={me} variant="admin" />
      </View>

      <View style={styles.groupTabs}>
        <Pressable style={styles.burger} onPress={() => setMenuOpen(true)} accessibilityLabel="ເມນູ ທັງ ໝົດ"><Text style={styles.burgerText}>☰</Text></Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.groupTabsRow}>
          {visibleNav.map((g) =>{
            const on = g.group === group;
            return <Pressable key={g.group} style={[styles.groupTab, on && styles.groupTabOn]} onPress={() => selectGroup(g.group)}><Text style={[styles.groupTabText, on && styles.groupTabTextOn]}>{tt('cndNav', g.group)}</Text></Pressable>;
          })}
        </ScrollView>
      </View>

      <View style={styles.chipBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {activeGroup.items.map((it) => {
            const on = it.k === tab;
            return <Pressable key={it.k} style={[styles.chip, on && styles.chipOn]} onPress={() => setTab(it.k)}><Text style={[styles.chipText, on && styles.chipTextOn]}>{it.icon} {tt('cndNav', it.label)}{count(it.k)}</Text></Pressable>;
          })}
        </ScrollView>
      </View>

      {Body}
      <CndAdminFooter />

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menu} onPress={() => {}}>
            <View style={styles.menuHd}><Text style={styles.menuHdText}>{ttStatic('cndAdmin', '🧰 ເມນູ CND')}</Text><Pressable onPress={() => setMenuOpen(false)} hitSlop={8}><Text style={styles.menuX}>✕</Text></Pressable></View>
            <ScrollView style={styles.menuScroll}>
              {visibleNav.map((g) =>(
                <View key={g.group}>
                  <Text style={styles.menuGrp}>{tt('cndNav', g.group)}</Text>
                  {g.items.map((it) => {
                    const active = it.k === tab;
                    return <Pressable key={it.k} onPress={() => { setGroup(g.group); setTab(it.k); setMenuOpen(false); }} style={[styles.menuItem, active && styles.menuItemOn]}><Text style={[styles.menuItemText, active && styles.menuItemTextOn]}>{it.icon} {tt('cndNav', it.label)}{count(it.k)}</Text></Pressable>;
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

/** Slim footer bar for the CND back-office (both layouts). */
function CndAdminFooter() {
  return (
    <View style={styles.footer}>
      <View style={styles.footRow}>
        <Text style={styles.footBrand}>🧰 <Text style={styles.footBrandO}>CND</Text> · Home Hardware Admin</Text>
        <View style={styles.footRight}>
          <Text style={styles.footMuted}>© 2026</Text>
          <Pressable onPress={() => router.replace('/cnd' as any)} hitSlop={6}><Text style={styles.footLink}>{ttStatic('cndAdmin', '← ກັບ ຮ້ານ')}</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Report (POS/sales summary + shift history) ───────────────────────────────
function Report({ orders, products, onGo }: { orders: CndOrder[]; products: CndProduct[]; onGo: (t: Tab) => void }) {
  const [shifts, setShifts] = useState<CndShift[]>([]);
  const [busy, setBusy] = useState(false);
  const [openShift, setOpenShift] = useState<string | null>(null);
  const [range, setRange] = useState<'today' | '7d' | '30d'>('7d');
  useEffect(() => watchCndShifts(setShifts), []);

  const now = Date.now();
  const since = range === 'today'
    ? (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })()
    : now - (range === '7d' ? 7 : 30) * 86400000;
  const inRange = orders.filter((o) => o.createdAt >= since);
  const live = inRange.filter((o) => o.status !== 'cancelled');
  const sales = live.reduce((s, o) => s + o.total, 0);
  const bills = live.length;
  const costOf = new Map(products.map((p) => [p.id, p.cost || 0]));
  const profit = live.reduce((s, o) => s + o.items.reduce((a, it) => a + (it.price - (costOf.get(it.productId) || 0)) * it.qty, 0), 0);
  const profitPct = sales ? Math.round((profit / sales) * 100) : 0;
  const onl = live.filter((o) => o.channel !== 'pos');
  const attach = onl.length ? Math.round((onl.filter((o) => !!o.install).length / onl.length) * 100) : 0;
  const hasMock = orders.some(isMock) || shifts.some(isMock);

  // sales by the last 7 days (bar chart)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * 86400000); d.setHours(0, 0, 0, 0);
    const t0 = d.getTime(); const t1 = t0 + 86400000;
    const tot = orders.filter((o) => o.status !== 'cancelled' && o.createdAt >= t0 && o.createdAt < t1).reduce((s, o) => s + o.total, 0);
    return { label: ['ອາ', 'ຈ', 'ອ', 'ພ', 'ພຫ', 'ສຸ', 'ສ'][d.getDay()], tot };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.tot));

  // best sellers + low stock
  const bs = new Map<string, { name: string; qty: number }>();
  for (const o of live) for (const it of o.items) { const e = bs.get(it.productId) || { name: it.name, qty: 0 }; e.qty += it.qty; bs.set(it.productId, e); }
  const bestSellers = [...bs.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  const lowStock = products.filter((p) => typeof p.stock === 'number' && p.stock <= 5);

  const seedLots = async () => { setBusy(true); try { const r = await seedCndDemo(); logCndAudit('ໃສ່ ຂໍ້ມູນ ຕົວຢ່າງ', 'ທັງ ຮ້ານ', 'ອໍເດີ +' + r.orders); alert(`${ttStatic('cndAdmin', 'ໃສ່ ຕົວຢ່າງ ແລ້ວ · ອໍເດີ')} +${r.orders} · ${ttStatic('cndAdmin', 'ກະ')} +${r.shifts}`); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const clearLots = async () => { if (typeof confirm === 'function' && !confirm(ttStatic('cndAdmin', 'ລຶບ ຂໍ້ມູນ ຕົວຢ່າງ CND ທັງ ໝົດ (ສິນຄ້າ/ຊ່າງ/ອໍເດີ/ກະ)?'))) return; setBusy(true); try { await clearCndDemo(); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };

  return (
    <>
      <View style={styles.seedBar}>
        {!hasMock
          ? <Pressable style={[styles.bigSeed, busy && { opacity: 0.5 }]} disabled={busy} onPress={seedLots}><Text style={styles.bigSeedTx}>{ttStatic('cndAdmin', '🧪 ໃສ່ ຂໍ້ມູນ ຕົວຢ່າງ ຫຼາຍໆ (ສິນຄ້າ + ອໍເດີ + ກະ)')}</Text></Pressable>
          : <Pressable style={[styles.seedBtn, styles.clearBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={clearLots}><Text style={[styles.seedTx, { color: cnd.error }]}>{ttStatic('cndAdmin', '🧹 ລຶບ ຂໍ້ມູນ ຕົວຢ່າງ ທັງ ໝົດ')}</Text></Pressable>}
      </View>

      <View style={styles.modeRow}>
        {([['today', 'ມື້ ນີ້'], ['7d', '7 ວັນ'], ['30d', '30 ວັນ']] as const).map(([k, l]) => (
          <Pressable key={k} style={[styles.modeChip, range === k && styles.modeOn]} onPress={() => setRange(k)}><Text style={[styles.modeTx, range === k && styles.modeTxOn]}>{ttStatic('cndAdmin', l)}</Text></Pressable>
        ))}
      </View>
      <View style={styles.statGrid}>
        <StatBtn k={ttStatic('cndAdmin', '💰 ຍອດ ຂາຍ')} v={kip(sales)} onPress={() => onGo('orders')} />
        <StatBtn k={ttStatic('cndAdmin', '🧾 ບິນ')} v={`${bills}`} onPress={() => onGo('orders')} />
        <StatBtn k={ttStatic('cndAdmin', '📈 ກຳໄລ ຂັ້ນ ຕົ້ນ')} v={`${kip(profit)} · ${profitPct}%`} onPress={() => onGo('products')} />
        <StatBtn k={ttStatic('cndAdmin', '🔧 ໃຊ້ ຊ່າງ ຕິດຕັ້ງ')} v={`${attach}%`} onPress={() => onGo('orders')} />
      </View>

      <Text style={styles.secH}>{ttStatic('cndAdmin', '📈 ຍອດ ຂາຍ 7 ວັນ')}</Text>
      <View style={styles.chartCard}>
        <View style={styles.bars}>
          {days.map((d, i) => (
            <View key={i} style={styles.barCol}>
              <View style={styles.barTrack}><View style={[styles.bar, { height: `${Math.max(4, Math.round((d.tot / maxDay) * 100))}%` }]} /></View>
              <Text style={styles.barLbl}>{d.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {lowStock.length > 0 && (
        <Pressable style={styles.alertCard} onPress={() => onGo('inventory')}>
          <Text style={styles.alertTx}>{ttStatic('cndAdmin', '⚠️ ໃກ້ ໝົດ stock')}: {lowStock.length} {ttStatic('cndAdmin', 'ລາຍການ — ກົດ ເພື່ອ ຮັບ ເຂົ້າ / ສັ່ງ ຊື້ ›')}</Text>
        </Pressable>
      )}

      <Text style={styles.secH}>{ttStatic('cndAdmin', '🔥 ຂາຍ ດີ')} ({range === 'today' ? ttStatic('cndAdmin', 'ມື້ ນີ້') : range === '7d' ? ttStatic('cndAdmin', '7 ວັນ') : ttStatic('cndAdmin', '30 ວັນ')})</Text>
      {bestSellers.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ຂໍ້ມູນ ຂາຍ')}</Text>}
      {bestSellers.map((b, i) => (
        <View key={i} style={styles.bsRow}>
          <Text style={styles.bsRk}>{i + 1}</Text>
          <Text style={styles.bsNm} numberOfLines={1}>{b.name}</Text>
          <Text style={styles.bsQt}>{b.qty}</Text>
        </View>
      ))}

      <Text style={styles.secH}>{ttStatic('cndAdmin', '🧾 ປະຫວັດ ກະ (ປິດ ແລ້ວ)')}</Text>
      {shifts.filter((s) => s.status === 'closed').length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ກະ ທີ່ ປິດ')}</Text>}
      {shifts.filter((s) => s.status === 'closed').map((s) => {
        const over = s.overShort ?? 0; const open = openShift === s.id;
        return (
          <Pressable key={s.id} style={styles.shiftRow} onPress={() => setOpenShift(open ? null : s.id)}>
            <View style={styles.rowHead}>
              <Text style={styles.shiftDate}>{new Date(s.openedAt).toLocaleDateString('lo-LA')} · {s.cashier ?? '—'}</Text>
              {isMock(s) && <Text style={styles.mockPill}>🧪</Text>}
              <Text style={[styles.overPill, { color: over < 0 ? cnd.error : cnd.green, backgroundColor: over < 0 ? '#fdecec' : cnd.greenSoft }]}>{over === 0 ? ttStatic('cndAdmin', 'ພໍ ດີ') : `${over > 0 ? '+' : ''}${kip(over)}`}</Text>
            </View>
            <Text style={styles.shiftMeta}>{s.salesCount ?? 0} {ttStatic('cndCommon', 'ບິນ')} · {ttStatic('cndAdmin', 'ຍອດ')} {kip(s.salesTotal ?? 0)} · {ttStatic('cndAdmin', 'ເງິນ ສົດ')} {kip(s.cashSales ?? 0)} · QR {kip(s.qrSales ?? 0)}</Text>
            {open && (
              <View style={styles.zBox}>
                <ZLine l={ttStatic('cndAdmin', 'ເງິນ ຕັ້ງ ຕົ້ນ')} v={kip(s.openingCash)} />
                <ZLine l={ttStatic('cndAdmin', 'ຄາດ ຫວັງ ເງິນ ສົດ')} v={kip(s.expectedCash ?? 0)} />
                <ZLine l={ttStatic('cndAdmin', 'ນັບ ໄດ້ ຈິງ')} v={kip(s.closingCashCounted ?? 0)} />
                <ZLine l={ttStatic('cndAdmin', 'ຫຼຸດ ລວມ')} v={kip(s.discountTotal ?? 0)} />
              </View>
            )}
          </Pressable>
        );
      })}
    </>
  );
}
function Stat({ k, v }: { k: string; v: string }) { return <View style={styles.stat}><Text style={styles.statK}>{ttStatic('cndAdmin', k)}</Text><Text style={styles.statV}>{v}</Text></View>; }
function StatBtn({ k, v, onPress }: { k: string; v: string; onPress: () => void }) {
  return <Pressable style={styles.stat} onPress={onPress}><Text style={styles.statArrow}>›</Text><Text style={styles.statK}>{ttStatic('cndAdmin', k)}</Text><Text style={styles.statV}>{v}</Text></Pressable>;
}
function ZLine({ l, v }: { l: string; v: string }) { return <View style={styles.trAdmin}><Text style={styles.trLa}>{l}</Text><Text style={styles.trVa}>{v} {ttStatic('cndCommon', 'ກີບ')}</Text></View>; }

// ── Products ─────────────────────────────────────────────────────────────────
function Products({ cats, products }: { cats: CndCategory[]; products: CndProduct[] }) {
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<'new' | CndProduct | null>(null);
  const hasMock = useMemo(() => products.some(isMock) || cats.some(isMock), [products, cats]);
  const catName = (id: string) => cats.find((c) => c.id === id)?.name ?? '—';
  const [importOpen, setImportOpen] = useState(false);
  const [rows, setRows] = useState<string[][] | null>(null);
  const template = () => downloadCsv('cnd-products-template.csv', toCsv([
    ['name', 'price', 'cost', 'sku', 'unit', 'category', 'stock', 'brand', 'oldprice', 'installable', 'installfeepct'],
    ['ໄຟ LED 9W', '45000', '30000', 'LED-9W', 'ໜ່ວຍ', 'ໄຟຟ້າ', '50', 'BRAND', '60000', 'yes', '10'],
  ]));
  const pick = async () => { const t = await pickCsvFile(); if (t) setRows(parseCsv(t)); };
  const doImport = async () => {
    if (!rows) return; setBusy(true);
    try {
      const r = await importCndProducts(rows, cats, products);
      logCndAudit('ນຳ ເຂົ້າ ສິນຄ້າ (CSV)', 'ສິນຄ້າ', `ໃໝ່ ${r.created} · ອັບເດດ ${r.updated}`);
      alert(`${ttStatic('cndAdmin', 'ນຳ ເຂົ້າ ສຳ ເລັດ · ໃໝ່')} ${r.created} · ${ttStatic('cndAdmin', 'ອັບເດດ')} ${r.updated} · ${ttStatic('cndAdmin', 'ໝວດ ໃໝ່')} ${r.newCats}${r.skipped ? ` · ${ttStatic('cndAdmin', 'ຂ້າມ')} ${r.skipped}` : ''}`);
      setRows(null); setImportOpen(false);
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const seed = async () => { setBusy(true); try { const r = await seedCndCatalog(cats.length, products.length); alert(`${ttStatic('cndAdmin', 'ໝວດ')} +${r.cats} · ${ttStatic('cndAdmin', 'ສິນຄ້າ')} +${r.products}`); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const clear = async () => { if (typeof confirm === 'function' && !confirm(ttStatic('cndAdmin', 'ລຶບ ຂໍ້ມູນ ຕົວຢ່າງ?'))) return; setBusy(true); try { await clearCndCatalog(); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const fillImages = async () => { setBusy(true); try { const r = await refreshCndProductImages(); logCndAudit('ໃສ່ ຮູບ ຕົວຢ່າງ', 'ສິນຄ້າ', `${r.updated}`); alert(`${ttStatic('cndAdmin', 'ອັບເດດ ຮູບ ສິນຄ້າ')} ${r.updated}`); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const cleanNames = async () => { setBusy(true); try { const r = await deMojibakeCndCatalog(products, cats); logCndAudit('ລ້າງ ໄທ ປົນ ໃນ ຊື່', 'ສິນຄ້າ', `${r.products}+${r.cats}`); alert(`${ttStatic('cndAdmin', 'ລ້າງ ໄທ ປົນ ແລ້ວ')}: ${ttStatic('cndAdmin', 'ສິນຄ້າ')} ${r.products} · ${ttStatic('cndAdmin', 'ໝວດ')} ${r.cats}`); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  return (
    <>
      <View style={styles.seedBar}>
        <Pressable style={styles.newBtn} onPress={() => setEditor('new')}><Text style={styles.newTx}>{ttStatic('cndAdmin', '＋ ເພີ່ມ ສິນຄ້າ')}</Text></Pressable>
        <Pressable style={styles.csvBtn} onPress={() => setImportOpen(true)}><Text style={styles.csvTx}>{ttStatic('cndAdmin', '📥 ນຳ ເຂົ້າ Excel/CSV')}</Text></Pressable>
        <Pressable style={[styles.csvBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={fillImages}><Text style={styles.csvTx}>{busy ? ttStatic('cndAdmin', 'ກຳລັງ...') : ttStatic('cndAdmin', '🖼️ ໃສ່ ຮູບ ຕົວຢ່າງ')}</Text></Pressable>
        <Pressable style={[styles.csvBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={cleanNames}><Text style={styles.csvTx}>{busy ? ttStatic('cndAdmin', 'ກຳລັງ...') : ttStatic('cndAdmin', '🧹 ລ້າງ ໄທ ປົນ ໃນ ຊື່')}</Text></Pressable>
        {!hasMock
          ? <Pressable style={[styles.seedBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={seed}><Text style={styles.seedTx}>{ttStatic('cndAdmin', '🧪 ຕົວຢ່າງ')}</Text></Pressable>
          : <Pressable style={[styles.seedBtn, styles.clearBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={clear}><Text style={[styles.seedTx, { color: cnd.error }]}>{ttStatic('cndAdmin', '🧹 ລຶບ ຕົວຢ່າງ')}</Text></Pressable>}
        <Text style={styles.hint}>{cats.length} {ttStatic('cndCommon', 'ໝວດ')} · {products.length} {ttStatic('cndCommon', 'ສິນຄ້າ')}</Text>
      </View>
      <Modal visible={importOpen} transparent animationType="fade" onRequestClose={() => setImportOpen(false)}>
        <Pressable style={styles.perfBackdrop} onPress={() => setImportOpen(false)}>
          <Pressable style={styles.perfCard} onPress={() => {}}>
            <View style={styles.perfHd}><Text style={styles.perfName}>{ttStatic('cndAdmin', '📥 ນຳ ເຂົ້າ ສິນຄ້າ (CSV)')}</Text><Pressable onPress={() => setImportOpen(false)} hitSlop={8}><Text style={styles.menuX}>✕</Text></Pressable></View>
            <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
              <Text style={styles.secS}>{ttStatic('cndAdmin', '1. ດາວ template → ຕື່ມ ຂໍ້ມູນ ໃນ Excel → Save As CSV. 2. ເລືອກ ໄຟລ໌. 3. ນຳ ເຂົ້າ (ຈັບ ຄູ່ ດ້ວຍ SKU: ມີ ແລ້ວ = ອັບເດດ, ບໍ່ ມີ = ສ້າງ ໃໝ່; ໝວດ ໃໝ່ ສ້າງ ໃຫ້ ອັດຕະໂນມັດ).')}</Text>
              <Pressable style={styles.addBtn} onPress={template}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '⬇️ ດາວ template CSV')}</Text></Pressable>
              <Pressable style={[styles.addBtn, { backgroundColor: cnd.steel }]} onPress={pick}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '📁 ເລືອກ ໄຟລ໌ CSV')}</Text></Pressable>
              {rows && (
                <View style={styles.card}>
                  <Text style={styles.pName}>{ttStatic('cndAdmin', 'ພົບ')} {Math.max(0, rows.length - 1)} {ttStatic('cndAdmin', 'ແຖວ')}</Text>
                  <Text style={styles.pMeta} numberOfLines={1}>{ttStatic('cndAdmin', 'ຖັນ')}: {(rows[0] || []).join(', ')}</Text>
                  {rows.slice(1, 4).map((r, i) => <Text key={i} style={styles.pMeta} numberOfLines={1}>• {(r[(rows[0] || []).map((h) => h.trim().toLowerCase()).indexOf('name')] || r[0] || '').trim()}</Text>)}
                </View>
              )}
              <Pressable style={[styles.addBtn, (!rows || busy) && { opacity: 0.5 }]} disabled={!rows || busy} onPress={doImport}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '✓ ນຳ ເຂົ້າ')} {rows ? `${Math.max(0, rows.length - 1)} ${ttStatic('cndAdmin', 'ລາຍການ')}` : ''}</Text></Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {products.map((p) => (
        <Pressable key={p.id} style={styles.row} onPress={() => setEditor(p)}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowHead}><Text style={styles.pName} numberOfLines={1}>{p.name}</Text>{p.installable && <Text style={styles.instPill}>🔧</Text>}{isMock(p) && <Text style={styles.mockPill}>🧪</Text>}</View>
            <Text style={styles.pMeta}>{catName(p.categoryId)} · {kip(p.price)} {ttStatic('cndAdmin', 'ກີບ')}/{unitT(p.unit)}{typeof p.stock === 'number' ? ` · stock ${p.stock}` : ''}{p.cost && p.price > p.cost ? ` · ${ttStatic('cndAdmin', 'ກຳໄລ')} ${Math.round(((p.price - p.cost) / p.price) * 100)}%` : ''}</Text>
          </View>
          <Text style={styles.edit}>✏️</Text>
          <Pressable onPress={() => { logCndAudit('ລຶບ ສິນຄ້າ', p.name); deleteCndProduct(p.id).catch(() => {}); }} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
        </Pressable>
      ))}
      {products.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ສິນຄ້າ — ກົດ "＋ ເພີ່ມ ສິນຄ້າ"')}</Text>}
      {editor && <ProductEditor cats={cats} editing={editor === 'new' ? null : editor} onClose={() => setEditor(null)} />}
    </>
  );
}

// ── Inventory (stock ledger + goods-in + adjust) ─────────────────────────────
function Inventory({ products }: { products: CndProduct[] }) {
  const [moves, setMoves] = useState<CndStockMove[]>([]);
  const [branches, setBranches] = useState<CndBranch[]>([]);
  const [brId, setBrId] = useState<string | null>(() => getActiveBranchId());
  const [sel, setSel] = useState<CndProduct | null>(null);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'in' | 'adjust' | 'transfer'>('in');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [toBr, setToBr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => watchCndStockMoves(setMoves), []);
  useEffect(() => watchCndBranches(setBranches), []);
  const active = branches.find((b) => b.id === brId && b.active) ?? pickActiveBranch(branches);
  const chooseBr = (id: string) => { setActiveBranchId(id); setBrId(id); };

  const tracked = products.filter((p) => typeof p.stock === 'number');
  const lowStock = tracked.filter((p) => branchStock(p, active?.id) <= 5);
  const stockValue = tracked.reduce((s, p) => s + branchStock(p, active?.id) * (p.cost ?? 0), 0);
  const found = q.trim() ? products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) || (p.sku ?? '').toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const selQty = sel ? branchStock(sel, active?.id) : 0;

  const submit = async () => {
    if (!sel) return; setBusy(true);
    try {
      const n = Number(qty.replace(/\D/g, '')) || 0;
      if (mode === 'in') await receiveStock({ id: sel.id, name: sel.name }, active?.id ?? null, n, cost ? Number(cost.replace(/\D/g, '')) : undefined, note);
      else if (mode === 'adjust') await adjustStock({ id: sel.id, name: sel.name }, active?.id ?? null, selQty, n, note);
      else { const to = branches.find((b) => b.id === toBr); if (active && to) await transferStock({ id: sel.id, name: sel.name }, { id: active.id, name: active.name }, { id: to.id, name: to.name }, n); }
      setSel(null); setQ(''); setQty(''); setCost(''); setNote(''); setToBr('');
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <>
      {branches.length > 0 && (
        <View style={styles.brRow}>
          <Text style={styles.brL}>{ttStatic('cndAdmin', '📍 ສາຂາ:')}</Text>
          {branches.map((b) => <Pressable key={b.id} style={[styles.brChip, active?.id === b.id && styles.brOn]} onPress={() => chooseBr(b.id)}><Text style={[styles.brTx, active?.id === b.id && styles.brTxOn]}>{b.name}</Text></Pressable>)}
        </View>
      )}
      <View style={styles.statGrid}>
        <Stat k="📦 SKU ນັບ stock" v={`${tracked.length}`} />
        <Stat k="⚠️ ໃກ້ ໝົດ (≤5)" v={`${lowStock.length}`} />
        <Stat k="💰 ມູນຄ່າ stock" v={kip(stockValue)} />
      </View>

      <Text style={styles.secH}>{mode === 'in' ? ttStatic('cndAdmin', '📥 ຮັບ ເຂົ້າ ສິນຄ້າ') : ttStatic('cndAdmin', '✏️ ປັບ/ນັບ stock')}</Text>
      <View style={styles.modeRow}>
        <Pressable style={[styles.modeChip, mode === 'in' && styles.modeOn]} onPress={() => setMode('in')}><Text style={[styles.modeTx, mode === 'in' && styles.modeTxOn]}>{ttStatic('cndAdmin', '📥 ຮັບ ເຂົ້າ')}</Text></Pressable>
        <Pressable style={[styles.modeChip, mode === 'adjust' && styles.modeOn]} onPress={() => setMode('adjust')}><Text style={[styles.modeTx, mode === 'adjust' && styles.modeTxOn]}>{ttStatic('cndAdmin', '✏️ ປັບ/ນັບ')}</Text></Pressable>
        {branches.length > 1 && <Pressable style={[styles.modeChip, mode === 'transfer' && styles.modeOn]} onPress={() => setMode('transfer')}><Text style={[styles.modeTx, mode === 'transfer' && styles.modeTxOn]}>{ttStatic('cndAdmin', '🔁 ໂອນ')}</Text></Pressable>}
      </View>
      <View style={styles.card}>
        {sel ? (
          <>
            <View style={styles.rowHead}><Text style={styles.pName}>{sel.name}</Text><Pressable onPress={() => setSel(null)}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable></View>
            <Text style={styles.pMeta}>stock @ {active?.name ?? '-'}: {selQty} {unitT(sel.unit)}</Text>
            {mode === 'transfer' && (
              <>
                <Text style={styles.lblA}>{ttStatic('cndAdmin', '🔁 ໂອນ ໄປ ສາຂາ')}</Text>
                <View style={styles.brRow}>{branches.filter((b) => b.id !== active?.id).map((b) => <Pressable key={b.id} style={[styles.brChip, toBr === b.id && styles.brOn]} onPress={() => setToBr(b.id)}><Text style={[styles.brTx, toBr === b.id && styles.brTxOn]}>{b.name}</Text></Pressable>)}</View>
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Text style={styles.lblA}>{mode === 'in' ? ttStatic('cndAdmin', 'ຈຳ ນວນ ຮັບ ເຂົ້າ') : mode === 'transfer' ? ttStatic('cndAdmin', 'ຈຳ ນວນ ໂອນ') : ttStatic('cndAdmin', 'ນັບ ໄດ້ (ຕັ້ງ ໃໝ່)')}</Text><TextInput style={styles.inputA} value={groupThousands(qty)} onChangeText={(t) => setQty(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={cnd.ink3} /></View>
              {mode === 'in' && <View style={{ flex: 1 }}><Text style={styles.lblA}>{ttStatic('cndAdmin', 'ຕົ້ນທຶນ/ໜ່ວຍ')}</Text><TextInput style={styles.inputA} value={groupThousands(cost)} onChangeText={(t) => setCost(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={ttStatic('cndAdmin', 'ບໍ່ ບັງຄັບ')} placeholderTextColor={cnd.ink3} /></View>}
            </View>
            {mode !== 'transfer' && <TextInput style={styles.inputA} value={note} onChangeText={setNote} placeholder={ttStatic('cndAdmin', 'ໝາຍເຫດ (ບໍ່ ບັງຄັບ)')} placeholderTextColor={cnd.ink3} />}
            <Pressable style={[styles.addBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={submit}><Text style={styles.addBtnTx}>{mode === 'in' ? ttStatic('cndAdmin', '✓ ຮັບ ເຂົ້າ') : mode === 'transfer' ? ttStatic('cndAdmin', '✓ ໂອນ') : ttStatic('cndAdmin', '✓ ບັນທຶກ ການ ນັບ')}</Text></Pressable>
          </>
        ) : (
          <>
            <TextInput style={styles.inputA} value={q} onChangeText={setQ} placeholder={ttStatic('cndAdmin', '🔍 ຄົ້ນ ສິນຄ້າ ເພື່ອ ຮັບ ເຂົ້າ/ນັບ')} placeholderTextColor={cnd.ink3} />
            {found.map((p) => <Pressable key={p.id} style={styles.findRow} onPress={() => { setSel(p); setQ(''); }}><Text style={styles.pName} numberOfLines={1}>{p.name}</Text><Text style={styles.pMeta}>stock {branchStock(p, active?.id)}</Text></Pressable>)}
          </>
        )}
      </View>

      {lowStock.length > 0 && (
        <>
          <Text style={styles.secH}>{ttStatic('cndAdmin', '⚠️ ໃກ້ ໝົດ')}</Text>
          {lowStock.map((p) => <View key={p.id} style={styles.row}><Text style={styles.pName} numberOfLines={1}>{p.name}</Text><Text style={[styles.pMeta, { color: cnd.error, fontWeight: '800' }]}>{ttStatic('cndAdmin', 'ເຫຼືອ')} {branchStock(p, active?.id)} {unitT(p.unit)}</Text></View>)}
        </>
      )}

      <Text style={styles.secH}>{ttStatic('cndAdmin', '📋 ປະຫວັດ ເຄື່ອນໄຫວ stock')}</Text>
      {moves.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ')}</Text>}
      {moves.map((m) => (
        <View key={m.id} style={styles.moveRow}>
          <Text style={[styles.movePill, m.qty >= 0 ? { backgroundColor: cnd.greenSoft, color: cnd.green } : { backgroundColor: '#fdecec', color: cnd.error }]}>{MOVE_LABEL[m.type]}</Text>
          <Text style={styles.moveN} numberOfLines={1}>{m.productName}{m.note ? ` · ${m.note}` : ''}</Text>
          <Text style={[styles.moveQ, { color: m.qty >= 0 ? cnd.green : cnd.error }]}>{m.qty >= 0 ? '+' : ''}{m.qty}</Text>
        </View>
      ))}
    </>
  );
}

// ── Branches CRUD ────────────────────────────────────────────────────────────
// ── Selling units (ໜ່ວຍ ຂາຍ) ─────────────────────────────────────────────────
// The unit is copied onto every product/bill as text, so this list is only the
// picker's vocabulary — retiring one never rewrites documents already issued.
function Units({ products }: { products: CndProduct[] }) {
  const [units, setUnits] = useState<CndUnit[]>([]);
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [service, setService] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => watchCndUnits(setUnits), []);

  // how many products currently sell in each unit — shown so nobody retires a
  // unit that is still in use without knowing the impact
  const usage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) { const k = normalizeUnitName(p.unit || ''); if (k) m[k] = (m[k] ?? 0) + 1; }
    return m;
  }, [products]);
  const usedBy = (u: CndUnit) => usage[normalizeUnitName(u.name)] ?? 0;

  // units already used by products but not registered — old products stay
  // linked by NAME, so adopting these is what makes them show up here
  const orphans = useMemo(
    () => missingUnitsFromProducts(products.map((p) => p.unit), units),
    [products, units],
  );
  const missingStd = useMemo(
    () => DEFAULT_CND_UNITS.filter((d) => !unitExists(units, d.name)).length,
    [units],
  );

  const dups = useMemo(() => duplicateUnits(units), [units]);
  const dup = !!name.trim() && unitExists(units, name);
  const add = async () => {
    if (!name.trim() || dup) return;
    setBusy(true);
    try { await addCndUnit({ name, nameEn, service, order: units.length + 1 }); setName(''); setNameEn(''); setService(false); }
    catch (e: any) { alert(e?.message ?? String(e)); }
    finally { setBusy(false); }
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  // old spellings still on products (ຕ.ມ. / ຄິວ …) that map to a standard unit
  const aliasHits = useMemo(() => {
    const out: { from: string; to: string; n: number }[] = [];
    const seen = new Set<string>();
    for (const p of products) {
      const raw = (p.unit || '').trim();
      const to = UNIT_ALIASES[normalizeUnitName(raw)];
      if (!to || normalizeUnitName(raw) === normalizeUnitName(to)) continue;
      if (seen.has(raw)) { out.find((o) => o.from === raw)!.n++; continue; }
      seen.add(raw); out.push({ from: raw, to, n: 1 });
    }
    return out;
  }, [products]);

  const applyAliases = () => run(async () => {
    for (const a of aliasHits) {
      // make sure the target exists first, then move the products onto it
      await addMissingUnits([{ name: a.to }]);
      await renameUnitEverywhere(a.from, a.to);
    }
  });

  const rename = (u: CndUnit) => {
    if (typeof prompt !== 'function') return;
    const next = prompt(`${ttStatic('cndAdmin', 'ປ່ຽນ ຊື່ ຫົວໜ່ວຍ')} "${u.name}" →`, u.name);
    if (next == null) return;
    const to = next.trim();
    if (!to || normalizeUnitName(to) === normalizeUnitName(u.name)) return;
    const merging = unitExists(units, to, u.id);
    const n = usedBy(u);
    const msg = merging
      ? `${ttStatic('cndAdmin', 'ມີ ຫົວໜ່ວຍ')} "${to}" ${ttStatic('cndAdmin', 'ຢູ່ ແລ້ວ — ຈະ ລວມ ເຂົ້າ ກັນ ແລະ ຍ້າຍ ສິນຄ້າ')} ${n} ${ttStatic('cndAdmin', 'ລາຍການ. ຕົກ ລົງ ບໍ?')}`
      : `${ttStatic('cndAdmin', 'ປ່ຽນ ຊື່ ແລະ ອັບເດດ ສິນຄ້າ')} ${n} ${ttStatic('cndAdmin', 'ລາຍການ. ຕົກ ລົງ ບໍ?')}`;
    if (typeof confirm === 'function' && !confirm(msg)) return;
    run(() => renameUnitEverywhere(u.name, to));
  };
  const remove = (u: CndUnit) => {
    const n = usedBy(u);
    const warn = n > 0
      ? `${ttStatic('cndAdmin', 'ຫົວໜ່ວຍ ນີ້ ຍັງ ໃຊ້ ຢູ່ ໃນ ສິນຄ້າ')} ${n} ${ttStatic('cndAdmin', 'ລາຍການ — ລຶບ ແລ້ວ ສິນຄ້າ ເກົ່າ ຍັງ ຄົງ ຄຳ ເດີມ. ລຶບ ບໍ?')}`
      : `${ttStatic('cndAdmin', 'ລຶບ ຫົວໜ່ວຍ')} "${u.name}"?`;
    if (typeof confirm !== 'function' || confirm(warn)) deleteCndUnit(u.id).catch(() => {});
  };

  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '📏 ຫົວໜ່ວຍ ຂາຍ — ໃຊ້ ຕອນ ຕັ້ງ ສິນຄ້າ, ບິນ ແລະ ປ້າຍ ລາຄາ')}</Text>
      <View style={styles.card}>
        <TextInput style={styles.inputA} value={name} onChangeText={setName} placeholder={ttStatic('cndAdmin', 'ຊື່ ຫົວໜ່ວຍ (ເຊັ່ນ ແກັດ, ກິໂລ, ຄິວ)')} placeholderTextColor={cnd.ink3} />
        <TextInput style={styles.inputA} value={nameEn} onChangeText={setNameEn} placeholder={ttStatic('cndAdmin', 'ພາສາ ອັງກິດ (ບໍ່ ບັງຄັບ — ເຊັ່ນ box)')} placeholderTextColor={cnd.ink3} />
        <View style={styles.cfgRow}>
          <Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ເປັນ ຫົວໜ່ວຍ ບໍລິການ (ຄັ້ງ / ຈຸດ)')}</Text>
          <Switch value={service} onValueChange={setService} trackColor={{ true: cnd.green }} />
        </View>
        {dup && <Text style={styles.none}>{ttStatic('cndAdmin', '⚠️ ມີ ຫົວໜ່ວຍ ຊື່ ນີ້ ແລ້ວ')}</Text>}
        <Pressable style={[styles.addBtn, (busy || !name.trim() || dup) && { opacity: 0.5 }]} disabled={busy || !name.trim() || dup} onPress={add}>
          <Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '＋ ເພີ່ມ ຫົວໜ່ວຍ')}</Text>
        </Pressable>
      </View>
      {orphans.length > 0 && (
        <View style={styles.seedBar}>
          <Pressable style={[styles.seedBtn, busy && { opacity: 0.5 }]} disabled={busy}
            onPress={() => run(() => addMissingUnits(orphans.map((n) => ({ name: n }))))}>
            <Text style={styles.seedTx}>
              {`${ttStatic('cndAdmin', '＋ ດຶງ ຫົວໜ່ວຍ ທີ່ ສິນຄ້າ ໃຊ້ ຢູ່ ແລ້ວ')} (${orphans.length}) · ${orphans.slice(0, 6).join(' · ')}${orphans.length > 6 ? ' …' : ''}`}
            </Text>
          </Pressable>
        </View>
      )}
      {dups.length > 0 && (
        <View style={styles.seedBar}>
          <Pressable style={[styles.seedBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => run(dedupeCndUnits)}>
            <Text style={styles.seedTx}>
              {`${ttStatic('cndAdmin', '🧹 ລຶບ ຫົວໜ່ວຍ ຊ້ຳ')} (${dups.length}) · ${dups.map((d) => d.name).join(' · ')}`}
            </Text>
          </Pressable>
        </View>
      )}
      {units.some(isMock) && (
        <View style={styles.seedBar}>
          <Pressable style={[styles.seedBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => run(unmarkCndUnitsMock)}>
            <Text style={styles.seedTx}>{`${ttStatic('cndAdmin', '✅ ໝາຍ ວ່າ ເປັນ ຂໍ້ມູນ ຈິງ (ເອົາ 🧪 ອອກ)')} (${units.filter(isMock).length})`}</Text>
          </Pressable>
        </View>
      )}
      {aliasHits.length > 0 && (
        <View style={styles.seedBar}>
          <Pressable style={[styles.seedBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={applyAliases}>
            <Text style={styles.seedTx}>
              {`${ttStatic('cndAdmin', '♻️ ຈັດ ໃຫ້ ເປັນ ມາດຕະຖານ')} · ${aliasHits.map((a) => `${a.from}→${a.to} (${a.n})`).join(' · ')}`}
            </Text>
          </Pressable>
        </View>
      )}
      {missingStd > 0 && (
        <View style={styles.seedBar}>
          <Pressable style={[styles.seedBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => run(seedCndUnits)}>
            <Text style={styles.seedTx}>{`${ttStatic('cndAdmin', '＋ ໃສ່ ຫົວໜ່ວຍ ມາດຕະຖານ ທີ່ ຍັງ ຂາດ')} (${missingStd})`}</Text>
          </Pressable>
        </View>
      )}
      {units.map((u) => (
        <View key={u.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowHead}>
              <Text style={styles.pName}>{u.name}</Text>
              {u.service && <Text style={styles.mockPill}>🔧</Text>}
              {isMock(u) && <Text style={styles.mockPill}>🧪</Text>}
            </View>
            <Text style={styles.pMeta}>
              {[u.nameEn, `${ttStatic('cndAdmin', 'ໃຊ້ ຢູ່')} ${usedBy(u)} ${ttStatic('cndAdmin', 'ລາຍການ')}`].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Pressable onPress={() => rename(u)} hitSlop={8} style={styles.del}><Text style={{ color: cnd.ink2, fontWeight: '800' }}>✎</Text></Pressable>
          <Switch value={u.active} onValueChange={(v) => updateCndUnit(u.id, { active: v }).catch(() => {})} trackColor={{ true: cnd.green }} />
          <Pressable onPress={() => remove(u)} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
        </View>
      ))}
      {units.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ຫົວໜ່ວຍ — ກົດ ປຸ່ມ ຂ້າງ ເທິງ ເພື່ອ ໃສ່ ຊຸດ ມາດຕະຖານ')}</Text>}
    </>
  );
}

function Branches() {
  const [branches, setBranches] = useState<CndBranch[]>([]);
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => watchCndBranches(setBranches), []);
  const hasMock = branches.some(isMock);
  const add = async () => { if (!name.trim()) return; setBusy(true); try { await addCndBranch({ name, address: addr, order: branches.length + 1 }); setName(''); setAddr(''); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '🏬 ສາຂາ / ສາງ — stock ຕິດຕາມ ຕໍ່ ສາຂາ')}</Text>
      <View style={styles.card}>
        <TextInput style={styles.inputA} value={name} onChangeText={setName} placeholder={ttStatic('cndAdmin', 'ຊື່ ສາຂາ (ເຊ່ນ ສາຂາ ໃຫຍ່)')} placeholderTextColor={cnd.ink3} />
        <TextInput style={styles.inputA} value={addr} onChangeText={setAddr} placeholder={ttStatic('cndAdmin', 'ທີ່ ຢູ່ (ບໍ່ ບັງຄັບ)')} placeholderTextColor={cnd.ink3} />
        <Pressable style={[styles.addBtn, (busy || !name.trim()) && { opacity: 0.5 }]} disabled={busy || !name.trim()} onPress={add}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '＋ ເພີ່ມ ສາຂາ')}</Text></Pressable>
      </View>
      {!hasMock && <View style={styles.seedBar}><Pressable style={[styles.seedBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => seedCndBranches(branches.length).catch(() => {})}><Text style={styles.seedTx}>{ttStatic('cndAdmin', '🧪 ໃສ່ ສາຂາ ຕົວຢ່າງ')}</Text></Pressable></View>}
      {branches.map((b) => (
        <View key={b.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowHead}><Text style={styles.pName}>{b.name}</Text>{isMock(b) && <Text style={styles.mockPill}>🧪</Text>}</View>
            {(b.address || b.phone) && <Text style={styles.pMeta}>{[b.address, b.phone].filter(Boolean).join(' · ')}</Text>}
          </View>
          <Switch value={b.active} onValueChange={(v) => updateCndBranch(b.id, { active: v }).catch(() => {})} trackColor={{ true: cnd.green }} />
          <Pressable onPress={() => { if (typeof confirm !== 'function' || confirm(`${ttStatic('cndAdmin', 'ລຶບ ສາຂາ')} "${b.name}"?`)) deleteCndBranch(b.id).catch(() => {}); }} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
        </View>
      ))}
      {branches.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ສາຂາ — ເພີ່ມ ຫຼື ໃສ່ ຕົວຢ່າງ')}</Text>}
    </>
  );
}

// ── Categories CRUD ──────────────────────────────────────────────────────────
function Categories({ cats, products }: { cats: CndCategory[]; products: CndProduct[] }) {
  const [editor, setEditor] = useState<'new' | CndCategory | null>(null);
  const [addUnder, setAddUnder] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const nextOrder = (cats.reduce((m, c) => Math.max(m, c.order ?? 0), 0)) + 1;
  const hasTree = cats.some((c) => c.parentId);
  const organize = async () => {
    if (typeof confirm === 'function' && !confirm(ttStatic('cndAdmin', 'ຈັດ ໝວດ ໃຫ້ ເປັນ tree ອັດຕະໂນມັດ? (ສ້າງ ໝວດ ຍ່ອຍ + ຍ້າຍ ສິນຄ້າ ເຂົ້າ · ບໍ່ ລຶບ ຫຍັງ)'))) return;
    setBusy(true);
    try {
      const r = await organizeCndTree();
      logCndAudit('ຈັດ ໝວດ ເປັນ tree', 'ໝວດ', `ຍ່ອຍ +${r.subs} · ຍ້າຍ ${r.moved}`);
      alert(`${ttStatic('cndAdmin', 'ສຳ ເລັດ · ໝວດ ຍ່ອຍ ໃໝ່')} ${r.subs} · ${ttStatic('cndAdmin', 'ຍ້າຍ ສິນຄ້າ')} ${r.moved} · ${ttStatic('cndAdmin', 'ຈັດ ເຂົ້າ')} ${r.nested}`);
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const importTree = async () => {
    if (typeof confirm === 'function' && !confirm(ttStatic('cndAdmin', 'ນຳ ເຂົ້າ ໂຄງ ໝວດ ຄົບ ແບບ dohome? (ເສີມ ໝວດ ຍ່ອຍ + ເພີ່ມ ໝວດ ໃໝ່ · ບໍ່ ລຶບ ຫຍັງ)'))) return;
    setBusy(true);
    try {
      const r = await importCndFullTree();
      logCndAudit('ນຳ ເຂົ້າ ໂຄງ ໝວດ (dohome)', 'ໝວດ', `ຫຼັກ +${r.mains} · ຍ່ອຍ +${r.subs}`);
      alert(`${ttStatic('cndAdmin', 'ສຳ ເລັດ · ໝວດ ຫຼັກ ໃໝ່')} ${r.mains} · ${ttStatic('cndAdmin', 'ໝວດ ຍ່ອຍ ໃໝ່')} ${r.subs}`);
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const repair = async () => {
    setBusy(true);
    try {
      const r = await repairCndCatalog();
      logCndAudit('ສ້ອມ ໂຄງ ໝວດ', 'ໝວດ', `ຕໍ່ ໝວດ ${r.reparented} · ຈັດ ສິນຄ້າ ${r.rehomed}`);
      alert(`${ttStatic('cndAdmin', 'ສ້ອມ ສຳ ເລັດ · ຕໍ່ ໝວດ ຍ່ອຍ')} ${r.reparented} · ${ttStatic('cndAdmin', 'ຈັດ ສິນຄ້າ ຄືນ')} ${r.rehomed}`);
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const fillSamples = async () => {
    setBusy(true);
    try {
      const m = await seedCndMaterialSamples();
      const h = await seedCndHomeSamples();
      const added = m.added + h.added;
      logCndAudit('ໃສ່ ສິນຄ້າ ຕົວຢ່າງ (ໝວດ ວ່າງ)', 'ສິນຄ້າ', `+${added}`);
      alert(added ? `${ttStatic('cndAdmin', 'ເພີ່ມ ສິນຄ້າ ຕົວຢ່າງ')} ${added}` : ttStatic('cndAdmin', 'ບໍ່ ມີ ໝວດ ວ່າງ ທີ່ ຕ້ອງ ເຕີມ'));
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const upgradeSvc = async () => {
    setBusy(true);
    try {
      const n = await upgradeCndServiceProducts();
      logCndAudit('ອັບເກຣດ SKU ບໍລິການ', 'ສິນຄ້າ', `${n}`);
      alert(n ? `${ttStatic('cndAdmin', 'ອັບເກຣດ SKU ບໍລິການ (isService)')} ${n}` : ttStatic('cndAdmin', 'ບໍ່ ມີ SKU ບໍລິການ ທີ່ ຕ້ອງ ອັບເກຣດ'));
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const del = (c: CndCategory) => {
    const n = catProductCount(cats, products, c.id);
    const kids = catChildren(cats, c.id).length;
    const msg = kids > 0 ? `${ttStatic('cndAdmin', 'ໝວດ')} "${c.name}" ${ttStatic('cndAdmin', 'ມີ')} ${kids} ${ttStatic('cndAdmin', 'ໝວດ ຍ່ອຍ. ລຶບ ໝວດ ນີ້? (ໝວດ ຍ່ອຍ ຈະ ກາຍ ເປັນ ໝວດ ຫຼັກ)')}`
      : n > 0 ? `${ttStatic('cndAdmin', 'ໝວດ')} "${c.name}" ${ttStatic('cndAdmin', 'ມີ')} ${n} ${ttStatic('cndAdmin', 'ສິນຄ້າ. ລຶບ ໝວດ? (ສິນຄ້າ ຈະ ບໍ່ ຖືກ ລຶບ)')}` : `${ttStatic('cndAdmin', 'ລຶບ ໝວດ')} "${c.name}"?`;
    if (typeof confirm === 'function' && !confirm(msg)) return;
    deleteCndCategory(c.id).catch(() => {});
  };
  // flatten to tree order (main → sub → sub2) with depth
  const rows: { c: CndCategory; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => { for (const c of catChildren(cats, parent)) { rows.push({ c, depth }); walk(c.id, depth + 1); } };
  walk(null, 0);
  const openNew = (parent?: string) => { setAddUnder(parent); setEditor('new'); };
  return (
    <>
      <View style={styles.seedBar}>
        <Pressable style={styles.newBtn} onPress={() => openNew(undefined)}><Text style={styles.newTx}>{ttStatic('cndAdmin', '＋ ເພີ່ມ ໝວດ ຫຼັກ')}</Text></Pressable>
        <Pressable style={[styles.csvBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={organize}><Text style={styles.csvTx}>{busy ? ttStatic('cndAdmin', 'ກຳລັງ ຈັດ...') : ttStatic('cndAdmin', '🌳 ຈັດ ເປັນ tree')}</Text></Pressable>
        <Pressable style={[styles.csvBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={importTree}><Text style={styles.csvTx}>{ttStatic('cndAdmin', '📚 ນຳ ເຂົ້າ ໝວດ ຄົບ (dohome)')}</Text></Pressable>
        <Pressable style={[styles.csvBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={repair}><Text style={styles.csvTx}>{ttStatic('cndAdmin', '🩹 ສ້ອມ ໂຄງ ໝວດ')}</Text></Pressable>
        <Pressable style={[styles.csvBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={fillSamples}><Text style={styles.csvTx}>{ttStatic('cndAdmin', '🌱 ເຕີມ ສິນຄ້າ ໝວດ ວ່າງ')}</Text></Pressable>
        <Pressable style={[styles.csvBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={upgradeSvc}><Text style={styles.csvTx}>{ttStatic('cndAdmin', '🛠️ ອັບເກຣດ SKU ບໍລິການ')}</Text></Pressable>
        <Text style={styles.hint}>{rows.length} {ttStatic('cndAdmin', 'ໝວດ')}</Text>
      </View>
      {!hasTree && <Text style={styles.hint}>{ttStatic('cndAdmin', '💡 ໝວດ ຍັງ ຮາບ — ກົດ "🌳 ຈັດ ເປັນ tree" ເພື່ອ ສ້າງ ໝວດ ຍ່ອຍ + ຍ້າຍ ສິນຄ້າ ອັດຕະໂນມັດ (ຄື dohome)')}</Text>}
      {rows.map(({ c, depth }) => (
        <View key={c.id} style={[styles.row, depth > 0 && { marginLeft: depth * 16, backgroundColor: depth === 1 ? cnd.surface : cnd.surface2 }]}>
          <Text style={{ fontSize: depth === 0 ? 22 : 17 }}>{depth > 0 ? '↳ ' : ''}{c.icon ?? '📦'}</Text>
          <Pressable style={{ flex: 1 }} onPress={() => setEditor(c)}>
            <View style={styles.rowHead}><Text style={[styles.pName, depth > 0 && { fontSize: 13 }]}>{c.name}</Text>{depth === 0 && <Text style={styles.instPill}>{ttStatic('cndAdmin', 'ຫຼັກ')}</Text>}{isMock(c) && <Text style={styles.mockPill}>🧪</Text>}</View>
            <Text style={styles.pMeta}>{catProductCount(cats, products, c.id)} {ttStatic('cndAdmin', 'ສິນຄ້າ')}{c.installFeePct != null ? ` · ${ttStatic('cndAdmin', 'ຄ່າ ຕິດຕັ້ງ')} ${c.installFeePct}%` : ''}</Text>
          </Pressable>
          {depth < 2 && <Pressable onPress={() => openNew(c.id)} hitSlop={6} style={styles.subAddBtn}><Text style={styles.subAddTx}>{ttStatic('cndAdmin', '＋ ຍ່ອຍ')}</Text></Pressable>}
          <Pressable onPress={() => setEditor(c)} hitSlop={6}><Text style={styles.edit}>✏️</Text></Pressable>
          <Pressable onPress={() => del(c)} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
        </View>
      ))}
      {rows.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ໝວດ — ກົດ "＋ ເພີ່ມ ໝວດ" ຫຼື ໃສ່ ຂໍ້ມູນ ຕົວຢ່າງ')}</Text>}
      {editor && <CategoryEditor editing={editor === 'new' ? null : editor} nextOrder={nextOrder} cats={cats} defaultParentId={editor === 'new' ? addUnder : undefined} onClose={() => { setEditor(null); setAddUnder(undefined); }} />}
    </>
  );
}

// ── Install fee config ───────────────────────────────────────────────────────
function InstallCfg({ cats, globalPct, deliveryFee }: { cats: CndCategory[]; globalPct: number; deliveryFee: number }) {
  const [g, setG] = useState(String(globalPct));
  const [dfee, setDfee] = useState(String(deliveryFee));
  useEffect(() => setG(String(globalPct)), [globalPct]);
  useEffect(() => setDfee(String(deliveryFee)), [deliveryFee]);
  const saveG = () => saveCndConfig({ installFeeDefaultPct: Number(g.replace(/\D/g, '')) || 0, deliveryFee: Number(dfee.replace(/\D/g, '')) || 0 }).catch(() => {});
  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', 'ຄ່າ ບໍລິການ ຕິດຕັ້ງ — ຕັ້ງ % ໄດ້ ອິດສະລະ')}</Text>
      <Text style={styles.secS}>{ttStatic('cndAdmin', 'ລຳ ດັບ: ຕໍ່ ສິນຄ້າ → ຕໍ່ ໝວດ → ຄ່າ ຫຼັກ (global)')}</Text>
      <View style={styles.cfg}>
        <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ຄ່າ ຫຼັກ global (%)')}</Text><TextInput style={styles.pctIn} value={groupThousands(g)} onChangeText={(t) => setG(t.replace(/\D/g, ''))} keyboardType="number-pad" onBlur={saveG} /></View>
        <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ຄ່າ ສົ່ງ (ກີບ)')}</Text><TextInput style={[styles.pctIn, { minWidth: 100 }]} value={groupThousands(dfee)} onChangeText={(t) => setDfee(t.replace(/\D/g, ''))} keyboardType="number-pad" onBlur={saveG} /></View>
      </View>
      <Text style={styles.secH}>{ttStatic('cndAdmin', 'ຕໍ່ ໝວດ (ວ່າງ = ໃຊ້ ຄ່າ ຫຼັກ)')}</Text>
      {cats.map((c) => <CatPct key={c.id} c={c} />)}
    </>
  );
}
function CatPct({ c }: { c: CndCategory }) {
  const [v, setV] = useState(c.installFeePct != null ? String(c.installFeePct) : '');
  useEffect(() => setV(c.installFeePct != null ? String(c.installFeePct) : ''), [c.installFeePct]);
  const save = () => updateCndCategory(c.id, { installFeePct: v === '' ? undefined : Number(v.replace(/\D/g, '')) }).catch(() => {});
  return (
    <View style={styles.cfgRow2}>
      <Text style={styles.cfgL}>{c.icon} {c.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <TextInput style={styles.pctIn} value={groupThousands(v)} onChangeText={(t) => setV(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="—" placeholderTextColor={cnd.ink3} onBlur={save} />
        <Text style={styles.pctSign}>%</Text>
      </View>
    </View>
  );
}

// ── Orders ───────────────────────────────────────────────────────────────────
const OSTAT: Record<CndOrderStatus, { lao: string; bg: string; fg: string }> = {
  new: { lao: 'ໃໝ່', bg: cnd.blueSoft, fg: cnd.blue },
  confirmed: { lao: 'ຢືນຢັນ', bg: cnd.yellowSoft, fg: '#8a6d00' },
  delivering: { lao: 'ກຳລັງ ສົ່ງ', bg: cnd.yellowSoft, fg: '#8a6d00' },
  done: { lao: 'ສຳ ເລັດ', bg: cnd.greenSoft, fg: cnd.green },
  cancelled: { lao: 'ຍົກເລີກ', bg: cnd.surface2, fg: cnd.ink3 },
};
const NEXT: Record<CndOrderStatus, CndOrderStatus | null> = { new: 'confirmed', confirmed: 'delivering', delivering: 'done', done: null, cancelled: null };
function Orders({ orders, staffName }: { orders: CndOrder[]; staffName?: string }) {
  const [filter, setFilter] = useState<'all' | 'urgent' | 'booking' | 'install' | 'noinstall'>('all');
  if (orders.length === 0) return <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ອໍເດີ')}</Text>;
  const online = orders.filter((o) => o.channel !== 'pos');
  const withInst = online.filter((o) => !!o.install).length;
  const rate = online.length ? Math.round((withInst / online.length) * 100) : 0;
  const urgentOpen = orders.filter((o) => o.channel === 'urgent' && o.status !== 'done' && o.status !== 'cancelled').length;
  const shown = orders.filter((o) =>
    filter === 'all' ? true
    : filter === 'urgent' ? o.channel === 'urgent'
    : filter === 'booking' ? o.channel === 'booking'
    : filter === 'install' ? !!o.install
    : (o.channel !== 'pos' && !o.install))
    // pin OPEN urgent call-outs to the very top
    .sort((a, b) => {
      const au = a.channel === 'urgent' && a.status !== 'done' && a.status !== 'cancelled' ? 1 : 0;
      const bu = b.channel === 'urgent' && b.status !== 'done' && b.status !== 'cancelled' ? 1 : 0;
      return bu - au || b.createdAt - a.createdAt;
    });
  return (
    <>
      <View style={styles.statGrid}>
        <Stat k="🛒 ອອນລາຍ" v={`${online.length} ${ttStatic('cndCommon', 'ອໍເດີ')}`} />
        <Stat k="🔧 ໃຊ້ ຊ່າງ" v={`${withInst} ${ttStatic('cndCommon', 'ບິນ')}`} />
        <Stat k="📈 ອັດຕາ ໃຊ້ ຊ່າງ" v={`${rate}%`} />
      </View>
      {urgentOpen > 0 && <Text style={styles.urgentAlert}>🚨 {ttStatic('cndAdmin', 'ຄຳ ຂໍ ດ່ວນ ຄ້າງ')}: {urgentOpen} — {ttStatic('cndAdmin', 'ຈັດ ຊ່າງ ໄວ!')}</Text>}
      <View style={styles.modeRow}>
        {([['all', 'ທັງ ໝົດ'], ['urgent', '🚨 ດ່ວນ'], ['booking', '📅 ຈອງ'], ['install', '🔧 ໃຊ້ ຊ່າງ'], ['noinstall', 'ບໍ່ ໃຊ້ ຊ່າງ']] as const).map(([k, l]) => (
          <Pressable key={k} style={[styles.modeChip, filter === k && styles.modeOn]} onPress={() => setFilter(k)}><Text style={[styles.modeTx, filter === k && styles.modeTxOn]}>{ttStatic('cndAdmin', l)}</Text></Pressable>
        ))}
        <Pressable style={styles.csvBtn} onPress={() => {
          const rows: (string | number)[][] = [['ເລກ ບິນ', 'ວັນ', 'ຊ່ອງ ທາງ', 'ລູກຄ້າ', 'ເບີ', 'ລາຍການ', 'ຍອດ', 'ຕິດຕັ້ງ', 'ຊ່າງ', 'ສະຖານະ']];
          orders.forEach((o) => rows.push([o.number, new Date(o.createdAt).toLocaleDateString('lo-LA'), o.channel === 'pos' ? 'POS' : 'online', o.customerName || '', o.phone || '', o.items.length, o.total, o.install ? 'ແມ່ນ' : '', o.install?.techName || '', o.status]));
          downloadCsv('cnd-orders.csv', toCsv(rows));
        }}><Text style={styles.csvTx}>⬇️ CSV</Text></Pressable>
      </View>
      {shown.map((o) => {
        const st = OSTAT[o.status]; const nx = NEXT[o.status]; const inst = o.install;
        return (
          <Pressable key={o.id} style={styles.orow} onPress={() => router.push(`/cnd/order/${o.id}` as any)}>
            <View style={styles.rowHead}>
              <Text style={styles.onum}>{o.number}</Text>
              {o.channel === 'urgent' && <Text style={[styles.ostat, { backgroundColor: '#fdecec', color: cnd.error }]}>🚨 {ttStatic('cndAdmin', 'ດ່ວນ')}</Text>}
              {o.channel === 'booking' && <Text style={[styles.ostat, { backgroundColor: cnd.blueSoft, color: cnd.blue }]}>📅 {ttStatic('cndAdmin', 'ຈອງ')}{inst?.slot ? ` ${inst.slot}` : ''}</Text>}
              <Text style={[styles.ostat, { backgroundColor: st.bg, color: st.fg }]}>{ttStatic('cndAdmin', st.lao)}</Text>
              {o.channel !== 'pos' && <Text style={[styles.ostat, o.paymentStatus === 'paid' ? { backgroundColor: cnd.greenSoft, color: cnd.green } : { backgroundColor: '#fdecec', color: cnd.error }]}>{o.paymentStatus === 'paid' ? ttStatic('cndAdmin', '💵 ຈ່າຍ ແລ້ວ') : ttStatic('cndAdmin', '⏳ ຄ້າງ ຈ່າຍ')}</Text>}
              {!!o.reviewFlags?.length && <Text style={[styles.ostat, { backgroundColor: '#FFF4D6', color: '#9A6B00' }]}>⚠️ {ttStatic('cndAdmin', 'ກວດ ກ່ອນ ຢືນຢັນ')}</Text>}
              {isMock(o) && <Text style={styles.mockPill}>🧪</Text>}
              <View style={{ flex: 1 }} />
              <Text style={styles.chev}>›</Text>
            </View>
            <Text style={styles.ometa}>{o.channel === 'pos' ? `🏬 POS${o.cashier ? ' · ' + o.cashier : ''}` : (o.customerName || '—')}{o.channel !== 'pos' && o.phone ? ` · ${o.phone}` : ''} · {o.items.length} {ttStatic('cndAdmin', 'ລາຍການ')} · {kip(o.total)} {ttStatic('cndAdmin', 'ກີບ')}</Text>
            {!!o.couponCode && <Text style={styles.ometa}>🎟️ {o.couponCode}{o.couponDiscount ? ` · −${kip(o.couponDiscount)}` : ''}{o.couponReject ? ` · ❌ ${o.couponReject}` : ''}</Text>}
            {!!o.reviewFlags?.length && (
              <View style={styles.reviewBox}>
                <Text style={styles.reviewT}>⚠️ {ttStatic('cndAdmin', 'ບິນ ນີ້ ຖືກ ໝາຍ — ກວດ ກ່ອນ ຢືນຢັນ')}</Text>
                {(o.reviewReasons?.length ? o.reviewReasons : o.reviewFlags).map((r, i) => <Text key={i} style={styles.reviewR}>• {r}</Text>)}
                <Pressable style={styles.reviewBtn} onPress={() => { logCndAudit('ກວດ ບິນ ທີ່ ຖືກ ໝາຍ', o.number, (o.reviewReasons ?? []).join(' | ')); markCndOrderReviewed(o.id, staffName).catch(() => {}); }}><Text style={styles.reviewBtnTx}>✓ {ttStatic('cndAdmin', 'ກວດ ແລ້ວ')}</Text></Pressable>
              </View>
            )}
            {!!inst && (
              <Text style={styles.oinstall}>🔧 {inst.techName ?? ttStatic('cndAdmin', 'CND ຈັດ ໃຫ້')} · {inst.stage === 'done' ? `${ttStatic('cndAdmin', '✅ ຕິດ ແລ້ວ')} ${inst.onTime === false ? ttStatic('cndAdmin', '⚠️ຊ້າ') : ttStatic('cndAdmin', '⏱️ທັນ')}` : ttStatic('cndAdmin', '🗓️ ລໍ ຖ້າ')}{inst.rating ? ` · ${'★'.repeat(inst.rating)}` : ''} · {inst.linkedToInvoice ? ttStatic('cndAdmin', '🔗 ຜູກ ບິນ') : ttStatic('cndAdmin', 'ແຍກ')}</Text>
            )}
            {!inst && o.channel !== 'pos' && !!o.declineReason && (
              <Text style={styles.odecline}>{ttStatic('cndAdmin', '✕ ບໍ່ ໃຊ້ ຊ່າງ')} · {o.declineReason}</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {nx && <Pressable style={styles.adv} onPress={() => { logCndAudit('ປ່ຽນ ສະຖານະ ອໍເດີ', o.number, OSTAT[nx].lao); setCndOrderStatus(o.id, nx).catch(() => {}); }}><Text style={styles.advTx}>→ {ttStatic('cndAdmin', OSTAT[nx].lao)}</Text></Pressable>}
              {o.channel !== 'pos' && o.paymentStatus !== 'paid' && <Pressable style={[styles.adv, { backgroundColor: cnd.green }]} onPress={() => { logCndAudit('ຢືນຢັນ ຮັບ ເງິນ', o.number, kip(o.total)); setCndOrderPaid(o.id, true, staffName).catch(() => {}); }}><Text style={styles.advTx}>{ttStatic('cndAdmin', '💵 ຢືນຢັນ ຮັບ ເງິນ')}</Text></Pressable>}
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

// ── Tech pool + performance ──────────────────────────────────────────────────
type TechStat = { jobs: number; done: number; onTime: number; rated: number; ratingSum: number };
function techStats(orders: CndOrder[], techId: string): TechStat {
  const s: TechStat = { jobs: 0, done: 0, onTime: 0, rated: 0, ratingSum: 0 };
  for (const o of orders) {
    const inst = o.install; if (!inst || inst.techId !== techId) continue;
    s.jobs++;
    if (inst.stage === 'done') { s.done++; if (inst.onTime) s.onTime++; }
    if (typeof inst.rating === 'number') { s.rated++; s.ratingSum += inst.rating; }
  }
  return s;
}
// ── 📅 ຕາຕະລາງ ຊ່າງ — scheduled install jobs per day, call/chat the tech ────────
function TechSchedule({ orders, techs }: { orders: CndOrder[]; techs: CndTech[] }) {
  const days = useMemo(() => bookingDays(14), []);
  const [dayMs, setDayMs] = useState(days[0]?.ms ?? 0);
  const dayEnd = dayMs + 24 * 3600 * 1000;
  const jobs = useMemo(() => orders
    .filter((o) => o.install && typeof o.install.scheduledAt === 'number' && o.install.scheduledAt >= dayMs && o.install.scheduledAt < dayEnd && o.status !== 'cancelled')
    .sort((a, b) => (a.install!.scheduledAt! - b.install!.scheduledAt!)), [orders, dayMs]);
  const fmtT = (ms?: number) => { if (!ms) return ''; const d = new Date(ms); const p = (n: number) => n < 10 ? '0' + n : '' + n; return `${p(d.getHours())}:${p(d.getMinutes())}`; };
  const techPhone = (id?: string) => techs.find((t) => t.id === id)?.phone;

  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '📅 ຕາຕະລາງ ຄິວ ຊ່າງ')}</Text>
      <Text style={styles.secS}>{ttStatic('cndAdmin', '💡 ຄິວ ຕິດຕັ້ງ ທຸກ ໂໝດ (ຈອງ + ຊື້+ຕິດຕັ້ງ) ຕໍ່ ມື້ · ກົດ ບິນ ເພື່ອ ຈັດ/ຍ້າຍ ຊ່າງ · 📞 ໂທ ແຈ້ງ ຊ່າງ')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 6 }}>
        {days.map((d) => {
          const n = orders.filter((o) => o.install?.scheduledAt && o.install.scheduledAt >= d.ms && o.install.scheduledAt < d.ms + 24 * 3600 * 1000 && o.status !== 'cancelled').length;
          return (
            <Pressable key={d.ms} style={[styles.schDay, dayMs === d.ms && styles.schDayOn]} onPress={() => setDayMs(d.ms)}>
              <Text style={[styles.schDayD, dayMs === d.ms && { color: cnd.white }]}>{d.d}</Text>
              <Text style={[styles.schDayM, dayMs === d.ms && { color: '#cfd8e2' }]}>{d.label}</Text>
              {n > 0 && <View style={styles.schBadge}><Text style={styles.schBadgeTx}>{n}</Text></View>}
            </Pressable>
          );
        })}
      </ScrollView>
      {jobs.length === 0 ? <Text style={styles.none}>{ttStatic('cndAdmin', 'ບໍ່ ມີ ຄິວ ໃນ ມື້ ນີ້')}</Text> : jobs.map((o) => {
        const inst = o.install!; const phone = techPhone(inst.techId);
        return (
          <View key={o.id} style={styles.schJob}>
            <View style={styles.rowHead}>
              <Text style={styles.schTime}>🕐 {inst.slot || fmtT(inst.scheduledAt)}</Text>
              {o.channel === 'urgent' && <Text style={[styles.ostat, { backgroundColor: '#fdecec', color: cnd.error }]}>🚨 {ttStatic('cndAdmin', 'ດ່ວນ')}</Text>}
              {o.channel === 'booking' && <Text style={[styles.ostat, { backgroundColor: cnd.blueSoft, color: cnd.blue }]}>📅 {ttStatic('cndAdmin', 'ຈອງ')}</Text>}
              <View style={{ flex: 1 }} />
              <Text style={[styles.ostat, inst.stage === 'done' ? { backgroundColor: cnd.greenSoft, color: cnd.green } : { backgroundColor: cnd.yellowSoft, color: '#9a6b00' }]}>{inst.stage === 'done' ? ttStatic('cndAdmin', '✅ ແລ້ວ') : ttStatic('cndAdmin', '🗓️ ຄິວ')}</Text>
            </View>
            <Text style={styles.schCust}>{(o.items.find((i) => i.install)?.name) || o.items[0]?.name} · {o.customerName || '—'}{o.phone ? ` · ${o.phone}` : ''}</Text>
            <Text style={styles.schTech}>🔧 {inst.techName || ttStatic('cndAdmin', '⚠️ ຍັງ ບໍ່ ຈັດ ຊ່າງ')}{phone ? ` · ${phone}` : ''}</Text>
            <View style={styles.schBtnRow}>
              {!!phone && <Pressable style={[styles.schBtn, { backgroundColor: cnd.green }]} onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)}><Text style={styles.schBtnTx}>{ttStatic('cndAdmin', '📞 ໂທ ຊ່າງ')}</Text></Pressable>}
              <Pressable style={[styles.schBtn, { backgroundColor: cnd.brand }]} onPress={() => router.push(`/cnd/order/${o.id}` as any)}><Text style={styles.schBtnTx}>{ttStatic('cndAdmin', 'ຈັດ/ຍ້າຍ ຊ່າງ ›')}</Text></Pressable>
            </View>
          </View>
        );
      })}
    </>
  );
}

function Techs({ techs, orders }: { techs: CndTech[]; orders: CndOrder[] }) {
  const [name, setName] = useState(''); const [trade, setTrade] = useState(''); const [phone, setPhone] = useState('');
  const [company, setCompany] = useState(''); const [supervisor, setSupervisor] = useState('');
  const [busy, setBusy] = useState(false);
  const [perf, setPerf] = useState<CndTech | null>(null);
  const hasMock = techs.some(isMock);
  const add = async () => { if (!name.trim()) return; setBusy(true); try { await addCndTech({ name, trade: trade || 'ທົ່ວ ໄປ', phone, company, supervisor }); setName(''); setTrade(''); setPhone(''); setCompany(''); setSupervisor(''); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const seed = async () => { setBusy(true); try { await seedCndTechs(techs.length); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const rebuildStats = async () => {
    setBusy(true);
    try {
      for (const t of techs) { const s = techStats(orders, t.id); await updateCndTech(t.id, { jobsDone: s.done, ratingAvg: s.rated ? Math.round((s.ratingSum / s.rated) * 10) / 10 : 0 }); }
      logCndAudit('ອັບເດດ ຄະແນນ ຊ່າງ', 'ຊ່າງ', `${techs.length}`);
      alert(`${ttStatic('cndAdmin', 'ອັບເດດ ຄະແນນ ຊ່າງ')} ${techs.length}`);
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', 'ຊ່າງ ລົງ ທະບຽນ ກັບ CND-ໂຮມຊ່າງ (CND ຈັດ ໃຫ້ ໄປ ຕິດຕັ້ງ)')}</Text>
      <View style={styles.card}>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={ttStatic('cndAdmin', 'ຊື່ ຊ່າງ')} placeholderTextColor={cnd.ink3} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={trade} onChangeText={setTrade} placeholder={ttStatic('cndAdmin', 'ໝວດ (ໄຟຟ້າ/ແອຣ໌...)')} placeholderTextColor={cnd.ink3} />
          <TextInput style={[styles.input, { flex: 1 }]} value={phone} onChangeText={setPhone} placeholder={ttStatic('cndAdmin', 'ເບີ ໂທ')} placeholderTextColor={cnd.ink3} keyboardType="phone-pad" />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={company} onChangeText={setCompany} placeholder={ttStatic('cndAdmin', 'ສັງກັດ/ບໍລິສັດ')} placeholderTextColor={cnd.ink3} />
          <TextInput style={[styles.input, { flex: 1 }]} value={supervisor} onChangeText={setSupervisor} placeholder={ttStatic('cndAdmin', 'ຫົວໜ້າ/ຄຸມ ງານ')} placeholderTextColor={cnd.ink3} />
        </View>
        <Pressable style={[styles.addBtn, (busy || !name.trim()) && { opacity: 0.5 }]} disabled={busy || !name.trim()} onPress={add}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '＋ ເພີ່ມ ຊ່າງ')}</Text></Pressable>
      </View>
      <View style={styles.seedBar}>
        {!hasMock && <Pressable style={[styles.seedBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={seed}><Text style={styles.seedTx}>{ttStatic('cndAdmin', '🧪 ໃສ່ ຊ່າງ ຕົວຢ່າງ')}</Text></Pressable>}
        {hasMock && <Pressable style={[styles.seedBtn, styles.clearBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => clearCndTechs().catch(() => {})}><Text style={[styles.seedTx, { color: cnd.error }]}>{ttStatic('cndAdmin', '🧹 ລຶບ ຕົວຢ່າງ')}</Text></Pressable>}
        <Pressable style={[styles.csvBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={rebuildStats}><Text style={styles.csvTx}>{ttStatic('cndAdmin', '🔄 ອັບເດດ ຄະແນນ ຊ່າງ')}</Text></Pressable>
      </View>
      {techs.map((t) => {
        const s = techStats(orders, t.id);
        const otPct = s.done ? Math.round((s.onTime / s.done) * 100) : null;
        const avg = s.rated ? (s.ratingSum / s.rated) : null;
        return (
          <Pressable key={t.id} style={styles.row} onPress={() => setPerf(t)}>
            <View style={{ flex: 1 }}>
              <View style={styles.rowHead}><Text style={styles.pName}>{t.name}</Text>{isMock(t) && <Text style={styles.mockPill}>🧪</Text>}</View>
              <Text style={styles.pMeta}>{t.trade}{t.company ? ` · 🏢 ${t.company}` : ''}</Text>
              <Text style={styles.pMeta}>📋 {s.jobs} {ttStatic('cndCommon', 'ວຽກ')}{otPct != null ? ` · ⏱️ ${ttStatic('cndAdmin', 'ທັນ')} ${otPct}%` : ''}{avg != null ? ` · ★ ${avg.toFixed(1)}` : ''}</Text>
              <View style={{ marginTop: 4 }}><TechBadge verified={t.verified} jobsDone={s.done} ratingAvg={avg ?? 0} /></View>
            </View>
            <Switch value={t.active} onValueChange={(v) => setCndTechActive(t.id, v).catch(() => {})} trackColor={{ true: cnd.green }} />
            <Pressable onPress={() => removeCndTech(t.id).catch(() => {})} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
          </Pressable>
        );
      })}
      {techs.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ຊ່າງ')}</Text>}

      <Modal visible={!!perf} transparent animationType="fade" onRequestClose={() => setPerf(null)}>
        <Pressable style={styles.perfBackdrop} onPress={() => setPerf(null)}>
          <Pressable style={styles.perfCard} onPress={() => {}}>
            {perf && <TechPerf tech={perf} orders={orders} onClose={() => setPerf(null)} />}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
function TechPerf({ tech, orders, onClose }: { tech: CndTech; orders: CndOrder[]; onClose: () => void }) {
  const s = techStats(orders, tech.id);
  const otPct = s.done ? Math.round((s.onTime / s.done) * 100) : 0;
  const avg = s.rated ? (s.ratingSum / s.rated) : 0;
  const jobs = orders.filter((o) => o.install?.techId === tech.id);
  const [certs, setCerts] = useState(tech.certifications ?? '');
  const [assessOpen, setAssessOpen] = useState(false);
  return (
    <>
      <View style={styles.perfHd}>
        <Text style={styles.perfName}>👷 {tech.name}</Text>
        <Pressable onPress={onClose} hitSlop={8}><Text style={styles.menuX}>✕</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 9 }}>
        <View style={styles.card}>
          <View style={styles.trAdmin}><Text style={styles.trLa}>{ttStatic('cndAdmin', 'ໝວດ ຊ່າງ')}</Text><Text style={styles.trVa}>{tech.trade || '—'}</Text></View>
          <View style={styles.trAdmin}><Text style={styles.trLa}>{ttStatic('cndAdmin', '🏢 ສັງກັດ/ບໍລິສັດ')}</Text><Text style={styles.trVa}>{tech.company || 'CND (ໃນ ເຄືອ)'}</Text></View>
          <View style={styles.trAdmin}><Text style={styles.trLa}>{ttStatic('cndAdmin', '👔 ຫົວໜ້າ/ຄຸມ ງານ')}</Text><Text style={styles.trVa}>{tech.supervisor || '—'}</Text></View>
          {!!tech.phone && <View style={styles.trAdmin}><Text style={styles.trLa}>{ttStatic('cndAdmin', '📞 ເບີ ໂທ')}</Text><Text style={styles.trVa}>{tech.phone}</Text></View>}
          {!!tech.area && <View style={styles.trAdmin}><Text style={styles.trLa}>{ttStatic('cndAdmin', '📍 ພື້ນ ທີ່')}</Text><Text style={styles.trVa}>{tech.area}</Text></View>}
        </View>
        <View style={styles.statGrid}>
          <Stat k="📋 ວຽກ ຮັບ" v={`${s.jobs}`} />
          <Stat k="✅ ສຳ ເລັດ" v={`${s.done}`} />
          <Stat k="⏱️ ທັນ ນັດ" v={`${otPct}%`} />
          <Stat k="★ ຄະແນນ" v={avg ? avg.toFixed(1) : '—'} />
        </View>

        {/* profile: verified stamp · photo · certifications (CND-ໂຮມຊ່າງ) */}
        <View style={styles.card}>
          <TechBadge verified={tech.verified} jobsDone={s.done} ratingAvg={avg ?? 0} showRating />
          <View style={[styles.trAdmin, { marginTop: 8 }]}>
            <Text style={styles.trLa}>{ttStatic('cndAdmin', '✅ ຢັ້ງຢືນ CND-ໂຮມຊ່າງ')}</Text>
            <Switch value={!!tech.verified} onValueChange={(v) => updateCndTech(tech.id, { verified: v }).catch(() => {})} trackColor={{ true: cnd.green }} />
          </View>
          <Pressable style={styles.assessBtn} onPress={() => setAssessOpen(true)}><Text style={styles.assessBtnT}>📋 {ttStatic('cndAdmin', 'ປະ ເມີນ ຢືນ ຢັນ 3 ຂັ້ນ')}</Text></Pressable>
          <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ຮູບ ຊ່າງ')}</Text>
          <PhotoPicker photos={tech.photo ? [tech.photo] : []} onChange={(u) => updateCndTech(tech.id, { photo: u[0] || '' }).catch(() => {})} pathPrefix="cnd/techs" max={1} />
          <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ໃບ ຢັ້ງຢືນ / ທັກສະ ພິເສດ')}</Text>
          <TextInput style={[styles.input, { height: 54 }]} value={certs} onChangeText={setCerts} onBlur={() => updateCndTech(tech.id, { certifications: certs }).catch(() => {})} placeholder={ttStatic('cndAdmin', 'ເຊ່ນ ຊ່າງ ແອ ໄດ້ ໃບ ຢັ້ງຢືນ, ຕິດຕັ້ງ ໂຊລ່າ...')} placeholderTextColor={cnd.ink3} multiline />
        </View>
        <Text style={styles.secH}>{ttStatic('cndAdmin', '📋 ວຽກ ຂອງ ຊ່າງ ນີ້')}</Text>
        {jobs.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ວຽກ')}</Text>}
        {jobs.map((o) => {
          const inst = o.install!;
          return (
            <Pressable key={o.id} style={styles.row} onPress={() => { onClose(); router.push(`/cnd/order/${o.id}` as any); }}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowHead}><Text style={styles.pName}>{o.number}</Text><Text style={styles.pMeta}>{o.customerName || '—'}</Text></View>
                <Text style={styles.pMeta}>{inst.stage === 'done' ? `${ttStatic('cndAdmin', '✅ ຕິດ ແລ້ວ')} ${inst.onTime === false ? ttStatic('cndAdmin', '⚠️ ຊ້າ') : ttStatic('cndAdmin', '⏱️ ທັນ')}` : ttStatic('cndAdmin', '🗓️ ລໍ ຖ້າ')}{inst.rating ? ` · ${'★'.repeat(inst.rating)}` : ''}</Text>
              </View>
              <Text style={styles.chev}>›</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {assessOpen && (
        <TechAssessmentModal
          visible={assessOpen}
          name={tech.name}
          onApprove={(d: AssessDecision) => { updateCndTech(tech.id, { verified: d.verify, techTier: d.tier, techAssessment: d.assessment } as any).catch(() => {}); setAssessOpen(false); }}
          onReject={() => setAssessOpen(false)}
          onClose={() => setAssessOpen(false)}
        />
      )}
    </>
  );
}

// ── Store settings (profile · payment · receipt/tax) ─────────────────────────
function Settings({ config }: { config: CndConfig }) {
  const [f, setF] = useState<CndConfig>(config);
  const [saved, setSaved] = useState(false);
  useEffect(() => setF(config), [config]);
  const set = (k: keyof CndConfig, v: any) => setF((p) => ({ ...p, [k]: v }));
  const num = (t: string) => Number(t.replace(/\D/g, '')) || 0;
  const save = async () => { try { await saveCndConfig(f); logCndAudit('ບັນທຶກ ຕັ້ງຄ່າ ຮ້ານ', 'ຕັ້ງຄ່າ'); setSaved(true); setTimeout(() => setSaved(false), 1600); } catch (e: any) { alert(e?.message ?? String(e)); } };
  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '🏪 ຂໍ້ມູນ ຮ້ານ')}</Text>
      <View style={styles.card}>
        <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ຊື່ ຮ້ານ')}</Text>
        <TextInput style={styles.inputA} value={f.storeName} onChangeText={(t) => set('storeName', t)} placeholder="CND" placeholderTextColor={cnd.ink3} />
        <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ຄຳ ຂວັນ (tagline)')}</Text>
        <TextInput style={styles.inputA} value={f.tagline ?? ''} onChangeText={(t) => set('tagline', t)} placeholder="Home Hardware & Services" placeholderTextColor={cnd.ink3} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Text style={styles.lblA}>{ttStatic('cndAdmin', 'ເບີ ໂທ')}</Text><TextInput style={styles.inputA} value={f.phone ?? ''} onChangeText={(t) => set('phone', t)} keyboardType="phone-pad" placeholderTextColor={cnd.ink3} /></View>
          <View style={{ flex: 1 }}><Text style={styles.lblA}>{ttStatic('cndAdmin', 'ເວລາ ເປີດ')}</Text><TextInput style={styles.inputA} value={f.hours ?? ''} onChangeText={(t) => set('hours', t)} placeholderTextColor={cnd.ink3} /></View>
        </View>
        <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ທີ່ ຢູ່')}</Text>
        <TextInput style={styles.inputA} value={f.address ?? ''} onChangeText={(t) => set('address', t)} placeholderTextColor={cnd.ink3} />
      </View>

      <Text style={styles.secH}>{ttStatic('cndAdmin', '🧩 ການ ສະແດງ ສິນຄ້າ (ຖັນ)')}</Text>
      <View style={styles.card}>
        <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ຖັນ ໃນ ມືຖື (2–3)')}</Text><TextInput style={styles.pctIn} value={String(f.gridColsMobile ?? 2)} onChangeText={(t) => set('gridColsMobile', Math.max(1, Math.min(3, num(t))))} keyboardType="number-pad" /></View>
        <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ຖັນ ໃນ ຈໍ ກວ້າງ (3–6)')}</Text><TextInput style={styles.pctIn} value={String(f.gridColsWide ?? 4)} onChangeText={(t) => set('gridColsWide', Math.max(2, Math.min(6, num(t))))} keyboardType="number-pad" /></View>
        <Text style={styles.secS}>{ttStatic('cndAdmin', '💡 ຖັນ ໜ້ອຍ = card ໃຫຍ່/ຮູບ ສົດ ໃສ ກວ່າ')}</Text>
      </View>

      <Text style={styles.secH}>{ttStatic('cndAdmin', '💳 ຊ່ອງ ຈ່າຍ & ໃບ ບິນ')}</Text>
      <View style={styles.card}>
        <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', '💵 ຮັບ ເງິນ ສົດ')}</Text><Switch value={f.acceptCash !== false} onValueChange={(v) => set('acceptCash', v)} trackColor={{ true: cnd.green }} /></View>
        <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', '📱 ຮັບ QR ໂອນ')}</Text><Switch value={f.acceptQr !== false} onValueChange={(v) => set('acceptQr', v)} trackColor={{ true: cnd.green }} /></View>
        <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ຄ່າ ສົ່ງ (ກີບ)')}</Text><TextInput style={styles.pctIn} value={groupThousands(String(f.deliveryFee ?? 0))} onChangeText={(t) => set('deliveryFee', num(t))} keyboardType="number-pad" /></View>
        <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ພາສີ / VAT (%)')}</Text><TextInput style={styles.pctIn} value={String(f.taxPct ?? 0)} onChangeText={(t) => set('taxPct', num(t))} keyboardType="number-pad" /></View>
        <Text style={styles.secS}>{ttStatic('cndAdmin', '💡 VAT ຄິດ ໃສ່ ບິນ ໃໝ່; ປ່ຽນ ຄ່າ ນີ້')} <Text style={{ fontWeight: '800' }}>{ttStatic('cndAdmin', 'ບໍ່ ກະທົບ')}</Text> {ttStatic('cndAdmin', 'ບິນ ເກົ່າ (ແຕ່ ລະ ບິນ ເກັບ ອັດຕາ ຂອງ ຕົນ ໄວ້)')}</Text>
        <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ຄອມ HomeSang (%)')}</Text><TextInput style={styles.pctIn} value={String(f.commissionPct ?? 0)} onChangeText={(t) => set('commissionPct', num(t))} keyboardType="number-pad" /></View>
        <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ຂໍ້ຄວາມ ທ້າຍ ໃບ ບິນ')}</Text>
        <TextInput style={styles.inputA} value={f.receiptNote ?? ''} onChangeText={(t) => set('receiptNote', t)} placeholder={ttStatic('cndAdmin', 'ຂອບໃຈ ທີ່ ອຸດໜູນ 🙏')} placeholderTextColor={cnd.ink3} />
      </View>

      <Text style={styles.secH}>{ttStatic('cndAdmin', '📐 ຄ່າ ສຳຫຼວດ ໜ້າ ງານ (ninesang)')}</Text>
      <Text style={styles.secS}>{ttStatic('cndAdmin', '💡 ວຽກ ໃຫຍ່ ອາດ ຕ້ອງ ສຳຫຼວດ ກ່ອນ · off=ບໍ່ ໃຊ້ · ຕົກລົງ=T&C ເທົ່ານັ້ນ · ຈ່າຍ ກ່ອນ=ເກັບ ຕອນ ສັ່ງ (ຄືນ ເປັນ ສ່ວນ ຫຼຸດ)')}</Text>
      <View style={styles.card}>
        <View style={styles.segRow}>
          {([['off', 'ປິດ'], ['agree', 'ຕົກລົງ (T&C)'], ['prepay', 'ຈ່າຍ ກ່ອນ']] as const).map(([k, l]) => (
            <Pressable key={k} style={[styles.seg, (f.surveyFeeMode ?? 'off') === k && styles.segOn]} onPress={() => set('surveyFeeMode', k)}><Text style={[styles.segTx, (f.surveyFeeMode ?? 'off') === k && styles.segTxOn]}>{ttStatic('cndAdmin', l)}</Text></Pressable>
          ))}
        </View>
        {(f.surveyFeeMode ?? 'off') !== 'off' && (
          <View style={[styles.cfgRow, { marginTop: 8 }]}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ຄ່າ ສຳຫຼວດ (ກີບ)')}</Text><TextInput style={[styles.pctIn, { minWidth: 110 }]} value={groupThousands(String(f.surveyFee ?? 0))} onChangeText={(t) => set('surveyFee', num(t))} keyboardType="number-pad" /></View>
        )}
      </View>

      <Text style={styles.secH}>{ttStatic('cndAdmin', '📅 ຈອງ ຄິວ ຊ່າງ (ninesang)')}</Text>
      <View style={styles.card}>
        <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ເປີດ ໃຫ້ ຈອງ ຄິວ')}</Text><Switch value={f.bookingEnabled !== false} onValueChange={(v) => set('bookingEnabled', v)} trackColor={{ true: cnd.green }} /></View>
        {f.bookingEnabled !== false && (<>
          <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ຄວາມ ຈຸ ຄິວ ຕໍ່ ຊ່ວງ ເວລາ')}</Text>
          <View style={styles.segRow}>
            {([['byTech', 'ນັບ ຕາມ ຊ່າງ'], ['unlimited', 'ບໍ່ ຈຳກັດ'], ['fixed', 'ເລກ ຄົງທີ່']] as const).map(([k, l]) => (
              <Pressable key={k} style={[styles.seg, (f.bookingCapacityMode ?? 'byTech') === k && styles.segOn]} onPress={() => set('bookingCapacityMode', k)}><Text style={[styles.segTx, (f.bookingCapacityMode ?? 'byTech') === k && styles.segTxOn]}>{ttStatic('cndAdmin', l)}</Text></Pressable>
            ))}
          </View>
          {(f.bookingCapacityMode ?? 'byTech') === 'fixed' && (
            <View style={[styles.cfgRow, { marginTop: 8 }]}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ຮັບ ໄດ້ ກີ່ ຄິວ / ຊ່ວງ')}</Text><TextInput style={styles.pctIn} value={String(f.bookingSlotCap ?? 3)} onChangeText={(t) => set('bookingSlotCap', num(t) || 1)} keyboardType="number-pad" /></View>
          )}
          <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ຊ່ວງ ເວລາ ຕໍ່ ມື້ (ຂັ້ນ ດ້ວຍ ຈຸດ ,)')}</Text>
          <TextInput style={styles.inputA} value={(f.bookingSlots ?? []).join(', ')} onChangeText={(t) => set('bookingSlots', t.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="09:00–10:30, 10:30–12:00, …" placeholderTextColor={cnd.ink3} />
          <View style={[styles.cfgRow, { marginTop: 6 }]}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ຈອງ ລ່ວງ ໜ້າ (ມື້)')}</Text><TextInput style={styles.pctIn} value={String(f.bookingDays ?? 14)} onChangeText={(t) => set('bookingDays', num(t) || 7)} keyboardType="number-pad" /></View>
        </>)}
      </View>

      <Text style={styles.secH}>{ttStatic('cndAdmin', '🚨 ຊ່າງ ດ່ວນ (ninesang)')}</Text>
      <View style={styles.card}>
        <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ເປີດ ບໍລິການ ດ່ວນ')}</Text><Switch value={f.urgentEnabled !== false} onValueChange={(v) => set('urgentEnabled', v)} trackColor={{ true: cnd.green }} /></View>
        {f.urgentEnabled !== false && (<>
          <View style={[styles.cfgRow, { marginTop: 6 }]}><Text style={styles.cfgL}>{ttStatic('cndAdmin', 'ຄ່າ ດ່ວນ (ກີບ)')}</Text><TextInput style={[styles.pctIn, { minWidth: 110 }]} value={groupThousands(String(f.urgentFee ?? 0))} onChangeText={(t) => set('urgentFee', num(t))} keyboardType="number-pad" /></View>
          <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ຊົ່ວໂມງ ບໍລິການ ດ່ວນ')}</Text>
          <TextInput style={styles.inputA} value={f.urgentHours ?? ''} onChangeText={(t) => set('urgentHours', t)} placeholder="08:00–20:00" placeholderTextColor={cnd.ink3} />
        </>)}
      </View>

      <Text style={styles.secH}>{ttStatic('cndAdmin', '📱 ໂອນ QR / ທະນາຄານ (ສຳ ຮອງ)')}</Text>
      <Text style={styles.secS}>{ttStatic('cndAdmin', '💡 ໃຊ້ ຫຼາຍ ທະນາຄານ + QR ແຍກ → ໄປ ແທ໋ບ "💳 ທະນາຄານ / QR". ຊ່ອງ ລຸ່ມ ນີ້ = ຄ່າ ສຳ ຮອງ ເມື່ອ ຍັງ ບໍ່ ມີ ທະນາຄານ.')}</Text>
      <View style={styles.card}>
        <Text style={styles.secS}>{ttStatic('cndAdmin', 'ລູກຄ້າ ໂອນ ເອງ → ຮ້ານ ຢືນຢັນ (ກ່ອນ ຕໍ່ PSP ຈິງ). ໃສ່ ລິ້ງ ຮູບ QR + ຂໍ້ມູນ ບັນຊີ.')}</Text>
        <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ລິ້ງ ຮູບ QR (BCEL One myQR …)')}</Text>
        <TextInput style={styles.inputA} value={f.payQrUrl ?? ''} onChangeText={(t) => set('payQrUrl', t)} placeholder={ttStatic('cndAdmin', 'https://… (ຮູບ QR)')} placeholderTextColor={cnd.ink3} autoCapitalize="none" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Text style={styles.lblA}>{ttStatic('cndAdmin', 'ທະນາຄານ')}</Text><TextInput style={styles.inputA} value={f.bankName ?? ''} onChangeText={(t) => set('bankName', t)} placeholder="BCEL" placeholderTextColor={cnd.ink3} /></View>
          <View style={{ flex: 1 }}><Text style={styles.lblA}>{ttStatic('cndAdmin', 'ເລກ ບັນຊີ')}</Text><TextInput style={styles.inputA} value={f.bankAccount ?? ''} onChangeText={(t) => set('bankAccount', t)} placeholder="xxx-xxxx" placeholderTextColor={cnd.ink3} /></View>
        </View>
        <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ຊື່ ບັນຊີ')}</Text>
        <TextInput style={styles.inputA} value={f.bankAccountName ?? ''} onChangeText={(t) => set('bankAccountName', t)} placeholder="CND ..." placeholderTextColor={cnd.ink3} />
      </View>

      <Pressable style={[styles.addBtn, saved && { backgroundColor: cnd.green }]} onPress={save}><Text style={styles.addBtnTx}>{saved ? ttStatic('cndAdmin', '✓ ບັນທຶກ ແລ້ວ') : ttStatic('cndAdmin', '💾 ບັນທຶກ ການ ຕັ້ງຄ່າ')}</Text></Pressable>
      <Text style={styles.secS}>{ttStatic('cndAdmin', '💡 ຄ່າ ຕິດຕັ້ງ % ຕັ້ງ ຢູ່ ແທ໋ບ "ຄ່າ ຕິດຕັ້ງ" · ຂໍ້ມູນ ນີ້ ສະແດງ ຢູ່ ໜ້າ ຮ້ານ + ໃບ ບິນ')}</Text>
    </>
  );
}

// ── Staff & Roles (RBAC) ─────────────────────────────────────────────────────
function StaffPanel({ roles, staff, onViewAs }: { roles: CndRole[]; staff: CndStaff[]; onViewAs: (k: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [roleKey, setRoleKey] = useState('cashier');
  const [expand, setExpand] = useState<string | null>(null);
  const hasMock = roles.some(isMock) || staff.some(isMock);
  const roleName = (k: string) => roles.find((r) => r.key === k)?.name ?? k;
  const seed = async () => { setBusy(true); try { await seedCndRoles(roles.length); await seedCndStaff(staff.length); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const addS = async () => { if (!name.trim()) return; setBusy(true); try { await addCndStaff({ name, phone, roleKey }); logCndAudit('ເພີ່ມ ພະນັກງານ', name, roleKey); setName(''); setPhone(''); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const toggleSection = (r: CndRole, s: CndSection) => {
    const sections = r.sections.includes(s) ? r.sections.filter((x) => x !== s) : [...r.sections, s];
    logCndAudit('ແກ້ ສິດ role', r.name); saveCndRole(r.key, { sections }).catch(() => {});
  };
  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '🔐 ບົດບາດ & ສິດ (RBAC)')}</Text>
      <Text style={styles.secS}>{ttStatic('cndAdmin', 'ກຳນົດ ວ່າ ແຕ່ ລະ ບົດບາດ ເຂົ້າ ໜ້າ ໃດ ໄດ້ · ກົດ 👁️ ເບິ່ງ ຫຼັງບ້ານ ໃນ ນາມ ບົດບາດ ນັ້ນ')}</Text>
      {roles.length > 0 && <Pressable style={[styles.csvBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => { setBusy(true); syncCndRoleNames().then(() => alert(ttStatic('cndAdmin', 'ອັບເດດ ຊື່ ບົດບາດ ແລ້ວ (🔴 Super-Admin / 🟠 Admin)'))).catch((e) => alert(e?.message ?? String(e))).finally(() => setBusy(false)); }}><Text style={styles.csvTx}>{ttStatic('cndAdmin', '🔄 ຊິງ ຊື່ ບົດບາດ (ຄ່າ ເລີ່ມ ຕົ້ນ)')}</Text></Pressable>}
      {roles.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ບົດບາດ — ກົດ ປຸ່ມ ໃສ່ ຄ່າ ເລີ່ມ ຕົ້ນ ຂ້າງ ລຸ່ມ')}</Text>}
      {roles.map((r) => {
        const open = expand === r.key;
        return (
          <View key={r.key} style={styles.roleCard}>
            <View style={styles.rowHead}>
              <Text style={styles.pName}>{r.name}</Text>
              {r.key === 'owner' && <Text style={styles.ownerPill}>super</Text>}
              <View style={{ flex: 1 }} />
              <Pressable style={styles.viewAsBtn} onPress={() => onViewAs(r.key)}><Text style={styles.viewAsBtnTx}>{ttStatic('cndAdmin', '👁️ ເບິ່ງ')}</Text></Pressable>
            </View>
            <Text style={styles.pMeta}>{r.sections.length} {ttStatic('cndAdmin', 'ໜ້າ')} · {[r.canPos && 'POS', r.canRefund && ttStatic('cndAdmin', 'ຄືນ ເງິນ'), r.canManageStaff && ttStatic('cndAdmin', 'ຈັດການ ຄົນ')].filter(Boolean).join(' · ') || 'ບໍ່ ມີ ສິດ ພິເສດ'}</Text>
            <Pressable onPress={() => setExpand(open ? null : r.key)}><Text style={styles.roleToggle}>{open ? ttStatic('cndAdmin', '▾ ເຊື່ອງ ສິດ') : ttStatic('cndAdmin', '▸ ແກ້ ສິດ')}</Text></Pressable>
            {open && (
              <>
                <View style={styles.permWrap}>
                  {CND_SECTIONS.map((s) => {
                    const on = r.sections.includes(s.k);
                    return <Pressable key={s.k} style={[styles.permChip, on && styles.permOn]} onPress={() => toggleSection(r, s.k)}><Text style={[styles.permTx, on && styles.permTxOn]}>{on ? '✓ ' : ''}{s.label}</Text></Pressable>;
                  })}
                </View>
                <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', '🏬 ໃຊ້ POS')}</Text><Switch value={r.canPos} onValueChange={(v) => { saveCndRole(r.key, { canPos: v }).catch(() => {}); }} trackColor={{ true: cnd.green }} /></View>
                <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', '↩️ ຄືນ ເງິນ ໄດ້')}</Text><Switch value={r.canRefund} onValueChange={(v) => { saveCndRole(r.key, { canRefund: v }).catch(() => {}); }} trackColor={{ true: cnd.green }} /></View>
                <View style={styles.cfgRow}><Text style={styles.cfgL}>{ttStatic('cndAdmin', '🔐 ຈັດການ ພະນັກງານ')}</Text><Switch value={r.canManageStaff} onValueChange={(v) => { saveCndRole(r.key, { canManageStaff: v }).catch(() => {}); }} trackColor={{ true: cnd.green }} /></View>
              </>
            )}
          </View>
        );
      })}

      <Text style={styles.secH}>{ttStatic('cndAdmin', '👥 ພະນັກງານ')}</Text>
      <View style={styles.card}>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={ttStatic('cndAdmin', 'ຊື່ ພະນັກງານ')} placeholderTextColor={cnd.ink3} />
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder={ttStatic('cndAdmin', 'ເບີ ໂທ')} keyboardType="phone-pad" placeholderTextColor={cnd.ink3} />
        <View style={styles.permWrap}>
          {roles.map((r) => <Pressable key={r.key} style={[styles.permChip, roleKey === r.key && styles.permOn]} onPress={() => setRoleKey(r.key)}><Text style={[styles.permTx, roleKey === r.key && styles.permTxOn]}>{r.name}</Text></Pressable>)}
        </View>
        <Pressable style={[styles.addBtn, (busy || !name.trim()) && { opacity: 0.5 }]} disabled={busy || !name.trim()} onPress={addS}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '＋ ເພີ່ມ ພະນັກງານ')}</Text></Pressable>
      </View>
      <View style={styles.seedBar}>
        {!hasMock && <Pressable style={[styles.seedBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={seed}><Text style={styles.seedTx}>{ttStatic('cndAdmin', '🧪 ໃສ່ ຄ່າ ເລີ່ມ ຕົ້ນ (4 ບົດບາດ + ພະນັກງານ)')}</Text></Pressable>}
        {hasMock && <Pressable style={[styles.seedBtn, styles.clearBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => clearCndStaff().catch(() => {})}><Text style={[styles.seedTx, { color: cnd.error }]}>{ttStatic('cndAdmin', '🧹 ລຶບ ຕົວຢ່າງ')}</Text></Pressable>}
      </View>
      {staff.map((s) => (
        <View key={s.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowHead}><Text style={styles.pName}>{s.name}</Text>{isMock(s) && <Text style={styles.mockPill}>🧪</Text>}</View>
            <Text style={styles.pMeta}>{roleName(s.roleKey)}{s.phone ? ` · ${s.phone}` : ''}</Text>
          </View>
          <Switch value={s.active} onValueChange={(v) => { updateCndStaff(s.id, { active: v }).catch(() => {}); }} trackColor={{ true: cnd.green }} />
          <Pressable onPress={() => removeCndStaff(s.id).catch(() => {})} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
        </View>
      ))}
      {staff.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ພະນັກງານ')}</Text>}
    </>
  );
}

// ── Returns / refunds ────────────────────────────────────────────────────────
function Returns({ orders, returns, access, staffName }: { orders: CndOrder[]; returns: CndReturn[]; access: CndAccess; staffName?: string }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<CndOrder | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'cash' | 'qr'>('cash');
  const [busy, setBusy] = useState(false);

  if (!access.canRefund) {
    return (
      <>
        <Text style={styles.secH}>{ttStatic('cndAdmin', '↩️ ຮັບ ຄືນ / ຄືນ ເງິນ')}</Text>
        <View style={styles.noPerm}><Text style={styles.noPermTx}>{ttStatic('cndAdmin', '🔒 ບົດບາດ ນີ້ ບໍ່ ມີ ສິດ ຄືນ ເງິນ — ໃຫ້ ຜູ້ ຈັດການ / ເຈົ້າ ຂອງ ດຳ ເນີນ ການ')}</Text></View>
        <Text style={styles.secH}>{ttStatic('cndAdmin', '📋 ປະຫວັດ ຄືນ')} ({returns.length})</Text>
        {returns.map((r) => <ReturnRow key={r.id} r={r} />)}
      </>
    );
  }

  const t = q.trim().toLowerCase();
  const found = t ? orders.filter((o) => o.number.toLowerCase().includes(t) || (o.phone ?? '').includes(q.trim())).slice(0, 8) : [];
  const lines: CndReturnLine[] = sel ? sel.items.map((it) => ({ productId: it.productId, name: it.name, unit: it.unit, price: it.price, qty: qty[it.productId] || 0, amount: (qty[it.productId] || 0) * it.price })) : [];
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const setQ2 = (id: string, max: number, v: number) => setQty((p) => ({ ...p, [id]: Math.max(0, Math.min(max, v)) }));

  const submit = async () => {
    if (!sel || total <= 0) return;
    setBusy(true);
    try {
      await createCndReturn({ orderId: sel.id, orderNumber: sel.number, lines: lines.filter((l) => l.qty > 0), reason, refundMethod: method, staff: staffName, branchId: getActiveBranchId() });
      logCndAudit('ຮັບ ຄືນ / ຄືນ ເງິນ', sel.number, kip(lines.filter((l) => l.qty > 0).reduce((s, l) => s + l.amount, 0)) + ' ກີບ');
      alert(`${ttStatic('cndAdmin', 'ຄືນ ເງິນ')} ${kip(total)} ${ttStatic('cndAdmin', 'ກີບ ສຳ ເລັດ · stock ຄືນ ແລ້ວ')}`);
      setSel(null); setQty({}); setReason(''); setQ('');
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '↩️ ຮັບ ຄືນ ສິນຄ້າ')}</Text>
      <View style={styles.card}>
        {!sel ? (
          <>
            <TextInput style={styles.inputA} value={q} onChangeText={setQ} placeholder={ttStatic('cndAdmin', '🔍 ຄົ້ນ ບິນ (ເລກ ບິນ / ເບີ ໂທ)')} placeholderTextColor={cnd.ink3} />
            {found.map((o) => <Pressable key={o.id} style={styles.findRow} onPress={() => { setSel(o); setQ(''); }}><Text style={styles.pName}>{o.number}</Text><Text style={styles.pMeta}>{o.customerName || (o.channel === 'pos' ? 'POS' : '—')} · {kipT(o.total)}</Text></Pressable>)}
            {t !== '' && found.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ບໍ່ ພົບ ບິນ')}</Text>}
          </>
        ) : (
          <>
            <View style={styles.rowHead}><Text style={styles.pName}>{ttStatic('cndAdmin', 'ບິນ')} {sel.number}</Text><View style={{ flex: 1 }} /><Pressable onPress={() => { setSel(null); setQty({}); }} hitSlop={8}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable></View>
            {sel.items.map((it) => {
              const cur = qty[it.productId] || 0;
              return (
                <View key={it.productId} style={styles.retLine}>
                  <View style={{ flex: 1 }}><Text style={styles.pName} numberOfLines={1}>{it.name}</Text><Text style={styles.pMeta}>{ttStatic('cndAdmin', 'ຂາຍ')} {it.qty} × {kip(it.price)}</Text></View>
                  <View style={styles.qtyRow}>
                    <Pressable style={styles.qBtn} onPress={() => setQ2(it.productId, it.qty, cur - 1)}><Text style={styles.qBtnTx}>−</Text></Pressable>
                    <Text style={styles.qVal}>{cur}</Text>
                    <Pressable style={styles.qBtn} onPress={() => setQ2(it.productId, it.qty, cur + 1)}><Text style={styles.qBtnTx}>＋</Text></Pressable>
                  </View>
                </View>
              );
            })}
            <TextInput style={styles.inputA} value={reason} onChangeText={setReason} placeholder={ttStatic('cndAdmin', 'ເຫດຜົນ ຄືນ (ຊຳລຸດ / ບໍ່ ພໍໃຈ...)')} placeholderTextColor={cnd.ink3} />
            <View style={styles.modeRow}>
              <Pressable style={[styles.modeChip, method === 'cash' && styles.modeOn]} onPress={() => setMethod('cash')}><Text style={[styles.modeTx, method === 'cash' && styles.modeTxOn]}>{ttStatic('cndAdmin', '💵 ເງິນ ສົດ')}</Text></Pressable>
              <Pressable style={[styles.modeChip, method === 'qr' && styles.modeOn]} onPress={() => setMethod('qr')}><Text style={[styles.modeTx, method === 'qr' && styles.modeTxOn]}>📱 QR</Text></Pressable>
            </View>
            <View style={styles.totRow2}><Text style={styles.totL2}>{ttStatic('cndAdmin', 'ຄືນ ເງິນ ລວມ')}</Text><Text style={styles.totV2}>{kipT(total)}</Text></View>
            <Pressable style={[styles.addBtn, (busy || total <= 0) && { opacity: 0.5 }]} disabled={busy || total <= 0} onPress={submit}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '✓ ຢືນຢັນ ຄືນ ເງິນ + ຄືນ stock')}</Text></Pressable>
          </>
        )}
      </View>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '📋 ປະຫວັດ ຄືນ')} ({returns.length})</Text>
      {returns.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ການ ຄືນ')}</Text>}
      {returns.map((r) => <ReturnRow key={r.id} r={r} />)}
    </>
  );
}
function ReturnRow({ r }: { r: CndReturn }) {
  return (
    <View style={styles.orow}>
      <View style={styles.rowHead}>
        <Text style={styles.onum}>{r.number}{r.orderNumber ? ` · ${ttStatic('cndCommon', 'ບິນ')} ${r.orderNumber}` : ''}</Text>
        <Text style={[styles.ostat, { backgroundColor: cnd.brandSoft, color: cnd.brandDark }]}>−{kip(r.total)}</Text>
        {isMock(r) && <Text style={styles.mockPill}>🧪</Text>}
      </View>
      <Text style={styles.ometa}>{r.lines.reduce((s, l) => s + l.qty, 0)} {ttStatic('cndAdmin', 'ຊິ້ນ')} · {r.refundMethod === 'cash' ? ttStatic('cndAdmin', '💵 ເງິນ ສົດ') : ttStatic('cndAdmin', '📱 QR')}{r.reason ? ` · ${r.reason}` : ''}{r.staff ? ` · ${r.staff}` : ''}</Text>
    </View>
  );
}

// ── Reviews moderation (install-service feedback) ────────────────────────────
function Reviews({ orders }: { orders: CndOrder[] }) {
  const [filter, setFilter] = useState<'all' | 'featured' | 'hidden'>('all');
  const reviewed = orders.filter((o) => o.install && typeof o.install.rating === 'number');
  const shown = reviewed.filter((o) => filter === 'all' ? true : filter === 'featured' ? o.install?.reviewFeatured : o.install?.reviewHidden);
  const avg = reviewed.length ? reviewed.reduce((s, o) => s + (o.install!.rating || 0), 0) / reviewed.length : 0;
  const pub = () => Promise.all([rebuildCndPublicCards(), rebuildCndTechStats()]).catch(() => {});
  const mod = (id: string, patch: any) => { logCndAudit('ຈັດການ ຣີວິວ', 'ຣີວິວ', Object.keys(patch).join(', ')); return updateCndInstall(id, patch).then(pub).catch(() => {}); };
  const reply = (o: CndOrder) => {
    const cur = o.install?.reviewReply || '';
    const r = typeof prompt === 'function' ? prompt(ttStatic('cndAdmin', 'ຄຳ ຕອບ ຂອງ ຮ້ານ:'), cur) : null;
    if (r != null) mod(o.id, { reviewReply: r || undefined });
  };
  return (
    <>
      <View style={styles.statGrid}>
        <Stat k="⭐ ຣີວິວ ທັງ ໝົດ" v={`${reviewed.length}`} />
        <Stat k="★ ຄະແນນ ສະເລ່ຍ" v={avg ? avg.toFixed(1) : '—'} />
        <Stat k="📌 ເດັ່ນ" v={`${reviewed.filter((o) => o.install?.reviewFeatured).length}`} />
      </View>
      <View style={styles.modeRow}>
        {([['all', 'ທັງ ໝົດ'], ['featured', '📌 ເດັ່ນ'], ['hidden', '🙈 ເຊື່ອງ']] as const).map(([k, l]) => (
          <Pressable key={k} style={[styles.modeChip, filter === k && styles.modeOn]} onPress={() => setFilter(k)}><Text style={[styles.modeTx, filter === k && styles.modeTxOn]}>{l}</Text></Pressable>
        ))}
        <Pressable style={styles.csvBtn} onPress={pub}><Text style={styles.csvTx}>{ttStatic('cndAdmin', '🔄 ອັບເດດ ໜ້າ ຮ້ານ')}</Text></Pressable>
      </View>
      <Text style={styles.secS}>{ttStatic('cndAdmin', 'ຣີວິວ ທີ່ ບໍ່ ເຊື່ອງ (+ ຕັ້ງ ເດັ່ນ) ຈະ ສະແດງ ຢູ່ ໜ້າ ຮ້ານ ຜ່ານ public projection')}</Text>
      {shown.map((o) => {
        const it = o.install!;
        return (
          <View key={o.id} style={[styles.card, it.reviewHidden && { opacity: 0.55 }]}>
            <View style={styles.rowHead}>
              <Text style={styles.stars2}>{'★'.repeat(it.rating || 0)}<Text style={{ color: cnd.line2 }}>{'★'.repeat(5 - (it.rating || 0))}</Text></Text>
              {it.reviewFeatured && <Text style={styles.featPill}>{ttStatic('cndAdmin', '📌 ເດັ່ນ')}</Text>}
              {it.reviewHidden && <Text style={styles.hidePill}>{ttStatic('cndAdmin', '🙈 ເຊື່ອງ')}</Text>}
              {isMock(o) && <Text style={styles.mockPill}>🧪</Text>}
            </View>
            {!!it.review && <Text style={styles.reviewTx}>“{it.review}”</Text>}
            <Text style={styles.pMeta}>{o.customerName || '—'} · {ttStatic('cndCommon', 'ຊ່າງ')} {it.techName || 'CND'} · {o.number}</Text>
            {!!it.reviewReply && <Text style={styles.replyTx}>↳ {ttStatic('cndAdmin', 'ຕອບ')}: {it.reviewReply}</Text>}
            <View style={styles.rvBtnRow}>
              <Pressable style={styles.rvBtn} onPress={() => mod(o.id, { reviewFeatured: !it.reviewFeatured })}><Text style={styles.rvBtnTx}>{it.reviewFeatured ? ttStatic('cndAdmin', 'ຍົກ ເລີກ ເດັ່ນ') : ttStatic('cndAdmin', '📌 ຕັ້ງ ເດັ່ນ')}</Text></Pressable>
              <Pressable style={styles.rvBtn} onPress={() => mod(o.id, { reviewHidden: !it.reviewHidden })}><Text style={styles.rvBtnTx}>{it.reviewHidden ? ttStatic('cndAdmin', '👁️ ສະແດງ') : ttStatic('cndAdmin', '🙈 ເຊື່ອງ')}</Text></Pressable>
              <Pressable style={styles.rvBtn} onPress={() => reply(o)}><Text style={styles.rvBtnTx}>{ttStatic('cndAdmin', '💬 ຕອບ')}</Text></Pressable>
              <Pressable style={styles.rvBtn} onPress={() => router.push(`/cnd/order/${o.id}` as any)}><Text style={styles.rvBtnTx}>{ttStatic('cndAdmin', 'ບິນ ›')}</Text></Pressable>
            </View>
          </View>
        );
      })}
      {reviewed.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ຣີວິວ (ມາ ຈາກ ບໍລິການ ຕິດຕັ້ງ ທີ່ ສຳ ເລັດ)')}</Text>}
    </>
  );
}

// ── Customers (CRM, derived from orders) ─────────────────────────────────────
function Customers({ orders }: { orders: CndOrder[] }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<CndCustomer | null>(null);
  const all = useMemo(() => deriveCustomers(orders), [orders]);
  const t = q.trim().toLowerCase();
  const shown = t ? all.filter((c) => c.name.toLowerCase().includes(t) || (c.phone || '').includes(q.trim())) : all;
  const exportCsv = () => {
    const rows: (string | number)[][] = [['ຊື່', 'ເບີ', 'ຈຳນວນ ຊື້', 'ຍອດ ລວມ', 'ຄັ້ງ ຕິດຕັ້ງ', 'ແຕ້ມ', 'ຊື້ ຫຼ້າ ສຸດ']];
    all.forEach((c) => rows.push([c.name, c.phone || '', c.orderCount, c.totalSpent, c.installCount, c.points, new Date(c.lastAt).toLocaleDateString('lo-LA')]));
    downloadCsv('cnd-customers.csv', toCsv(rows));
  };
  return (
    <>
      <View style={styles.statGrid}>
        <Stat k="👤 ລູກຄ້າ" v={`${all.length}`} />
        <Stat k="💰 ຍອດ ລວມ" v={kip(all.reduce((s, c) => s + c.totalSpent, 0))} />
        <Stat k="🎁 ແຕ້ມ ລວມ" v={`${all.reduce((s, c) => s + c.points, 0)}`} />
      </View>
      <View style={styles.seedBar}>
        <View style={{ flex: 1 }}><TextInput style={styles.inputA} value={q} onChangeText={setQ} placeholder={ttStatic('cndAdmin', '🔍 ຄົ້ນ ລູກຄ້າ (ຊື່/ເບີ)')} placeholderTextColor={cnd.ink3} /></View>
        <Pressable style={styles.csvBtn} onPress={exportCsv}><Text style={styles.csvTx}>⬇️ CSV</Text></Pressable>
      </View>
      {shown.map((c) => (
        <Pressable key={c.key} style={styles.row} onPress={() => setSel(c)}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowHead}><Text style={styles.pName}>{c.name}</Text><Text style={[styles.tierPill, { color: c.tier.color, backgroundColor: c.tier.color + '22' }]}>{c.tier.icon} {c.tier.name}</Text>{c.installCount > 0 && <Text style={styles.instPill}>🔧{c.installCount}</Text>}</View>
            <Text style={styles.pMeta}>{c.phone || '—'} · {c.orderCount} {ttStatic('cndCommon', 'ຄັ້ງ')} · 🎁 {c.points} {ttStatic('cndCommon', 'ແຕ້ມ')}</Text>
          </View>
          <Text style={styles.custSpent}>{kip(c.totalSpent)}</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      ))}
      {all.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ລູກຄ້າ (ດຶງ ຈາກ ອໍເດີ ອອນລາຍ)')}</Text>}
      <Modal visible={!!sel} transparent animationType="fade" onRequestClose={() => setSel(null)}>
        <Pressable style={styles.perfBackdrop} onPress={() => setSel(null)}>
          <Pressable style={styles.perfCard} onPress={() => {}}>
            {sel && (
              <>
                <View style={styles.perfHd}><Text style={styles.perfName}>👤 {sel.name}</Text><Pressable onPress={() => setSel(null)} hitSlop={8}><Text style={styles.menuX}>✕</Text></Pressable></View>
                <ScrollView contentContainerStyle={{ padding: 12, gap: 9 }}>
                  <View style={styles.card}>
                    <View style={styles.trAdmin}><Text style={styles.trLa}>{ttStatic('cndAdmin', 'ເບີ ໂທ')}</Text><Text style={styles.trVa}>{sel.phone || '—'}</Text></View>
                    <View style={styles.trAdmin}><Text style={styles.trLa}>{ttStatic('cndAdmin', 'ຈຳນວນ ຊື້')}</Text><Text style={styles.trVa}>{sel.orderCount} ຄັ້ງ</Text></View>
                    <View style={styles.trAdmin}><Text style={styles.trLa}>{ttStatic('cndAdmin', 'ຍອດ ໃຊ້ ຈ່າຍ ລວມ')}</Text><Text style={styles.trVa}>{kipT(sel.totalSpent)}</Text></View>
                    <View style={styles.trAdmin}><Text style={styles.trLa}>{ttStatic('cndAdmin', '🎁 ແຕ້ມ ສະສົມ')}</Text><Text style={styles.trVa}>{sel.points}</Text></View>
                    <View style={styles.trAdmin}><Text style={styles.trLa}>{ttStatic('cndAdmin', 'ໃຊ້ ຊ່າງ ຕິດຕັ້ງ')}</Text><Text style={styles.trVa}>{sel.installCount} ຄັ້ງ</Text></View>
                  </View>
                  {(() => { const { tier, next, toNext, progress } = tierFor(sel.totalSpent); return (
                    <View style={[styles.card, { borderColor: tier.color, borderWidth: 1.5 }]}>
                      <View style={styles.rowHead}><Text style={[styles.tierBig, { color: tier.color }]}>{tier.icon} {ttStatic('cndAdmin', 'ລະດັບ')} {tier.name}</Text>{tier.discountPct > 0 && <Text style={styles.tierDisc}>{ttStatic('cndAdmin', 'ສິດ ຫຼຸດ')} {tier.discountPct}%</Text>}</View>
                      {next ? (
                        <>
                          <View style={styles.tierBar}><View style={[styles.tierFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: tier.color }]} /></View>
                          <Text style={styles.pMeta}>{ttStatic('cndAdmin', 'ອີກ')} {kip(toNext)} {ttStatic('cndAdmin', 'ກີບ ຂຶ້ນ ລະດັບ')} {next.icon} {next.name}</Text>
                        </>
                      ) : <Text style={styles.pMeta}>{ttStatic('cndAdmin', '🎉 ລະດັບ ສູງ ສຸດ ແລ້ວ')}</Text>}
                    </View>
                  ); })()}
                  <Text style={styles.secH}>{ttStatic('cndAdmin', '🧾 ປະຫວັດ ຊື້')}</Text>
                  {sel.orders.map((o) => (
                    <Pressable key={o.id} style={styles.row} onPress={() => { setSel(null); router.push(`/cnd/order/${o.id}` as any); }}>
                      <View style={{ flex: 1 }}><View style={styles.rowHead}><Text style={styles.pName}>{o.number}</Text>{!!o.install && <Text style={styles.instPill}>🔧</Text>}</View><Text style={styles.pMeta}>{new Date(o.createdAt).toLocaleDateString('lo-LA')} · {o.items.length} {ttStatic('cndCommon', 'ລາຍການ')}</Text></View>
                      <Text style={styles.custSpent}>{kip(o.total)}</Text><Text style={styles.chev}>›</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Promotions: coupons + storefront banners ─────────────────────────────────
function Promos({ coupons, banners }: { coupons: CndCoupon[]; banners: CndBanner[] }) {
  const [sub, setSub] = useState<'coupons' | 'banners'>('coupons');
  return (
    <>
      <View style={styles.modeRow}>
        <Pressable style={[styles.modeChip, sub === 'coupons' && styles.modeOn]} onPress={() => setSub('coupons')}><Text style={[styles.modeTx, sub === 'coupons' && styles.modeTxOn]}>🎟️ {ttStatic('cndAdmin', 'ຄູປອງ')} ({coupons.length})</Text></Pressable>
        <Pressable style={[styles.modeChip, sub === 'banners' && styles.modeOn]} onPress={() => setSub('banners')}><Text style={[styles.modeTx, sub === 'banners' && styles.modeTxOn]}>🖼️ {ttStatic('cndAdmin', 'ປ້າຍ')} ({banners.length})</Text></Pressable>
      </View>
      {sub === 'coupons' ? <Coupons coupons={coupons} /> : <Banners banners={banners} />}
    </>
  );
}
function cnDateFmt(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function Coupons({ coupons }: { coupons: CndCoupon[] }) {
  const [code, setCode] = useState(''); const [type, setType] = useState<CndCouponType>('pct'); const [value, setValue] = useState(''); const [minSpend, setMinSpend] = useState(''); const [busy, setBusy] = useState(false);
  const [audience, setAudience] = useState<CndCouponAudience>('public'); const [phone, setPhone] = useState(''); const [cap, setCap] = useState(''); const [expiry, setExpiry] = useState(''); const [limit, setLimit] = useState('');
  const hasMock = coupons.some(isMock);
  const num = (s: string) => Number(s.replace(/\D/g, '')) || 0;
  const add = async () => {
    if (!code.trim() || !value) return;
    const exp = parseCouponDate(expiry);
    if (!exp.ok) { alert(ttStatic('cndAdmin', 'ວັນ ໝົດ ອາຍຸ ບໍ່ ຖືກ — ໃຊ້ ຮູບແບບ 31/12/2026 ຫຼື 2026-12-31')); return; }
    const input = { code, type, value: num(value), minSpend: minSpend ? num(minSpend) : undefined, cap: type === 'pct' && cap ? num(cap) : undefined, audience, assignedToPhone: audience === 'personal' ? phone.trim() : undefined, expiresAt: exp.ms, usageLimit: limit ? num(limit) : undefined };
    const err = checkCouponInput(input, coupons);   // duplicate code / % over 100 / bad phone / past date
    if (err) { alert(err); return; }
    setBusy(true);
    try {
      await addCndCoupon(input);
      setCode(''); setValue(''); setMinSpend(''); setCap(''); setExpiry(''); setLimit(''); setPhone('');
    } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const expired = (c: CndCoupon) => !!c.expiresAt && Date.now() > c.expiresAt;
  return (
    <>
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder={ttStatic('cndAdmin', 'ໂຄ້ດ (HELLO10)')} placeholderTextColor={cnd.ink3} autoCapitalize="characters" />
          <View style={styles.modeRow2}>
            <Pressable style={[styles.modeChip, type === 'pct' && styles.modeOn]} onPress={() => setType('pct')}><Text style={[styles.modeTx, type === 'pct' && styles.modeTxOn]}>%</Text></Pressable>
            <Pressable style={[styles.modeChip, type === 'amount' && styles.modeOn]} onPress={() => setType('amount')}><Text style={[styles.modeTx, type === 'amount' && styles.modeTxOn]}>{ttStatic('cndAdmin', 'ກີບ')}</Text></Pressable>
          </View>
        </View>
        <View style={styles.modeRow2}>
          <Pressable style={[styles.modeChip, audience === 'public' && styles.modeOn]} onPress={() => setAudience('public')}><Text style={[styles.modeTx, audience === 'public' && styles.modeTxOn]}>🌐 {ttStatic('cndAdmin', 'ສາທາລະນະ')}</Text></Pressable>
          <Pressable style={[styles.modeChip, audience === 'personal' && styles.modeOn]} onPress={() => setAudience('personal')}><Text style={[styles.modeTx, audience === 'personal' && styles.modeTxOn]}>👤 {ttStatic('cndAdmin', 'ສ່ວນ ຕົວ')}</Text></Pressable>
        </View>
        {audience === 'personal' && <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder={ttStatic('cndAdmin', 'ເບີ ໂທ ຂອງ ຄົນ ທີ່ ມອບ ໃຫ້')} placeholderTextColor={cnd.ink3} />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={groupThousands(value)} onChangeText={(t) => setValue(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={type === 'pct' ? ttStatic('cndAdmin', 'ຫຼຸດ %') : ttStatic('cndAdmin', 'ຫຼຸດ ກີບ')} placeholderTextColor={cnd.ink3} />
          {type === 'pct' && <TextInput style={[styles.input, { flex: 1 }]} value={groupThousands(cap)} onChangeText={(t) => setCap(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={ttStatic('cndAdmin', 'ຫຼຸດ ສູງ ສຸດ (ກີບ)')} placeholderTextColor={cnd.ink3} />}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={groupThousands(minSpend)} onChangeText={(t) => setMinSpend(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={ttStatic('cndAdmin', 'ຊື້ ຂັ້ນ ຕ່ຳ')} placeholderTextColor={cnd.ink3} />
          <TextInput style={[styles.input, { flex: 1 }]} value={limit} onChangeText={(t) => setLimit(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={ttStatic('cndAdmin', 'ຈຳ ກັດ ຄັ້ງ ໃຊ້')} placeholderTextColor={cnd.ink3} />
        </View>
        <TextInput style={styles.input} value={expiry} onChangeText={setExpiry} placeholder={ttStatic('cndAdmin', 'ວັນ ໝົດ ອາຍຸ (31/12/2026)')} placeholderTextColor={cnd.ink3} />
        <Pressable style={[styles.addBtn, (busy || !code.trim() || !value) && { opacity: 0.5 }]} disabled={busy || !code.trim() || !value} onPress={add}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '＋ ເພີ່ມ ຄູປອງ')}</Text></Pressable>
      </View>
      <View style={styles.seedBar}>
        {!hasMock && <Pressable style={styles.seedBtn} onPress={() => seedCndCoupons(coupons.length).catch(() => {})}><Text style={styles.seedTx}>{ttStatic('cndAdmin', '🧪 ໃສ່ ຕົວຢ່າງ')}</Text></Pressable>}
        {hasMock && <Pressable style={[styles.seedBtn, styles.clearBtn]} onPress={() => clearCndCoupons().catch(() => {})}><Text style={[styles.seedTx, { color: cnd.error }]}>{ttStatic('cndAdmin', '🧹 ລຶບ')}</Text></Pressable>}
      </View>
      {coupons.map((c) => {
        const meta: string[] = [];
        meta.push(c.type === 'pct' ? `${ttStatic('cndAdmin', 'ຫຼຸດ')} ${c.value}%${c.cap ? ` (${ttStatic('cndAdmin', 'ສູງ ສຸດ')} ${kip(c.cap)})` : ''}` : `${ttStatic('cndAdmin', 'ຫຼຸດ')} ${kipT(c.value)}`);
        if (c.minSpend) meta.push(`${ttStatic('cndAdmin', 'ຊື້ ≥')} ${kip(c.minSpend)}`);
        if (c.expiresAt) meta.push(`${ttStatic('cndAdmin', 'ໝົດ')} ${cnDateFmt(c.expiresAt)}`);
        meta.push(`${ttStatic('cndAdmin', 'ໃຊ້')} ${c.usedCount}${c.usageLimit ? `/${c.usageLimit}` : ''}`);
        return (
          <View key={c.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <View style={styles.rowHead}>
                <Text style={styles.couponCode}>{c.code}</Text>
                <Text style={styles.audPill}>{c.audience === 'personal' ? `👤${c.assignedToPhone ? ' ' + c.assignedToPhone : ''}` : '🌐'}</Text>
                {expired(c) && <Text style={[styles.mockPill, { color: cnd.error }]}>{ttStatic('cndAdmin', 'ໝົດ ອາຍຸ')}</Text>}
                {isMock(c) && <Text style={styles.mockPill}>🧪</Text>}
              </View>
              <Text style={styles.pMeta}>{meta.join(' · ')}</Text>
            </View>
            <Switch value={c.active} onValueChange={(v) => { updateCndCoupon(c.id, { active: v }).catch(() => {}); }} trackColor={{ true: cnd.green }} />
            <Pressable onPress={() => removeCndCoupon(c.id).catch(() => {})} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
          </View>
        );
      })}
      {coupons.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ຄູປອງ')}</Text>}
    </>
  );
}
function Banners({ banners }: { banners: CndBanner[] }) {
  const hasMock = banners.some(isMock);
  return (
    <>
      <Text style={styles.secS}>{ttStatic('cndAdmin', 'ປ້າຍ ເລື່ອນ ໜ້າ ຮ້ານ — ເປີດ/ປິດ ຫຼື ລຶບ. (ວ່າງ = ໜ້າ ຮ້ານ ໃຊ້ ຄ່າ ເລີ່ມ ຕົ້ນ)')}</Text>
      <View style={styles.seedBar}>
        {!hasMock && <Pressable style={styles.seedBtn} onPress={() => seedCndBanners(banners.length).catch(() => {})}><Text style={styles.seedTx}>{ttStatic('cndAdmin', '🧪 ໃສ່ ປ້າຍ ເລີ່ມ ຕົ້ນ (4)')}</Text></Pressable>}
        {hasMock && <Pressable style={[styles.seedBtn, styles.clearBtn]} onPress={() => clearCndBanners().catch(() => {})}><Text style={[styles.seedTx, { color: cnd.error }]}>{ttStatic('cndAdmin', '🧹 ລຶບ ທັງ ໝົດ')}</Text></Pressable>}
      </View>
      {banners.map((b) => (
        <View key={b.id} style={[styles.bannerRow, { borderLeftColor: b.c1 }]}>
          <Text style={{ fontSize: 26 }}>{b.icon}</Text>
          <View style={{ flex: 1 }}>
            <View style={styles.rowHead}><Text style={styles.pName}>{b.title}</Text>{isMock(b) && <Text style={styles.mockPill}>🧪</Text>}</View>
            <Text style={styles.pMeta}>{b.kicker} · {b.sub}</Text>
          </View>
          <Switch value={b.active} onValueChange={(v) => { updateCndBanner(b.id, { active: v }).catch(() => {}); }} trackColor={{ true: cnd.green }} />
          <Pressable onPress={() => removeCndBanner(b.id).catch(() => {})} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
        </View>
      ))}
      {banners.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ປ້າຍ — ໜ້າ ຮ້ານ ໃຊ້ ຄ່າ ເລີ່ມ ຕົ້ນ')}</Text>}
    </>
  );
}

// ── Price-label + barcode printing ───────────────────────────────────────────
function Labels({ products, storeName }: { products: CndProduct[]; storeName: string }) {
  const [q, setQ] = useState('');
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const t = q.trim().toLowerCase();
  const shown = t ? products.filter((p) => p.name.toLowerCase().includes(t) || (p.sku || '').toLowerCase().includes(t)) : products;
  const setN = (id: string, n: number) => setQtys((m) => ({ ...m, [id]: Math.max(0, n) }));
  const selected = products.filter((p) => (qtys[p.id] || 0) > 0);
  const totalLabels = selected.reduce((s, p) => s + (qtys[p.id] || 0), 0);
  const printSel = () => { if (selected.length) printCndLabels(selected.map((p) => ({ name: p.name, price: p.price, sku: p.sku, unit: p.unit, qty: qtys[p.id] })), storeName); };
  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '🏷️ ພິມ ປ້າຍ ລາຄາ + Barcode')}</Text>
      <Text style={styles.secS}>{ttStatic('cndAdmin', 'ໃສ່ ຈຳນວນ ປ້າຍ ຕໍ່ ສິນຄ້າ → ພິມ (barcode Code128 ຈາກ SKU · ເປີດ ໜ້າ ພິມ ໃໝ່)')}</Text>
      <View style={styles.seedBar}>
        <View style={{ flex: 1 }}><TextInput style={styles.inputA} value={q} onChangeText={setQ} placeholder={ttStatic('cndAdmin', '🔍 ຄົ້ນ ສິນຄ້າ / SKU')} placeholderTextColor={cnd.ink3} /></View>
        <Pressable style={[styles.csvBtn, !selected.length && { opacity: 0.5 }]} disabled={!selected.length} onPress={printSel}><Text style={styles.csvTx}>🖨️ {ttStatic('cndAdmin', 'ພິມ')} ({totalLabels})</Text></Pressable>
      </View>
      {shown.map((p) => {
        const n = qtys[p.id] || 0;
        return (
          <View key={p.id} style={styles.row}>
            <Image source={{ uri: code128DataUri(p.sku || p.name.slice(0, 12)) }} style={styles.bcPreview} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.pName} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.pMeta}>{kipT(p.price)} · SKU {p.sku || '—'}</Text>
            </View>
            <View style={styles.qtyRow}>
              <Pressable style={styles.qBtn} onPress={() => setN(p.id, n - 1)}><Text style={styles.qBtnTx}>−</Text></Pressable>
              <Text style={styles.qVal}>{n}</Text>
              <Pressable style={styles.qBtn} onPress={() => setN(p.id, n + 1)}><Text style={styles.qBtnTx}>＋</Text></Pressable>
            </View>
            <Pressable style={styles.rvBtn} onPress={() => printCndLabels([{ name: p.name, price: p.price, sku: p.sku, unit: p.unit, qty: Math.max(1, n) }], storeName)}><Text style={styles.rvBtnTx}>🖨️</Text></Pressable>
          </View>
        );
      })}
      {products.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ສິນຄ້າ')}</Text>}
    </>
  );
}

// ── Suppliers + Purchase Orders ──────────────────────────────────────────────
function Suppliers({ suppliers, pos, products }: { suppliers: CndSupplier[]; pos: CndPurchaseOrder[]; products: CndProduct[] }) {
  const [sub, setSub] = useState<'suppliers' | 'po'>('suppliers');
  return (
    <>
      <View style={styles.modeRow}>
        <Pressable style={[styles.modeChip, sub === 'suppliers' && styles.modeOn]} onPress={() => setSub('suppliers')}><Text style={[styles.modeTx, sub === 'suppliers' && styles.modeTxOn]}>🏭 {ttStatic('cndAdmin', 'ຜູ້ຂາຍ')} ({suppliers.length})</Text></Pressable>
        <Pressable style={[styles.modeChip, sub === 'po' && styles.modeOn]} onPress={() => setSub('po')}><Text style={[styles.modeTx, sub === 'po' && styles.modeTxOn]}>📥 {ttStatic('cndAdmin', 'ໃບ ສັ່ງ ຊື້')} ({pos.length})</Text></Pressable>
      </View>
      {sub === 'suppliers' ? <SupplierList suppliers={suppliers} /> : <PoList pos={pos} suppliers={suppliers} products={products} />}
    </>
  );
}
function SupplierList({ suppliers }: { suppliers: CndSupplier[] }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const hasMock = suppliers.some(isMock);
  const add = async () => { if (!name.trim()) return; setBusy(true); try { await addCndSupplier({ name, phone, contact }); setName(''); setPhone(''); setContact(''); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  return (
    <>
      <View style={styles.card}>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={ttStatic('cndAdmin', 'ຊື່ ຜູ້ຂາຍ / ບໍລິສັດ')} placeholderTextColor={cnd.ink3} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={phone} onChangeText={setPhone} placeholder={ttStatic('cndAdmin', 'ເບີ ໂທ')} keyboardType="phone-pad" placeholderTextColor={cnd.ink3} />
          <TextInput style={[styles.input, { flex: 1 }]} value={contact} onChangeText={setContact} placeholder={ttStatic('cndAdmin', 'ຜູ້ ຕິດຕໍ່')} placeholderTextColor={cnd.ink3} />
        </View>
        <Pressable style={[styles.addBtn, (busy || !name.trim()) && { opacity: 0.5 }]} disabled={busy || !name.trim()} onPress={add}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '＋ ເພີ່ມ ຜູ້ຂາຍ')}</Text></Pressable>
      </View>
      <View style={styles.seedBar}>
        {!hasMock && <Pressable style={styles.seedBtn} onPress={() => seedCndSuppliers(suppliers.length).catch(() => {})}><Text style={styles.seedTx}>{ttStatic('cndAdmin', '🧪 ໃສ່ ຕົວຢ່າງ')}</Text></Pressable>}
        {hasMock && <Pressable style={[styles.seedBtn, styles.clearBtn]} onPress={() => clearCndSuppliers().catch(() => {})}><Text style={[styles.seedTx, { color: cnd.error }]}>{ttStatic('cndAdmin', '🧹 ລຶບ ຕົວຢ່າງ')}</Text></Pressable>}
      </View>
      {suppliers.map((s) => (
        <View key={s.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowHead}><Text style={styles.pName}>{s.name}</Text>{isMock(s) && <Text style={styles.mockPill}>🧪</Text>}</View>
            <Text style={styles.pMeta}>{[s.contact, s.phone].filter(Boolean).join(' · ') || '—'}</Text>
          </View>
          <Switch value={s.active} onValueChange={(v) => { updateCndSupplier(s.id, { active: v }).catch(() => {}); }} trackColor={{ true: cnd.green }} />
          <Pressable onPress={() => removeCndSupplier(s.id).catch(() => {})} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
        </View>
      ))}
      {suppliers.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ຜູ້ຂາຍ')}</Text>}
    </>
  );
}
function PoList({ pos, suppliers, products }: { pos: CndPurchaseOrder[]; suppliers: CndSupplier[]; products: CndProduct[] }) {
  const [creating, setCreating] = useState(false);
  const payable = pos.filter((p) => p.status === 'received' && !p.paid).reduce((s, p) => s + p.subtotal, 0);
  return (
    <>
      <View style={styles.seedBar}>
        <Pressable style={styles.newBtn} onPress={() => setCreating(true)}><Text style={styles.newTx}>{ttStatic('cndAdmin', '＋ ສ້າງ ໃບ ສັ່ງ ຊື້')}</Text></Pressable>
        <Text style={styles.hint}>{ttStatic('cndAdmin', 'ໜີ້ ຄ້າງ ຈ່າຍ')}: {kip(payable)} {ttStatic('cndAdmin', 'ກີບ')}</Text>
      </View>
      {pos.map((p) => {
        const st = PO_STATUS[p.status];
        return (
          <View key={p.id} style={styles.orow}>
            <View style={styles.rowHead}>
              <Text style={styles.onum}>{p.number}</Text>
              <Text style={[styles.ostat, { backgroundColor: st.bg, color: st.fg }]}>{ttStatic('cndAdmin', st.lao)}</Text>
              {p.status === 'received' && <Text style={[styles.ostat, p.paid ? { backgroundColor: cnd.greenSoft, color: cnd.green } : { backgroundColor: '#fdecec', color: cnd.error }]}>{p.paid ? ttStatic('cndAdmin', 'ຈ່າຍ ແລ້ວ') : ttStatic('cndAdmin', 'ຄ້າງ ຈ່າຍ')}</Text>}
              {isMock(p) && <Text style={styles.mockPill}>🧪</Text>}
            </View>
            <Text style={styles.ometa}>{p.supplierName || '—'} · {p.lines.length} {ttStatic('cndCommon', 'ລາຍການ')} · {kipT(p.subtotal)}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {p.status === 'ordered' && <Pressable style={styles.adv} onPress={() => { if (typeof confirm !== 'function' || confirm(`${ttStatic('cndAdmin', 'ຮັບ')} ${p.number} ${ttStatic('cndAdmin', 'ເຂົ້າ ສາງ?')}`)) { logCndAudit('ຮັບ PO ເຂົ້າ ສາງ', p.number, kip(p.subtotal) + ' ກີບ'); receiveCndPO(p).catch((e) => alert(e?.message ?? String(e))); } }}><Text style={styles.advTx}>{ttStatic('cndAdmin', '📥 ຮັບ ເຂົ້າ ສາງ')}</Text></Pressable>}
              {p.status === 'received' && !p.paid && <Pressable style={styles.adv} onPress={() => { logCndAudit('ໝາຍ PO ຈ່າຍ ແລ້ວ', p.number); setCndPoPaid(p.id, true).catch(() => {}); }}><Text style={styles.advTx}>{ttStatic('cndAdmin', '💵 ໝາຍ ຈ່າຍ ແລ້ວ')}</Text></Pressable>}
              {p.status === 'ordered' && <Pressable style={[styles.adv, { backgroundColor: cnd.surface2 }]} onPress={() => cancelCndPO(p.id).catch(() => {})}><Text style={[styles.advTx, { color: cnd.ink2 }]}>{ttStatic('cndAdmin', 'ຍົກເລີກ')}</Text></Pressable>}
            </View>
          </View>
        );
      })}
      {pos.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ໃບ ສັ່ງ ຊື້')}</Text>}
      <Modal visible={creating} transparent animationType="slide" onRequestClose={() => setCreating(false)}>
        <View style={styles.poBackdrop}><View style={styles.poSheet}><PoCreate suppliers={suppliers} products={products} onClose={() => setCreating(false)} /></View></View>
      </Modal>
    </>
  );
}
function PoCreate({ suppliers, products, onClose }: { suppliers: CndSupplier[]; products: CndProduct[]; onClose: () => void }) {
  const [supId, setSupId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [lines, setLines] = useState<CndPoLine[]>([]);
  const [busy, setBusy] = useState(false);
  const found = q.trim() ? products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const add = (p: CndProduct) => { if (lines.some((l) => l.productId === p.id)) return; const cost = Math.round(p.cost || (p.price || 0) * 0.7); setLines([...lines, { productId: p.id, name: p.name, unit: p.unit || 'ໜ່ວຍ', qty: 1, cost, amount: cost }]); setQ(''); };
  const upd = (id: string, patch: Partial<CndPoLine>) => setLines(lines.map((l) => l.productId === id ? { ...l, ...patch, amount: (patch.qty ?? l.qty) * (patch.cost ?? l.cost) } : l));
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const sup = suppliers.find((s) => s.id === supId);
  const submit = async () => { if (lines.length === 0) return; setBusy(true); try { await createCndPO({ supplierId: supId || undefined, supplierName: sup?.name, lines, branchId: getActiveBranchId() }); logCndAudit('ສ້າງ ໃບ ສັ່ງ ຊື້', sup?.name || 'PO', kip(subtotal) + ' ກີບ'); onClose(); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  return (
    <>
      <View style={styles.perfHd}><Text style={styles.perfName}>{ttStatic('cndAdmin', '＋ ໃບ ສັ່ງ ຊື້ ໃໝ່')}</Text><Pressable onPress={onClose} hitSlop={8}><Text style={styles.menuX}>✕</Text></Pressable></View>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
        <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ຜູ້ຂາຍ')}</Text>
        <View style={styles.permWrap}>{suppliers.map((s) => <Pressable key={s.id} style={[styles.permChip, supId === s.id && styles.permOn]} onPress={() => setSupId(s.id)}><Text style={[styles.permTx, supId === s.id && styles.permTxOn]}>{s.name}</Text></Pressable>)}</View>
        <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ເພີ່ມ ສິນຄ້າ')}</Text>
        <TextInput style={styles.inputA} value={q} onChangeText={setQ} placeholder={ttStatic('cndAdmin', '🔍 ຄົ້ນ ສິນຄ້າ')} placeholderTextColor={cnd.ink3} />
        {found.map((p) => <Pressable key={p.id} style={styles.findRow} onPress={() => add(p)}><Text style={styles.pName} numberOfLines={1}>{p.name}</Text><Text style={styles.pMeta}>{ttStatic('cndAdmin', '＋ ເພີ່ມ')}</Text></Pressable>)}
        {lines.map((l) => (
          <View key={l.productId} style={styles.poLine}>
            <Text style={[styles.pName, { flex: 1 }]} numberOfLines={1}>{l.name}</Text>
            <TextInput style={styles.poIn} value={groupThousands(String(l.qty))} onChangeText={(t) => upd(l.productId, { qty: Number(t.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" />
            <Text style={styles.pMeta}>×</Text>
            <TextInput style={styles.poIn} value={groupThousands(String(l.cost))} onChangeText={(t) => upd(l.productId, { cost: Number(t.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" />
            <Text style={styles.poAmt}>{kip(l.amount)}</Text>
            <Pressable onPress={() => setLines(lines.filter((x) => x.productId !== l.productId))} hitSlop={6}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
          </View>
        ))}
        <View style={styles.totRow2}><Text style={styles.totL2}>{ttStatic('cndAdmin', 'ລວມ')}</Text><Text style={styles.totV2}>{kipT(subtotal)}</Text></View>
        <Pressable style={[styles.addBtn, (busy || lines.length === 0) && { opacity: 0.5 }]} disabled={busy || lines.length === 0} onPress={submit}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '✓ ສ້າງ ໃບ ສັ່ງ ຊື້')}</Text></Pressable>
      </ScrollView>
    </>
  );
}

// ── Finance (P&L + payables + expenses) ──────────────────────────────────────
function Finance({ orders, returns, products, pos, expenses, config }: { orders: CndOrder[]; returns: CndReturn[]; products: CndProduct[]; pos: CndPurchaseOrder[]; expenses: CndExpense[]; config: CndConfig }) {
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('30d');
  const now = Date.now();
  const since = range === 'all' ? 0 : now - (range === '7d' ? 7 : 30) * 86400000;
  const live = orders.filter((o) => o.status !== 'cancelled' && o.createdAt >= since);
  const rets = returns.filter((r) => r.createdAt >= since);
  const sales = live.reduce((s, o) => s + o.total, 0);
  const refunds = rets.reduce((s, r) => s + r.total, 0);
  const net = sales - refunds;
  const costOf = new Map(products.map((p) => [p.id, p.cost || 0]));
  const cogs = live.reduce((s, o) => s + o.items.reduce((a, it) => a + (costOf.get(it.productId) || 0) * it.qty, 0), 0)
    - rets.reduce((s, r) => s + r.lines.reduce((a, l) => a + (costOf.get(l.productId) || 0) * l.qty, 0), 0);
  const gross = net - cogs;
  const installInc = live.reduce((s, o) => s + (o.installFeeTotal || 0), 0);
  const commPct = config.commissionPct ?? 0;
  const commission = Math.round((net * commPct) / 100);
  const exp = expenses.filter((e) => e.at >= since).reduce((s, e) => s + e.amount, 0);
  const netProfit = gross - commission - exp;
  const payables = pos.filter((p) => p.status === 'received' && !p.paid).reduce((s, p) => s + p.subtotal, 0);
  return (
    <>
      <View style={styles.modeRow}>
        {([['7d', '7 ວັນ'], ['30d', '30 ວັນ'], ['all', 'ທັງ ໝົດ']] as const).map(([k, l]) => (
          <Pressable key={k} style={[styles.modeChip, range === k && styles.modeOn]} onPress={() => setRange(k)}><Text style={[styles.modeTx, range === k && styles.modeTxOn]}>{l}</Text></Pressable>
        ))}
      </View>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '💰 ກຳໄລ - ຂາດທຶນ (P&L)')}</Text>
      <View style={styles.card}>
        <PL l={ttStatic('cndAdmin', 'ຍອດ ຂາຍ')} v={sales} />
        <PL l={ttStatic('cndAdmin', 'ຫັກ ຄືນ ເງິນ')} v={-refunds} neg />
        <PL l={ttStatic('cndAdmin', 'ລາຍ ຮັບ ສຸດທິ')} v={net} bold />
        <PL l={ttStatic('cndAdmin', 'ຫັກ ຕົ້ນທຶນ ສິນຄ້າ (COGS)')} v={-cogs} neg />
        <PL l={ttStatic('cndAdmin', 'ກຳໄລ ຂັ້ນ ຕົ້ນ')} v={gross} bold />
        <PL l={`${ttStatic('cndAdmin', 'ຫັກ ຄອມ HomeSang')} (${commPct}%)`} v={-commission} neg />
        <PL l={ttStatic('cndAdmin', 'ຫັກ ຄ່າ ໃຊ້ ຈ່າຍ')} v={-exp} neg />
        <View style={styles.plNet}><Text style={styles.plNetL}>{ttStatic('cndAdmin', 'ກຳໄລ ສຸດທິ')}</Text><Text style={[styles.plNetV, { color: netProfit >= 0 ? cnd.green : cnd.error }]}>{kipT(netProfit)}</Text></View>
      </View>
      <View style={styles.statGrid}>
        <Stat k="🔧 ລາຍ ຮັບ ຕິດຕັ້ງ" v={kip(installInc)} />
        <Stat k="🏭 ໜີ້ PO ຄ້າງ" v={kip(payables)} />
        <Stat k="📉 ຄ່າ ໃຊ້ ຈ່າຍ" v={kip(exp)} />
      </View>
      <ExpensesInline expenses={expenses} />
    </>
  );
}
function PL({ l, v, neg, bold }: { l: string; v: number; neg?: boolean; bold?: boolean }) {
  return (
    <View style={[styles.plRow, bold && styles.plBold]}>
      <Text style={[styles.plL, bold && { fontWeight: '900', color: cnd.ink }]}>{l}</Text>
      <Text style={[styles.plV, neg && { color: cnd.error }, bold && { fontWeight: '900', color: cnd.ink }]}>{kip(v)}</Text>
    </View>
  );
}
function ExpensesInline({ expenses }: { expenses: CndExpense[] }) {
  const [cat, setCat] = useState(EXPENSE_CATS[0]); const [amt, setAmt] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const add = async () => { const a = Number(amt.replace(/\D/g, '')) || 0; if (a <= 0) return; setBusy(true); try { await addCndExpense({ category: cat, amount: a, note }); setAmt(''); setNote(''); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '📉 ຄ່າ ໃຊ້ ຈ່າຍ')}</Text>
      <View style={styles.card}>
        <View style={styles.permWrap}>{EXPENSE_CATS.map((c) => <Pressable key={c} style={[styles.permChip, cat === c && styles.permOn]} onPress={() => setCat(c)}><Text style={[styles.permTx, cat === c && styles.permTxOn]}>{c}</Text></Pressable>)}</View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={groupThousands(amt)} onChangeText={(t) => setAmt(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={ttStatic('cndAdmin', 'ຈຳ ນວນ ເງິນ')} placeholderTextColor={cnd.ink3} />
          <TextInput style={[styles.input, { flex: 1 }]} value={note} onChangeText={setNote} placeholder={ttStatic('cndAdmin', 'ໝາຍເຫດ')} placeholderTextColor={cnd.ink3} />
        </View>
        <Pressable style={[styles.addBtn, (busy || !amt) && { opacity: 0.5 }]} disabled={busy || !amt} onPress={add}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '＋ ບັນທຶກ ຄ່າ ໃຊ້ ຈ່າຍ')}</Text></Pressable>
      </View>
      {expenses.slice(0, 10).map((e) => (
        <View key={e.id} style={styles.row}>
          <View style={{ flex: 1 }}><View style={styles.rowHead}><Text style={styles.pName}>{e.category}</Text>{isMock(e) && <Text style={styles.mockPill}>🧪</Text>}</View>{!!e.note && <Text style={styles.pMeta}>{e.note}</Text>}</View>
          <Text style={styles.pName}>{kip(e.amount)}</Text>
          <Pressable onPress={() => removeCndExpense(e.id).catch(() => {})} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
        </View>
      ))}
    </>
  );
}

// ── Banks / QR (multi-bank) ──────────────────────────────────────────────────
function Banks({ banks }: { banks: CndBank[] }) {
  const [name, setName] = useState(''); const [acc, setAcc] = useState(''); const [accName, setAccName] = useState('');
  const [mid, setMid] = useState(''); const [akey, setAkey] = useState(''); const [aep, setAep] = useState('');
  const [showApi, setShowApi] = useState(false); const [busy, setBusy] = useState(false);
  const hasMock = banks.some(isMock);
  const add = async () => {
    if (!name.trim()) return; setBusy(true);
    try { await addCndBank({ name, accountNo: acc, accountName: accName, apiMerchantId: mid, apiKey: akey, apiEndpoint: aep, order: banks.length + 1 }); logCndAudit('ເພີ່ມ ທະນາຄານ', name); setName(''); setAcc(''); setAccName(''); setMid(''); setAkey(''); setAep(''); }
    catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '💳 ທະນາຄານ / QR')}</Text>
      <Text style={styles.secS}>{ttStatic('cndAdmin', 'ເພີ່ມ ໄດ້ ຫຼາຍ ທະນາຄານ · ໃນ checkout QR ຈະ ໂຜ່ ຕອນ ລູກຄ້າ ເລືອກ ທະນາຄານ · ຊ່ອງ API ໄວ້ ຕໍ່ PSP ພາຍ ໜ້າ')}</Text>
      <View style={styles.card}>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={ttStatic('cndAdmin', 'ຊື່ ທະນາຄານ (BCEL / JDB …)')} placeholderTextColor={cnd.ink3} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={acc} onChangeText={setAcc} placeholder={ttStatic('cndAdmin', 'ເລກ ບັນຊີ')} placeholderTextColor={cnd.ink3} />
          <TextInput style={[styles.input, { flex: 1 }]} value={accName} onChangeText={setAccName} placeholder={ttStatic('cndAdmin', 'ຊື່ ບັນຊີ')} placeholderTextColor={cnd.ink3} />
        </View>
        <Pressable onPress={() => setShowApi((v) => !v)}><Text style={styles.apiToggle}>{showApi ? '▾' : '▸'} {ttStatic('cndAdmin', 'ຕັ້ງຄ່າ API ຕໍ່ ທະນາຄານ (ບໍ່ ບັງຄັບ)')}</Text></Pressable>
        {showApi && (
          <>
            <TextInput style={styles.input} value={mid} onChangeText={setMid} placeholder="Merchant ID" placeholderTextColor={cnd.ink3} autoCapitalize="none" />
            <TextInput style={styles.input} value={akey} onChangeText={setAkey} placeholder="API Key" placeholderTextColor={cnd.ink3} autoCapitalize="none" />
            <TextInput style={styles.input} value={aep} onChangeText={setAep} placeholder="API Endpoint (URL)" placeholderTextColor={cnd.ink3} autoCapitalize="none" />
          </>
        )}
        <Pressable style={[styles.addBtn, (busy || !name.trim()) && { opacity: 0.5 }]} disabled={busy || !name.trim()} onPress={add}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '＋ ເພີ່ມ ທະນາຄານ')}</Text></Pressable>
      </View>
      <View style={styles.seedBar}>
        {!hasMock && <Pressable style={styles.seedBtn} onPress={() => seedCndBanks(banks.length).catch(() => {})}><Text style={styles.seedTx}>{ttStatic('cndAdmin', '🧪 ໃສ່ ຕົວຢ່າງ')}</Text></Pressable>}
        {hasMock && <Pressable style={[styles.seedBtn, styles.clearBtn]} onPress={() => clearCndBanks().catch(() => {})}><Text style={[styles.seedTx, { color: cnd.error }]}>{ttStatic('cndAdmin', '🧹 ລຶບ')}</Text></Pressable>}
      </View>
      {banks.map((b) => (
        <View key={b.id} style={styles.card}>
          <View style={styles.rowHead}>
            <Text style={styles.pName}>{b.name}</Text>{isMock(b) && <Text style={styles.mockPill}>🧪</Text>}
            <View style={{ flex: 1 }} />
            <Switch value={b.active} onValueChange={(v) => { updateCndBank(b.id, { active: v }).catch(() => {}); }} trackColor={{ true: cnd.green }} />
            <Pressable onPress={() => removeCndBank(b.id).catch(() => {})} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
          </View>
          <Text style={styles.pMeta}>{[b.accountNo, b.accountName].filter(Boolean).join(' · ') || '—'}{b.apiKey ? ' · 🔑 API' : ''}</Text>
          <Text style={styles.lblA}>{ttStatic('cndAdmin', 'ຮູບ QR ຂອງ ທະນາຄານ ນີ້')}</Text>
          <PhotoPicker photos={b.qrUrl ? [b.qrUrl] : []} onChange={(u) => updateCndBank(b.id, { qrUrl: u[0] || '' }).catch(() => {})} pathPrefix="cnd/banks" max={1} />
        </View>
      ))}
      {banks.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ທະນາຄານ')}</Text>}
    </>
  );
}

// ── Delivery zones + fees ────────────────────────────────────────────────────
function DeliveryZones({ zones }: { zones: CndZone[] }) {
  const [name, setName] = useState(''); const [fee, setFee] = useState(''); const [tfee, setTfee] = useState(''); const [eta, setEta] = useState(''); const [busy, setBusy] = useState(false);
  const hasMock = zones.some(isMock);
  const add = async () => { if (!name.trim()) return; setBusy(true); try { await addCndZone({ name, fee: Number(fee.replace(/\D/g, '')) || 0, techFee: Number(tfee.replace(/\D/g, '')) || 0, eta, order: zones.length + 1 }); setName(''); setFee(''); setTfee(''); setEta(''); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '🚚 ເຂດ ຈັດ ສົ່ງ + ຄ່າ ສົ່ງ')}</Text>
      <Text style={styles.secS}>{ttStatic('cndAdmin', 'ລູກຄ້າ ເລືອກ ເຂດ ຕອນ checkout → ຄິດ ຄ່າ ສົ່ງ ຕາມ ເຂດ (ວ່າງ = ໃຊ້ ຄ່າ ສົ່ງ flat ໃນ ຕັ້ງຄ່າ)')}</Text>
      <View style={styles.card}>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={ttStatic('cndAdmin', 'ຊື່ ເຂດ (ເຊ່ນ ໃນ ເມືອງ)')} placeholderTextColor={cnd.ink3} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={groupThousands(fee)} onChangeText={(t) => setFee(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={ttStatic('cndAdmin', 'ຄ່າ ສົ່ງ (ກີບ)')} placeholderTextColor={cnd.ink3} />
          <TextInput style={[styles.input, { flex: 1 }]} value={groupThousands(tfee)} onChangeText={(t) => setTfee(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={ttStatic('cndAdmin', '🔧 ຄ່າ ເດີນທາງ ຊ່າງ')} placeholderTextColor={cnd.ink3} />
        </View>
        <TextInput style={styles.input} value={eta} onChangeText={setEta} placeholder={ttStatic('cndAdmin', 'ໄລຍະ ເວລາ (1–2 ຊົ່ວໂມງ)')} placeholderTextColor={cnd.ink3} />
        <Pressable style={[styles.addBtn, (busy || !name.trim()) && { opacity: 0.5 }]} disabled={busy || !name.trim()} onPress={add}><Text style={styles.addBtnTx}>{ttStatic('cndAdmin', '＋ ເພີ່ມ ເຂດ')}</Text></Pressable>
      </View>
      <View style={styles.seedBar}>
        {!hasMock && <Pressable style={styles.seedBtn} onPress={() => seedCndZones(zones.length).catch(() => {})}><Text style={styles.seedTx}>{ttStatic('cndAdmin', '🧪 ໃສ່ ເຂດ ຕົວຢ່າງ (5)')}</Text></Pressable>}
        {hasMock && <Pressable style={[styles.seedBtn, styles.clearBtn]} onPress={() => clearCndZones().catch(() => {})}><Text style={[styles.seedTx, { color: cnd.error }]}>{ttStatic('cndAdmin', '🧹 ລຶບ')}</Text></Pressable>}
      </View>
      {zones.map((z) => (
        <View key={z.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowHead}><Text style={styles.pName}>{z.name}</Text>{isMock(z) && <Text style={styles.mockPill}>🧪</Text>}</View>
            <Text style={styles.pMeta}>{z.eta || '—'}{z.techFee ? ` · 🔧 ${ttStatic('cndCommon', 'ຊ່າງ')} ${kip(z.techFee)}` : ''}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Text style={styles.lblA}>{ttStatic('cndAdmin', '🔧 ຄ່າ ເດີນທາງ ຊ່າງ')}</Text>
              <ZoneTechFee z={z} />
            </View>
          </View>
          <Text style={styles.custSpent}>{z.fee === 0 ? ttStatic('cndAdmin', 'ຟຣີ') : kip(z.fee)}</Text>
          <Switch value={z.active} onValueChange={(v) => { updateCndZone(z.id, { active: v }).catch(() => {}); }} trackColor={{ true: cnd.green }} />
          <Pressable onPress={() => removeCndZone(z.id).catch(() => {})} hitSlop={8} style={styles.del}><Text style={{ color: cnd.error, fontWeight: '800' }}>✕</Text></Pressable>
        </View>
      ))}
      {zones.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ເຂດ — ໃຊ້ ຄ່າ ສົ່ງ flat ໃນ ຕັ້ງຄ່າ')}</Text>}
    </>
  );
}
// per-zone tech travel fee — money, so it shows 1,000-separators while typing
function ZoneTechFee({ z }: { z: CndZone }) {
  const [v, setV] = useState(z.techFee ? String(z.techFee) : '');
  useEffect(() => setV(z.techFee ? String(z.techFee) : ''), [z.techFee]);
  const save = () => updateCndZone(z.id, { techFee: Number(v.replace(/\D/g, '')) || 0 }).catch(() => {});
  return (
    <TextInput style={[styles.pctIn, { minWidth: 90 }]} value={groupThousands(v)} onChangeText={(t) => setV(t.replace(/\D/g, ''))} onBlur={save} keyboardType="number-pad" placeholder="0" placeholderTextColor={cnd.ink3} />
  );
}

// ── Audit log viewer ─────────────────────────────────────────────────────────
function AuditPanel({ logs }: { logs: CndAuditLog[] }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const shown = t ? logs.filter((l) => (l.actor + l.action + l.target + (l.detail || '')).toLowerCase().includes(t)) : logs;
  const fmt = (ms: number) => ms ? new Date(ms).toLocaleString('lo-LA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  return (
    <>
      <Text style={styles.secH}>{ttStatic('cndAdmin', '📋 ບັນທຶກ ການ ເຮັດ ວຽກ')} ({logs.length})</Text>
      <Text style={styles.secS}>{ttStatic('cndAdmin', 'ໃຜ ເຮັດ ຫຍັງ ເມື່ອ ໃດ — ບັນທຶກ ອັດຕະໂນມັດ, ໃໝ່ ສຸດ ກ່ອນ')}</Text>
      <TextInput style={styles.inputA} value={q} onChangeText={setQ} placeholder={ttStatic('cndAdmin', '🔍 ຄົ້ນ (ຄົນ / ການ ກະທຳ / ເປົ້າ ໝາຍ)')} placeholderTextColor={cnd.ink3} />
      {shown.map((l) => (
        <View key={l.id} style={styles.auditRow}>
          <View style={styles.auditDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.auditAction}>{l.action} · <Text style={styles.auditTarget}>{l.target}</Text></Text>
            {!!l.detail && <Text style={styles.pMeta}>{l.detail}</Text>}
            <Text style={styles.auditMeta}>👤 {l.actor} · {fmt(l.at)}</Text>
          </View>
        </View>
      ))}
      {logs.length === 0 && <Text style={styles.none}>{ttStatic('cndAdmin', 'ຍັງ ບໍ່ ມີ ບັນທຶກ — ການ ກະທຳ ຈະ ຖືກ ບັນທຶກ ອັດຕະໂນມັດ')}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cnd.bg },
  gate: { flex: 1, backgroundColor: cnd.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  gateCard: { width: '100%', maxWidth: 360, backgroundColor: cnd.surface, borderRadius: 16, borderWidth: 1, borderColor: cnd.line, padding: 24, alignItems: 'center', gap: 12 },
  gateLogo: { fontSize: 20, fontWeight: '800', color: cnd.brand },
  gateTitle: { fontSize: 15, fontWeight: '700', color: cnd.ink, textAlign: 'center', marginTop: 4 },
  gateMsg: { fontSize: 13, color: cnd.ink2, textAlign: 'center', lineHeight: 20 },
  gateBtn: { backgroundColor: cnd.brand, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 6, alignSelf: 'stretch', alignItems: 'center' },
  gateBtnTx: { color: cnd.white, fontSize: 15, fontWeight: '700' },
  gateLink: { paddingVertical: 8 },
  gateLinkTx: { color: cnd.ink2, fontSize: 13, fontWeight: '600' },
  content: { flex: 1 },
  body: { padding: 12, gap: 9 },
  topAccent: { height: 3, backgroundColor: cnd.brand },
  posBtn: { backgroundColor: cnd.brand, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  posTx: { color: cnd.white, fontWeight: '800', fontSize: 12.5 },
  // wide-screen left sidebar
  rootRow: { flex: 1, flexDirection: 'row', backgroundColor: cnd.bg },
  sidebar: { width: 214, backgroundColor: cnd.steel, paddingTop: 8 },
  sidebarBrand: { color: cnd.white, fontWeight: '800', fontSize: 15, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: cnd.steel2 },
  roleBadge: { color: cnd.yellow, fontSize: 12, fontWeight: '800', paddingHorizontal: 16, paddingTop: 8 },
  navGroup: { fontSize: 12, color: '#9fb0c2', textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 3, letterSpacing: 0.5, fontWeight: '700' },
  navItem: { paddingHorizontal: 16, paddingVertical: 7 },
  navItemActive: { backgroundColor: cnd.brand },
  navText: { color: '#cdd7e2', fontSize: 13 },
  navTextActive: { color: cnd.white, fontWeight: '700' },
  // two-level nav: sidebar shows groups; sub-items are page-top tabs
  sideGroup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 11, borderLeftWidth: 3, borderLeftColor: 'transparent' },
  sideGroupOn: { backgroundColor: cnd.steel2, borderLeftColor: cnd.brand },
  sideGroupTx: { color: '#cdd7e2', fontSize: 13.5, fontWeight: '700' },
  sideGroupTxOn: { color: cnd.white },
  sideGroupN: { color: '#8194a8', fontSize: 12, fontWeight: '700' },
  contentCol: { flex: 1 },
  pageTabs: { backgroundColor: cnd.surface, borderBottomWidth: 1, borderBottomColor: cnd.line },
  pageTabsRow: { gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  pageTab: { backgroundColor: cnd.surface2, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 8 },
  pageTabOn: { backgroundColor: cnd.brand },
  pageTabTx: { color: cnd.ink2, fontSize: 13, fontWeight: '700' },
  pageTabTxOn: { color: cnd.white },
  posSide: { margin: 10, backgroundColor: cnd.brand, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  posSideTx: { color: cnd.white, fontWeight: '800', fontSize: 13 },
  exit: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: cnd.steel2 },
  exitText: { color: '#9fb0c2', fontSize: 12.5, fontWeight: '600' },
  // footer
  footer: { backgroundColor: cnd.steel, borderTopWidth: 2, borderTopColor: cnd.brand },
  footRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 4, columnGap: 12, paddingHorizontal: 16, paddingVertical: 9 },
  footBrand: { color: '#e5e7eb', fontSize: 12.5, fontWeight: '700' },
  footBrandO: { color: cnd.brand },
  footRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footMuted: { color: '#9fb0c2', fontSize: 12 },
  footLink: { color: cnd.yellow, fontSize: 12, fontWeight: '700' },
  // narrow header
  hdr: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: cnd.steel, paddingHorizontal: 10, paddingVertical: 9 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: cnd.steel2, alignItems: 'center', justifyContent: 'center' },
  iconTxt: { fontSize: 15 },
  hdrTitle: { flex: 1, color: cnd.white, fontWeight: '800', fontSize: 15 },
  // level-1 group tabs
  groupTabs: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E2A38' },
  burger: { paddingHorizontal: 12, paddingVertical: 10, borderRightWidth: 1, borderRightColor: cnd.steel2 },
  burgerText: { color: cnd.white, fontSize: 20 },
  groupTabsRow: { alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  groupTab: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  groupTabOn: { borderBottomColor: cnd.brand },
  groupTabText: { color: '#cdd7e2', fontSize: 13.5 },
  groupTabTextOn: { color: cnd.white, fontWeight: '700' },
  // level-2 chips
  chipBar: { backgroundColor: cnd.surface2, borderBottomWidth: 1, borderBottomColor: cnd.line },
  chipRow: { gap: 6, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center' },
  chip: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: cnd.brand, borderColor: cnd.brand },
  chipText: { fontSize: 12, color: cnd.ink2, fontWeight: '600' },
  chipTextOn: { color: cnd.white, fontWeight: '700' },
  // ☰ overlay menu
  backdrop: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)' },
  menu: { alignSelf: 'flex-start', maxHeight: '92%', width: 208, maxWidth: '86%', backgroundColor: cnd.steel, borderBottomRightRadius: 14, overflow: 'hidden', paddingBottom: 8 },
  menuScroll: { flexShrink: 1 },
  menuHd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: cnd.steel2 },
  menuHdText: { color: cnd.white, fontWeight: '800', fontSize: 14 },
  menuX: { color: '#9fb0c2', fontSize: 15 },
  menuGrp: { fontSize: 12, color: '#9fb0c2', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, fontWeight: '700' },
  menuItem: { paddingHorizontal: 16, paddingVertical: 7 },
  menuItemOn: { backgroundColor: cnd.brand },
  menuItemText: { color: '#cdd7e2', fontSize: 13 },
  menuItemTextOn: { color: cnd.white, fontWeight: '700' },
  // tech performance modal
  perfBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 14 },
  perfCard: { backgroundColor: cnd.bg, borderRadius: 16, overflow: 'hidden', maxHeight: '88%', maxWidth: 560, width: '100%', alignSelf: 'center' },
  perfHd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13, backgroundColor: cnd.steel },
  perfName: { color: cnd.white, fontWeight: '800', fontSize: 15 },
  // view-as banner
  viewAsBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: cnd.steel, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  viewAsTx: { color: cnd.white, fontSize: 12.5, fontWeight: '800' },
  viewAsBack: { color: cnd.yellow, fontSize: 12, fontWeight: '800' },
  // roles
  roleCard: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 12, gap: 3 },
  ownerPill: { fontSize: 12, fontWeight: '800', color: cnd.brandDark, backgroundColor: cnd.brandSoft, borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7, overflow: 'hidden' },
  viewAsBtn: { backgroundColor: cnd.steel, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 11 },
  viewAsBtnTx: { color: cnd.white, fontSize: 12, fontWeight: '800' },
  roleToggle: { fontSize: 12, fontWeight: '800', color: cnd.brand, marginTop: 4 },
  permWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  permChip: { borderWidth: 1, borderColor: cnd.line, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: cnd.surface2 },
  permOn: { backgroundColor: cnd.brandSoft, borderColor: cnd.brand },
  permTx: { fontSize: 12, fontWeight: '700', color: cnd.ink2 },
  permTxOn: { color: cnd.brandDark },
  noPerm: { backgroundColor: cnd.surface2, borderWidth: 1, borderColor: cnd.line, borderRadius: 11, padding: 16, alignItems: 'center' },
  noPermTx: { fontSize: 13, fontWeight: '700', color: cnd.ink2, textAlign: 'center' },
  // returns
  retLine: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: cnd.line, paddingVertical: 8 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: cnd.surface2, borderWidth: 1, borderColor: cnd.line, alignItems: 'center', justifyContent: 'center' },
  qBtnTx: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  qVal: { minWidth: 26, textAlign: 'center', fontSize: 15, fontWeight: '900', color: cnd.ink },
  totRow2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: cnd.line, paddingTop: 9, marginTop: 2 },
  totL2: { fontSize: 13.5, fontWeight: '800', color: cnd.ink },
  totV2: { fontSize: 15, fontWeight: '900', color: cnd.brandDark },
  // purchase order create sheet
  poBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  poSheet: { backgroundColor: cnd.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden', maxHeight: '90%' },
  poLine: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 9, padding: 8 },
  poIn: { borderWidth: 1, borderColor: cnd.line, borderRadius: 7, paddingVertical: 5, paddingHorizontal: 8, fontSize: 13, color: cnd.ink, backgroundColor: cnd.surface, minWidth: 54, textAlign: 'center' },
  poAmt: { fontSize: 12.5, fontWeight: '900', color: cnd.brandDark, minWidth: 60, textAlign: 'right' },
  // finance P&L
  plRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  plBold: { borderTopWidth: 1, borderTopColor: cnd.line, marginTop: 2, paddingTop: 8 },
  plL: { fontSize: 12.5, color: cnd.ink2, fontWeight: '600', flex: 1 },
  plV: { fontSize: 13, fontWeight: '700', color: cnd.ink },
  plNet: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cnd.surface2, borderRadius: 9, padding: 11, marginTop: 8 },
  plNetL: { fontSize: 14, fontWeight: '900', color: cnd.ink },
  plNetV: { fontSize: 15, fontWeight: '900' },
  // CRM + promos
  custSpent: { fontSize: 14, fontWeight: '900', color: cnd.brandDark },
  csvBtn: { backgroundColor: cnd.steel, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 13, alignSelf: 'stretch', justifyContent: 'center' },
  csvTx: { color: cnd.white, fontWeight: '800', fontSize: 12.5 },
  modeRow2: { flexDirection: 'row', gap: 6 },
  couponCode: { fontSize: 14, fontWeight: '900', color: cnd.brandDark, letterSpacing: 1 },
  reviewBox: { marginTop: 6, backgroundColor: '#FFF8E6', borderRadius: 9, padding: 9, gap: 3, borderWidth: 1, borderColor: '#F3DDA0' },
  reviewT: { fontSize: 12.5, fontWeight: '900', color: '#8A5A00' },
  reviewR: { fontSize: 12, color: '#6B4A00' },
  reviewBtn: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: '#9A6B00', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6 },
  reviewBtnTx: { color: '#fff', fontWeight: '800', fontSize: 12 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderLeftWidth: 4, borderRadius: 11, padding: 12 },
  // reviews
  stars2: { fontSize: 15, color: cnd.yellow, fontWeight: '900', letterSpacing: 1 },
  featPill: { fontSize: 12, fontWeight: '800', color: cnd.brandDark, backgroundColor: cnd.brandSoft, borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7, overflow: 'hidden' },
  hidePill: { fontSize: 12, fontWeight: '800', color: cnd.ink3, backgroundColor: cnd.surface2, borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7, overflow: 'hidden' },
  reviewTx: { fontSize: 13.5, fontStyle: 'italic', color: cnd.ink, marginTop: 4 },
  replyTx: { fontSize: 12.5, color: cnd.green, backgroundColor: cnd.greenSoft, borderRadius: 7, padding: 7, marginTop: 4 },
  rvBtnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  rvBtn: { backgroundColor: cnd.surface2, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 11 },
  rvBtnTx: { fontSize: 12, fontWeight: '800', color: cnd.ink2 },
  // loyalty tiers
  tierPill: { fontSize: 12, fontWeight: '800', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7, overflow: 'hidden' },
  tierBig: { fontSize: 15, fontWeight: '900', flex: 1 },
  tierDisc: { fontSize: 12, fontWeight: '800', color: cnd.green, backgroundColor: cnd.greenSoft, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8, overflow: 'hidden' },
  tierBar: { height: 8, backgroundColor: cnd.surface2, borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  tierFill: { height: '100%', borderRadius: 4 },
  // audit log
  auditRow: { flexDirection: 'row', gap: 10, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 10, padding: 11 },
  auditDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: cnd.brand, marginTop: 5 },
  auditAction: { fontSize: 13, fontWeight: '800', color: cnd.ink },
  auditTarget: { fontSize: 13, fontWeight: '600', color: cnd.ink2 },
  auditMeta: { fontSize: 12, color: cnd.ink3, marginTop: 3, fontWeight: '600' },
  // labels / barcode
  bcPreview: { width: 74, height: 34, backgroundColor: '#fff', borderRadius: 4, borderWidth: 1, borderColor: cnd.line },
  apiToggle: { fontSize: 12.5, fontWeight: '800', color: cnd.blue, paddingVertical: 4 },
  seedBar: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  newBtn: { backgroundColor: cnd.brand, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
  newTx: { color: cnd.white, fontWeight: '800', fontSize: 12.5 },
  edit: { fontSize: 15 },
  segRow: { flexDirection: 'row', gap: 6 },
  seg: { flex: 1, borderWidth: 1, borderColor: cnd.line, borderRadius: 8, paddingVertical: 8, alignItems: 'center', backgroundColor: cnd.surface2 },
  segOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  segTx: { fontSize: 12, fontWeight: '700', color: cnd.ink2 },
  segTxOn: { color: cnd.white },
  subAddBtn: { backgroundColor: cnd.surface2, borderWidth: 1, borderColor: cnd.line, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  subAddTx: { fontSize: 12, fontWeight: '800', color: cnd.brandDark },
  bigSeed: { flex: 1, backgroundColor: '#fffbeb', borderColor: cnd.yellow, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' },
  bigSeedTx: { fontSize: 13, fontWeight: '800', color: '#b45309', textAlign: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: 100, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 11, padding: 12, position: 'relative' },
  statK: { fontSize: 12, color: cnd.ink3, fontWeight: '700' },
  statV: { fontSize: 15, fontWeight: '900', color: cnd.ink, marginTop: 3 },
  statArrow: { position: 'absolute', top: 8, right: 10, color: cnd.ink3, fontSize: 15, fontWeight: '900' },
  chartCard: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 14 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barTrack: { width: '100%', flex: 1, justifyContent: 'flex-end', backgroundColor: cnd.surface2, borderRadius: 5 },
  bar: { width: '100%', backgroundColor: cnd.brand, borderRadius: 5, minHeight: 4 },
  barLbl: { fontSize: 12, color: cnd.ink3, marginTop: 5, fontWeight: '700' },
  alertCard: { backgroundColor: '#fdecec', borderWidth: 1, borderColor: '#f6c6c2', borderRadius: 11, padding: 12 },
  alertTx: { fontSize: 12.5, fontWeight: '800', color: '#98211b' },
  bsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  bsRk: { width: 20, height: 20, borderRadius: 6, backgroundColor: cnd.brandSoft, color: cnd.brandDark, fontWeight: '900', fontSize: 12, textAlign: 'center', lineHeight: 20, overflow: 'hidden' },
  bsNm: { flex: 1, fontSize: 13, fontWeight: '600', color: cnd.ink },
  bsQt: { fontSize: 14, fontWeight: '900', color: cnd.ink },
  shiftRow: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 11, padding: 12, gap: 4 },
  shiftDate: { flex: 1, fontSize: 13, fontWeight: '800', color: cnd.ink },
  shiftMeta: { fontSize: 12, color: cnd.ink3 },
  overPill: { fontSize: 12, fontWeight: '800', borderRadius: 5, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' },
  zBox: { marginTop: 6, backgroundColor: cnd.surface2, borderRadius: 8, padding: 10, gap: 2 },
  trAdmin: { flexDirection: 'row', justifyContent: 'space-between' },
  trLa: { fontSize: 12, color: cnd.ink2 },
  trVa: { fontSize: 12, color: cnd.ink, fontWeight: '700' },
  modeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  urgentAlert: { backgroundColor: '#fdecec', color: cnd.error, fontWeight: '900', fontSize: 12.5, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8, overflow: 'hidden' },
  schDay: { width: 56, alignItems: 'center', borderWidth: 1, borderColor: cnd.line, borderRadius: 10, paddingVertical: 7, backgroundColor: cnd.surface, position: 'relative' },
  schDayOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  schDayD: { fontSize: 15, fontWeight: '900', color: cnd.ink },
  schDayM: { fontSize: 12, color: cnd.ink3 },
  schBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: cnd.brand, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  schBadgeTx: { color: '#fff', fontSize: 12, fontWeight: '900' },
  schJob: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 12, marginTop: 8, gap: 4 },
  schTime: { fontSize: 14, fontWeight: '900', color: cnd.ink },
  schCust: { fontSize: 13, color: cnd.ink2 },
  schTech: { fontSize: 12.5, color: cnd.ink },
  schBtnRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  schBtn: { flex: 1, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  schBtnTx: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  modeChip: { flex: 1, borderWidth: 1, borderColor: cnd.line, borderRadius: 9, paddingVertical: 9, alignItems: 'center', backgroundColor: cnd.surface },
  modeOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  modeTx: { fontSize: 13, fontWeight: '800', color: cnd.ink2 },
  modeTxOn: { color: cnd.white },
  lblA: { fontSize: 12, fontWeight: '700', color: cnd.ink2, marginBottom: 4 },
  assessBtn: { marginTop: 8, backgroundColor: cnd.blueSoft, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  assessBtnT: { color: cnd.blue, fontWeight: '800', fontSize: 12.5 },
  inputA: { borderWidth: 1, borderColor: cnd.line, borderRadius: 9, padding: 10, fontSize: 14, color: cnd.ink, backgroundColor: cnd.surface },
  findRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: cnd.line },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 10, padding: 10 },
  movePill: { fontSize: 12, fontWeight: '800', borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7, overflow: 'hidden' },
  moveN: { flex: 1, fontSize: 12.5, color: cnd.ink, fontWeight: '600' },
  moveQ: { fontSize: 14, fontWeight: '900' },
  brRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  brL: { fontSize: 12.5, fontWeight: '800', color: cnd.ink2 },
  brChip: { borderWidth: 1, borderColor: cnd.line, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: cnd.surface, maxWidth: 200 },
  brOn: { backgroundColor: cnd.steel, borderColor: cnd.steel },
  brTx: { fontSize: 12, fontWeight: '700', color: cnd.ink2 },
  brTxOn: { color: cnd.white },
  seedBtn: { backgroundColor: '#fffbeb', borderColor: cnd.yellow, borderWidth: 1, borderStyle: 'dashed', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 13 },
  clearBtn: { backgroundColor: '#fdecec', borderColor: cnd.error },
  seedTx: { fontSize: 12.5, fontWeight: '800', color: '#b45309' },
  hint: { fontSize: 12, color: cnd.ink3, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 11, padding: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pName: { fontSize: 13.5, fontWeight: '700', color: cnd.ink, flexShrink: 1 },
  instPill: { fontSize: 12 },
  mockPill: { fontSize: 12 },
  audPill: { fontSize: 12, fontWeight: '700', color: cnd.ink2 },
  pMeta: { fontSize: 12, color: cnd.ink3, marginTop: 2 },
  del: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#fdecec', alignItems: 'center', justifyContent: 'center' },
  none: { fontSize: 13, color: cnd.ink3, textAlign: 'center', paddingVertical: 24 },
  secH: { fontSize: 14, fontWeight: '800', color: cnd.ink, marginTop: 4 },
  secS: { fontSize: 12, color: cnd.ink2, marginBottom: 6 },
  cfg: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 6 },
  cfgRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderBottomWidth: 1, borderBottomColor: cnd.line },
  cfgRow2: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 10, padding: 11 },
  cfgL: { flex: 1, fontSize: 13, fontWeight: '600', color: cnd.ink },
  pctIn: { borderWidth: 1.5, borderColor: cnd.brand, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, fontSize: 15, fontWeight: '900', color: cnd.brandDark, minWidth: 60, textAlign: 'center', backgroundColor: cnd.surface },
  pctSign: { fontSize: 14, fontWeight: '800', color: cnd.ink2 },
  orow: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 11, padding: 12, gap: 5 },
  onum: { fontSize: 12.5, fontWeight: '800', color: cnd.ink3, flex: 1 },
  ostat: { fontSize: 12, fontWeight: '800', borderRadius: 5, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' },
  ometa: { fontSize: 12, color: cnd.ink2 },
  oinstall: { fontSize: 12, fontWeight: '700', color: cnd.brandDark, backgroundColor: cnd.yellowSoft, borderRadius: 7, padding: 7 },
  odecline: { fontSize: 12, fontWeight: '600', color: cnd.ink2, backgroundColor: cnd.surface2, borderRadius: 7, padding: 7 },
  chev: { fontSize: 20, fontWeight: '900', color: cnd.ink3, marginTop: -4 },
  adv: { alignSelf: 'flex-start', backgroundColor: cnd.steel, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 2 },
  advTx: { color: cnd.white, fontSize: 12, fontWeight: '800' },
  card: { backgroundColor: cnd.surface, borderWidth: 1, borderColor: cnd.line, borderRadius: 12, padding: 12, gap: 9 },
  input: { borderWidth: 1, borderColor: cnd.line, borderRadius: 9, padding: 10, fontSize: 13.5, color: cnd.ink, backgroundColor: cnd.surface },
  addBtn: { backgroundColor: cnd.brand, borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  addBtnTx: { color: cnd.white, fontWeight: '800', fontSize: 13 },
});
