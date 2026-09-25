import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Shared geo helpers for delivery: a Leaflet loader (OpenStreetMap tiles — free,
 * no API key, same stack as app/map.tsx), great-circle distance, and the
 * distance→fee resolver. Every rate is ADMIN-CONFIGURED on the logistics
 * provider (deliveryRates / flatFee) — nothing here is a hardcoded price.
 */

/** Vientiane — the map's default centre when nothing else is known. */
// Canonical Vientiane centre — keep in sync with lib/leaflet-web.ts VIENTIANE
// (same coordinates; that one is a [lat,lng] tuple for the jobs-map stack).
export const VIENTIANE = { lat: 17.9757, lng: 102.6331 };

/**
 * Load Leaflet from CDN once (web only). Polls for window.L so an already-cached
 * script that fired 'load' before we attached is still detected.
 */
export function useLeaflet(): boolean {
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
    const iv = setInterval(() => { if ((window as any).L) { setReady(true); clearInterval(iv); } }, 150);
    const stop = setTimeout(() => clearInterval(iv), 8000);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, []);
  return ready;
}

/** Great-circle distance in km between two coordinates. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Ask the browser for the current position (web geolocation). */
export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

/** Turn-by-turn link that works on phone and desktop without any SDK. */
export function directionsUrl(to: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`;
}

/** A km→fee tier as configured by admin on the logistics provider. */
export interface DistanceRateLike { upToKm: number; fee: number }

/**
 * Fee for a trip, from the ADMIN-CONFIGURED tiers: the first tier whose
 * `upToKm` covers the distance wins; past the last tier the last tier applies.
 * Falls back to the provider's flat fee when there are no tiers, or when the
 * distance is unknown (customer didn't drop a pin) — so nothing breaks and no
 * price is invented in code.
 */
export function feeForDistance(
  provider: { flatFee?: number; deliveryRates?: DistanceRateLike[] } | null | undefined,
  km: number | undefined,
): number {
  if (!provider) return 0;
  const tiers = (provider.deliveryRates ?? [])
    .filter((r) => Number.isFinite(Number(r?.upToKm)) && Number.isFinite(Number(r?.fee)))
    .map((r) => ({ upToKm: Number(r.upToKm), fee: Number(r.fee) }))
    .sort((a, b) => a.upToKm - b.upToKm);
  if (!tiers.length || km == null || !Number.isFinite(km)) {
    return provider.flatFee != null ? Number(provider.flatFee) : (tiers[0]?.fee ?? 0);
  }
  const hit = tiers.find((t) => km <= t.upToKm);
  return (hit ?? tiers[tiers.length - 1]).fee;
}

/** Human label for the matched tier, e.g. "5–20 ກມ" (for the checkout breakdown). */
export function tierLabel(rates: DistanceRateLike[] | undefined, km: number | undefined): string {
  const tiers = (rates ?? []).map((r) => ({ upToKm: Number(r.upToKm), fee: Number(r.fee) })).sort((a, b) => a.upToKm - b.upToKm);
  if (!tiers.length || km == null) return '';
  const i = tiers.findIndex((t) => km <= t.upToKm);
  const idx = i === -1 ? tiers.length - 1 : i;
  const from = idx === 0 ? 0 : tiers[idx - 1].upToKm;
  return `${from}–${tiers[idx].upToKm} ກມ`;
}
