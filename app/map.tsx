import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { type TechCard, watchTechnicians } from '@/lib/users';
import { distanceKm, type Job, watchOpenJobs } from '@/lib/jobs';
import { type Shop, watchShops } from '@/lib/shop';
import { getCategory } from '@/lib/categories';
import { emojiOnly } from '@/components/CategoryIcon';
import { type AppSettings, watchAppSettings } from '@/lib/appSettings';
import { colors, font, radius, shadow, space } from '@/lib/theme';
import { ttStatic, useTT } from '@/lib/i18n';

const VTE = { lat: 17.9757, lng: 102.6331 };

/** Radius chip options, always including the admin default. */
function buildRadii(adminKm: number) {
  const base = [0, 5, 10, 20];
  if (adminKm > 0 && !base.includes(adminKm)) base.push(adminKm);
  base.sort((a, b) => a - b);
  return base.map((km) => ({ km, lao: km === 0 ? ttStatic('map', 'ທັງໝົດ') : `${km} ${ttStatic('map', 'ກມ')}` }));
}

/** Load Leaflet from CDN once (web only). Robust: polls for window.L so we
 * don't miss an already-fired 'load' event (cached script). */
function useLeaflet() {
  const [ready, setReady] = useState(() => typeof window !== 'undefined' && !!(window as any).L);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if ((window as any).L) { setReady(true); return; }
    if (!document.getElementById('leaflet-css')) {
      const css = document.createElement('link');
      css.id = 'leaflet-css';
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }
    if (!document.getElementById('leaflet-js')) {
      const s = document.createElement('script');
      s.id = 'leaflet-js';
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      document.head.appendChild(s);
    }
    // poll until the global is available (covers cached / already-loaded script)
    const iv = setInterval(() => {
      if ((window as any).L) { setReady(true); clearInterval(iv); }
    }, 150);
    const stop = setTimeout(() => clearInterval(iv), 8000);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, []);
  return ready;
}

