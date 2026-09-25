import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import CalendarView from '@/components/mk/CalendarView';
import PipelineView from '@/components/mk/PipelineView';
import ScriptsView from '@/components/mk/ScriptsView';
import MediaView from '@/components/mk/MediaView';
import PartnerCRMView from '@/components/mk/PartnerCRMView';
import KpiView from '@/components/mk/KpiView';
import { type AutoKpis, type MkCampaign, MK_CAMPAIGN_STATUS_LABEL, fetchAutoKpis, watchMkCampaigns } from '@/lib/mkCampaigns';
import { type MkContent, MK_STATUS_LABEL, watchMkContent } from '@/lib/mkContent';
import { clearAllMk, hasMkMock, seedAllMk } from '@/lib/mkSeed';
import { useMockEnabled } from '@/lib/mock';

/**
 * MK Plan — the internal Marketing Platform (mkplan.homesang.pro).
 * A role-gated back-office tool: content calendar, production pipeline, AI video
 * scripts, media library, partner CRM, and KPI/campaign tracking. Reuses the
 * app's auth + RBAC (the 'marketing' admin section). Phase 1 = shell + nav +
 * Overview; the other modules land in following phases.
 */

const NAV: { v: View_; icon: string; lao: string; group: string }[] = [
  { v: 'overview', icon: '📊', lao: 'ໜ້າ ຫຼັກ', group: 'ພາບ ລວມ' },
  { v: 'kpi', icon: '📈', lao: 'KPI & Campaign', group: 'ພາບ ລວມ' },
  { v: 'calendar', icon: '📅', lao: 'ປະຕິທິນ Content', group: 'ຜະລິດ ເນື້ອຫາ' },
  { v: 'pipeline', icon: '🏭', lao: 'ສະຖານະ ຜະລິດ', group: 'ຜະລິດ ເນື້ອຫາ' },
  { v: 'scripts', icon: '🎬', lao: 'Script AI ວີດີໂອ', group: 'ຜະລິດ ເນື້ອຫາ' },
  { v: 'media', icon: '📁', lao: 'ຄັງ ເອກະສານ & Media', group: 'ຜະລິດ ເນື້ອຫາ' },
  { v: 'crm', icon: '🤝', lao: 'CRM ພາດເນີ', group: 'ຄູ່ ຮ່ວມ ມື' },
];
type View_ = 'overview' | 'kpi' | 'calendar' | 'pipeline' | 'scripts' | 'media' | 'crm';

const SIDE = '#0e1f36';

