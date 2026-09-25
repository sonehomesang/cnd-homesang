import { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';
import { useAuth } from '../auth-context';
import { isAnyAdmin } from '../adminTier';
import { formatLaoPhone } from '../format';
import { accessForRole, ownerAccess, watchCndRoles, type CndAccess, type CndRole } from './staff';

/**
 * "Who is signed in on CND, and as what?" — one answer shared by the storefront
 * header, the account menu, the admin header and /cnd/account.
 *
 * Role source, in order:
 *  1. A HomeSang admin (isAnyAdmin) is the store owner → Super-Admin.
 *  2. A CND staff member carries the custom claim `token.cnd.role` (issued by the
 *     claimCndStaff function) → that role, named from cndRoles.
 *  3. Anyone else signed in is a customer.
 * Staff PII is never read here — only the caller's own token + the role catalogue.
 */
export type CndIdentityKind = 'guest' | 'owner' | 'staff' | 'customer';

export interface CndIdentity {
  loading: boolean;
  kind: CndIdentityKind;
  uid?: string;
  /** short display name (first name) */
  name: string;
  fullName: string;
  /** canonical display phone, '' when unknown */
  phone: string;
  image?: string;
  createdAt?: number;
  /** resolved back-office access; null for guests and customers */
  access: CndAccess | null;
  /** 'owner' | a staff role key | 'customer' | '' (guest) */
  roleKey: string;
  /** role display name as stored ('' for guest, CUSTOMER_ROLE for customers) */
  roleName: string;
}

export const CUSTOMER_ROLE = 'ລູກຄ້າ';

/** First letter for an avatar. Skips Lao leading vowels (ເ ແ ໂ ໃ ໄ) so "ເພັດ"
 *  shows ພ rather than a lone vowel sign; a phone-only name gets 👤. */
export function initialOf(s: string): string {
  const ch = Array.from((s || '').trim()).find((c) => /\S/.test(c) && !/[ເ-ໄ]/.test(c) && !/[+\d]/.test(c));
  return ch ? ch.toUpperCase() : '👤';
}

/** "🔴 Super-Admin (CND-HomeSang)" → "🔴 Super-Admin" for tight spaces. */
export function shortRoleName(name: string): string {
  return (name || '').replace(/\s*[(（].*[)）]\s*$/, '').trim();
}

/** Pill colours per role, matching the role emoji used in cndRoles names. */
export function roleTone(roleKey: string): { bg: string; fg: string } {
  switch (roleKey) {
    case 'owner': return { bg: '#FDE4E4', fg: '#DC2626' };
    case 'manager': return { bg: '#FFEBD9', fg: '#C25A00' };
    case 'cashier': return { bg: '#E2F5EA', fg: '#1F9D57' };
    case 'stock': return { bg: '#E4EEFB', fg: '#0066CC' };
    case 'customer': return { bg: '#EEF1F5', fg: '#556072' };
    default: return { bg: '#E6EAF0', fg: '#2B3A4A' };  // custom roles
  }
}

/**
 * @param opts.access  Pass the access a screen has ALREADY resolved (the admin does)
 *                     to skip a second claim round-trip. `null` = not staff.
 * @param opts.verify  Ask the server to (re)issue the staff claim once. Only the
 *                     account page sets this — the claim is otherwise issued on the
 *                     first admin visit, and we don't want a function call on every
 *                     storefront page view.
 */
export function useCndIdentity(opts?: { access?: CndAccess | null; verify?: boolean }): CndIdentity {
  const { profile, fbUser, loading: authLoading } = useAuth();
  const preset = !!opts && 'access' in opts;
  const presetAccess = opts?.access ?? null;
  const verify = !!opts?.verify;
  const uid = fbUser?.uid;
  const hasProfile = !!profile;
  const isOwner = isAnyAdmin(profile);

  // undefined = still resolving, null = no staff claim
  const [claimRole, setClaimRole] = useState<string | null | undefined>(undefined);
  const [roles, setRoles] = useState<CndRole[]>([]);

  useEffect(() => {
    if (preset || !uid) { setClaimRole(null); return; }
    if (!hasProfile) return;                 // wait: an owner must not trigger the claim call
    if (isOwner) { setClaimRole(null); return; }
    let alive = true;
    setClaimRole(undefined);
    const read = async (force: boolean) => {
      const r = await auth.currentUser?.getIdTokenResult(force);
      return ((r?.claims as any)?.cnd?.role as string | undefined) || null;
    };
    (async () => {
      let role: string | null = null;
      try { role = await read(false); } catch { /* ignore */ }
      if (!role && verify) {
        try { await httpsCallable(functions, 'claimCndStaff')({}); role = await read(true); } catch { /* ignore */ }
      }
      if (alive) setClaimRole(role);
    })();
    return () => { alive = false; };
  }, [preset, uid, hasProfile, isOwner, verify]);

  const needRoles = !preset && !isOwner && !!claimRole;
  useEffect(() => { if (needRoles) return watchCndRoles(setRoles); }, [needRoles]);

  return useMemo<CndIdentity>(() => {
    const phone = formatLaoPhone(profile?.phone || fbUser?.phoneNumber || '');
    const first = (profile?.firstName || '').trim();
    const full = (profile?.name || `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`).trim();
    const name = first || full || phone || 'ບັນຊີ';
    const base = { uid, name, fullName: full || name, phone, image: profile?.image || undefined, createdAt: profile?.createdAt };

    if (!fbUser) return { ...base, loading: authLoading, kind: 'guest', access: null, roleKey: '', roleName: '' };

    let access: CndAccess | null = null;
    let resolving = false;
    if (preset) {
      access = presetAccess ?? (isOwner ? ownerAccess() : null);
    } else if (isOwner) {
      access = ownerAccess();
    } else if (claimRole === undefined) {
      resolving = true;
    } else if (claimRole) {
      const role = roles.find((r) => r.key === claimRole);
      // until the role catalogue arrives, show the key rather than nothing
      access = role ? accessForRole(role) : { ...accessForRole(undefined), roleKey: claimRole, roleName: claimRole };
    }
    const kind: CndIdentityKind = isOwner || access?.isOwner ? 'owner' : access ? 'staff' : 'customer';
    return {
      ...base,
      loading: authLoading || !profile || resolving,
      kind,
      access,
      roleKey: kind === 'customer' ? 'customer' : access?.roleKey || 'owner',
      roleName: kind === 'customer' ? CUSTOMER_ROLE : access?.roleName || '',
    };
  }, [profile, fbUser, authLoading, uid, preset, presetAccess, isOwner, claimRole, roles]);
}
