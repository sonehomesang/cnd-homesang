import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { loadLeaflet } from '@/lib/leaflet-web';

let counter = 0;

export interface LocationMapProps {
  lat: number;
  lng: number;
  height?: number;
}

export default function LocationMap({ lat, lng, height = 200 }: LocationMapProps) {
  const idRef = useRef(`map-view-${++counter}`);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled) return;
      const el = document.getElementById(idRef.current);
      if (!el || (el as any)._leaflet_id) return;
      const map = L.map(idRef.current, {
        zoomControl: true,
        dragging: true,
        scrollWheelZoom: false,
      }).setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      L.marker([lat, lng]).addTo(map);
      mapRef.current = map;
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
  }, [lat, lng]);

  return (
    <View
      // @ts-ignore - nativeID becomes DOM id on web
      nativeID={idRef.current}
      style={{ height, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#d1d5db' }}
    />
  );
}
