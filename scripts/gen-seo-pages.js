// Generate static, keyword-optimized landing pages — one per service trade + a
// materials page — into dist/s/*.html. The app is a SPA (empty #root), so it
// can't rank per-category on its own; these are REAL HTML files Firebase serves
// directly (physical files beat the SPA rewrite), each with unique Lao content
// that funnels the visitor into the app. Legitimate category pages (substantive
// + genuinely useful), not thin doorways. Runs in build:web AFTER patch-html.
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const SITE = 'https://homesang.pro';
const enc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// key = URL slug + app category value; trade = the searched Lao word (ຊ່າງໄຟ …)
const SERVICES = [
  { key: 'electrical', lao: 'ໄຟຟ້າ', trade: 'ຊ່າງໄຟ', icon: '⚡', tasks: ['ຕິດຕັ້ງ ແລະ ເດີນ ສາຍ ໄຟ', 'ຕິດ ປລັກ ສະວິດ ໂຄມໄຟ', 'ຕິດຕັ້ງ ຕູ້ໄຟ ແລະ ເບຣກເກີ', 'ກວດ ແລະ ແກ້ ໄຟຮົ່ວ ໄຟຕັດ', 'ວາງ ລະບົບ ໄຟ ເຮືອນ-ຮ້ານ-ໂຮງງານ'] },
  { key: 'plumbing', lao: 'ປະປາ', trade: 'ຊ່າງປະປາ', icon: '💧', tasks: ['ຕິດຕັ້ງ ແລະ ເດີນ ທໍ່ນ້ຳ', 'ແກ້ ນ້ຳຮົ່ວ ນ້ຳຕັນ', 'ຕິດ ກັອກນ້ຳ ໂຖສ້ວມ ອ່າງລ້າງ', 'ຕິດຕັ້ງ ປັ໊ມນ້ຳ ແລະ ຖັງນ້ຳ', 'ວາງ ລະບົບ ນ້ຳ ດີ-ນ້ຳ ເສຍ'] },
  { key: 'aircon', lao: 'ແອ', trade: 'ຊ່າງແອ', icon: '❄️', tasks: ['ຕິດຕັ້ງ ແອ ໃໝ່', 'ລ້າງ ແອ ທຳຄວາມສະອາດ', 'ຕື່ມ ນ້ຳຢາ ແອ', 'ຍ້າຍ ແລະ ຖອດ ແອ', 'ກວດ-ສ້ອມ ແອ ບໍ່ ເย็น'] },
  { key: 'carpenter', lao: 'ຊ່າງໄມ້', trade: 'ຊ່າງໄມ້', icon: '🔨', tasks: ['ເຮັດ ຕູ້ ຕຽງ ໂຕະ ເຟີນິເຈີ', 'ຕິດຕັ້ງ ປະຕູ ໜ້າຕ່າງ', 'ບຸ ຝ້າ ເພດານ ພື້ນໄມ້', 'ສ້ອມແປງ ເຄື່ອງໄມ້', 'ອອກແບບ ງານໄມ້ ຕາມສັ່ງ'] },
  { key: 'painter', lao: 'ທາສີ', trade: 'ຊ່າງທາສີ', icon: '🎨', tasks: ['ທາ ສີ ເຮືອນ ພາຍໃນ-ພາຍນອກ', 'ພ່ນ ສີ ຮົ້ວ ກຳແພງ', 'ໂປ໊ະ ຮອຍແຕກ ກ່ອນ ທາ', 'ທາ ສີ ກັນ ຮ້ອນ ກັນ ຮົ່ວ', 'ຕົກແຕ່ງ ສີ ຕາມ ແບບ'] },
  { key: 'cleaning', lao: 'ທຳສະອາດ', trade: 'ຊ່າງ ທຳຄວາມສະອາດ', icon: '✨', tasks: ['ທຳຄວາມສະອາດ ເຮືອນ ຫ້ອງການ', 'ທຳຄວາມສະອາດ ຫຼັງ ກໍ່ສ້າງ', 'ຂັດ ພື້ນ ລ້າງ ກະຈົກ', 'ທຳຄວາມສະອາດ ໂຊຟາ ຜ້າມ່ານ', 'ບໍລິການ ລາຍ ຄັ້ງ / ລາຍ ເດືອນ'] },
  { key: 'construction', lao: 'ກໍ່ສ້າງ', trade: 'ຊ່າງກໍ່ສ້າງ', icon: '🏗️', tasks: ['ກໍ່ ອິດ ເທ ປູນ', 'ຕໍ່ເຕີມ ຕໍ່ຂະຫຍາຍ ເຮືອນ', 'ปู ກະເບື້ອງ ตกแต่ง', 'ງານ ໂຄງສ້າງ ຄອນກรีต', 'ຮັບເໝົາ ກໍ່ສ້າງ ທັງ ໂຄງການ'] },
  { key: 'garden', lao: 'ສວນ', trade: 'ຊ່າງ ຈັດສວນ', icon: '🌿', tasks: ['ຕັດ ຫຍ້າ ຕັດ ຕົ້ນໄມ້', 'ອອກແບບ ແລະ ຈັດ ສວນ', 'ປູກ ຕົ້ນໄມ້ ຈັດ ພູມ', 'ວາງ ລະບົບ ຫົດ ນ້ຳ', 'ດູແລ ສວນ ລາຍ ເດືອນ'] },
  { key: 'moving', lao: 'ຍ້າຍຂອງ', trade: 'ຊ່າງ ຍ້າຍເຮືອນ', icon: '📦', tasks: ['ຍ້າຍ ເຮືອນ ຍ້າຍ ຫ້ອງການ', 'ຫໍ່ ແລະ ຂົນ ເຄື່ອງ', 'ຖອດ-ປະກອບ ເຟີນິເຈີ', 'ລົດ ຂົນສົ່ງ ພ້ອມ ຄົນ ຍົກ', 'ຍ້າຍ ພາຍໃນ-ຕ່າງແຂວງ'] },
  { key: 'cctv', lao: 'CCTV', trade: 'ຊ່າງ ຕິດ ກ້ອງ CCTV', icon: '📹', tasks: ['ຕິດຕັ້ງ ກ້ອງ ວົງຈອນ ปิด', 'ເດີນ ສາຍ ແລະ ຕັ້ງ ລະບົບ', 'ຕັ້ງ ເບິ່ງ ຜ່ານ ມືຖື', 'ຕິດ ກ້ອງ ເຮືອນ ຮ້ານ ໂກดัง', 'ກວດ-ສ້ອມ ລະບົບ ກ້ອງ'] },
];

