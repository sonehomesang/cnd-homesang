import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useTT } from '@/lib/i18n';
import { getCategory, useServiceCategories } from '@/lib/categories';
import CategoryIcon from '@/components/CategoryIcon';
import { distanceKm } from '@/lib/jobs';
import { type TechCard, watchTechnicians } from '@/lib/users';
import { isFresh, rankByFreshness } from '@/lib/freshness';
import { useAppSettings, useFeedConfig } from '@/lib/appSettings';
import AppHeader from '@/components/AppHeader';
import SortBar from '@/components/SortBar';
import { techTier, TIER_BADGE } from '@/lib/techTier';
import AppFooter from '@/components/AppFooter';
import { colors, useResponsive } from '@/lib/theme';

export default function FindTechScreen() {
  const { fbUser, profile } = useAuth();
  const [techs, setTechs] = useState<TechCard[]>([]);
  const [cat, setCat] = useState<string>('');
  const [sort, setSort] = useState('recommended');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const serviceCats = useServiceCategories();
  const tt = useTT();
  const techCfg = useFeedConfig('techs'); // freshness: new-first, then keep distance
  const settings = useAppSettings();
  const { maxWidth } = useResponsive(); // shared responsive content width (phone full / tablet 720 / desktop 960)

  // public techCards projection — works logged-out too
  useEffect(() => watchTechnicians(setTechs), []);

  const myLat = profile?.lat;
  const myLng = profile?.lng;
  // radius gate: only when admin enabled it AND we know the viewer's location
  const gateKm = settings.radiusVisibilityEnabled && myLat != null && myLng != null ? settings.searchRadiusKm : 0;

  const byDistance = (a: { dist?: number }, b: { dist?: number }) => {
    if (a.dist === undefined && b.dist === undefined) return 0;
    if (a.dist === undefined) return 1;
    if (b.dist === undefined) return -1;
    return a.dist - b.dist;
  };
  // quick-win 3: a proven-low-rated tech (rating below the admin minimum, with
  // enough reviews to be fair) sinks to the bottom of the list — reviews now have
  // teeth. New techs (no rating yet) are NOT penalised; freshness still floats them.
  const minRating = settings.techMinRating || 0;
  const belowMin = (t: { rating?: number; reviewCount?: number }) =>
    minRating > 0 && typeof t.rating === 'number' && (t.reviewCount ?? 0) >= 3 && t.rating < minRating;
  const byRatingThenDistance = (a: { tech: any; dist?: number }, b: { tech: any; dist?: number }) => {
    const sink = (belowMin(a.tech) ? 1 : 0) - (belowMin(b.tech) ? 1 : 0);
    if (sink !== 0) return sink;
    return byDistance(a, b);
  };
  const pool = techs
    .filter((tch) => !cat || (tch.specialties ?? []).includes(cat))
    .filter((tch) => !verifiedOnly || tch.verified)
    .map((tch) => {
      let dist: number | undefined;
      if (myLat != null && myLng != null && tch.lat != null && tch.lng != null) {
        dist = distanceKm(myLat, myLng, tch.lat, tch.lng);
      }
      return { tech: tch, dist };
    })
    // when the radius gate is on, drop anyone beyond it (unknown distance = shown)
    .filter((x) => gateKm === 0 || x.dist === undefined || x.dist <= gateKm);
  // user-chosen sort overrides the default freshness ranking
  const list =
    sort === 'rating' ? [...pool].sort((a, b) => (b.tech.rating ?? -1) - (a.tech.rating ?? -1))
    : sort === 'near' ? [...pool].sort(byDistance)
    // default: new technicians (< N days) first; older ones sink-if-low-rated then nearest
    : rankByFreshness(pool, techCfg, { createdAt: (x) => x.tech.createdAt ?? 0, oldCompare: byRatingThenDistance });

  return (
    <View style={styles.screen}>
      <AppHeader
        accent={colors.secondary}
        accentSoft="#FFEDE4"
        icon="🔧"
        nameAccent="ຊ່າງ"
        subtitle={tt('findtech', 'ຊ່າງ ໃກ້ຕົວ ພ້ອມ ໃຫ້ ບໍລິການ')}
        searchPlaceholder={tt('findtech', 'ຄົ້ນຫາ ຊ່າງ / ບໍລິການ…')}
        actions={[
          { label: tt('findtech', '＋ ໂພສງານ'), onPress: () => router.push((fbUser ? '/post-job' : '/sign-in') as any) },
          { label: tt('findtech', '🗺️ ແຜນທີ່'), onPress: () => router.push('/map' as any) },
        ]}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.wrap, { maxWidth }]}>
          <View style={styles.body}>
      {gateKm > 0 && <Text style={styles.radiusNote}>📍 {tt('findtech', 'ສະແດງ ສະເພາະ ໃນ')} {gateKm} {tt('findtech', 'ກມ')}</Text>}

      {/* filter by specialty */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <Pressable style={[styles.chip, cat === '' && styles.chipActive]} onPress={() => setCat('')}>
          <Text style={[styles.chipText, cat === '' && styles.chipTextActive]}>{tt('findtech', 'ທັງໝົດ')}</Text>
        </Pressable>
        {serviceCats.map((c) => (
          <Pressable
            key={c.value}
            style={[styles.chip, cat === c.value && styles.chipActive]}
            onPress={() => setCat(c.value)}>
            <Text style={[styles.chipText, cat === c.value && styles.chipTextActive]}>
              <CategoryIcon icon={c.icon} size={13} color={cat === c.value ? '#fff' : '#4b5563'} /> {c.lao}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Pressable style={[styles.vfilter, verifiedOnly && styles.vfilterOn]} onPress={() => setVerifiedOnly((v) => !v)}>
        <Text style={[styles.vfilterT, verifiedOnly && styles.vfilterTOn]}>✔️ {tt('findtech', 'ຊ່າງ ຢືນຢັນ ແລ້ວ ເທົ່ານັ້ນ')}</Text>
      </Pressable>

      <SortBar
        value={sort}
        onChange={setSort}
        options={[
          { key: 'recommended', label: tt('findtech', 'ແນະນຳ') },
          { key: 'rating', label: tt('findtech', '⭐ ຄະແນນ ສູງ') },
          { key: 'near', label: tt('findtech', '📍 ໃກ້ ຂ້ອຍ') },
        ]}
      />

      {list.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>👷</Text>
          <Text style={styles.emptyText}>{tt('findtech', 'ບໍ່ມີຊ່າງ')} {cat ? getCategory(cat)?.lao ?? '' : ''} {tt('findtech', 'ໃນຂະນະນີ້')}</Text>
          {myLat == null && (
            <Text style={styles.emptyHint}>{tt('findtech', 'ໃສ່ຕຳແໜ່ງໃນ profile ເພື່ອເຫັນໄລຍະທາງ')}</Text>
          )}
        </View>
      ) : (
        list.map(({ tech: tch, dist }) => (
          <Pressable
            key={tch.uid}
            style={styles.card}
            onPress={() => router.push(`/users/${tch.uid}` as any)}>
            {tch.image ? (
              <Image source={{ uri: tch.image }} style={styles.av} />
            ) : (
              <View style={[styles.av, styles.avEmpty]}>
                <Text style={styles.avIcon}>👷</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{tch.name}</Text>
                {tch.verified && (
                  <View style={styles.verBadge}><Text style={styles.verText}>✔️ {tt('findtech', 'ຢືນຢັນ')}</Text></View>
                )}
                {isFresh(tch.createdAt ?? 0, techCfg.freshDays) && (
                  <View style={styles.newBadge}><Text style={styles.newBadgeText}>{tt('feed', 'ໃໝ່')}</Text></View>
                )}
                {belowMin(tch) && (
                  <View style={styles.lowBadge}><Text style={styles.lowBadgeText}>{tt('findtech', 'ຄະແນນ ຕ່ຳ')}</Text></View>
                )}
              </View>
              {tch.roleDescription ? (
                <Text style={styles.role} numberOfLines={1}>{tch.roleDescription}</Text>
              ) : tch.specialties && tch.specialties.length > 0 ? (
                <Text style={styles.role} numberOfLines={1}>
                  {tch.specialties.map((s) => getCategory(s)?.lao ?? s).join(' · ')}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                {(() => {
                  const tier = techTier(tch);
                  if (tier === 'new') return null; // redundant with the freshness badge
                  const b = TIER_BADGE[tier];
                  return (
                    <View style={[styles.tierBadge, { backgroundColor: b.bg }]}>
                      <Text style={[styles.tierText, { color: b.fg }]}>{b.emoji} {tt('findtech', b.label)}</Text>
                    </View>
                  );
                })()}
                {typeof tch.rating === 'number' && (
                  <Text style={styles.rating}>⭐ {tch.rating.toFixed(1)}{tch.reviewCount ? ` (${tch.reviewCount})` : ''}</Text>
                )}
                {dist !== undefined && <Text style={styles.dist}>📍 {dist.toFixed(1)} km</Text>}
              </View>
            </View>
          </Pressable>
        ))
      )}
        </View>
        <AppFooter page="find-tech" />
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  // centered responsive column: header/footer span it, the body pads inside
  content: { alignItems: 'center', paddingBottom: 0 },
  wrap: { width: '100%' },
  body: { paddingHorizontal: 8, paddingTop: 8 },
  radiusNote: { fontSize: 12, color: colors.text2, marginBottom: 8, paddingHorizontal: 4 },
  title: { fontSize: 15, fontWeight: 'bold', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 12 },
  ctaRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  cta: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  ctaPrimary: { backgroundColor: '#0066CC' },
  ctaPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  ctaGhost: { backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#bcd6f5' },
  ctaGhostText: { color: '#0066CC', fontWeight: '700', fontSize: 12 },
  filterRow: { gap: 6, paddingBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  chipActive: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  chipText: { fontSize: 12, color: '#4b5563' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  av: { width: 52, height: 52, borderRadius: 8 },
  avEmpty: { backgroundColor: '#EAF2FB', alignItems: 'center', justifyContent: 'center' },
  avIcon: { fontSize: 24 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '600', color: '#111', flexShrink: 1 },
  newBadge: { backgroundColor: '#EF4444', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  newBadgeText: { fontSize: 12, color: '#fff', fontWeight: '800' },
  lowBadge: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 1 },
  lowBadgeText: { fontSize: 12, color: '#9a3412', fontWeight: '800' },
  role: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' },
  rating: { fontSize: 12, color: '#F59E0B', fontWeight: '600' },
  tierBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  tierText: { fontSize: 12, fontWeight: '800' },
  verBadge: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', borderWidth: 1, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 1 },
  verText: { fontSize: 12, fontWeight: '800', color: '#065f46' },
  vfilter: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#a7f3d0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 },
  vfilterOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  vfilterT: { fontSize: 12, fontWeight: '800', color: '#065f46' },
  vfilterTOn: { color: '#fff' },
  dist: { fontSize: 12, color: '#0066CC', fontWeight: '600' },
  emptyBox: { backgroundColor: '#fff', padding: 32, borderRadius: 12, alignItems: 'center' },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 14, color: '#4b5563', marginTop: 8 },
  emptyHint: { fontSize: 12, color: '#9ca3af', marginTop: 4, textAlign: 'center' },
});
