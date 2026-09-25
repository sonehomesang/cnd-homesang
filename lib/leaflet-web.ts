// Web-only: dynamically load Leaflet (JS + CSS) from CDN once.
// Avoids bundler CSS/asset handling. Returns the global `L`.

let loadingPromise: Promise<any> | null = null;

export function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet is web-only'));
  }
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    // CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    // JS
    const existing = document.getElementById('leaflet-js') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).L));
      return;
    }
    const script = document.createElement('script');
    script.id = 'leaflet-js';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });
  return loadingPromise;
}

// Keep this canonical Vientiane centre in sync with lib/geo.ts VIENTIANE
// (same coordinates, different shape: tuple here for the jobs-map stack).
export const VIENTIANE: [number, number] = [17.9757, 102.6331];
