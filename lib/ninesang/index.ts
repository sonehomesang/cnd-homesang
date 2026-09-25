/**
 * ນາຍຊ່າງ / craftsman-service module — SHARED logic for the "buy a product → use a
 * recommended technician" feature. Kept framework/namespace-agnostic (pure funcs +
 * plain types, no Firestore) so BOTH CND (cnd* data) and HomeSang can reuse it.
 * Brand for CND = "CND-ໂຮມຊ່າງ".
 */
import { ttStatic } from '../i18n';                 // shared unit words → translatable (cndCommon)

export const NINESANG_BRAND = 'CND-ໂຮມຊ່າງ';        // CND service brand
export const NINESANG_BRAND_HS = 'ໂຮມຊ່າງ';          // HomeSang variant

// ── Skill tier (auto, from completed jobs + average rating) ──────────────────
export interface TechTier { key: string; name: string; short: string; icon: string; color: string; minJobs: number; minRating: number; }
export const TECH_TIERS: TechTier[] = [
  { key: 'master',   name: 'ຊ່າງ ລະດັບ ໂທ',   short: 'Master',   icon: '🏆', color: '#C4400F', minJobs: 20, minRating: 4.7 },
  { key: 'pro',      name: 'ຊ່າງ ມື ອາຊີບ',   short: 'Pro',      icon: '⭐', color: '#E8551E', minJobs: 8,  minRating: 4.3 },
  { key: 'verified', name: 'ຊ່າງ ຜ່ານ ງານ',   short: 'Skilled',  icon: '🔧', color: '#0E7490', minJobs: 1,  minRating: 0 },
  { key: 'new',      name: 'ຊ່າງ ໃໝ່',        short: 'New',      icon: '🌱', color: '#556072', minJobs: 0,  minRating: 0 },
];
/** Pick the highest tier the tech qualifies for (jobs + avg rating). */
export function computeTechTier(jobsDone: number, ratingAvg: number): TechTier {
  for (const t of TECH_TIERS) if (jobsDone >= t.minJobs && ratingAvg >= t.minRating) return t;
  return TECH_TIERS[TECH_TIERS.length - 1];
}

// ── Performance stats from a list of install jobs (caller maps its own data) ──
export interface TechJob { done: boolean; onTime?: boolean; rating?: number; }
export interface TechStats { jobsDone: number; ratingAvg: number; onTimePct: number; rated: number; }
export function techStatsFrom(jobs: TechJob[]): TechStats {
  const done = jobs.filter((j) => j.done);
  const rated = done.filter((j) => typeof j.rating === 'number');
  const ratingAvg = rated.length ? Math.round((rated.reduce((s, j) => s + (j.rating || 0), 0) / rated.length) * 10) / 10 : 0;
  const onT = done.filter((j) => j.onTime === true).length;
  return { jobsDone: done.length, ratingAvg, onTimePct: done.length ? Math.round((onT / done.length) * 100) : 0, rated: rated.length };
}

// ── Auto-match "CND ຈັດ ໃຫ້" (recommend a technician) ────────────────────────
export interface TechCandidate { id: string; name?: string; trade?: string; area?: string; verified?: boolean; jobsDone?: number; ratingAvg?: number; active?: boolean; }
const tokens = (s?: string) => (s || '').toLowerCase().split(/[\s·,\/|]+/).filter(Boolean);
function areaOverlap(a?: string, b?: string): boolean {
  const A = tokens(a), B = tokens(b);
  return A.some((x) => B.some((y) => x.includes(y) || y.includes(x)));
}
function tradeMatch(techTrade?: string, want?: string): boolean {
  if (!techTrade || !want) return false;
  const t = techTrade.toLowerCase(), w = want.toLowerCase();
  return t.includes(w) || w.includes(t);
}
/** Rank active technicians by trade + area + credibility − current load; best first. */
export function rankTechs(cands: TechCandidate[], want: { trade?: string; area?: string; loadByTech?: Record<string, number> }): TechCandidate[] {
  const score = (t: TechCandidate): number => {
    let s = 0;
    if (tradeMatch(t.trade, want.trade)) s += 100;
    if (want.area && areaOverlap(t.area, want.area)) s += 40;
    if (t.verified) s += 25;
    s += Math.min(20, (t.ratingAvg || 0) * 4) + Math.min(15, (t.jobsDone || 0));
    s -= (want.loadByTech?.[t.id] || 0) * 8;   // prefer a less-loaded tech
    return s;
  };
  return cands.filter((t) => t.active !== false).map((t) => ({ t, s: score(t) })).sort((a, b) => b.s - a.s).map((x) => x.t);
}
export function pickBestTech(cands: TechCandidate[], want: { trade?: string; area?: string; loadByTech?: Record<string, number> }): TechCandidate | null {
  return rankTechs(cands, want)[0] ?? null;
}
/** Guess a trade keyword from install item names (electrical / plumbing / aircon / paint …). */
export function guessTrade(names: string[]): string {
  const s = names.join(' ');
  if (/ແອ|air|btu/i.test(s)) return 'ແອ';
  if (/ໄຟ|led|ສາຍ|ปลั๊ก|ສະວິດ|breaker|solar|ໂຊລ່າ/i.test(s)) return 'ໄຟຟ້າ';
  if (/ປະປາ|ນ້ຳ|ท่อ|ปั๊ม|ໂຖ|ອ່າງ|ຝັກບົວ|ສຸຂະພັນ/i.test(s)) return 'ປະປາ';
  if (/ສີ|paint|ທາ/i.test(s)) return 'ທາສີ';
  if (/ກະເບື້ອງ|ปูน|ອິດ|ຫີນ|ໄມ້|ກໍ່ສ້າງ/i.test(s)) return 'ກໍ່ສ້າງ';
  return '';
}

