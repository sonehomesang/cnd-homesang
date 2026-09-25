/** Device-local saved addresses for CND checkout (reuse next time; supports many). */
export interface CndSavedAddress { id: string; label: string; text: string; }
const KEY = 'cnd_addr_v1';

export function getSavedAddresses(): CndSavedAddress[] {
  try { if (typeof window !== 'undefined') { const r = window.localStorage?.getItem(KEY); if (r) return JSON.parse(r); } } catch { /* ignore */ }
  return [];
}
function write(list: CndSavedAddress[]) {
  try { if (typeof window !== 'undefined') window.localStorage?.setItem(KEY, JSON.stringify(list.slice(0, 12))); } catch { /* ignore */ }
}
export function addSavedAddress(label: string, text: string): CndSavedAddress[] {
  const t = (text || '').trim();
  const list = getSavedAddresses();
  if (!t || list.some((a) => a.text.trim() === t)) return list;
  const next = [{ id: 'a' + Date.now().toString(36), label: (label || '').trim() || 'ທີ່ຢູ່', text: t }, ...list];
  write(next);
  return next;
}
export function removeSavedAddress(id: string): CndSavedAddress[] {
  const next = getSavedAddresses().filter((a) => a.id !== id);
  write(next);
  return next;
}
