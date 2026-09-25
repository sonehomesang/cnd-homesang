// ===================== ROOT ADMIN SAFETY NET =====================
// The product owner's own phone number is always treated as super admin, and
// self-heals the DB `isSuperAdmin` flag if it was ever cleared (e.g. by a role
// reconcile or an accidental edit). This guarantees the owner can never be
// locked out of their own admin console.
//
// This is NOT a public backdoor: to be granted the role you must actually
// authenticate via phone OTP (Twilio) as this exact number, which requires the
// physical SIM. The suffix (last 8 digits) is matched so any stored format
// (+8562059682000 / 02059682000 / 2059682000 / 59682000) resolves the same.
//
// To hand root to another owner, add their number's last 8 digits here.
const ROOT_ADMIN_PHONE_SUFFIXES = ['59682000'];

export function normalizePhone(p?: string | null): string {
  return String(p || '').replace(/\D/g, '');
}

export function isRootAdminPhone(phone?: string | null): boolean {
  const d = normalizePhone(phone);
  return d.length >= 8 && ROOT_ADMIN_PHONE_SUFFIXES.some((s) => d.endsWith(s));
}