// ── Warranty ─────────────────────────────────────────────────────────────────
/** Human Lao form of a warranty length in days: ວັນ / ເດືອນ / ປີ. */
export function formatWarrantyDays(days?: number): string {
  if (!days || days <= 0) return '';
  if (days % 365 === 0) return `${days / 365} ${ttStatic('cndCommon', 'ປີ')}`;
  if (days % 30 === 0) return `${days / 30} ${ttStatic('cndCommon', 'ເດືອນ')}`;
  return `${days} ${ttStatic('cndCommon', 'ວັນ')}`;
}
/** Warranty end timestamp (ms) from a handover time + warranty length in days. */
export function warrantyUntil(handoverAtMs: number, days?: number): number {
  if (!handoverAtMs || !days) return 0;
  return handoverAtMs + days * 24 * 60 * 60 * 1000;
}

// ── Service terms & conditions (Lao) — shown + agreed at checkout ─────────────
export const SERVICE_TERMS: string[] = [
  'ວຽກ ໃຫຍ່ (ຕິດຕັ້ງ ແອ · ປູ ກະເບື້ອງ · ທາ ສີ · ປັ໊ມ/ຖັງ ນ້ຳ · ຕໍ່ເຕີມ ຄົວ/ຫ້ອງນ້ຳ) ອາດ ຕ້ອງ ສຳຫຼວດ ໜ້າ ງານ ກ່ອນ.',
  'ຄ່າ ສຳຫຼວດ ໜ້າ ງານ (ຖ້າ ມີ) ຈະ ຄືນ ເປັນ ສ່ວນ ຫຼຸດ ເມື່ອ ຕົກລົງ ໃຊ້ ບໍລິການ; ຖ້າ ບໍ່ ດຳເນີນ ຕໍ່ = ຄ່າ ເດີນທາງ ຊ່າງ.',
  'ກະລຸນາ ຕຽມ ພື້ນ ທີ່ ໃຫ້ ພ້ອມ ກ່ອນ ວັນ ນັດ · ເລື່ອນ ນັດ ແຈ້ງ ລ່ວງ ໜ້າ ຢ່າງ ໜ້ອຍ 1 ວັນ.',
  'ຮັບປະກັນ ວຽກ ຕາມ ປະເພດ ບໍລິການ (ສະແດງ ໃນ ແຕ່ ລະ ລາຍການ) ເລີ່ມ ນັບ ຈາກ ວັນ ຮັບ ງານ.',
  'ອຸປະກອນ ຄິດ ຕາມ ທີ່ ໃຊ້ ຈິງ · ວຽກ ນອກ ເໜືອ ລາຍການ ຄິດ ເພີ່ມ ຕາມ ຕົກລົງ.',
  'ລູກຄ້າ ເຊັນ ຮັບ ງານ ແລ້ວ ຖື ວ່າ ວຽກ ສຳເລັດ ຕາມ ມາດຕະຖານ.',
];

