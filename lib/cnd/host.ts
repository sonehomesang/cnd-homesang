// True when the app is served from the CND partner subdomain (cnd.homesang.pro).
// Web-only; always false on native. Used to serve the CND storefront at the clean
// subdomain root (`/`) instead of redirecting to `/cnd`.
export function isCndHost(): boolean {
  return typeof window !== 'undefined'
    && typeof window.location !== 'undefined'
    && /^cnd\./i.test(window.location.hostname);
}
