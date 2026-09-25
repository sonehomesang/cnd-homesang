import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type OtpProvider = 'twilio' | 'firebase';

/** Default OTP SMS body (keep in sync with the same constant in functions). */
export const DEFAULT_OTP_TEMPLATE = 'HomeSang: ລະຫັດ ຢືນຢັນ ຂອງ ທ່ານ ແມ່ນ {code} — ໃຊ້ ໄດ້ 5 ນາທີ, ຫ້າມ ບອກ ຜູ້ ອື່ນ.';

/** Public: which OTP provider the sign-up flow should use (default twilio). */
export function watchOtpProvider(cb: (p: OtpProvider) => void) {
  return onSnapshot(
    doc(db, 'settings', 'otpProvider'),
    (s) => cb((s.data()?.provider as OtpProvider) || 'twilio'),
    () => cb('twilio'),
  );
}
export async function fetchOtpProvider(): Promise<OtpProvider> {
  try { const s = await getDoc(doc(db, 'settings', 'otpProvider')); return (s.data()?.provider as OtpProvider) || 'twilio'; }
  catch { return 'twilio'; }
}
export async function saveOtpProvider(provider: OtpProvider) {
  await setDoc(doc(db, 'settings', 'otpProvider'), { provider, updatedAt: serverTimestamp() }, { merge: true });
}

/** Super-admin only: the Twilio credentials (kept in the locked secureConfig). */
export interface SecureOtp {
  twilioAccountSid?: string;
  /** Messaging Service SID (MG…) — used to send the custom-Lao OTP SMS. */
  twilioMessagingSid?: string;
  twilioVerifySid?: string; // legacy (old Verify flow); unused now
  twilioAuthToken?: string;
  /** Admin-editable OTP SMS body; "{code}" is replaced with the 6-digit code. */
  otpMessageTemplate?: string;
  /** whether an auth token is stored (so the editor can show status without re-fetching it) */
  tokenSet?: boolean;
}
export function watchSecureOtp(cb: (c: SecureOtp) => void) {
  return onSnapshot(
    doc(db, 'secureConfig', 'otp'),
    (s) => cb((s.data() as SecureOtp) || {}),
    () => cb({}),
  );
}
/** Save Twilio config. Only writes the auth token when a new one is provided
 *  (so re-saving other fields doesn't wipe the stored token). */
export async function saveSecureOtp(patch: SecureOtp) {
  const data: any = { updatedAt: serverTimestamp() };
  if (patch.twilioAccountSid !== undefined) data.twilioAccountSid = patch.twilioAccountSid.trim();
  if (patch.twilioMessagingSid !== undefined) data.twilioMessagingSid = patch.twilioMessagingSid.trim();
  if (patch.twilioVerifySid !== undefined) data.twilioVerifySid = patch.twilioVerifySid.trim();
  if (patch.otpMessageTemplate !== undefined) data.otpMessageTemplate = patch.otpMessageTemplate;
  if (patch.twilioAuthToken) { data.twilioAuthToken = patch.twilioAuthToken.trim(); data.tokenSet = true; }
  await setDoc(doc(db, 'secureConfig', 'otp'), data, { merge: true });
}