const MATERIALS = {
  key: 'vatsadu', lao: 'ວັດສະດຸ ກໍ່ສ້າງ', trade: 'ຊື້ ວັດສະດຸ ກໍ່ສ້າງ', icon: '🧱',
  tasks: ['ອຸປະກອນ ໄຟຟ້າ (ສາຍໄຟ ປລັກ ໂຄມ)', 'ອຸປະກອນ ປະປາ (ທໍ່ ກັອກ ปั๊ม)', 'ສີ ທາ ແລະ ອຸປະກອນ ທາສີ', 'ເຄື່ອງມື ຊ່າງ ແລະ ຮາດແວร์', 'ວັດສະດຸ ກໍ່ສ້າງ ທົ່ວໄປ'],
};

const ALL = SERVICES.concat([MATERIALS]);
const NAV = ALL.map((s) => '<a href="/s/' + s.key + '.html">' + s.icon + ' ' + enc(s.trade) + '</a>').join(' · ');

function page(s) {
  const isMat = s.key === 'vatsadu';
  const title = isMat
    ? 'ຊື້ ວັດສະດຸ ກໍ່ສ້າງ ອອນລາຍ ໃນ ລາວ — ໂຮມຊ່າງ | HomeSang'
    : 'ຫາ ' + s.trade + ' ໃກ້ຕົວ ໃນ ລາວ — ' + s.trade + ' ມືອາຊີບ | ໂຮມຊ່າງ';
  const desc = isMat
    ? 'ຊື້ ວັດສະດຸ ກໍ່ສ້າງ ແລະ ອຸປະກອນ ຊ່າງ ອອນລາຍ ໃນ ລາວ ຜ່ານ ໂຮມຊ່າງ — ' + s.tasks.join(', ') + '. ສົ່ງ ເຖິງ ບ້ານ, ຈ່າຍ ໄດ້ ຫຼາຍ ຊ່ອງທາງ.'
    : 'ຫາ ' + s.trade + ' ມືອາຊີບ ໃກ້ຕົວ ໃນ ລາວ ຜ່ານ ໂຮມຊ່າງ — ' + s.tasks.join(', ') + '. ໂພສງານ ຟຣີ, ຮັບໃບສະເໜີລາຄາ, ເລືອກ ຊ່າງ ຈາກ ຄະແນນ ຣີວິວ.';
  const kw = [s.trade, 'ຫາ' + s.trade, s.trade + ' ວຽງຈັນ', s.trade + ' ລາວ', s.trade + ' ໃກ້ຕົວ', 'ໂຮມຊ່າງ', 'HomeSang'].join(', ');
  const cta = isMat ? 'ເປີດ ໂຮມເຄື່ອງ ຊື້ ວັດສະດຸ' : 'ເປີດ ແອັບ ຫາ ' + s.trade;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Service',
    name: s.trade, areaServed: { '@type': 'Country', name: 'Laos' },
    provider: { '@type': 'Organization', name: 'ໂຮມຊ່າງ HomeSang', url: SITE, logo: SITE + '/pwa-512.png' },
    description: desc, inLanguage: 'lo', url: SITE + '/s/' + s.key + '.html',
  };
  const related = ALL.filter((x) => x.key !== s.key);
  return '<!doctype html>\n<html lang="lo" translate="no">\n<head>\n' +
    '<meta charset="utf-8" />\n<meta name="google" content="notranslate" />\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    '<title>' + enc(title) + '</title>\n' +
    '<meta name="description" content="' + enc(desc) + '" />\n' +
    '<meta name="keywords" content="' + enc(kw) + '" />\n' +
    '<meta name="robots" content="index, follow" />\n' +
    '<link rel="canonical" href="' + SITE + '/s/' + s.key + '.html" />\n' +
    '<meta property="og:type" content="website" />\n' +
    '<meta property="og:site_name" content="ໂຮມຊ່າງ HomeSang" />\n' +
    '<meta property="og:title" content="' + enc(title) + '" />\n' +
    '<meta property="og:description" content="' + enc(desc) + '" />\n' +
    '<meta property="og:url" content="' + SITE + '/s/' + s.key + '.html" />\n' +
    '<meta property="og:image" content="' + SITE + '/pwa-512.png" />\n' +
    '<meta property="og:locale" content="lo_LA" />\n' +
    '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>\n' +
    '<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,"Noto Sans Lao",sans-serif;color:#0f172a;background:#f8fafc;line-height:1.65}' +
    '.wrap{max-width:760px;margin:0 auto;padding:20px 16px 48px}a{color:#0066CC;text-decoration:none}' +
    '.brand{font-weight:800;font-size:20px}.brand b{color:#0066CC}.brand i{color:#F47B20;font-style:normal}' +
    'h1{font-size:26px;margin:18px 0 6px}h2{font-size:18px;margin:26px 0 8px}p{color:#334155}' +
    'ul{padding-left:20px}li{margin:5px 0;color:#334155}' +
    '.cta{display:inline-block;background:#0066CC;color:#fff;font-weight:800;padding:14px 22px;border-radius:12px;margin:14px 0}' +
    '.steps{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}.step{flex:1;min-width:160px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px}' +
    '.nav{font-size:14px;color:#475569;margin-top:8px}.rel{background:#fff;border:1px solid #eef0f3;border-radius:12px;padding:14px;margin-top:24px}' +
    '.foot{color:#94a3b8;font-size:13px;margin-top:30px;border-top:1px solid #e5e7eb;padding-top:14px}</style>\n' +
    '</head>\n<body>\n<div class="wrap">\n' +
    '<div class="brand"><b>ໂຮມ</b><i>ຊ່າງ</i> · HomeSang</div>\n' +
    '<h1>' + s.icon + ' ' + enc(isMat ? 'ຊື້ ວັດສະດຸ ກໍ່ສ້າງ ອອນລາຍ ໃນ ລາວ' : 'ຫາ ' + s.trade + ' ໃກ້ຕົວ ໃນ ລາວ') + '</h1>\n' +
    '<p>' + enc(desc) + '</p>\n' +
    '<a class="cta" href="/">' + enc(cta) + ' →</a>\n' +
    '<h2>' + enc(isMat ? 'ມີ ຫຍັງ ຂາຍ ແດ່' : s.trade + ' ຮັບ ວຽກ ຫຍັງ ແດ່') + '</h2>\n<ul>' +
    s.tasks.map((t) => '<li>' + enc(t) + '</li>').join('') + '</ul>\n' +
    '<h2>ໃຊ້ ໂຮມຊ່າງ ແນວໃດ</h2>\n<div class="steps">' +
    (isMat
      ? '<div class="step">1) ເລືອກ ສິນຄ້າ ໃນ ໂຮมເຄື່ອງ</div><div class="step">2) ສັ່ງຊື້ + ເລືອກ ວິທີ ຈ່າຍ</div><div class="step">3) ຮັບ ເຄື່ອງ ສົ່ງ ເຖິງ ບ້ານ</div>'
      : '<div class="step">1) ໂພສ ງານ ຟຣີ ບອກ ລາຍລະອຽດ</div><div class="step">2) ຮັບ ໃບ ສະເໜີ ລາຄາ ຈາກ ' + enc(s.trade) + '</div><div class="step">3) ເລືອກ ຊ່າງ ຈາກ ຄະແນນ ຣີວິວ</div>') +
    '</div>\n' +
    '<a class="cta" href="/">' + enc(cta) + ' →</a>\n' +
    '<div class="rel"><b>ບໍລິການ ອື່ນ ໃນ ໂຮມຊ່າງ</b><div class="nav">' +
    related.map((r) => '<a href="/s/' + r.key + '.html">' + r.icon + ' ' + enc(r.trade) + '</a>').join(' · ') + '</div></div>\n' +
    '<div class="foot">ໂຮມຊ່າງ (HomeSang) — ຫາຊ່າງ · ຊື້ວັດສະດຸ · ຄົບ ໃນ ບ່ອນ ດຽວ · <a href="/">homesang.pro</a></div>\n' +
    '</div>\n</body>\n</html>\n';
}

try {
  const outDir = path.join(dist, 's');
  fs.mkdirSync(outDir, { recursive: true });
  ALL.forEach((s) => fs.writeFileSync(path.join(outDir, s.key + '.html'), page(s)));

  // full sitemap: home + every landing page
  const urls = ['<url><loc>' + SITE + '/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>']
    .concat(ALL.map((s) => '<url><loc>' + SITE + '/s/' + s.key + '.html</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>'));
  fs.writeFileSync(path.join(dist, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ' +
    urls.join('\n  ') + '\n</urlset>\n');

  console.log('gen-seo-pages: ' + ALL.length + ' landing pages + sitemap (' + (ALL.length + 1) + ' urls)');
} catch (e) {
  console.warn('gen-seo-pages: skipped —', e.message);
}
