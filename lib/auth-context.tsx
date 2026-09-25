import { onAuthStateChanged, User as FirebaseUser, signOut as fbSignOut } from 'firebase/auth';
import { doc, onSnapshot, Timestamp, updateDoc } from 'firebase/firestore';
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { auth, db } from './firebase';
import { isRootAdminPhone } from './rootAdmin';
import { logUserActivity, recordLogin, touchActive } from './userActivity';

export type Role = 'customer' | 'technician' | 'shop' | 'admin';
export type Gender = 'male' | 'female' | 'other';

export interface UserProfile {
  uid: string;
  phone: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  image?: string;
  roles: Role[];
  primaryRole?: Role;
  language?: string;
  gender?: Gender;
  dob?: number;
  lat?: number;
  lng?: number;
  bio?: string;
  address?: string;
  savedAddresses?: import('./addresses').SavedAddress[];
  companyName?: string;
  roleDescription?: string;
  specialties?: string[];
  rating?: number;
  reviewCount?: number;
  isSuperAdmin?: boolean;
  status?: 'pending' | 'approved' | 'rejected' | 'suspended';
  createdAt: number;
  updatedAt?: number;
}

interface AuthState {
  fbUser: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  needsProfileSetup: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  fbUser: null,
  profile: null,
  loading: true,
  needsProfileSetup: false,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // login-tracking guards: skip the initial session-restore (not a fresh login)
  // and token refreshes (same uid firing again) so loginCount only counts real
  // sign-ins.
  const bootDone = useRef(false);
  const prevUid = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const unsub = onAuthStateChanged(auth, (user) => {
      setFbUser(user);
      const uid = user?.uid ?? null;
      if (uid && uid !== prevUid.current) {
        if (bootDone.current) void recordLogin(uid); // a genuine sign-in
        else void touchActive(uid);                  // restored session on load
      }
      prevUid.current = uid;
      bootDone.current = true;
      if (!user) {
        setProfile(null);
        setProfileLoaded(true);
        // NOTE: do NOT flip loading=false here. onAuthStateChanged can fire a
        // transient `null` before Firebase finishes restoring a persisted
        // session on a cold page load; flipping loading off on that transient
        // makes guarded screens briefly see "logged out" and bounce to
        // /sign-in → home (observed on deep-linking to /referral while signed
        // in). We resolve the logged-out state only once auth has truly settled,
        // via authStateReady() below. For a signed-in user, loading is cleared
        // by the profile snapshot effect instead.
      } else {
        setProfileLoaded(false);
      }
    });
    // authStateReady() resolves after the initial persisted session (if any) is
    // restored — the reliable signal that "no user" is final, not transient.
    auth.authStateReady().then(() => {
      if (mounted && !auth.currentUser) setLoading(false);
    });
    return () => { mounted = false; unsub(); };
  }, []);

  useEffect(() => {
    if (!fbUser) return;
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'users', fbUser.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const createdAt =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toMillis()
              : typeof data.createdAt === 'number'
              ? data.createdAt
              : Date.now();
          setProfile({ uid: snap.id, ...data, createdAt } as UserProfile);
        } else {
          setProfile(null);
        }
        setProfileLoaded(true);
        setLoading(false);
      },
      (err) => {
        console.error('Profile snapshot error:', err);
        setProfileLoaded(true);
        setLoading(false);
      },
    );
    return unsub;
  }, [fbUser]);

  // Root-admin safety net: if the product owner's own phone is ever missing the
  // super-admin flag in the DB (e.g. a role reconcile cleared it), restore it so
  // the Firestore rules — which read this flag server-side — keep letting them in.
  // The guard (isSuperAdmin !== true) prevents a write→snapshot→write loop.
  // Attempt the write at most ONCE per signed-in user. A failed write (e.g. the
  // rules block a self-escalation) optimistically applies then rolls back,
  // firing two snapshots that flip isSuperAdmin true→false — without this guard
  // the effect re-fires on every flip and loops forever, spamming the DB and
  // re-rendering the whole app (which flickers the UI). Retrying can't help: if
  // the first write was denied, every retry is denied too.
  const selfHealFor = useRef<string | null>(null);
  useEffect(() => {
    if (!fbUser || !profile) return;
    if (isRootAdminPhone(profile.phone) && profile.isSuperAdmin !== true && selfHealFor.current !== fbUser.uid) {
      selfHealFor.current = fbUser.uid;
      updateDoc(doc(db, 'users', fbUser.uid), { isSuperAdmin: true }).catch((e) =>
        console.error('root-admin self-heal:', e));
    }
  }, [fbUser, profile]);

  // Gate on !loading too: during a cold-load the profile snapshot hasn't
  // resolved yet, and a transient (fbUser set, profile still null) must NOT read
  // as "needs setup" — otherwise the home tab's redirect fires and bounces a
  // deep-linked route (e.g. /referral) through /profile-setup to home.
  const needsProfileSetup =
    !loading && !!fbUser && profileLoaded && (!profile || !profile.firstName);

  const signOut = async () => {
    const uid = auth.currentUser?.uid;
    if (uid) await logUserActivity(uid, 'logout');
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ fbUser, profile, loading, needsProfileSetup, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
