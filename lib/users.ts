import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { publicArea } from './format';
import { Gender, Role } from './auth-context';
import { canonicalPhoneKey } from './auth';
import { codeForUid, consumeStashedReferral } from './referrals';
import { logUserActivity } from './userActivity';

// ===================== UNIQUENESS (phone / email / name) =====================
// Phone / email / name must be unique across accounts. The users collection is
// small, so we scan it once and compare normalized values (digits-only phone,
// lower-cased trimmed email + name) — this catches format/case differences a
// plain Firestore equality query would miss.

export type UniqueField = 'phone' | 'email' | 'name';
export interface UserConflict { field: UniqueField; conflictUid: string; }

const UNIQUE_FIELD_LAO: Record<UniqueField, string> = {
  phone: 'ເບີໂທ',
  email: 'ອີເມລ',
  name: 'ຊື່',
};

export async function findUserConflicts(
  uid: string | null,
  fields: { phone?: string | null; email?: string | null; name?: string | null },
): Promise<UserConflict[]> {
  const want = {
    phone: canonicalPhoneKey(fields.phone),
    email: String(fields.email ?? '').trim().toLowerCase(),
    name: String(fields.name ?? '').trim().toLowerCase(),
  };
  if (!want.phone && !want.email && !want.name) return [];

  const snap = await getDocs(collection(db, 'users'));
  const conflicts: UserConflict[] = [];
  snap.forEach((d) => {
    if (d.id === uid) return; // ignore the record being edited itself
    const u = d.data() as any;
    if (want.phone && canonicalPhoneKey(u.phone) === want.phone)
      conflicts.push({ field: 'phone', conflictUid: d.id });
    if (want.email && String(u.email ?? '').trim().toLowerCase() === want.email)
      conflicts.push({ field: 'email', conflictUid: d.id });
    // NOTE: name is intentionally NOT deduped — shared names are very common in
    // Laos and blocking them stranded authenticated users at profile-setup with
    // no recoverable path (uniqueness is already guaranteed by phone/email→uid).
  });
  return conflicts;
}

/** Throws a Lao-language error if any phone/email/name already belongs to another account. */
export async function assertUserUnique(
  uid: string | null,
  fields: { phone?: string | null; email?: string | null; name?: string | null },
): Promise<void> {
  const conflicts = await findUserConflicts(uid, fields);
  if (!conflicts.length) return;
  const labels = [...new Set(conflicts.map((c) => UNIQUE_FIELD_LAO[c.field]))];
  throw new Error(`${labels.join(' / ')} ນີ້ ຖືກໃຊ້ ໂດຍ ບັນຊີ ອື່ນ ແລ້ວ — ຫ້າມ ຊ້ຳກັນ`);
}

export interface TechCard {
  uid: string;
  name: string;
  image?: string;
  rating?: number;
  reviewCount?: number;
  specialties?: string[];
  roleDescription?: string;
  verified?: boolean; // admin-vetted technician (identity / credentials checked)
  /** district/province only — the full address is never published here */
  area?: string;
  portfolio?: string[];
  workSchedule?: Record<string, { available: boolean; open: string; close: string }>;
  lat?: number;
  lng?: number;
  createdAt?: number; // technician's join date (for "new" freshness ranking)
}

/** One technician's PUBLIC card — readable logged-out (the `users` doc is not). */
export function watchTechCard(uid: string, cb: (t: TechCard | null) => void) {
  return onSnapshot(
    doc(db, 'techCards', uid),
    (s) => cb(s.exists() ? ({ uid: s.id, ...(s.data() as any) } as TechCard) : null),
    () => cb(null),
  );
}

/**
 * Technicians for the home "nearby" carousel — read from the world-readable
 * `techCards` projection (NOT the private `users` docs), so logged-out visitors
 * can browse technicians without exposing phone / address / email.
 */
export function watchTechnicians(cb: (t: TechCard[]) => void) {
  const q = query(collection(db, 'techCards'), limit(12));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }) as TechCard)),
    (e) => { console.error('watchTechnicians:', e); cb([]); },
  );
}

/**
 * Mirror a user's PUBLIC-SAFE fields into projection collections, so nothing
 * needs to read the now-private `users` doc of ANOTHER person:
 *   • userCards/{uid}  (world-readable) — name / image / referralCode, for chat
 *     display + referral-code lookup. Written for EVERY user.
 *   • techCards/{uid}  (world-readable) — the technician showcase (coarse area,
 *     never the full address). Technicians only.
 *   • techContact/{uid} (signed-in read) — a technician's FULL service address +
 *     coords, so a logged-in customer still sees where the tech works (the
 *     `users` doc is no longer readable cross-user). Technicians only; carries
 *     NO phone/email.
 * Call after any write that changes a user's public info (profile, location,
 * rating). Idempotent.
 */
