import {
  collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { logAdminAction } from './auditLog';
import { logUserActivity } from './userActivity';
import { getAppSettings } from './appSettings';
import { syncTechCard } from './users';
import { setUserRoles } from './admin';

/**
 * Technician onboarding + verification.
 *
 * Two populations:
 *  - A user who signed up AS a technician already holds the `technician` role and
 *    can self-complete their profile (saveTechProfile) — auto-listed unless the
 *    admin "review" mode holds them (techListed:false).
 *  - A general user who wants to become a tech submits a techApplications doc;
 *    only an admin (super — role grants are super-only per rules) may approve it,
 *    which adds the role, copies the fields onto the user, and lists them.
 *
 * The `verified` badge is always admin-granted. techListed gates directory
 * visibility (see syncTechCard).
 */
export interface TechApplication {
  uid: string;
  name?: string;
  subType?: string;        // trade (electrical/plumbing/…)
  specialties?: string[];
  roleDescription?: string;
  address?: string;
  lat?: number;
  lng?: number;
  years?: number;
  portfolio?: string[];    // public showcase photos
  idDocs?: string[];       // ID / credentials — admin-only review
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  updatedAt?: number;
}

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function clean<T extends object>(o: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

export interface TechProfileInput {
  subType?: string;
  specialties?: string[];
  roleDescription?: string;
  address?: string;
  lat?: number;
  lng?: number;
  years?: number;
  portfolio?: string[];
  idDocs?: string[];
}

/** A general (non-technician) user submits / edits their application. */
export async function submitTechApplication(uid: string, name: string, data: TechProfileInput) {
  await setDoc(doc(db, 'techApplications', uid), clean({
    uid, name, ...data, status: 'pending', createdAt: serverTimestamp(), updatedAt: Date.now(),
  }), { merge: true });
  void logUserActivity(uid, 'other', { detail: 'tech_apply' });
}

export function watchMyTechApplication(uid: string, cb: (a: TechApplication | null) => void) {
  return onSnapshot(doc(db, 'techApplications', uid),
    (s) => cb(s.exists() ? ({ uid: s.id, ...(s.data() as any), createdAt: ms((s.data() as any).createdAt) } as TechApplication) : null),
    () => cb(null));
}

/** Admin: the pending application queue. */
export function watchTechApplications(cb: (a: TechApplication[]) => void) {
  return onSnapshot(query(collection(db, 'techApplications'), where('status', '==', 'pending')),
    (snap) => cb(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as any), createdAt: ms((d.data() as any).createdAt) } as TechApplication)).sort((a, b) => a.createdAt - b.createdAt)),
    (e) => { console.error('watchTechApplications:', e); cb([]); });
}

/**
 * A technician (already holds the role) completes / edits their own tech profile.
 * Self-writable fields only (never roles/verified). techListed follows the
 * admin-set mode: 'auto' → visible now, 'review' → hidden until an admin opens.
 */
export async function saveTechProfile(uid: string, data: TechProfileInput) {
  const mode = (await getAppSettings()).techApprovalMode;
  const snap = await getDoc(doc(db, 'users', uid));
  const u = snap.exists() ? (snap.data() as any) : {};
  const patch: Record<string, unknown> = clean({ ...data, updatedAt: Date.now() });
  // only set techListed the first time (don't silently re-hide a live tech on edit)
  if (u.techListed === undefined) patch.techListed = mode === 'review' ? false : true;
  await setDoc(doc(db, 'users', uid), patch, { merge: true });
  await syncTechCard(uid);
}

/** The result of walking the 3-step assessment (admin-driven). */
export interface TechAssessment {
  type?: 'new' | 'experienced';
  testScore?: number;
  passed?: boolean;
  checklist?: Record<string, boolean>;
  safePass?: number;
  safeTotal?: number;
  tier?: string;
  decidedAt?: number;
  decidedBy?: string;
}

/** Admin (super): approve an application → grant role + copy fields + list, and
 *  record the verification assessment (tier + checklist) that decided it. */
export async function approveTechApplication(uid: string, opts: { verify: boolean; tier?: string; assessment?: TechAssessment }) {
  const [appSnap, uSnap] = await Promise.all([getDoc(doc(db, 'techApplications', uid)), getDoc(doc(db, 'users', uid))]);
  const a = (appSnap.data() as any) ?? {};
  const u = (uSnap.data() as any) ?? {};
  const roles: string[] = Array.isArray(u.roles) ? u.roles.slice() : [];
  if (!roles.includes('technician')) { roles.push('technician'); await setUserRoles(uid, roles); }
  const assessment = opts.assessment ? { ...opts.assessment, decidedAt: Date.now(), decidedBy: auth.currentUser?.uid } : undefined;
  const patch: Record<string, unknown> = clean({
    subType: a.subType, specialties: a.specialties, roleDescription: a.roleDescription,
    address: a.address, lat: a.lat, lng: a.lng, years: a.years, portfolio: a.portfolio, idDocs: a.idDocs,
    verified: opts.verify ? true : undefined, techListed: true,
    techTier: opts.tier, techAssessment: assessment, updatedAt: Date.now(),
  });
  await updateDoc(doc(db, 'users', uid), patch);
  await updateDoc(doc(db, 'techApplications', uid), { status: 'approved', updatedAt: Date.now() });
  await syncTechCard(uid);
  void logAdminAction({ action: 'update', collection: 'users', docId: uid, after: { technician: true, verified: !!opts.verify, techTier: opts.tier } });
  void logUserActivity(uid, 'role_change', { detail: 'technician approved', actorUid: auth.currentUser?.uid });
}

/** Admin: finalize the assessment for an EXISTING technician (already has role). */
export async function finalizeTechAssessment(uid: string, opts: { verify: boolean; tier?: string; assessment?: TechAssessment }) {
  const assessment = opts.assessment ? { ...opts.assessment, decidedAt: Date.now(), decidedBy: auth.currentUser?.uid } : undefined;
  await updateDoc(doc(db, 'users', uid), clean({
    verified: opts.verify ? true : false, techListed: true,
    techTier: opts.tier, techAssessment: assessment, updatedAt: Date.now(),
  }));
  await syncTechCard(uid);
  void logAdminAction({ action: 'update', collection: 'users', docId: uid, after: { verified: opts.verify, techTier: opts.tier } });
}

export async function rejectTechApplication(uid: string) {
  await updateDoc(doc(db, 'techApplications', uid), { status: 'rejected', updatedAt: Date.now() });
  void logAdminAction({ action: 'update', collection: 'techApplications', docId: uid, after: { status: 'rejected' } });
}

/** Admin: grant / revoke the ✔️ verified badge on a technician. */
export async function setTechVerified(uid: string, verified: boolean) {
  const before = (await getDoc(doc(db, 'users', uid))).data()?.verified ?? false;
  await updateDoc(doc(db, 'users', uid), { verified, updatedAt: Date.now() });
  await syncTechCard(uid);
  void logAdminAction({ action: 'update', collection: 'users', docId: uid, before: { verified: before }, after: { verified } });
  void logUserActivity(uid, 'other', { detail: verified ? 'tech_verified' : 'tech_unverified', actorUid: auth.currentUser?.uid });
}

/** Admin: show / hide a technician in the directory (the review-mode gate). */
export async function setTechListed(uid: string, listed: boolean) {
  await updateDoc(doc(db, 'users', uid), { techListed: listed, updatedAt: Date.now() });
  await syncTechCard(uid);
  void logAdminAction({ action: 'update', collection: 'users', docId: uid, after: { techListed: listed } });
}
