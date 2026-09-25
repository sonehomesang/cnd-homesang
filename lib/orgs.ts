import {
  addDoc, arrayRemove, collection, deleteDoc, deleteField, doc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import type { Site } from './sites';

/**
 * Company / org accounts (B2B phase 2) — a company groups its buildings (sites)
 * and lets a team of staff see them. `orgs/{id}`: name + ownerId + memberUids +
 * inviteCode. A site tagged with orgId is visible to org members. Joining is via
 * the joinOrg Cloud Function (code-gated, server-side). Multi-building dashboard
 * lives at /company.
 */
export interface Org {
  id: string;
  name: string;
  ownerId: string;
  memberUids: string[];
  inviteCode: string;
  createdAt: number;
  creditLimit?: number;         // B2B phase 4 — company credit ceiling (kip)
  defaultTerms?: string;        // default payment terms ('prepay'|'net15'|'net30'|'net60')
}

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): Org {
  return { id, name: d.name ?? '', ownerId: d.ownerId ?? '', memberUids: Array.isArray(d.memberUids) ? d.memberUids : [], inviteCode: d.inviteCode ?? '', createdAt: ms(d.createdAt), creditLimit: typeof d.creditLimit === 'number' ? d.creditLimit : undefined, defaultTerms: d.defaultTerms };
}
function genCode(): string {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

export function watchMyOrgs(uid: string, cb: (orgs: Org[]) => void) {
  return onSnapshot(query(collection(db, 'orgs'), where('memberUids', 'array-contains', uid)),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => a.createdAt - b.createdAt)),
    (e) => { console.error('watchMyOrgs:', e); cb([]); });
}

export async function createOrg(name: string, ownerId: string): Promise<string> {
  const ref = await addDoc(collection(db, 'orgs'), {
    name: name.trim(), ownerId, memberUids: [ownerId], inviteCode: genCode(), createdAt: serverTimestamp(),
  });
  return ref.id;
}
export async function renameOrg(id: string, name: string) { await updateDoc(doc(db, 'orgs', id), { name: name.trim() }); }
/** Owner sets the company credit ceiling + default payment terms (B2B phase 4). */
export async function updateOrgCredit(id: string, creditLimit: number, defaultTerms: string) { await updateDoc(doc(db, 'orgs', id), { creditLimit, defaultTerms }); }
export async function removeMember(id: string, uid: string) { await updateDoc(doc(db, 'orgs', id), { memberUids: arrayRemove(uid) }); }
export async function deleteOrg(id: string) { await deleteDoc(doc(db, 'orgs', id)); }

/** A team member joins by invite code (server-side — bypasses the read-before-
 *  member chicken-and-egg; adds only the caller's own uid). */
export async function joinOrg(code: string): Promise<{ ok: boolean; orgName?: string }> {
  const res: any = await httpsCallable(functions, 'joinOrg')({ code: String(code || '').trim().toUpperCase() });
  return res?.data ?? { ok: false };
}

/** Buildings that belong to a company. */
export function watchSitesForOrg(orgId: string, cb: (sites: Site[]) => void) {
  return onSnapshot(query(collection(db, 'sites'), where('orgId', '==', orgId)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Site).sort((a, b) => (a.name || '').localeCompare(b.name || ''))),
    (e) => { console.error('watchSitesForOrg:', e); cb([]); });
}
export async function assignSiteToOrg(siteId: string, orgId: string) { await updateDoc(doc(db, 'sites', siteId), { orgId }); }
export async function unassignSiteFromOrg(siteId: string) { await updateDoc(doc(db, 'sites', siteId), { orgId: deleteField() }); }

// ── Active company (multi-company) ───────────────────────────────────────────
// One person can belong to / own several companies. The "active" one is kept in
// localStorage so every company screen (/company · /vendors · /billing ·
// /statement) shows the same context; switch it on /company.
const ACTIVE_KEY = 'hs_activeOrg';
export function getActiveOrgId(): string | null {
  try { return (typeof window !== 'undefined' && window.localStorage?.getItem(ACTIVE_KEY)) || null; } catch { return null; }
}
export function setActiveOrgId(id: string) {
  try { if (typeof window !== 'undefined') window.localStorage?.setItem(ACTIVE_KEY, id); } catch { /* ignore */ }
}
/** The active org from a watched list — the stored choice, else the first. */
export function pickActiveOrg(orgs: Org[]): Org | null {
  if (!orgs.length) return null;
  const id = getActiveOrgId();
  return orgs.find((o) => o.id === id) ?? orgs[0];
}