export default function MkPlanScreen() {
  const { fbUser, loading } = useAuth();
  const { canView, canCreate } = useSectionPerms('marketing');
  const tt = useTT();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [view, setView] = useState<View_>('overview');

  useEffect(() => { if (!loading && !fbUser) router.replace('/sign-in' as any); }, [fbUser, loading]);

  if (loading) return <View style={styles.center}><Text style={styles.muted}>{tt('mk', 'ກຳລັງ ໂຫຼດ...')}</Text></View>;
  if (!fbUser) return null;
  if (!canView) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 40 }}>🔒</Text>
        <Text style={styles.denyTitle}>{tt('mk', 'ບໍ່ ມີ ສິດ ເຂົ້າ ໃຊ້')}</Text>
        <Text style={styles.muted}>{tt('mk', 'ຕ້ອງ ມີ ບົດບາດ Marketing — ໃຫ້ ແອດມິນ ມອບ ສິດ ໃນ ໜ້າ ຜູ້ໃຊ້ງານ & ສິດ')}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.replace('/' as any)}><Text style={styles.backTx}>{tt('mk', '← ກັບ ແອັບ')}</Text></Pressable>
      </View>
    );
  }

  const NavItem = ({ n }: { n: typeof NAV[number] }) => {
    const on = view === n.v;
    return (
      <Pressable onPress={() => setView(n.v)} style={[wide ? styles.navW : styles.navN, on && (wide ? styles.navWOn : styles.navNOn)]}>
        <Text style={[wide ? styles.navWtx : styles.navNtx, on && styles.navTxOn]}>{n.icon} {tt('mk', n.lao)}</Text>
      </Pressable>
    );
  };

  const nav = NAV[0];
  const current = NAV.find((n) => n.v === view) ?? nav;

  return (
    <View style={[styles.root, wide && styles.rootRow]}>
      {/* SIDEBAR (wide) */}
      {wide ? (
        <View style={styles.side}>
          <View style={styles.brand}><Text style={styles.brandLogo}>📣</Text><Text style={styles.brandTx}>MK Plan</Text></View>
          <Text style={styles.brandSub}>{tt('mk', 'ໂຮມຊ່າງ · Marketing')}</Text>
          {['ພາບ ລວມ', 'ຜະລິດ ເນື້ອຫາ', 'ຄູ່ ຮ່ວມ ມື'].map((g) => (
            <View key={g}>
              <Text style={styles.navGroup}>{tt('mk', g)}</Text>
              {NAV.filter((n) => n.group === g).map((n) => <NavItem key={n.v} n={n} />)}
            </View>
          ))}
          <View style={styles.sideFoot}>
            <Pressable onPress={() => router.replace('/' as any)}><Text style={styles.sideExit}>← {tt('mk', 'ກັບ ແອັບ')}</Text></Pressable>
          </View>
        </View>
      ) : null}

      {/* MAIN */}
      <View style={styles.main}>
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Text style={styles.topTitle}>{current.icon} {tt('mk', current.lao)}</Text>
            <Text style={styles.topSub}>{tt('mk', 'ໂຮມຊ່າງ · Marketing Platform')}</Text>
          </View>
          <View style={styles.demoTag}><Text style={styles.demoTx}>● {tt('mk', 'Marketing Platform')}</Text></View>
        </View>

        {/* NARROW nav — horizontal chips */}
        {!wide && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navBar} contentContainerStyle={{ gap: 6, paddingHorizontal: 8 }}>
            {NAV.map((n) => <NavItem key={n.v} n={n} />)}
          </ScrollView>
        )}

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
          {view === 'overview' ? <Overview tt={tt} canCreate={canCreate} onView={setView} /> : view === 'calendar' ? <CalendarView /> : view === 'pipeline' ? <PipelineView /> : view === 'scripts' ? <ScriptsView /> : view === 'media' ? <MediaView /> : view === 'crm' ? <PartnerCRMView /> : view === 'kpi' ? <KpiView /> : <Stub tt={tt} label={current.lao} />}
        </ScrollView>
      </View>
    </View>
  );
}

