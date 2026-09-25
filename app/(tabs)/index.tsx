import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CAT_ICON, getCategory, useServiceCategories } from '@/lib/categories';
import { isFresh, rankByFreshness } from '@/lib/freshness';
import { useFeedConfig } from '@/lib/appSettings';
import { distanceKm, type Job, JOB_STATUS_LABEL, watchMyJobs, watchOpenJobs } from '@/lib/jobs';
import { type TechCard, watchTechnicians } from '@/lib/users';
import AppHeader from '@/components/AppHeader';
import AppFooter from '@/components/AppFooter';
import CategoryIcon from '@/components/CategoryIcon';
import FlashDeals from '@/components/FlashDeals';
import GroupBuys from '@/components/GroupBuys';
import RiderPromo from '@/components/RiderPromo';
import LearnShowcase from '@/components/LearnShowcase';
import BannerCarousel from '@/components/BannerCarousel';
import ProductShowcase from '@/components/ProductShowcase';
import ReelsShowcase from '@/components/ReelsShowcase';
import SearchResults from '@/components/SearchResults';
import { type AppSettings, sectionOn, watchAppSettings } from '@/lib/appSettings';
import { useT, useTT } from '@/lib/i18n';
import { colors, font, radius, shadow, space, useResponsive } from '@/lib/theme';
import { isCndHost } from '@/lib/cnd/host';
import CndStore from '../cnd';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open: { bg: '#d1fae5', fg: '#065f46' },
  assigned: { bg: '#fef3c7', fg: '#92400e' },
  in_progress: { bg: '#dbeafe', fg: '#1e40af' },
  completed: { bg: '#f3f4f6', fg: '#374151' },
  cancelled: { bg: '#fee2e2', fg: '#991b1b' },
  pending_payment: { bg: '#ede9fe', fg: '#5b21b6' },
};

const FILTERS = [
  { value: '', lao: 'ທັງໝົດ' },
  { value: 'open', lao: 'ເປີດຮັບ' },
  { value: 'in_progress', lao: 'ກຳລັງເຮັດ' },
  { value: 'completed', lao: 'ສຳເລັດ' },
] as const;

// On the CND subdomain the home route IS the CND storefront (clean root URL),
// so we never fall through to the HomeSang home there.
export default function HomeRoute() {
  if (isCndHost()) return <CndStore />;
  return <HomeSangHome />;
}