/** Sensible default warranty (days) inferred from a service name keyword. */
export function defaultWarrantyDays(name: string): number {
  const n = name || '';
  if (/ໂຊລ່າ|solar/i.test(n)) return 730;                 // solar 2y
  if (/ລ້າງ|ทำความสะอาด|clean/i.test(n)) return 30;         // cleaning 30d
  if (/ຕິດຕັ້ງ|ຕໍ່ເຕີມ|install/i.test(n)) return 180;       // install/reno 180d
  return 0;
}

// ── Service-detail template (dohome "ninechang"-style structured service SKU) ──
export interface ServiceTemplate {
  key: string;
  name: string;               // suggested SKU name (editable)
  icon: string;
  unit: string;               // pricing unit — usually 'ຄັ້ງ' (per job) or 'ຈຸດ' (per point)
  durationMin: number;        // minutes
  durationMax: number;
  warrantyDays: number;
  scope: string[];            // ✓ what's included
  excludes: string[];         // ✕ what's NOT included
  requirements: string[];     // 📋 customer prep / notes
}

/** Starter templates for common Lao home services — owner loads one, then edits.
 *  Shared (namespace-agnostic) so HomeSang can reuse it too. */
export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    key: 'ac-clean', name: 'ບໍລິການ ລ້າງ ແອ (ຕິດ ຝາ)', icon: '❄️', unit: 'ຄັ້ງ',
    durationMin: 45, durationMax: 60, warrantyDays: 30,
    scope: ['ລ້າງ ຄອຍ ເຢັນ (ຕົວ ໃນ) + ຖາດ ນ້ຳ ຖິ້ມ', 'ພົ່ນ ຢາ ຂ້າ ເຊື້ອ / ດັບ ກິ່ນ', 'ກວດ ແຮງ ດັນ ນ້ຳຢາ + ທົດ ສອບ ການ ເຮັດ ວຽກ'],
    excludes: ['ຕື່ມ ນ້ຳຢາ (ຄິດ ແຍກ ຕາມ ຈິງ)', 'ຮື້ ຖອນ / ຍ້າຍ ຈຸດ ຕິດຕັ້ງ', 'ລ້າງ ຄອຍ ຮ້ອນ (ຕົວ ນອກ) ຖ້າ ບໍ່ ໄດ້ ລະບຸ'],
    requirements: ['ມີ ໄຟຟ້າ + ນ້ຳ ໃຫ້ ໃຊ້ ໜ້າ ງານ', 'ເກັບ ເຄື່ອງ ໃຕ້ ແອ ອອກ ກ່ອນ'],
  },
  {
    key: 'ac-remove', name: 'ບໍລິການ ຮື້ ຖອນ ແອ', icon: '🔧', unit: 'ຄັ້ງ',
    durationMin: 45, durationMax: 60, warrantyDays: 30,
    scope: ['ຮື້ ຕົວ ໃນ (fan coil) + ຕົວ ນອກ (CDU)', 'ຖອດ ທໍ່ ນ້ຳຢາ ລະບົບ ເດີນ ທໍ່', 'ເກັບ ອຸປະກອນ ຄືນ ໃຫ້ ລູກຄ້າ ຮຽບຮ້ອຍ'],
    excludes: ['ອຸດ / ປິດ ຮູ ເຈາະ ຕ່າງ ໆ', 'ຍ້າຍ ໄປ ຕິດຕັ້ງ ໃໝ່ (ຄິດ ແຍກ)'],
    requirements: ['ມີ ບ່ອນ ໃຫ້ ຊ່າງ ເຂົ້າ ເຖິງ ຕົວ ນອກ ໄດ້', 'ຖ້າ ໜ້າ ງານ ຍາກ ພິເສດ ອາດ ມີ ຄ່າ ເພີ່ມ (ແຈ້ງ ກ່ອນ)'],
  },
  {
    key: 'ac-install', name: 'ບໍລິການ ຕິດຕັ້ງ ແອ ໃໝ່', icon: '❄️', unit: 'ຄັ້ງ',
    durationMin: 60, durationMax: 120, warrantyDays: 180,
    scope: ['ຕິດ ຕົວ ໃນ + ຕົວ ນອກ', 'ເດີນ ທໍ່ ນ້ຳຢາ ≤ 4 ແມັດ', 'ເຮັດ ສູນຍາກາດ + ທົດ ສອບ ການ ເຮັດ ວຽກ'],
    excludes: ['ທໍ່ ສ່ວນ ເກີນ 4 ແມັດ (ຄິດ ຕໍ່ ແມັດ)', 'ເຈາະ ຝາ ຄອນກຣີດ / ຂາ ແຂວນ ພິເສດ', 'ເດີນ ສາຍ ໄຟ ໃໝ່ ຈາກ ຕູ້'],
    requirements: ['ຕຽມ ຈຸດ ໄຟຟ້າ ໃຫ້ ພ້ອມ', 'ຕົກລົງ ຕຳແໜ່ງ ຕິດ ກ່ອນ ວັນ ນັດ'],
  },
  {
    key: 'light', name: 'ບໍລິການ ຕິດ ໄຟ / ໂຄມ', icon: '💡', unit: 'ຈຸດ',
    durationMin: 30, durationMax: 60, warrantyDays: 90,
    scope: ['ຕິດຕັ້ງ ໂຄມ / ໄຟ ຕາມ ຈຸດ', 'ຕໍ່ ສາຍ + ທົດ ສອບ ເປີດ-ປິດ'],
    excludes: ['ອຸປະກອນ ໄຟ / ໂຄມ (ຄິດ ແຍກ)', 'ເດີນ ສາຍ ໃໝ່ ໄລຍະ ໄກ'],
    requirements: ['ມີ ຈຸດ ໄຟ ພ້ອມ ໃຊ້', 'ຕຽມ ໂຄມ / ອຸປະກອນ ໄວ້ ໜ້າ ງານ'],
  },
  {
    key: 'plumb', name: 'ບໍລິການ ແກ້ ນ້ຳ ຮົ່ວ / ປະປາ', icon: '🚿', unit: 'ຄັ້ງ',
    durationMin: 30, durationMax: 90, warrantyDays: 30,
    scope: ['ກວດ ຫາ ຈຸດ ຮົ່ວ / ຕັນ', 'ປ່ຽນ / ອັດ ຈຸດ ຮົ່ວ ຕາມ ຈິງ', 'ທົດ ສອບ ນ້ຳ ໄຫຼ'],
    excludes: ['ອຸປະກອນ ປະປາ (ທໍ່/ກ໊ອກ/ປັ໊ມ — ຄິດ ແຍກ)', 'ທຸບ / ຕິດຕັ້ງ ລະບົບ ໃໝ່ ທັງ ໝົດ'],
    requirements: ['ຊີ້ ຈຸດ ບັນຫາ ໃຫ້ ຊ່າງ', 'ມີ ນ້ຳ ໃຫ້ ທົດ ສອບ'],
  },
  {
    key: 'appliance', name: 'ບໍລິການ ຕິດ ເຄື່ອງ ໃຊ້ ໄຟຟ້າ', icon: '🧺', unit: 'ຄັ້ງ',
    durationMin: 30, durationMax: 60, warrantyDays: 90,
    scope: ['ຕິດຕັ້ງ ເຄື່ອງ (ຊັກ ຜ້າ / ນ້ຳ ອຸ່ນ / ອື່ນ ໆ)', 'ຕໍ່ ນ້ຳ-ໄຟ + ທົດ ສອບ ການ ໃຊ້ ງານ'],
    excludes: ['ອຸປະກອນ / ເຄື່ອງ (ຄິດ ແຍກ)', 'ເດີນ ທໍ່ ນ້ຳ / ສາຍ ໄຟ ໃໝ່ ໄລຍະ ໄກ'],
    requirements: ['ຕຽມ ຈຸດ ນ້ຳ + ໄຟ ໃຫ້ ພ້ອມ', 'ເຄື່ອງ ພ້ອມ ຢູ່ ໜ້າ ງານ'],
  },
];

export function serviceTemplate(key: string): ServiceTemplate | undefined {
  return SERVICE_TEMPLATES.find((t) => t.key === key);
}

/** "45–60 ນາທີ" / "1–2 ຊົ່ວໂມງ" from a minute range. */
export function formatDuration(min?: number, max?: number): string {
  const a = Math.max(0, Math.round(min || 0));
  const b = Math.max(a, Math.round(max || 0));
  if (!a && !b) return '';
  const fmt = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60} ຊົ່ວໂມງ` : m >= 90 ? `${(m / 60).toFixed(1)} ຊົ່ວໂມງ` : `${m} ນາທີ`);
  if (!b || a === b) return fmt(a || b);
  // keep the same unit label on the range when both are minutes
  if (a < 90 && b < 90) return `${a}–${b} ນາທີ`;
  return `${fmt(a)} – ${fmt(b)}`;
}
