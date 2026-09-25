import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { loadLeaflet, VIENTIANE } from '@/lib/leaflet-web';

let counter = 0;

export interface MapPickerProps {
  lat?: number;
  lng?: number;
  onChange: (lat: number, lng: number) => void;
  height?: number;
}

export default function MapPicker({ lat, lng, onChange, height = 240 }: MapPickerProps) {
  const idRef = useRef(`map-pick-${++counter}`);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled) return;
      const el = document.getElementById(idRef.current);
      if (!el || (el as any)._leaflet_id) return;

      const start: [number, number] =
        lat !== undefined && lng !== undefined ? [lat, lng] : VIENTIANE;
      const map = L.map(idRef.current).setView(start, 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker(start, { draggable: true }).addTo(map);
      marker.on('dragend', (e: any) => {
        const ll = e.target.getLatLng();
        onChangeRef.current(ll.lat, ll.lng);
      });
      map.on('click', (e: any) => {
        marker.setLatLng(e.latlng);
        onChangeRef.current(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      setTimeout(() => map.invalidateSize(), 100);
    });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external lat/lng changes (e.g. "detect my location") onto the marker
  useEffect(() => {
    if (mapRef.current && markerRef.current && lat !== undefined && lng !== undefined) {
      const cur = markerRef.current.getLatLng();
      if (Math.abs(cur.lat - lat) > 1e-6 || Math.abs(cur.lng - lng) > 1e-6) {
        markerRef.current.setLatLng([lat, lng]);
        mapRef.current.setView([lat, lng], mapRef.current.getZoom());
      }
    }
  }, [lat, lng]);

  return (
    <View
      // @ts-ignore - nativeID becomes DOM id on web
      nativeID={idRef.current}
      style={{ height, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#d1d5db' }}
    />
  );
}