function HomeSangHome() {
  const { fbUser, profile, loading, needsProfileSetup } = useAuth();
  const { can } = usePermissions();
  const { maxWidth } = useResponsive();
  const t = useT();
  const tt = useTT();
  const serviceCats = useServiceCategories();
  const techCfg = useFeedConfig('techs'); // freshness: new techs first, then nearest
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [techs, setTechs] = useState<TechCard[]>([]);
  const [openJobs, setOpenJobs] = useState<Job[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [q, setQ] = useState('');
  const searching = q.trim() !== '';

  useEffect(() => watchAppSettings(setSettings), []);

  // Redirect a genuinely-incomplete profile to setup — but DEBOUNCED. On a
  // cold-load deep link the home tab mounts as the anchor for a beat, and auth
  // can transiently report needsProfileSetup before the profile snapshot lands;
  // firing immediately would bounce the real target (e.g. /referral) through
  // /profile-setup to home. If the flag is a transient it clears within the
  // delay and the timer is cancelled; a real incomplete profile stays true.
  useEffect(() => {
    if (!needsProfileSetup) return;
    const id = setTimeout(() => router.replace('/profile-setup' as any), 1200);
    return () => clearTimeout(id);
  }, [needsProfileSetup]);

  useEffect(() => {
    const st = (profile as any)?.status;
    if (st === 'pending' || st === 'suspended' || st === 'rejected') router.replace('/pending' as any);
  }, [profile]);

  useEffect(() => {
    if (!fbUser) {
      setJobs([]);
      setJobsLoading(false);
      return;
    }
    setJobsLoading(true);
    const unsub = watchMyJobs(fbUser.uid, (j) => {
      setJobs(j);
      setJobsLoading(false);
    });
    return unsub;
  }, [fbUser]);

  // technicians are public — show them whether or not the visitor is signed in
  useEffect(() => watchTechnicians(setTechs), []);
  // latest posted (open) jobs — public feed (jobCards), shown at the top of home
  useEffect(() => watchOpenJobs(fbUser?.uid ?? '', setOpenJobs), [fbUser]);

  // TEMP: force-fetch the latest deployed build (clears caches + cache-busts the document)
  const updateApp = async () => {
    if (typeof window === 'undefined' || !window.location) return;
    try {
      if (typeof caches !== 'undefined') {
        const ks = await caches.keys();
        await Promise.all(ks.map((k) => caches.delete(k)));
      }
    } catch {
      /* ignore */
    }
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('_', String(Date.now()));
      window.location.replace(u.toString());
    } catch {
      window.location.reload();
    }
  };

  if (loading) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('home','ກຳລັງໂຫຼດ...')}</Text></View>;
  }

  const filteredJobs = filter ? jobs.filter((j) => j.status === filter) : jobs;
  // "nearby" technicians on the home carousel: nearest-first when we know the
  // user's location, but never hide everyone (strict radius filtering lives on
  // the map). Techs without coords sink to the end.
  const myLat = profile?.lat;
  const myLng = profile?.lng;
  const distOf = (t: (typeof techs)[number]) =>
    myLat != null && myLng != null && t.lat != null && t.lng != null
      ? distanceKm(myLat, myLng, t.lat, t.lng)
      : Infinity;
  // new technicians (< N days) first; older ones keep nearest-first
  const nearbyTechs = rankByFreshness(techs, techCfg, {
    createdAt: (t) => t.createdAt ?? 0,
    oldCompare: (a, b) => distOf(a) - distOf(b),
  });

  return (
    <View style={styles.screen}>
      {/* standard brand bar (shared with the other tabs) — no section hero on
          home, which is the overview page. The 🔄 keeps the deploy cache-bust. */}
      <AppHeader extra={{ icon: '🔄', onPress: updateApp }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={[styles.wrap, { maxWidth }]}>
        <View style={styles.body}>

        {/* announcement */}
        {!!settings?.announcement && (
          <View style={styles.announce}>
            <Text style={styles.announceText}>📢 {settings.announcement}</Text>
          </View>
        )}

        {/* search — inline: type here, results appear below (no navigation) */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('home.search')}
            placeholderTextColor={colors.text3}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {q !== '' && <Pressable onPress={() => setQ('')} hitSlop={8}><Text style={styles.searchClear}>✕</Text></Pressable>}
        </View>

        {searching && <SearchResults query={q} onNavigate={() => setQ('')} />}

        {!searching && (
        <>
        {/* hero promo slider */}
        <BannerCarousel />

        {/* post a job — prominent CTA at the top */}
        {(!fbUser || can('postJob')) && (
          <Pressable style={styles.postTop} onPress={() => router.push((fbUser ? '/post-job' : '/sign-in') as any)}>
            <Text style={styles.postTopIcon}>＋</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.postTopTitle}>{tt('home', 'ໂພສວຽກ ຫາຊ່າງ')}</Text>
              <Text style={styles.postTopSub} numberOfLines={1}>{tt('home', 'ບອກ ວຽກ ຂອງ ທ່ານ — ຊ່າງ ໃກ້ຕົວ ສະເໜີ ລາຄາ')}</Text>
            </View>
            <Text style={styles.postTopArrow}>→</Text>
          </Pressable>
        )}

        {/* latest posted (open) jobs — sits where the service categories used to */}
        {openJobs.length > 0 && (
          <>
            <View style={styles.rowHead}>
              <Text style={styles.sectionTitle}>{tt('home', 'ງານ ທີ່ ໂພສ ຫຼ້າສຸດ')}</Text>
              <Pressable onPress={() => router.push('/(tabs)/explore' as any)}>
                <Text style={styles.seeAll}>{tt('home','ທັງໝົດ →')}</Text>
              </Pressable>
            </View>
            <View style={styles.ojGrid}>
            {openJobs.slice(0, Math.max(1, settings?.homeJobCount ?? 4)).map((job) => {
              const jc = getCategory(job.category);
              const twoCol = (settings?.homeJobCols ?? 2) >= 2;
              return (
                <Pressable key={job.id} style={[styles.ojCard, twoCol && styles.ojCardHalf]} onPress={() => router.push(`/jobs/${job.id}` as any)}>
                  <View style={styles.ojHead}>
                    <Text style={styles.ojCat} numberOfLines={1}><CategoryIcon icon={jc?.icon} size={13} color={colors.primary} /> {jc?.lao ?? job.category}</Text>
                    {job.urgent
                      ? <View style={styles.urgentTag}><Text style={styles.urgentTagTx}>🚨 {tt('home','ດ່ວນ')}</Text></View>
                      : <View style={styles.ojStatus}><Text style={styles.ojStatusTx}>{tt('jobStatus', JOB_STATUS_LABEL[job.status].lao)}</Text></View>}
                  </View>
                  <Text style={styles.ojTitle} numberOfLines={1}>{job.title}</Text>
                  <View style={styles.ojMeta}>
                    {job.budget !== undefined && <Text style={styles.ojMetaTx}>💰 {job.budget.toLocaleString()} {tt('home','ກີບ')}</Text>}
                    {!!job.address && <Text style={styles.ojMetaTx} numberOfLines={1}>📍 {job.address}</Text>}
                  </View>
                </Pressable>
              );
            })}
            </View>
          </>
        )}

        {/* service categories — admin-toggleable (hidden by default) */}
        {sectionOn(settings, 'homeCategories', 'home') && (
        <>
        <View style={styles.rowHead}>
          <Text style={styles.sectionTitle}>{t('home.services')}</Text>
          <Pressable onPress={() => router.push('/(tabs)/explore' as any)}>
            <Text style={styles.seeAll}>{tt('home','ທັງໝົດ →')}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
          {serviceCats.map((c) => (
            <Pressable
              key={c.value}
              style={styles.catCell}
              onPress={() => router.push(`/(tabs)/explore?cat=${c.value}` as any)}>
              <View style={styles.catIconWrap}>
                {CAT_ICON[c.value] ? (
                  <Ionicons name={CAT_ICON[c.value].name as any} size={34} color={CAT_ICON[c.value].color} />
                ) : (
                  <CategoryIcon icon={c.icon} size={32} color={colors.primary} />
                )}
              </View>
              <Text style={styles.catLabel} numberOfLines={1}>{c.lao}</Text>
            </Pressable>
          ))}
        </ScrollView>
        </>
        )}

        {/* nearby technicians */}
        {nearbyTechs.length > 0 && (
          <>
            <View style={styles.rowHead}>
              <Text style={styles.sectionTitle}>{t('home.nearbyTechs')}</Text>
              <Pressable style={styles.mapLink} onPress={() => router.push('/map' as any)}>
                <Text style={styles.mapLinkText}>🗺️ {t('home.moreOnMap')}</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.techRow}>
              {nearbyTechs.map((t) => (
                <Pressable key={t.uid} style={styles.techCard} onPress={() => router.push(`/users/${t.uid}` as any)}>
                  <View>
                    {t.image ? (
                      <Image source={{ uri: t.image }} style={styles.techAv} />
                    ) : (
                      <View style={[styles.techAv, styles.techAvEmpty]}>
                        <Text style={styles.techAvIcon}>👷</Text>
                      </View>
                    )}
                    {isFresh(t.createdAt ?? 0, techCfg.freshDays) && (
                      <View style={styles.techNewBadge}><Text style={styles.techNewBadgeText}>{tt('feed', 'ໃໝ່')}</Text></View>
                    )}
                  </View>
                  <Text style={styles.techName} numberOfLines={1}>{t.name}</Text>
                  {t.roleDescription ? (
                    <Text style={styles.techRole} numberOfLines={1}>{t.roleDescription}</Text>
                  ) : t.specialties && t.specialties.length > 0 ? (
                    <Text style={styles.techRole} numberOfLines={1}>{t.specialties.join(' · ')}</Text>
                  ) : null}
                  {typeof t.rating === 'number' && (
                    <Text style={styles.techRating}>⭐ {t.rating.toFixed(1)}</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* become-a-rider CTA (technicians / general, non-riders) */}
        {!searching && <RiderPromo />}

        {/* group buy (Y3) — live campaigns, progress + countdown */}
        {!searching && <GroupBuys />}

        {/* flash deals (Y2) — active only, live countdown */}
        {!searching && <FlashDeals />}

        {/* product showcase (marketplace) */}
        <ProductShowcase />

        {/* shoppable short-video feed (Y2) */}
        <ReelsShowcase />

        {/* knowledge & safety video clips */}
        <LearnShowcase />

        {/* quick links — member area, signed-in only */}
        {fbUser && (
          <View style={styles.quickRow}>
            <QuickLink icon="💬" label={t('quick.messages')} onPress={() => router.push('/messages' as any)} />
            {can('bid') && <QuickLink icon="💰" label={t('quick.income')} onPress={() => router.push('/wallet' as any)} />}
            <QuickLink icon="📦" label={t('quick.orders')} onPress={() => router.push('/orders' as any)} />
            <QuickLink icon="👤" label={t('quick.profile')} onPress={() => router.push('/profile')} />
          </View>
        )}

        {/* my jobs — member area, signed-in only */}
        {fbUser && (
        <>
        <Text style={styles.sectionTitle}>{t('home.myJobs')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.value}
              style={[styles.chip, filter === f.value && styles.chipOn]}
              onPress={() => setFilter(f.value)}>
              <Text style={[styles.chipText, filter === f.value && styles.chipTextOn]}>{tt('home', f.lao)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {jobsLoading ? (
          <Text style={styles.muted}>{tt('home','ກຳລັງໂຫຼດງານ...')}</Text>
        ) : filteredJobs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>
              {filter ? `${tt('home','ບໍ່ມີງານ')} ${tt('home', FILTERS.find((f) => f.value === filter)?.lao ?? '')}` : tt('home','ຍັງບໍ່ມີງານ')}
            </Text>
            {!filter && <Text style={styles.emptyHint}>{tt('home','ກົດ «＋ ໂພສງານໃໝ່» ດ້ານເທິງ')}</Text>}
          </View>
        ) : (
          filteredJobs.map((job) => {
            const cat = getCategory(job.category);
            const label = JOB_STATUS_LABEL[job.status];
            const color = STATUS_COLORS[job.status] ?? STATUS_COLORS.completed;
            return (
              <Pressable key={job.id} style={styles.jobCard} onPress={() => router.push(`/jobs/${job.id}` as any)}>
                <View style={styles.jobHead}>
                  <Text style={styles.jobCat}><CategoryIcon icon={cat?.icon} size={13} color={colors.primary} /> {cat?.lao ?? job.category}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {job.urgent && job.status === 'open' && <View style={styles.urgentTag}><Text style={styles.urgentTagTx}>🚨 {tt('home','ດ່ວນ')}</Text></View>}
                    <View style={[styles.jobStatus, { backgroundColor: color.bg }]}>
                      <Text style={[styles.jobStatusText, { color: color.fg }]}>{tt('jobStatus', label.lao)}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.jobBody}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobTitle}>{job.title}</Text>
                    <Text style={styles.jobDesc} numberOfLines={2}>{job.description}</Text>
                    <View style={styles.jobMeta}>
                      {job.budget !== undefined && (
                        <Text style={styles.jobMetaText}>💰 {job.budget.toLocaleString()} {tt('home','ກີບ')}</Text>
                      )}
                      {job.address && <Text style={styles.jobMetaText} numberOfLines={1}>📍 {job.address}</Text>}
                    </View>
                  </View>
                  {job.photos && job.photos.length > 0 && (
                    <Image source={{ uri: job.photos[0] }} style={styles.jobThumb} />
                  )}
                </View>
              </Pressable>
            );
          })
        )}
        </>
        )}
        </>
        )}
        </View>
        <AppFooter page="home" />
      </View>
    </ScrollView>
    </View>
  );
}

function QuickLink({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quick} onPress={onPress}>
      <Text style={styles.quickIcon}>{icon}</Text>
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 0, alignItems: 'center' },
  wrap: { width: '100%' },
  body: { paddingHorizontal: 8, paddingTop: 8 },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { color: colors.text3, textAlign: 'center', padding: 24 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  tbLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ham: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  hamIcon: { fontSize: 15, color: colors.text },
  tbRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  updateBtn: { backgroundColor: '#EAF2FB', borderColor: '#bcd6f5' },
  iconTxt: { fontSize: 15 },
  loginBtn: { backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 8 },
  loginBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  whoName: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  whoRole: { fontSize: 12, color: colors.text3, maxWidth: 130 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#fff', backgroundColor: colors.surface2, ...shadow.card },
  avatarEmpty: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInit: { color: '#fff', fontSize: font.md, fontWeight: '800' },
  announce: { backgroundColor: '#FFF7ED', borderRadius: radius.lg, padding: 12, marginTop: space.md, borderWidth: 1, borderColor: '#FED7AA' },
  announceText: { color: '#9A3412', fontSize: font.sm, lineHeight: 20 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 11, marginTop: space.md, ...shadow.card },
  searchIcon: { fontSize: 15 },
  searchText: { color: colors.text3, fontSize: font.sm },
  searchInput: { flex: 1, paddingVertical: 2, fontSize: font.sm, color: colors.text, outlineStyle: 'none' } as any,
  searchClear: { fontSize: 15, color: colors.text3, paddingHorizontal: 4 },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  postBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: space.lg, ...shadow.card },
  postBtnText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  // top post-a-job CTA + latest open-job cards (home lead section)
  postTop: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primary, borderRadius: radius.lg, padding: 14, marginTop: space.md, ...shadow.card },
  postTopIcon: { color: '#fff', fontSize: 26, fontWeight: '800' },
  postTopTitle: { color: '#fff', fontSize: font.md, fontWeight: '800' },
  postTopSub: { color: '#cfe3ff', fontSize: 12, marginTop: 2 },
  postTopArrow: { color: '#fff', fontSize: 20, fontWeight: '800' },
  ojGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  ojCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: space.sm, width: '100%', ...shadow.card },
  ojCardHalf: { width: '48.8%' },
  ojHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  ojCat: { fontSize: 12, fontWeight: '700', color: colors.primary },
  ojStatus: { backgroundColor: '#d1fae5', borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 3 },
  urgentTag: { backgroundColor: '#fee2e2', borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 3 },
  urgentTagTx: { color: '#b91c1c', fontSize: 12, fontWeight: '800' },
  ojStatusTx: { fontSize: 12, fontWeight: '800', color: '#065f46' },
  ojTitle: { fontSize: font.sm, fontWeight: '700', color: colors.text, marginTop: 7 },
  ojMeta: { flexDirection: 'row', gap: 12, marginTop: 7, flexWrap: 'wrap' },
  ojMetaTx: { fontSize: 12, color: colors.text3 },
  quickRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  quick: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 12, alignItems: 'center', ...shadow.card },
  quickIcon: { fontSize: 20 },
  quickText: { fontSize: 12, color: colors.text2, fontWeight: '600', marginTop: 4 },
  adminBtn: { backgroundColor: colors.text, borderRadius: radius.lg, padding: 12, alignItems: 'center', marginTop: space.md },
  adminBtnText: { color: '#fff', fontSize: font.sm, fontWeight: '600' },
  sectionTitle: { fontSize: font.lg, fontWeight: '700', color: colors.text, marginTop: space.xl, marginBottom: space.sm },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  mapLink: { backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#bcd6f5', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  mapLinkText: { color: colors.primary, fontSize: font.xs, fontWeight: '800' },
  more: { fontSize: font.sm, color: colors.primary, marginBottom: space.sm },
  seeAll: { fontSize: font.sm, color: colors.primary, fontWeight: '700' },
  catScroll: { gap: 10, paddingTop: space.xs, paddingBottom: space.sm, paddingRight: 4 },
  catCol: { gap: 12 },
  catCell: { width: 66, alignItems: 'center', gap: 6 },
  catIconWrap: { width: 64, height: 64, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  catLabel: { fontSize: 12, color: colors.text2, fontWeight: '600' },
  techRow: { gap: space.sm, paddingBottom: space.xs, paddingTop: space.xs },
  techCard: { width: 124, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, alignItems: 'center', ...shadow.card },
  techAv: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2 },
  techAvEmpty: { alignItems: 'center', justifyContent: 'center' },
  techNewBadge: { position: 'absolute', top: -4, right: -6, backgroundColor: '#EF4444', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1 },
  techNewBadgeText: { fontSize: 12, color: '#fff', fontWeight: '800' },
  techAvIcon: { fontSize: 26 },
  techName: { fontSize: font.sm, fontWeight: '700', color: colors.text, marginTop: 8, textAlign: 'center' },
  techRole: { fontSize: font.xs, color: colors.text3, marginTop: 2, textAlign: 'center' },
  techRating: { fontSize: font.xs, color: colors.secondary, fontWeight: '700', marginTop: 4 },
  filterRow: { gap: 6, paddingBottom: space.md },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.xs, color: colors.text2 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  jobCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.sm, ...shadow.card },
  jobHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  jobCat: { fontSize: 12, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  jobStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  jobStatusText: { fontSize: 12, fontWeight: '700' },
  jobBody: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  jobThumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surface2 },
  jobTitle: { fontSize: font.md, fontWeight: '600', color: colors.text, marginTop: 2 },
  jobDesc: { fontSize: font.sm, color: colors.text2, marginTop: 4 },
  jobMeta: { flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  jobMetaText: { fontSize: font.xs, color: colors.text3 },
  empty: { backgroundColor: colors.surface, padding: 32, borderRadius: radius.lg, alignItems: 'center', ...shadow.card },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: font.sm, color: colors.text2, marginTop: 8 },
  emptyHint: { fontSize: font.xs, color: colors.text3, marginTop: 4 },
  signOut: { padding: 14, alignItems: 'center', marginTop: space.xl },
  signOutText: { color: colors.error, fontSize: font.sm },
});
