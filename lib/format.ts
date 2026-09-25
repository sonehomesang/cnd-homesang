// Thousands-grouping for numeric text — used by inputs so money/quantity
// fields show 1,000-separators AS the user types, matching the comma grouping
// toLocaleString() produces everywhere else in the app.

/** Group the integer part of a numeric STRING with commas, keeping any
 * decimal part (and a lone trailing "." while the user is mid-typing). */
export function groupThousands(s: string): string {
  if (s === '' || s == null) return '';
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const dot = body.indexOf('.');
  const int = dot >= 0 ? body.slice(0, dot) : body;
  const rest = dot >= 0 ? body.slice(dot) : ''; // includes the '.'
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + grouped + rest;
}

/** Keep only digits (and, when decimals allowed, a single dot). */
export function sanitizeNumeric(s: string, decimals = false): string {
  let d = s.replace(decimals ? /[^\d.]/g : /[^\d]/g, '');
  if (decimals) {
    const i = d.indexOf('.');
    if (i >= 0) d = d.slice(0, i + 1) + d.slice(i + 1).replace(/\./g, '');
  }
  return d;
}

/** Parse a sanitized numeric string to a number (empty / lone dot → 0). */
export function parseNumeric(s: string): number {
  if (s === '' || s === '.') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// A number is MONEY when a currency word is involved — ລາຄາ / ມູນຄ່າ / ເງິນ /
// ກີບ and friends. Admin-defined (schema-driven) fields carry no money TYPE, so
// their label/unit wording is the only signal we have; this is that rule, shared
// so every generic editor groups the same fields.
// Written without spaces because Lao labels are spaced by syllable
// ("ຄ່າ ທຳນຽມ") — the haystack has its whitespace stripped before matching.
const MONEY_WORD =
  /ລາຄາ|ມູນຄ່າ|ເງິນ|ກີບ|ຕົ້ນທຶນ|ງົບປະມານ|ຍອດ|ຄ່າໃຊ້ຈ່າຍ|ລາຍຮັບ|ລາຍຈ່າຍ|ຄ່າແຮງ|ຄ່າທຳນຽມ|ຄ່າສົ່ງ|ຄ່າບໍລິການ|ຄ່າມັດຈຳ|ຄ່າປັບ|price|cost|amount|fee|salary|wage|income|revenue|balance|budget|payout|deposit|withdraw|refund|cashback|reward|subtotal|total|kip|stock|qty|quantity/i;
// …unless it is really a proportion, where separators would be nonsense.
const RATE_WORD = /%|ເປີເຊັນ|ສ່ວນຮ້ອຍ|pct|percent|ratio|rating/i;

/**
 * Should this numeric field show 1,000-separators? Pass any identifying parts
 * (field key, Lao label, unit); a percentage marker anywhere vetoes it.
 */
export function isMoneyField(...parts: (string | null | undefined)[]): boolean {
  const s = parts.filter(Boolean).join(' ').replace(/\s+/g, '');
  if (RATE_WORD.test(s)) return false;
  return MONEY_WORD.test(s);
}

/**
 * Coarse, PUBLIC form of an address — district/province only, never the house or
 * village detail. Used for the logged-out technician card: a visitor should see
 * roughly where someone works, not where they live; the full address is only
 * shown to signed-in viewers.
 *
 * "ບ້ານ ໜອງໜ່ຽງ, ຈັນທະບູລີ, ນະຄອນຫຼວງວຽງຈັນ" → "ຈັນທະບູລີ · ນະຄອນຫຼວງວຽງຈັນ"
 * A single-part address is dropped entirely (it can't be coarsened safely).
 */
export function publicArea(address?: string | null): string {
  const parts = String(address || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(1).join(' · ');
  // no commas: keep only a district/province-looking token, else show nothing
  const one = parts[0] ?? '';
  return /ເມືອງ|ນະຄອນຫຼວງ|ແຂວງ/.test(one) ? one : '';
}

/**
 * Canonical Lao-mobile DISPLAY form, matching how the number is entered
 * (`+856 20` + 8 subscriber digits): "+856 20 XXXX XXXX". Accepts any stored
 * format (55597299 / 02055597299 / 2055597299 / +8562055597299) by taking the
 * last 8 digits. Returns '' for an empty phone.
 */
export function formatLaoPhone(phone?: string | null): string {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  const last8 = d.slice(-8);
  if (last8.length !== 8) return '+856 20 ' + d; // unexpected length — show what we have
  return `+856 20 ${last8.slice(0, 4)} ${last8.slice(4)}`;
}