export async function syncTechCard(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return;
  const u = snap.data() as any;

  // userCards — for EVERY user (customers included: chat shows their name/photo)
  const uc: Record<string, unknown> = {
    uid,
    name: u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || 'ຜູ້ໃຊ້',
    updatedAt: Date.now(),
  };
  if (u.image !== undefined) uc.image = u.image;
  if (u.referralCode !== undefined) uc.referralCode = u.referralCode;
  try { await setDoc(doc(db, 'userCards', uid), uc, { merge: true }); } catch { /* best-effort */ }

  const roles: string[] = u.roles ?? [];
  // techListed gates directory visibility: undefined = listed (back-compat);
  // an admin "review" hold sets it false so the tech is hidden until opened.
  const listed = u.techListed !== false;
  if (!roles.includes('technician') || !listed) {
    // not a technician, or held for review → remove the technician-only projections
    try { await deleteDoc(doc(db, 'techCards', uid)); } catch { /* best-effort */ }
    try { await deleteDoc(doc(db, 'techContact', uid)); } catch { /* best-effort */ }
    return;
  }
  const card: Record<string, unknown> = {
    uid,
    name: u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || 'ຊ່າງ',
    updatedAt: Date.now(),
  };
  // PUBLIC-SAFE fields only. A logged-out visitor browses technicians from this
  // projection, so it carries what a customer needs to choose one — but never
  // `phone` or `email`: contacting goes through the in-app chat after sign-in.
  const safe: Record<string, unknown> = {
    image: u.image,
    rating: u.rating,
    reviewCount: u.reviewCount,
    specialties: u.specialties,
    roleDescription: u.roleDescription,
    verified: u.verified === true ? true : undefined, // admin-vetted flag (from the user doc)
    area: publicArea(u.address),  // district/province only — never the full address
    portfolio: u.portfolio,       // past work gallery
    workSchedule: u.workSchedule,  // opening hours per day
    lat: u.lat,
    lng: u.lng,
    createdAt: u.createdAt, // join date → drives the "new technician" boost
  };
  for (const [k, v] of Object.entries(safe)) if (v !== undefined) card[k] = v;
  // scrub a full address published by an earlier build of this projection
  card.address = deleteField();
  await setDoc(doc(db, 'techCards', uid), card, { merge: true });

  // techContact — signed-in-only projection of the technician's FULL service
  // address (+coords), so a logged-in customer still sees where the tech works
  // without reading the private users doc. NO phone/email here.
  const contact: Record<string, unknown> = { uid, updatedAt: Date.now() };
  if (u.address !== undefined) contact.address = u.address;
  if (u.lat !== undefined) contact.lat = u.lat;
  if (u.lng !== undefined) contact.lng = u.lng;
  try { await setDoc(doc(db, 'techContact', uid), contact, { merge: true }); } catch { /* best-effort */ }
}

export async function createUserProfile(
  uid: string,
  data: {
    phone: string;
    firstName: string;
    lastName: string;
    primaryRole: Role;
    group?: string; // account-type group chosen at signup (userGroups key)
    subType?: string; // account sub-type chosen at signup (userGroups subTypes key)
    email?: string; // set for email signups
    language?: string;
  },
) {
  const name = `${data.firstName} ${data.lastName}`.trim();
  await assertUserUnique(uid, { phone: data.phone, email: data.email, name });
  const record: Record<string, unknown> = {
    uid,
    phone: data.phone,
    firstName: data.firstName,
    lastName: data.lastName,
    name,
    roles: [data.primaryRole],
    primaryRole: data.primaryRole,
    language: data.language ?? 'lo',
    // stamp the deterministic referral code at creation so a shared ?ref link
    // (Slice 4/6) can resolve this user as a referrer without them first
    // visiting the referral screen (applyReferral looks up by referralCode).
    referralCode: codeForUid(uid),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    // provenance: this path is the customer/tech self-signup flow
    creationMethod: 'signup',
    lastLoginAt: Date.now(),
    lastActiveAt: Date.now(),
    loginCount: 1,
  };
  if (data.group) record.group = data.group;
  if (data.subType) record.subType = data.subType;
  if (data.email) record.email = data.email;
  await setDoc(doc(db, 'users', uid), record);
  void logUserActivity(uid, 'signup', { detail: data.email ? 'email' : 'OTP' });
  await syncTechCard(uid);
  // Slice 6: apply a shared ?ref referral (stashed at landing) → rewards the referrer
  try { await consumeStashedReferral(uid, name); } catch { /* best-effort */ }
}

export type ProfileUpdate = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  bio: string;
  address: string;
  gender: Gender;
  dob: number;
  lat: number;
  lng: number;
  image: string;
  language: string;
  companyName: string;
  roleDescription: string;
  specialties: string[];
  portfolio: string[];
}>;

export async function updateUserProfile(uid: string, data: ProfileUpdate) {
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) patch[key] = value;
  }
  if (data.firstName !== undefined || data.lastName !== undefined) {
    const snap = await getDoc(doc(db, 'users', uid));
    const cur = snap.data() ?? {};
    const fn = data.firstName ?? cur.firstName ?? '';
    const ln = data.lastName ?? cur.lastName ?? '';
    patch.name = `${fn} ${ln}`.trim();
  }
  // block edits that would collide with another account's name/email
  await assertUserUnique(uid, {
    email: data.email,
    name: patch.name as string | undefined,
  });
  await updateDoc(doc(db, 'users', uid), patch);
  await syncTechCard(uid);
}

export async function updateUserLocation(
  uid: string,
  lat: number,
  lng: number,
) {
  await updateDoc(doc(db, 'users', uid), {
    lat,
    lng,
    locationUpdatedAt: Date.now(),
    updatedAt: Date.now(),
  });
  await syncTechCard(uid);
}
