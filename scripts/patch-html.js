// Post-export patch for the SPA index.html (output: "single" ignores app/+html.tsx).
// Sets the document language to Lao and disables browser auto-translation, so
// Chrome stops mis-detecting Lao as Thai and machine-translating the whole UI.
// The app does its own i18n (Lao/Thai/English) — the browser must not translate.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'dist', 'index.html');
if (!fs.existsSync(file)) {
  console.error('patch-html: dist/index.html not found (run expo export first)');
  process.exit(0);
}

let html = fs.readFileSync(file, 'utf8');

// 1. <html lang="en"> → <html lang="lo" translate="no">
html = html.replace(/<html[^>]*>/i, '<html lang="lo" translate="no">');

// 2. inject the notranslate meta once, right after <head>
if (!/name=["']google["']\s+content=["']notranslate["']/i.test(html)) {
  html = html.replace(/<head>/i, '<head>\n    <meta name="google" content="notranslate" />');
}

// 2b. embed the Lao national font Phetsarath OT (from dgc.gov.la) so Lao text
// renders in a proper Lao typeface instead of the browser's Thai/system fallback.
// Files live in public/fonts (copied to dist/fonts). The override sets the font on
// every element under #root; icon glyphs (@expo/vector-icons) set font-family
// INLINE, which a non-!important rule never touches, so icons stay intact.
if (!/id=["']hs-lao-font["']/i.test(html)) {
  const FONT_STACK = "'Phetsarath OT','Noto Sans Lao',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const fontBlock =
    '<link rel="preload" href="/fonts/phetsarath_ot.woff2" as="font" type="font/woff2" crossorigin />\n' +
    '    <style id="hs-lao-font">\n' +
    "@font-face{font-family:'Phetsarath OT';" +
    "src:url('/fonts/phetsarath_ot.woff2') format('woff2')," +
    "url('/fonts/phetsarath_ot.woff') format('woff')," +
    "url('/fonts/phetsarath_ot.ttf') format('truetype');" +
    'font-weight:normal;font-style:normal;font-display:swap;}\n' +
    ':root{--hs-font:' + FONT_STACK + ';}\n' +
    'html,body,input,textarea,select,button{font-family:var(--hs-font);}\n' +
    '#root,#root *{font-family:var(--hs-font);}\n' +
    '</style>';
  html = html.replace(/<head>/i, '<head>\n    ' + fontBlock);
}

// ===================== SEO (discoverability) =====================
// The SPA ships an empty #root, so crawlers + social scrapers see only this
// static HTML. Give them a keyword-rich Lao title/description, Open-Graph +
// Twitter cards (Line/Facebook link previews), JSON-LD, and a <noscript> block
// listing the product lines — so "ວັດສະດຸ ກໍ່ສ້າງ / ເຄື່ອງໃຊ້ໄຟຟ້າ …" searches can find the store.
// (Full per-category/per-tech SEO would need SSR/prerender — a separate project.)
const SITE_URL = 'https://cnd.homesang.pro';
const BRAND = 'CND Home Hardware';
const LINES = 'ວັດສະດຸ ກໍ່ສ້າງ, ເຄື່ອງໃຊ້ ໄຟຟ້າ, ອຸປະກອນ ໄຟຟ້າ, ອຸປະກອນ ປະປາ, ແອ, ສີ ທາເຮືອນ, ເຄື່ອງມື ຊ່າງ, ຮາດແວ';
const SEO_TITLE = 'CND — ຮ້ານ ວັດສະດຸ ກໍ່ສ້າງ ແລະ ເຄື່ອງໃຊ້ໄຟຟ້າ ພ້ອມ ຊ່າງ ຕິດຕັ້ງ | ' + BRAND;
const SEO_DESC = 'CND ຮ້ານ ຂາຍ ວັດສະດຸ ກໍ່ສ້າງ ແລະ ເຄື່ອງໃຊ້ ໄຟຟ້າ ໃນ ວຽງຈັນ — ' + LINES + '. ສັ່ງ ອອນລາຍ, ສົ່ງ ເຖິງ ບ້ານ, ມີ ຊ່າງ ຕິດຕັ້ງ ໃຫ້.';
const enc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// a) rewrite the default "<title>mobile</title>"
html = html.replace(/<title>[^<]*<\/title>/i, '<title>' + enc(SEO_TITLE) + '</title>');
if (!/<title>/i.test(html)) html = html.replace(/<\/head>/i, '  <title>' + enc(SEO_TITLE) + '</title>\n  </head>');

// b) meta + Open Graph + Twitter + canonical + JSON-LD, injected once
if (!/name=["']description["']/i.test(html)) {
  const ld = {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: BRAND, url: SITE_URL, inLanguage: 'lo',
    description: SEO_DESC,
    publisher: { '@type': 'Organization', name: BRAND, url: SITE_URL, logo: SITE_URL + '/pwa-512.png' },
    potentialAction: { '@type': 'SearchAction', target: SITE_URL + '/?q={q}', 'query-input': 'required name=q' },
  };
  const seo = [
    '<meta name="description" content="' + enc(SEO_DESC) + '" />',
    '<meta name="keywords" content="' + enc('CND, ' + LINES + ', ຮ້ານ ວັດສະດຸ, ຮ້ານ ວັດສະດຸ ວຽງຈັນ, ຊື້ ວັດສະດຸ ອອນລາຍ, ຊ່າງ ຕິດຕັ້ງ, hardware store laos, buy construction materials vientiane, electrical appliances laos') + '" />',
    '<meta name="robots" content="index, follow" />',
    '<link rel="canonical" href="' + SITE_URL + '/" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="' + BRAND + '" />',
    '<meta property="og:title" content="' + enc(SEO_TITLE) + '" />',
    '<meta property="og:description" content="' + enc(SEO_DESC) + '" />',
    '<meta property="og:url" content="' + SITE_URL + '/" />',
    '<meta property="og:image" content="' + SITE_URL + '/pwa-512.png" />',
    '<meta property="og:locale" content="lo_LA" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + enc(SEO_TITLE) + '" />',
    '<meta name="twitter:description" content="' + enc(SEO_DESC) + '" />',
    '<meta name="twitter:image" content="' + SITE_URL + '/pwa-512.png" />',
    '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>',
  ].join('\n    ');
  html = html.replace(/<\/head>/i, '    ' + seo + '\n  </head>');
}

// ===================== PWA (installable web app) =====================
const dist = path.join(__dirname, '..', 'dist');

// a) copy the app icon to a stable served path for the manifest + apple-touch
try {
  fs.copyFileSync(path.join(__dirname, '..', 'assets', 'images', 'icon.png'), path.join(dist, 'pwa-512.png'));
} catch (e) {
  console.warn('patch-html: could not copy pwa icon —', e.message);
}

// b) web app manifest (one 512 icon serves both slots; Firebase serves this
//    physical file before the SPA rewrite kicks in)
const manifest = {
  name: 'CND Home Hardware',
  short_name: 'CND',
  description: 'ວັດສະດຸ ກໍ່ສ້າງ · ເຄື່ອງໃຊ້ໄຟຟ້າ · ຊ່າງ ຕິດຕັ້ງ',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#E8551E',
  lang: 'lo',
  icons: [
    { src: '/pwa-512.png', sizes: '192x192 512x512', type: 'image/png', purpose: 'any' },
  ],
};
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// c) minimal service worker — pass-through (NO caching, so it can never serve a
//    stale build) + skipWaiting/clients.claim so updates apply immediately. Its
//    only job is to make the app installable; offline caching is intentionally
//    left out given the app's cache-sensitivity.
const sw = [
  "self.addEventListener('install', function(){ self.skipWaiting(); });",
  "self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });",
  "self.addEventListener('fetch', function(){ /* network pass-through, no cache */ });",
  '',
].join('\n');
fs.writeFileSync(path.join(dist, 'sw.js'), sw);

// d) inject manifest link + iOS meta + SW registration into <head>
if (!/rel=["']manifest["']/i.test(html)) {
  const head = [
    '<link rel="manifest" href="/manifest.webmanifest" />',
    '<meta name="theme-color" content="#E8551E" />',
    '<link rel="apple-touch-icon" href="/pwa-512.png" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    '<meta name="apple-mobile-web-app-title" content="CND" />',
    "<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}</script>",
  ].join('\n    ');
  html = html.replace(/<\/head>/i, '    ' + head + '\n  </head>');
}

// d2) pre-boot route alias — /admin → /cnd/admin BEFORE the SPA boots (via
//     history.replaceState, no reload), so expo-router initializes directly on
//     the admin screen. Doing it here avoids the navigator-mount race of a
//     client-side router.replace in _layout.
if (!/id="hs-subdomain-route"/.test(html)) {
  const routeScript =
    '<script id="hs-subdomain-route">(function(){try{var p=location.pathname;if(p===\'/admin\'||p.indexOf(\'/admin/\')===0)history.replaceState(null,\'\',\'/cnd/admin\');}catch(e){}})();</script>';
  html = html.replace(/<head[^>]*>/i, function (m) { return m + '\n    ' + routeScript; });
}

// e) instant branded splash — the SPA entry bundle takes a beat to download +
//    parse, during which #root is empty (blank white screen). This paints a
//    logo + spinner immediately from the static HTML, then a tiny self-contained
//    script removes it the moment the app renders its first node into #root.
//    Purely additive to the generated HTML — no app code / structure touched.
if (!/id="hs-splash"/.test(html)) {
  const splash =
    '<div id="hs-splash" style="position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#ffffff;font-family:\'Phetsarath OT\',system-ui,\'Noto Sans Lao\',sans-serif;">' +
      '<div style="font-size:38px;font-weight:900;letter-spacing:1px;color:#2B3A4A;">C<span style="color:#E8551E;">N</span>D</div>' +
      '<div style="margin-top:18px;width:34px;height:34px;border:3px solid #e6eef7;border-top-color:#E8551E;border-radius:50%;animation:hsspin .8s linear infinite;"></div>' +
      '<style>@keyframes hsspin{to{transform:rotate(360deg)}}</style>' +
    '</div>' +
    "<script>(function(){var s=document.getElementById('hs-splash');if(!s)return;var o;function go(){if(s&&s.parentNode)s.parentNode.removeChild(s);if(o)o.disconnect();}function init(){var r=document.getElementById('root');if(r){try{o=new MutationObserver(function(){if(r.childNodes.length>0)go();});o.observe(r,{childList:true});}catch(e){}if(r.childNodes.length>0)go();}setTimeout(go,10000);}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();})();</script>";
  html = html.replace(/<body[^>]*>/i, function (m) { return m + splash; });
}

// f) crawlable <noscript> content — search engines that don't run JS (and many
//    social scrapers) still get a keyword-rich Lao summary of what the site does.
if (!/id="seo-noscript"/.test(html)) {
  const ns =
    '<noscript id="seo-noscript"><div>' +
      '<h1>CND — ຮ້ານ ວັດສະດຸ ກໍ່ສ້າງ ແລະ ເຄື່ອງໃຊ້ໄຟຟ້າ</h1>' +
      '<p>' + SEO_DESC + '</p>' +
      '<h2>ສິນຄ້າ ແລະ ບໍລິການ</h2><ul>' +
      LINES.split(', ').map(function (x) { return '<li>' + x + '</li>'; }).join('') +
      '</ul>' +
      '<p>ສັ່ງ ອອນລາຍ · ສົ່ງ ເຖິງ ບ້ານ · ຊ່າງ ຕິດຕັ້ງ · ' + SITE_URL + '</p>' +
    '</div></noscript>';
  html = html.replace(/<body[^>]*>/i, function (m) { return m + ns; });
}

// g) robots.txt + a minimal sitemap (the home URL — dynamic routes need SSR to
//    enumerate, out of scope). Allow-all so crawlers can index.
try {
  fs.writeFileSync(path.join(dist, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: ' + SITE_URL + '/sitemap.xml\n');
  fs.writeFileSync(path.join(dist, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <url><loc>' + SITE_URL + '/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n' +
    '</urlset>\n');
} catch (e) { /* best-effort */ }

fs.writeFileSync(file, html);
console.log('patch-html: lang=lo + notranslate + PWA + splash + SEO (title/meta/OG/JSON-LD/noscript/robots)');
