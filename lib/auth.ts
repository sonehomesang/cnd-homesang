import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  FacebookAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updatePassword,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from './firebase';

// ===================== SOCIAL LOGIN (web) =====================
// Uses Firebase's built-in OAuth providers via a popup. Requires the provider to
// be enabled in the Firebase console (Authentication → Sign-in method) with the
// matching OAuth app credentials — until then it throws auth/operation-not-allowed.
// New users land with no profile doc, so the sign-in routing sends them to
// /profile-setup like any other first-time account.
export async function signInWithFacebook() {
  const provider = new FacebookAuthProvider();
  provider.addScope('email');
  return signInWithPopup(auth, provider);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

/** A login identifier is an email if it contains "@", otherwise a phone. */
export function looksLikeEmail(v: string): boolean {
  return v.includes('@');
}

/**
 * Normalize any Lao mobile input to E.164 (+85620XXXXXXXX) so accounts created
 * the old way (+85620 + 8 digits) still resolve to the SAME synthetic email.
 * Accepts 8-digit subscriber, 020…, 20…, 856…, or +856… forms.
 */
export function normalizeLaoPhone(input: string): string {
  let d = (input || '').replace(/\D/g, '');
  if (d.startsWith('856')) return '+' + d;
  if (d.startsWith('0')) d = d.slice(1);   // 020… → 20…
  if (d.length === 8) d = '20' + d;        // bare 8-digit subscriber → prepend 20
  return '+856' + d;
}

/**
 * Canonical digit key for a Lao phone, format-independent. Every stored form —
 * 55597299 / 02055597299 / 2055597299 / +8562055597299 — collapses to the same
 * "8562055597299", so duplicate detection never misses a format difference.
 * Returns '' for an empty/invalid phone.
 */
export function canonicalPhoneKey(input?: string | null): string {
  const raw = String(input || '').replace(/\D/g, '');
  if (!raw) return '';
  return normalizeLaoPhone(raw).replace(/\D/g, '');
}

/** The Firebase auth email for a login identifier (real email, or phone→synthetic). */
export function authEmailFor(identifier: string): string {
  return looksLikeEmail(identifier)
    ? identifier.trim().toLowerCase()
    : phoneToEmail(normalizeLaoPhone(identifier));
}

/** Password sign-in that accepts either a phone or a real email in one field. */
export async function signInUnified(identifier: string, password: string) {
  return signInWithEmailAndPassword(auth, authEmailFor(identifier), password);
}

/** Create a new email+password account (email signup — phone signup uses OTP). */
export async function signUpWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
}

/** Send a Firebase password-reset link to a real email (email-signup accounts). */
export async function sendResetEmailLink(email: string) {
  return sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

/**
 * Convert a phone number to a synthetic email for Firebase email/password auth.
 * Strips all non-digits, appends @homesang.local
 *   "+856 20 59682000" -> "8562059682000@homesang.local"
 */
export function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@homesang.local`;
}

export async function signInWithPhonePassword(phone: string, password: string) {
  const email = phoneToEmail(phone);
  return signInWithEmailAndPassword(auth, email, password);
}

export function hasPasswordSet(user: FirebaseUser | null): boolean {
  if (!user) return false;
  return user.providerData.some((p) => p.providerId === 'password');
}

/**
 * Set or update the password for a phone-authenticated user.
 * - If no email/password linked yet → link new credential
 * - If already linked → update existing password
 */
export async function setOrUpdatePassword(
  user: FirebaseUser,
  password: string,
) {
  if (!user.phoneNumber) {
    throw new Error('User has no phone — ບໍ່ໄດ້ verify ເບີໂທ');
  }
  if (password.length < 6) {
    throw new Error('Password ຕ້ອງມີ 6 ໂຕຂຶ້ນໄປ');
  }
  if (hasPasswordSet(user)) {
    await updatePassword(user, password);
  } else {
    const email = phoneToEmail(user.phoneNumber);
    const credential = EmailAuthProvider.credential(email, password);
    await linkWithCredential(user, credential);
  }
}
