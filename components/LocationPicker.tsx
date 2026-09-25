import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { currentPosition, useLeaflet, VIENTIANE } from '@/lib/geo';
import { useTT } from '@/lib/i18n';
import { colors, font, radius } from '@/lib/theme';

/**
 * Drop-a-pin location picker (Leaflet + OpenStreetMap, web). Used at checkout so
 * a delivery has real coordinates — a typed address alone can't be measured, and
 * distance is what the admin-configured delivery rates are priced on.
 * Optional by design: if the user never picks, callers fall back to the flat fee.
 */
export default function LocationPicker({
  value,
  onChange,
  height = 200,
}: {
  value?: { lat: number; lng: number } | null;
  onChange: (v: { lat: number; lng: number }) => void;
  height?: number;
}) {
  const tt = useTT();
  const ready = useLeaflet();
  const elRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState('');

  // init once Leaflet + the container are available
  useEffect(() => {
    if (!ready || Platform.OS !== 'web' || !elRef.current || mapRef.current) return;
    const L = (window as any).L;
    const start = value ?? VIENTIANE;
    const map = L.map(elRef.current).setView([start.lat, start.lng], value ? 15 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
    const marker = L.marker([start.lat, start.lng], { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      onChange({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) });
    });
    map.on('click', (e: any) => {
      marker.setLatLng(e.latlng);
      onChange({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) });
    });
    mapRef.current = map;
    markerRef.current = marker;
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // keep the marker in sync when the value changes from outside
  useEffect(() => {
    if (!markerRef.current || !value) return;
    markerRef.current.setLatLng([value.lat, value.lng]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  const useMyLocation = async () => {
    setLocating(true); setErr('');
    try {
      const p = await currentPosition();
      onChange(p);
      if (mapRef.current) mapRef.current.setView([p.lat, p.lng], 16);
      if (markerRef.current) markerRef.current.setLatLng([p.lat, p.lng]);
    } catch {
      setErr(tt('locPicker', 'ຫາ ຕຳແໜ່ງ ບໍ່ ໄດ້ — ອະນຸຍາດ location ໃນ browser ກ່ອນ'));
    } finally { setLocating(false); }
  };

  if (Platform.OS !== 'web') {
    return <Text style={styles.hint}>{tt('locPicker', 'ປັກໝຸດ ໃຊ້ ໄດ້ ເທິງ ເວັບ')}</Text>;
  }

  return (
    <View>
      <View style={[styles.mapWrap, { height }]}>
        {/* web-only div host for Leaflet */}
        <div ref={elRef} style={{ width: '100%', height: '100%', borderRadius: 10 }} />
        {!ready && <Text style={styles.loading}>{tt('locPicker', 'ກຳລັງໂຫຼດ ແຜນທີ່...')}</Text>}
      </View>
      <Text style={styles.hint}>{tt('locPicker', 'ແຕະ ແຜນທີ່ ຫຼື ລາກ ໝຸດ ໄປ ບ່ອນ ທີ່ ຕ້ອງການ ໃຫ້ ສົ່ງ')}</Text>
      <Pressable style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
        <Text style={styles.locBtnText}>{locating ? tt('locPicker', 'ກຳລັງຫາ...') : `📍 ${tt('locPicker', 'ໃຊ້ ຕຳແໜ່ງ ປັດຈຸບັນ')}`}</Text>
      </Pressable>
      {!!value && <Text style={styles.coords}>📌 {value.lat.toFixed(5)}, {value.lng.toFixed(5)}</Text>}
      {err !== '' && <Text style={styles.err}>{err}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: '#eef2f0' },
  loading: { position: 'absolute', alignSelf: 'center', top: '45%', color: colors.text3, fontSize: font.sm },
  hint: { fontSize: font.xs, color: colors.text3, textAlign: 'center', marginTop: 6 },
  locBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  locBtnText: { color: colors.primary, fontSize: font.sm, fontWeight: '700' },
  coords: { fontSize: font.xs, color: colors.text2, textAlign: 'center', marginTop: 6, fontVariant: ['tabular-nums'] },
  err: { fontSize: font.xs, color: colors.error, textAlign: 'center', marginTop: 6 },
});
