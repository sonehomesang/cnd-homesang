import { httpsCallable } from 'firebase/functions';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, functions } from './firebase';
import { phoneToEmail } from './auth';

/**
 * Twilio phone-OTP for sign-up (no reCAPTCHA). The heavy lifting + account
 * creation happen in the sendOtp / verifyOtp Cloud Functions; here we just call
 * them and sign in with the returned custom token.
 */

/** Send an OTP SMS to `phone` (E.164, e.g. +8562059682000). Throws on a
 *  Twilio/validation error or if the phone already has an account. */
export async function sendSignupOtp(phone: string): Promise<void> {
  await httpsCallable(functions, 'sendOtp')({ phone });
}

/** Verify the code, create the account server-side, then sign in. Returns uid. */
export async function verifySignupOtp(phone: string, code: string, password: string): Promise<{ uid: string }> {
  const res: any = await httpsCallable(functions, 'verifyOtp')({ phone, code, password });
  const email = (res?.data?.email as string) || phoneToEmail(phone);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return { uid: cred.user.uid };
}

/** Send an OTP to reset the password of an EXISTING phone account (forgot password). */
export async function sendResetOtp(phone: string): Promise<void> {
  await httpsCallable(functions, 'sendResetOtp')({ phone });
}

/** Verify the code, set a new password server-side, then sign in. Returns uid. */
export async function resetPasswordWithOtp(phone: string, code: string, password: string): Promise<{ uid: string }> {
  const res: any = await httpsCallable(functions, 'resetPassword')({ phone, code, password });
  const email = (res?.data?.email as string) || phoneToEmail(phone);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return { uid: cred.user.uid };
}

export interface OtpConfigReport {
  accountSid: { set: boolean; ok: boolean; value: string };
  authToken: { set: boolean; len: number };
  messagingSid: { set: boolean; ok: boolean; value: string };
  connection: { ok: boolean; message: string };
}
/** Admin-only: validate the stored Twilio config against Twilio (no SMS sent). */
export async function checkOtpConnection(): Promise<OtpConfigReport> {
  const res: any = await httpsCallable(functions, 'checkOtpConfig')({});
  return res.data as OtpConfigReport;
}

/** Turn a Firebase callable error into a friendly Lao message. */
export function otpErrorMessage(e: any): string {
  const code = e?.code || '';
  const msg = e?.message || '';
  if (code.includes('not-found') || msg.includes('ບໍ່ ພົບ ບັນຊີ')) return 'ບໍ່ ພົບ ບັນຊີ ຂອງ ເບີ ນີ້ — ກະລຸນາ ສະໝັກ ໃໝ່';
  if (code.includes('already-exists') || msg.includes('ມີ ບັນຊີ')) return 'ເບີ ນີ້ ມີ ບັນຊີ ແລ້ວ — ກະລຸນາ ເຂົ້າ ສູ່ ລະບົບ';
  if (code.includes('permission-denied') || msg.includes('OTP')) return 'ລະຫັດ OTP ບໍ່ ຖືກ ຫຼື ໝົດ ອາຍຸ';
  if (code.includes('invalid-argument')) return 'ຂໍ້ມູນ ບໍ່ ຄົບ ຫຼື ບໍ່ ຖືກຕ້ອງ';
  if (code.includes('unavailable') || code.includes('internal')) return 'ສົ່ງ OTP ບໍ່ ສຳເລັດ — ລອງ ໃໝ່ ອີກ ຄັ້ງ';
  return msg || 'ເກີດ ຂໍ້ຜິດພາດ — ລອງ ໃໝ່';
}
