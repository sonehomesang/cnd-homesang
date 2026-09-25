import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { normalizeLaoPhone, canonicalPhoneKey, signInUnified } from '../auth';
import { sendSignupOtp, verifySignupOtp, sendResetOtp, resetPasswordWithOtp } from '../otp';

/**
 * ninesang P4 — "OTP mini-login" for CND storefront customers.
 *
 * The app has no passwordless auth; every phone account is phone+password created
 * server-side by the OTP Cloud Functions. So we give the customer a passwordless
 * FEEL by generating a random device-stored password behind the OTP: they only
 * ever see the phone + code step. First time → sign up; returning phone → reset.
 * The stored secret also lets us re-sign-in silently on the same device (no SMS).
 */

const SECRET_PREFIX = 'cndpw:';
const secretKey = (phone: string) => SECRET_PREFIX + canonicalPhoneKey(phone);

async function saveSecret(key: string, value: string) {
  try {
    if (Platform.OS === 'web') { try { window.localStorage.setItem(key, value); } catch {} return; }
    await SecureStore.setItemAsync(key, value);
  } catch {}
}
async function loadSecret(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') { try { return window.localStorage.getItem(key); } catch { return null; } }
    return await SecureStore.getItemAsync(key);
  } catch { return null; }
}

// A strong-enough random device password (never shown to the user).
function randomPassword(): string {
  const rnd = () => Math.random().toString(36).slice(2);
  return ('Cnd!' + rnd() + rnd() + rnd()).slice(0, 28);
}

export type CndOtpMode = 'signup' | 'reset';

/** Send the OTP. Returns whether this phone is a NEW account or an existing one. */
export async function cndSendOtp(phone: string): Promise<CndOtpMode> {
  const p = normalizeLaoPhone(phone);
  try {
    await sendSignupOtp(p);
    return 'signup';
  } catch (e: any) {
    const code = e?.code || ''; const msg = e?.message || '';
    if (code.includes('already-exists') || msg.includes('ມີ ບັນຊີ')) {
      await sendResetOtp(p);   // existing account → reset flow (still just phone+code for the user)
      return 'reset';
    }
    throw e;
  }
}

/** Verify the code, (create or reset with a hidden random password), then sign in. */
export async function cndVerifyOtp(phone: string, code: string, mode: CndOtpMode): Promise<{ uid: string }> {
  const p = normalizeLaoPhone(phone);
  const pw = randomPassword();
  const r = mode === 'signup'
    ? await verifySignupOtp(p, code, pw)
    : await resetPasswordWithOtp(p, code, pw);
  await saveSecret(secretKey(p), pw);
  return r;
}

/** Silent re-login on the same device (no SMS) using the stored secret. */
export async function cndQuickSignIn(phone: string): Promise<boolean> {
  const p = normalizeLaoPhone(phone);
  const pw = await loadSecret(secretKey(p));
  if (!pw) return false;
  try { await signInUnified(p, pw); return true; } catch { return false; }
}

/** Is there a stored secret for this phone on this device? (offer 1-tap login) */
export async function cndHasSavedLogin(phone: string): Promise<boolean> {
  if (canonicalPhoneKey(phone).length < 8) return false;
  return !!(await loadSecret(secretKey(phone)));
}

/**
 * Link this signed-in customer's earlier GUEST orders (same phone, no uid) to
 * their account, so orders placed before login appear in "my orders" + chat.
 * Secure server-side (Cloud Function derives the phone from the auth record).
 * Fire-and-forget; returns how many orders got linked.
 */
export async function claimMyCndOrders(): Promise<number> {
  try {
    const res: any = await httpsCallable(functions, 'claimCndOrders')({});
    return Number(res?.data?.linked) || 0;
  } catch { return 0; }
}
