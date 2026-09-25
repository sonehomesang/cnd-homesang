import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth-context';
import { isRootAdminPhone } from './rootAdmin';
import {
  type AdminAction,
  effectivePerms,
  type OwnAction,
  type Role,
  watchRoles,
} from './rbac';

interface PermState {
  rolesLoaded: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  can: (capability: string) => boolean;
  adminCan: (section: string, action: AdminAction) => boolean;
  /** may this user open the given admin console section? */
  canSection: (section: string) => boolean;
  /** may this user do `action` to their OWN content in `domain`? (fine-grained) */
  ownCan: (domain: string, action: OwnAction) => boolean;
}

const PermContext = createContext<PermState>({
  rolesLoaded: false,
  isAdmin: false,
  isSuperAdmin: false,
  can: () => false,
  adminCan: () => false,
  canSection: () => false,
  ownCan: () => false,
});

export function usePermissions() {
  return useContext(PermContext);
}

/**
 * Per-section CRUD gate for an admin panel. `section` must be one of the
 * ADMIN_SECTIONS keys (the panel's nav key). Super admin → all true.
 * Use to gate create / edit / delete controls inside a panel.
 */
export function useSectionPerms(section: string) {
  const { adminCan, canSection } = usePermissions();
  return {
    canView: canSection(section),
    canCreate: adminCan(section, 'create'),
    canEdit: adminCan(section, 'edit'),
    canDelete: adminCan(section, 'delete'),
  };
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loaded, setLoaded] = useState(false);

  // roles (the RBAC matrix) are signed-in only — a guest has no permissions to
  // compute, so don't subscribe (and don't hit a denied read) until logged in
  useEffect(() => {
    if (!profile) { setRoles([]); setLoaded(true); return; }
    const unsub = watchRoles((r) => {
      setRoles(r);
      setLoaded(true);
    });
    return unsub;
  }, [profile]);

  const value = useMemo<PermState>(() => {
    const isSuper = profile?.isSuperAdmin === true || isRootAdminPhone(profile?.phone);
    const userRoles = (profile?.roles ?? []) as string[];
    const eff = effectivePerms(userRoles, roles, isSuper);
    return {
      rolesLoaded: loaded,
      isAdmin: eff.isAdmin,
      isSuperAdmin: isSuper,
      can: (cap: string) => {
        // before roles load, allow (avoid flicker-blocking); default-allow for signed-in
        if (!loaded) return !!profile;
        return !!eff.capabilities[cap];
      },
      adminCan: (section: string, action: AdminAction) =>
        !!eff.adminPerms[section]?.[action],
      canSection: (section: string) => isSuper || !!eff.adminPerms[section]?.view,
      ownCan: (domain: string, action: OwnAction) => {
        if (isSuper) return true;
        if (!loaded) return !!profile; // avoid flicker-blocking before roles load
        return !!eff.ownPerms?.[domain]?.[action];
      },
    };
  }, [profile, roles, loaded]);

  return <PermContext.Provider value={value}>{children}</PermContext.Provider>;
}