export default function MapScreen() {
  const { fbUser, profile } = useAuth();
  const [mode, setMode] = useState<'tech' | 'job' | 'shop'>('tech');
  const [rad, setRad] = useState(10);
  const [techs, setTechs] = useState<TechCard[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ctrlH, setCtrlH] = useState(120); // measured controls height
  const { height: winH } = useWindowDimensions();
  const mapHeight = Math.max(240, Math.round(winH - ctrlH - 56)); // 56 ≈ stack header
  const leafletReady = useLeaflet();
  const mapEl = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const radTouched = useRef(false);
  const tt = useTT();

  const center =
    profile?.lat != null && profile?.lng != null ? { lat: profile.lat, lng: profile.lng } : VTE;
  const RADII = buildRadii(settings?.searchRadiusKm ?? 10);

  useEffect(() => watchTechnicians(setTechs), []);
  useEffect(() => watchOpenJobs(fbUser?.uid ?? '', setJobs), [fbUser?.uid]);
  useEffect(() => watchShops(setShops), []);
  useEffect(() => watchAppSettings(setSettings), []);

  // default the radius: when the admin radius-gate is OFF, open at "ທັງໝົດ" (0)
  // so everyone shows; when ON, open at the admin radius. Until the user picks one.
  useEffect(() => {
    if (settings && !radTouched.current) {
      setRad(settings.radiusVisibilityEnabled ? settings.searchRadiusKm || 10 : 0);
    }
  }, [settings]);

  // init the map once Leaflet is loaded AND the container has a real height
  useEffect(() => {
    if (!leafletReady || Platform.OS !== 'web' || !mapEl.current || mapRef.current || mapHeight <= 0) return;
    const L = (window as any).L;
    const map = L.map(mapEl.current).setView([center.lat, center.lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    L.circleMarker([center.lat, center.lng], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: colors.primary,
      fillOpacity: 1,
    })
      .addTo(map)
      .bindPopup(tt('map', 'ຕຳແໜ່ງຂອງເຈົ້າ'));
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady, mapHeight]);

  // keep Leaflet sized to its container
  useEffect(() => {
    if (mapRef.current) mapRef.current.invalidateSize();
  }, [mapHeight]);

  // redraw markers when mode / radius / data change
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current || !layerRef.current) return;
    const L = (window as any).L;
    layerRef.current.clearLayers();
    const within = (lat: number, lng: number) =>
      rad === 0 || distanceKm(center.lat, center.lng, lat, lng) <= rad;
    if (mode === 'tech') {
      techs.forEach((t) => {
        if (t.lat == null || t.lng == null || !within(t.lat, t.lng)) return;
        const sub = t.roleDescription || (t.specialties ?? []).join(', ');
        const star = typeof t.rating === 'number' ? `<br/>⭐ ${t.rating.toFixed(1)}` : '';
        L.marker([t.lat, t.lng])
          .addTo(layerRef.current)
          .bindPopup(`<b>${t.name}</b><br/>${sub}${star}<br/><a href="/users/${t.uid}">${tt('map', 'ເບິ່ງໂປຣໄຟລ໌')}</a>`);
      });
    } else if (mode === 'job') {
      jobs.forEach((j) => {
        if (j.lat == null || j.lng == null || !within(j.lat, j.lng)) return;
        const c = getCategory(j.category);
        const budget = j.budget != null ? `<br/>💰 ${j.budget.toLocaleString()} ${tt('common', 'ກີບ')}` : '';
        L.marker([j.lat, j.lng])
          .addTo(layerRef.current)
          .bindPopup(`<b>${emojiOnly(c?.icon)} ${j.title}</b>${budget}<br/><a href="/jobs/${j.id}">${tt('map', 'ເບິ່ງງານ')}</a>`);
      });
    } else {
      shops.forEach((sh) => {
        if (sh.lat == null || sh.lng == null || !within(sh.lat, sh.lng)) return;
        const addr = sh.address ? `<br/>📍 ${sh.address}` : '';
        L.marker([sh.lat, sh.lng])
          .addTo(layerRef.current)
          .bindPopup(`<b>🏬 ${sh.name}</b>${addr}<br/><a href="/shop/${sh.id}">${tt('map', 'ເບິ່ງຮ້ານ')}</a>`);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, rad, techs, jobs, shops, leafletReady]);

  // native list fallback (sorted by distance)
  const listItems = (() => {
    if (mode === 'tech') {
      return techs
        .filter((t) => t.lat != null && t.lng != null)
        .map((t) => ({
          key: t.uid,
          title: t.name,
          sub: t.roleDescription || (t.specialties ?? []).join(', '),
          extra: typeof t.rating === 'number' ? `⭐ ${t.rating.toFixed(1)}` : '',
          dist: distanceKm(center.lat, center.lng, t.lat!, t.lng!),
          onPress: () => router.push(`/users/${t.uid}` as any),
        }));
    }
    if (mode === 'job') {
      return jobs
        .filter((j) => j.lat != null && j.lng != null)
        .map((j) => {
          const c = getCategory(j.category);
          return {
            key: j.id,
            title: `${emojiOnly(c?.icon)} ${j.title}`,
            sub: j.address ?? '',
            extra: j.budget != null ? `💰 ${j.budget.toLocaleString()}` : '',
            dist: distanceKm(center.lat, center.lng, j.lat!, j.lng!),
            onPress: () => router.push(`/jobs/${j.id}` as any),
          };
        });
    }
    return shops
      .filter((sh) => sh.lat != null && sh.lng != null)
      .map((sh) => ({
        key: sh.id,
        title: `🏬 ${sh.name}`,
        sub: sh.address ?? '',
        extra: '',
        dist: distanceKm(center.lat, center.lng, sh.lat!, sh.lng!),
        onPress: () => router.push(`/shop/${sh.id}` as any),
      }));
  })()
    .filter((i) => rad === 0 || i.dist <= rad)
    .sort((a, b) => a.dist - b.dist);

  return (
    <View style={styles.root}>
      <View style={styles.controls} onLayout={(e) => setCtrlH(Math.round(e.nativeEvent.layout.height))}>
        <View style={styles.seg}>
          <Pressable style={[styles.segBtn, mode === 'tech' && styles.segOn]} onPress={() => setMode('tech')}>
            <Text style={[styles.segText, mode === 'tech' && styles.segTextOn]}>{tt('map', '👷 ຊ່າງ')}</Text>
          </Pressable>
          <Pressable style={[styles.segBtn, mode === 'job' && styles.segOn]} onPress={() => setMode('job')}>
            <Text style={[styles.segText, mode === 'job' && styles.segTextOn]}>{tt('map', '🛠️ ງານ')}</Text>
          </Pressable>
          <Pressable style={[styles.segBtn, mode === 'shop' && styles.segOn]} onPress={() => setMode('shop')}>
            <Text style={[styles.segText, mode === 'shop' && styles.segTextOn]}>{tt('map', '🏬 ຮ້ານ')}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radii}>
          {RADII.map((r) => (
            <Pressable
              key={r.km}
              style={[styles.chip, rad === r.km && styles.chipOn]}
              onPress={() => { radTouched.current = true; setRad(r.km); }}>
              <Text style={[styles.chipText, rad === r.km && styles.chipTextOn]}>{r.lao}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {Platform.OS === 'web' ? (
        <View style={[styles.mapWrap, { height: mapHeight }]}>
          <View ref={mapEl} style={[styles.map, { height: mapHeight }]} />
          {!leafletReady && (
            <View style={styles.loading}>
              <Text style={styles.muted}>{tt('map', 'ກຳລັງໂຫຼດແຜນທີ່...')}</Text>
            </View>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {listItems.length === 0 ? (
            <Text style={styles.muted}>{tt('map', 'ບໍ່ມີຂໍ້ມູນ ໃນລັດສະໝີນີ້')}</Text>
          ) : (
            listItems.map((i) => (
              <Pressable key={i.key} style={styles.card} onPress={i.onPress}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{i.title}</Text>
                  {!!i.sub && <Text style={styles.cardSub} numberOfLines={1}>{i.sub}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {!!i.extra && <Text style={styles.cardExtra}>{i.extra}</Text>}
                  <Text style={styles.cardDist}>📍 {i.dist.toFixed(1)} {tt('map', 'ກມ')}</Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  controls: { padding: space.md, gap: space.sm, backgroundColor: colors.surface, ...shadow.card, zIndex: 2 },
  seg: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.full, padding: 3 },
  segBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.full },
  segOn: { backgroundColor: colors.primary },
  segText: { fontSize: font.sm, color: colors.text2, fontWeight: '600' },
  segTextOn: { color: '#fff' },
  radii: { gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.xs, color: colors.text2 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  mapWrap: { position: 'relative' },
  map: { width: '100%', backgroundColor: colors.surface2 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.text3, textAlign: 'center', padding: 24 },
  list: { padding: space.md, gap: space.sm },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, ...shadow.card },
  cardTitle: { fontSize: font.md, fontWeight: '600', color: colors.text },
  cardSub: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
  cardExtra: { fontSize: font.sm, color: colors.primary, fontWeight: '700' },
  cardDist: { fontSize: font.xs, color: colors.text3, marginTop: 2 },
});
