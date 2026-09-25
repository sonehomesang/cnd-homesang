// Three admin tiers, layered on the user roles — used for the tier BADGE and
// delete gating. Which admin SECTIONS a tier can open now lives in the RBAC
// roles (adminPerms, editable in ບົດບາດ & ສິດ) and is read via usePermissions.
//   super — everything incl. delete · cs / cp — no delete
// Tier is derived from the profile: isSuperAdmin (or 'admin' role) = super;
// otherwise the 'cs_admin' / 'cp_admin' role names.

export type AdminTier = 'super' | 'cs' | 'cp' | null;

export const ADMIN_TIER_LABEL: Record<Exclude<AdminTier, null>, string> = {
  super: '👑 Super admin',
  cs: '🎧 CS admin',
  cp: '🗂️ CP admin',
};

interface TierProfile {
  isSuperAdmin?: boolean;
  roles?: string[];
}

export function getAdminTier(profile: TierProfile | null | undefined): AdminTier {
  if (!profile) return null;
  const roles = profile.roles ?? [];
  if (profile.isSuperAdmin || roles.includes('admin')) return 'super';
  if (roles.includes('cs_admin')) return 'cs';
  if (roles.includes('cp_admin')) return 'cp';
  return null;
}

export function isAnyAdmin(profile: TierProfile | null | undefined): boolean {
  return getAdminTier(profile) !== null;
}

/** Delete is reserved for Super admin. */
export function tierCanDelete(tier: AdminTier): boolean {
  return tier === 'super';
}
