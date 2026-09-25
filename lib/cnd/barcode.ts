/**
 * Minimal Code 128-B barcode generator (self-contained — no external library) +
 * a browser price-label print sheet. Renders scannable SVG bars from a product's
 * SKU. Web only (uses window.open / window.print).
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104, STOP = 106, MODULE = 2, HEIGHT = 54;

/** Raw <svg> string of a Code128-B barcode for the given text. */
export function code128Svg(text: string): string {
  const clean = (text || '').replace(/[^\x20-\x7E]/g, '').slice(0, 24) || '00000';
  const codes: number[] = [START_B];
  let sum = START_B;
  for (let i = 0; i < clean.length; i++) { const v = clean.charCodeAt(i) - 32; codes.push(v); sum += v * (i + 1); }
  codes.push(sum % 103);
  codes.push(STOP);
  let x = 0;
  const rects: string[] = [];
  for (const c of codes) {
    const pat = PATTERNS[c];
    if (!pat) continue;
    for (let i = 0; i < pat.length; i++) {
      const w = parseInt(pat[i], 10) * MODULE;
      if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="${HEIGHT}" fill="#000"/>`);
      x += w;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${HEIGHT}" viewBox="0 0 ${x} ${HEIGHT}">${rects.join('')}</svg>`;
}
/** Same barcode as a data URI (for <Image> previews inside the app). */
export function code128DataUri(text: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(code128Svg(text));
}

function esc(s: string): string { return (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }

/** Open a print sheet of price labels (name · price · barcode · SKU), repeated by qty. */
export function printCndLabels(items: { name: string; price: number; sku?: string; unit?: string; qty?: number }[], storeName = 'CND'): boolean {
  if (typeof window === 'undefined') return false;
  const cards: string[] = [];
  for (const p of items) {
    const n = Math.max(1, Math.min(200, p.qty || 1));
    const code = (p.sku || '').trim() || p.name.slice(0, 12);
    const bc = code128Svg(code);
    for (let i = 0; i < n; i++) {
      cards.push(`<div class="lbl"><div class="st">${esc(storeName)}</div><div class="nm">${esc(p.name)}</div><div class="pr">${(p.price || 0).toLocaleString('en-US')} <span>ກີບ${p.unit ? '/' + esc(p.unit) : ''}</span></div><div class="bc">${bc}</div><div class="sku">${esc(code)}</div></div>`);
    }
  }
  if (cards.length === 0) return false;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>ປ້າຍ ລາຄາ ${esc(storeName)}</title><style>
    *{box-sizing:border-box;margin:0}
    body{font-family:'Noto Sans Lao','Segoe UI',sans-serif;padding:8px;display:flex;flex-wrap:wrap;gap:6px}
    .lbl{width:52mm;height:32mm;border:1px dashed #bbb;border-radius:4px;padding:5px 7px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;page-break-inside:avoid}
    .st{font-size:8px;font-weight:800;color:#E8551E;letter-spacing:1px}
    .nm{font-size:11px;font-weight:700;line-height:1.15;max-height:26px;overflow:hidden}
    .pr{font-size:19px;font-weight:900;color:#111}.pr span{font-size:9px;font-weight:600;color:#666}
    .bc{height:34px;display:flex;align-items:center}.bc svg{height:34px;width:auto;max-width:100%}
    .sku{font-size:8px;color:#555;letter-spacing:1px;text-align:center}
    @media print{body{padding:0;gap:0}.lbl{border:1px solid #eee}}
  </style></head><body>${cards.join('')}
  <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { try { alert('ເປີດ ໜ້າ ພິມ ບໍ່ ໄດ້ — ອະນຸຍາດ popup ກ່ອນ'); } catch {} return false; }
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