/* ---------- Overview (real data) ---------- */
function Overview({ tt, canCreate, onView }: { tt: (p: string, s: string) => string; canCreate?: boolean; onView?: (v: View_) => void }) {
  const [auto, setAuto] = useState<AutoKpis | null>(null);
  const [camps, setCamps] = useState<MkCampaign[]>([]);
  const [posts, setPosts] = useState<MkContent[]>([]);
  const [mockPresent, setMockPresent] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const mockEnabled = useMockEnabled();
  useEffect(() => { fetchAutoKpis().then(setAuto); }, []);
  useEffect(() => watchMkCampaigns(setCamps), []);
  useEffect(() => watchMkContent(setPosts), []);
  useEffect(() => { hasMkMock().then(setMockPresent); }, []);

  const doSeed = async () => { setSeeding(true); try { const n = await seedAllMk(); setMockPresent(await hasMkMock()); alert(`${tt('mk', 'ໃສ່ ຂໍ້ມູນ ຕົວຢ່າງ ແລ້ວ')} (+${n})`); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setSeeding(false); } };
  const doClear = async () => { if (typeof confirm === 'function' && !confirm(tt('mk', 'ລຶບ ຂໍ້ມູນ ຕົວຢ່າງ MK Plan ທັງ ໝົດ?'))) return; setSeeding(true); try { await clearAllMk(); setMockPresent(await hasMkMock()); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setSeeding(false); } };

  // open an app route as the "source" of a count. On web open a new tab so the
  // MK workspace stays put; on native navigate in place.
  const openApp = (path: string) => {
    if (Platform.OS === 'web') { try { (window as any).open(path, '_blank'); return; } catch { /* fall through */ } }
    router.push(path as any);
  };
  const stats: { k: string; v?: number; hint: string; go: () => void }[] = [
    { k: '🔧 ຊ່າງ', v: auto?.techs, hint: 'ເບິ່ງ ຊ່າງ', go: () => openApp('/find-tech') },
    { k: '🏪 ຮ້ານ', v: auto?.shops, hint: 'ເບິ່ງ ຮ້ານ', go: () => openApp('/shops') },
    { k: '📣 ງານ ເປີດ', v: auto?.openJobs, hint: 'ເບິ່ງ ງານ', go: () => openApp('/') },
    { k: '🤝 ພາດເນີ active', v: auto?.partnersActive, hint: 'ໄປ CRM', go: () => onView?.('crm') },
    { k: '✅ ໂພສ ເຜີຍແຜ່', v: auto?.postsPublished, hint: 'ໄປ ຜະລິດ', go: () => onView?.('pipeline') },
  ];
  const activeCamps = camps.filter((c) => c.status === 'active').slice(0, 4);
  const upcoming = posts.filter((p) => p.status !== 'published').slice(0, 5);

  return (
    <View style={{ gap: 14 }}>
      {canCreate && (mockEnabled || mockPresent) && (
        <View style={styles.seedBar}>
          {!mockPresent
            ? <Pressable style={[styles.seedBtn, seeding && { opacity: 0.5 }]} disabled={seeding} onPress={doSeed}><Text style={styles.seedTx}>🧪 {tt('mk', 'ໃສ່ ຂໍ້ມູນ ຕົວຢ່າງ (ທຸກ ໂມດູນ)')}</Text></Pressable>
            : <Pressable style={[styles.seedBtn, styles.seedClear, seeding && { opacity: 0.5 }]} disabled={seeding} onPress={doClear}><Text style={[styles.seedTx, { color: '#dc2626' }]}>🧹 {tt('mk', 'ລຶບ ຂໍ້ມູນ ຕົວຢ່າງ')}</Text></Pressable>}
          <Text style={styles.seedHint}>{tt('mk', 'ຕົວຢ່າງ = ຂໍ້ມູນ ທົດລອງ ຕິດ ປ້າຍ 🧪, ລຶບ ໄດ້')}</Text>
        </View>
      )}
      <View style={styles.tiles}>
        {stats.map((s) => (
          <Pressable key={s.k} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.6 }]} onPress={s.go}>
            <View style={styles.tileTop}><Text style={styles.tileK}>{s.k}</Text><Text style={[styles.src, styles.srcAuto]}>auto</Text></View>
            <Text style={styles.tileV}>{s.v === undefined ? '…' : s.v.toLocaleString('en-US')}</Text>
            <Text style={styles.tileGo}>{tt('mk', s.hint)} ›</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.g2}>
        <View style={styles.card}>
          <Text style={styles.cardH}>🎯 {tt('mk', 'Campaign ກຳລັງ ດຳເນີນ')}</Text>
          {activeCamps.length === 0 ? <Text style={styles.note}>{tt('mk', 'ຍັງ ບໍ່ ມີ — ໄປ ໜ້າ KPI ເພື່ອ ເພີ່ມ')}</Text> : activeCamps.map((c) => {
            const pct = c.target && c.target > 0 ? Math.min(100, Math.round(((c.current ?? 0) / c.target) * 100)) : 0;
            return (
              <View key={c.id} style={styles.fbar}>
                <Text style={styles.fbarL} numberOfLines={1}>{c.name}</Text>
                <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
                <Text style={styles.fbarP}>{pct}%</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardH}>📅 {tt('mk', 'ໂພສ ທີ່ ຍັງ ບໍ່ ເຜີຍແຜ່')}</Text>
          {upcoming.length === 0 ? <Text style={styles.note}>{tt('mk', 'ບໍ່ ມີ ຄິວ — ໄປ ໜ້າ ປະຕິທິນ')}</Text> : upcoming.map((p) => (
            <View key={p.id} style={styles.task}>
              <Text style={styles.upDate}>{new Date(p.date).getDate()}/{new Date(p.date).getMonth() + 1}</Text>
              <Text style={styles.taskTx} numberOfLines={1}>{p.title}</Text>
              <Text style={styles.upSt}>{tt('mk', MK_STATUS_LABEL[p.status])}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/* ---------- Stub (upcoming modules) ---------- */
function Stub({ tt, label }: { tt: (p: string, s: string) => string; label: string }) {
  return (
    <View style={styles.stub}>
      <Text style={{ fontSize: 44 }}>🚧</Text>
      <Text style={styles.stubTitle}>{tt('mk', label)}</Text>
      <Text style={styles.muted}>{tt('mk', 'ໂມດູນ ນີ້ ກຳລັງ ສ້າງ ໃນ ໄລຍະ ຖັດ ໄປ — ໂຄງ ຮ່າງ ຕາມ mockup ທີ່ ອະນຸມັດ ແລ້ວ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  rootRow: { flexDirection: 'row' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 28, gap: 10 },
  muted: { color: colors.text3, textAlign: 'center', fontSize: 13, lineHeight: 20, maxWidth: 360 },
  denyTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  backBtn: { marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  backTx: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  // sidebar
  side: { width: 236, backgroundColor: SIDE, paddingHorizontal: 12, paddingTop: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 8, paddingTop: 4 },
  brandLogo: { fontSize: 15 },
  brandTx: { color: '#fff', fontWeight: '800', fontSize: 15 },
  brandSub: { color: '#6a80a0', fontSize: 12, paddingHorizontal: 8, marginTop: 2, marginBottom: 6 },
  navGroup: { color: '#61789a', fontSize: 12, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4, textTransform: 'uppercase' },
  navW: { paddingVertical: 9, paddingHorizontal: 10, borderRadius: 9 },
  navWOn: { backgroundColor: '#1b3a63' },
  navWtx: { color: '#c4d2e4', fontSize: 13.5, fontWeight: '600' },
  navTxOn: { color: '#fff' },
  sideFoot: { marginTop: 22, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#1e355a' },
  sideExit: { color: '#8195b0', fontSize: 12.5, fontWeight: '700', paddingHorizontal: 8 },
  // narrow nav
  navBar: { flexGrow: 0, paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  navN: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  navNOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  navNtx: { color: colors.text2, fontSize: 12.5, fontWeight: '700' },
  // main
  main: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  topTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  topSub: { fontSize: 12, color: colors.text3, marginTop: 1 },
  demoTag: { backgroundColor: '#fbf0d9', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11, borderWidth: 1, borderColor: '#eeddb4' },
  demoTx: { fontSize: 12, fontWeight: '800', color: '#c07d12' },
  body: { padding: 16, paddingBottom: 60, maxWidth: 1180 },
  // overview
  demoBanner: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 12, padding: 12 },
  demoBannerTx: { fontSize: 12.5, color: '#92400e', fontWeight: '600' },
  seedBar: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  seedBtn: { backgroundColor: '#fffbeb', borderColor: '#f59e0b', borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 13 },
  seedClear: { backgroundColor: '#fdecec', borderColor: '#dc2626' },
  seedTx: { fontSize: 12.5, fontWeight: '800', color: '#b45309' },
  seedHint: { fontSize: 12, color: colors.text3, flex: 1, minWidth: 140 },
  tileGo: { fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: 160, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 15 },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileK: { flex: 1, fontSize: 12, color: colors.text2, fontWeight: '700' },
  tileV: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 6 },
  tileD: { fontSize: 12, color: colors.success, fontWeight: '700', marginTop: 2 },
  src: { fontSize: 12, fontWeight: '800', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden', textTransform: 'uppercase' },
  srcAuto: { backgroundColor: '#e2f6ea', color: '#1f9d57' },
  srcMan: { backgroundColor: '#e7f0fb', color: '#0a5fc0' },
  g2: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { flexGrow: 1, flexBasis: 320, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16 },
  cardH: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 12 },
  fbar: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  fbarL: { width: 104, fontSize: 12, color: colors.text2, fontWeight: '700' },
  track: { flex: 1, height: 22, backgroundColor: colors.surface2, borderRadius: 7, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 7 },
  fbarP: { width: 34, fontSize: 12, fontWeight: '800', color: colors.text2, textAlign: 'right' },
  note: { fontSize: 12, color: colors.text2, backgroundColor: '#e7f0fb', borderRadius: 10, padding: 10, marginTop: 8, lineHeight: 18 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  ck: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  ckDone: { backgroundColor: colors.success, borderColor: colors.success },
  ckTx: { color: '#fff', fontSize: 12, fontWeight: '800' },
  taskTx: { flex: 1, fontSize: 13.5, color: colors.text },
  taskDone: { color: colors.text3, textDecorationLine: 'line-through' },
  upDate: { width: 34, fontSize: 12, fontWeight: '800', color: colors.text2 },
  upSt: { fontSize: 12, fontWeight: '800', color: colors.primary, backgroundColor: colors.surface2, borderRadius: 5, paddingVertical: 1, paddingHorizontal: 6, overflow: 'hidden' },
  // stub
  stub: { alignItems: 'center', justifyContent: 'center', paddingVertical: 70, gap: 8 },
  stubTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
});
