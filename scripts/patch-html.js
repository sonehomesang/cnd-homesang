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
// listing the trades — so "ຊ່າງໄຟ / ຊ່າງປະປາ / ຊ່າງແອ …" searches can find the site.
// (Full per-category/per-tech SEO would need SSR/prerender — a separate project.)
const SITE_URL = 'https://homesang.pro';
const TRADES = 'ຊ່າງໄຟ, ຊ່າງປະປາ, ຊ່າງແອ, ຊ່າງກໍ່ສ້າງ, ຊ່າງໄມ້, ຊ່າງທາສີ, ຊ່າງເຫຼັກ, ຊ່າງເຊື່ອມ, ຊ່າງປູກະເບື້ອງ, ຊ່າງຫຼັງຄາ, ຊ່າງເຄື່ອງເຢັນ, ຊ່າງກະຈົກ, ຊ່າງຊ່ອມແປງ';
const SEO_TITLE = 'ໂຮມຊ່າງ — ຫາຊ່າງໄຟ ຊ່າງປະປາ ຊ່າງແອ ຊ່າງກໍ່ສ້າງ ແລະ ຊື້ວັດສະດຸ | HomeSang';
const SEO_DESC = 'ໂຮມຊ່າງ (HomeSang) ແພລດຟອມ ຫາຊ່າງ ມືອາຊີບ ໃນ ລາວ — ' + TRADES + ' ແລະ ອື່ນໆ. ໂພສງານ ຟຣີ ຮັບໃບສະເໜີລາຄາ ຈາກ ຊ່າງ ໃກ້ຕົວ, ຊື້ວັດສະດຸ ກໍ່ສ້າງ ຄົບ ໃນ ບ່ອນ ດຽວ.';
const enc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// a) rewrite the default "<title>mobile</title>"
html = html.replace(/<title>[^<]*<\/title>/i, '<title>' + enc(SEO_TITLE) + '</title>');
if (!/<title>/i.test(html)) html = html.replace(/<\/head>/i, '  <title>' + enc(SEO_TITLE) + '</title>\n  </head>');

// b) meta + Open Graph + Twitter + canonical + JSON-LD, injected once
if (!/name=["']description["']/i.test(html)) {
  const ld = {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: 'ໂຮມຊ່າງ HomeSang', url: SITE_URL, inLanguage: 'lo',
    description: SEO_DESC,
    publisher: { '@type': 'Organization', name: 'ໂຮມຊ່າງ HomeSang', url: SITE_URL, logo: SITE_URL + '/pwa-512.png' },
    potentialAction: { '@type': 'SearchAction', target: SITE_URL + '/?q={q}', 'query-input': 'required name=q' },
  };
  const seo = [
    '<meta name="description" content="' + enc(SEO_DESC) + '" />',
    '<meta name="keywords" content="' + enc('ຫາຊ່າງ, ຫາຊ່າງ ໃກ້ຕົວ, ຊ່າງ ລາວ, ຊ່າງ ວຽງຈັນ, ໂພສງານ ຊ່າງ, ' + TRADES + ', ວັດສະດຸ ກໍ່ສ້າງ, ຮ້ານ ວັດສະດຸ, ອຸປະກອນ ໄຟຟ້າ, ອຸປະກອນ ປະປາ, ສີ ທາເຮືອນ, ເຄື່ອງມື ຊ່າງ, ຊື້ ວັດສະດຸ ອອນລາຍ, ໂຮມຊ່າງ, HomeSang, find technician laos, hire electrician plumber aircon laos, buy construction materials laos') + '" />',
    '<meta name="robots" content="index, follow" />',
    '<link rel="canonical" href="' + SITE_URL + '/" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="ໂຮມຊ່າງ HomeSang" />',
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
  name: 'HomeSang ໂຮມຊ່າງ',
  short_name: 'ໂຮມຊ່າງ',
  description: 'ຫາຊ່າງ · ຊື້ວັດສະດຸ · ຄົບ ໃນ ບ່ອນ ດຽວ',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#0066CC',
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
    '<meta name="theme-color" content="#0066CC" />',
    '<link rel="apple-touch-icon" href="/pwa-512.png" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    '<meta name="apple-mobile-web-app-title" content="ໂຮມຊ່າງ" />',
    "<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}</script>",
  ].join('\n    ');
  html = html.replace(/<\/head>/i, '    ' + head + '\n  </head>');
}

// d2) pre-boot subdomain routing — mkplan.* is the MK Plan marketing platform.
//     Rewrite the URL to /mk BEFORE the SPA boots (via history.replaceState, no
//     reload) so expo-router initializes directly on /mk. Doing it here — rather
//     than a client-side router.replace in _layout — avoids the navigator-mount
//     race that otherwise leaves the subdomain sitting on the home screen. Only
//     fires on the subdomain root; never touches homesang.pro.
if (!/id="hs-subdomain-route"/.test(html)) {
  const routeScript =
    '<script id="hs-subdomain-route">(function(){try{var h=location.hostname,p=location.pathname;if(/^mkplan\\./i.test(h)){if(p===\'/\'||p===\'\')history.replaceState(null,\'\',\'/mk\'+location.search+location.hash);}else if(/^cnd\\./i.test(h)){if(p===\'/admin\'||p.indexOf(\'/admin/\')===0)history.replaceState(null,\'\',\'/cnd/admin\');}}catch(e){}})();</script>';
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
      '<div style="font-size:34px;font-weight:800;letter-spacing:.5px;"><span style="color:#0066CC;">ໂຮມ</span><span style="color:#F47B20;">ຊ່າງ</span></div>' +
      '<div style="margin-top:18px;width:34px;height:34px;border:3px solid #e6eef7;border-top-color:#0066CC;border-radius:50%;animation:hsspin .8s linear infinite;"></div>' +
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
      '<h1>ໂຮມຊ່າງ HomeSang — ຫາຊ່າງ ມືອາຊີບ ໃນ ລາວ</h1>' +
      '<p>' + SEO_DESC + '</p>' +
      '<h2>ປະເພດ ຊ່າງ ທີ່ ຫາ ໄດ້</h2><ul>' +
      TRADES.split(', ').map(function (x) { return '<li>' + x + '</li>'; }).join('') +
      '</ul>' +
      '<p>ໂພສງານ ຟຣີ · ຮັບໃບສະເໜີລາຄາ · ຊື້ວັດສະດຸ ກໍ່ສ້າງ · ' + SITE_URL + '</p>' +
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
