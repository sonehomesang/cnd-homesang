// Best-effort public-IP lookup for the maintenance allowlist. Uses api64 so it
// returns whatever address the connection actually uses (IPv6 on many 5G
// networks, IPv4 on wifi) — the SAME value both the admin "scan" button and the
// gate compare against. Returns null on failure; every caller must fail SAFE
// (admins bypass separately, so a null here never locks an admin out).
let _cache: string | null | undefined;

export async function fetchPublicIp(force = false): Promise<string | null> {
  if (!force && _cache !== undefined) return _cache ?? null;
  try {
    const res = await fetch('https://api64.ipify.org?format=json');
    const data = await res.json();
    _cache = typeof data?.ip === 'string' ? data.ip.trim() : null;
  } catch {
    _cache = null;
  }
  return _cache ?? null;
}
