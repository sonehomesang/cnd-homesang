import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { DeliveryTask } from '@/lib/riders';
import { distanceKm, useLeaflet } from '@/lib/geo';
import { useTT } from '@/lib/i18n';
import { colors, font, radius } from '@/lib/theme';

/**
 * Live delivery map for the buyer: shop, destination and the rider's current
 * position (updated while the rider shares it). Renders nothing until the rider
 * has actually shared a position, so an order with no sharing simply keeps the
 * status timeline. Leaflet/OpenStreetMap — no API key, no SDK.
 */
export default function RiderLiveMap({ task }: { task: DeliveryTask }) {
  const tt = useTT();
  const ready = useLeaflet();
  const elRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const riderRef = useRef<any>(null);

  const hasRider = task.riderLat != null && task.riderLng != null;
  const drop = task.dropoffLat != null && task.dropoffLng != null
    ? { lat: task.dropoffLat, lng: task.dropoffLng } : null;
  const pick = task.pickupLat != null && task.pickupLng != null
    ? { lat: task.pickupLat, lng: task.pickupLng } : null;

  // remaining distance rider → destination
  const remainKm = hasRider && drop
    ? distanceKm({ lat: task.riderLat!, lng: task.riderLng! }, drop)
    : undefined;
  // rough ETA at ~22 km/h city average (informational only)
  const etaMin = remainKm != null ? Math.max(1, Math.round((remainKm / 22) * 60)) : undefined;

  useEffect(() => {
    if (!ready || Platform.OS !== 'web' || !elRef.current || mapRef.current || !hasRider) return;
    const L = (window as any).L;
    const map = L.map(elRef.current).setView([task.riderLat, task.riderLng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
    if (pick) L.marker([pick.lat, pick.lng]).addTo(map).bindPopup(tt('liveMap', 'ຮ້ານ'));
    if (drop) L.marker([drop.lat, drop.lng]).addTo(map).bindPopup(tt('liveMap', 'ຈຸດສົ່ງ'));
    riderRef.current = L.circleMarker([task.riderLat, task.riderLng], {
      radius: 9, color: '#fff', weight: 3, fillColor: '#0891b2', fillOpacity: 1,
    }).addTo(map).bindPopup(tt('liveMap', 'ໄຣເດີ້'));
    // frame everything we know about
    const pts = [[task.riderLat, task.riderLng], ...(pick ? [[pick.lat, pick.lng]] : []), ...(drop ? [[drop.lat, drop.lng]] : [])];
    if (pts.length > 1) map.fitBounds(pts as any, { padding: [30, 30] });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasRider]);

  // move the rider dot as new positions arrive
  useEffect(() => {
    if (!riderRef.current || !hasRider) return;
    riderRef.current.setLatLng([task.riderLat, task.riderLng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.riderLat, task.riderLng]);

  if (!hasRider || Platform.OS !== 'web') return null;

  const ageSec = task.locUpdatedAt ? Math.max(0, Math.round((Date.now() - task.locUpdatedAt) / 1000)) : undefined;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>🛰️ {tt('liveMap', 'ຕິດຕາມ ໄຣເດີ້ ສົດ')}</Text>
        <View style={styles.liveTag}><View style={styles.dot} /><Text style={styles.liveText}>{tt('liveMap', 'ສົດ')}</Text></View>
      </View>
      <View style={styles.mapWrap}>
        {/* web-only div host for Leaflet */}
        <div ref={elRef} style={{ width: '100%', height: 210 }} />
      </View>
      <Text style={styles.meta}>
        {remainKm != null ? `📍 ${tt('liveMap', 'ຍັງ')} ${remainKm.toFixed(1)} ${tt('liveMap', 'ກມ')}${etaMin ? ` · ~${etaMin} ${tt('liveMap', 'ນາທີ')}` : ''}` : ''}
        {ageSec != null ? `  ·  ${tt('liveMap', 'ອັບເດດ')} ${ageSec < 60 ? `${ageSec} ${tt('liveMap', 'ວິນາທີ')}` : `${Math.round(ageSec / 60)} ${tt('liveMap', 'ນາທີ')}`} ${tt('liveMap', 'ຜ່ານມາ')}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: '#a5f3fc', backgroundColor: '#f0fdff', borderRadius: radius.lg, padding: 12, marginTop: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: font.sm, fontWeight: '800', color: '#0e7490' },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#dc2626' },
  liveText: { fontSize: 12, fontWeight: '800', color: '#dc2626' },
  mapWrap: { borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  meta: { fontSize: font.xs, color: '#0e7490', marginTop: 8, fontWeight: '600' },
});
