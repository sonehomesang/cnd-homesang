import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { logAdminAction } from './auditLog';
import { logUserActivity } from './userActivity';
import { PLATFORM_FEE_RATE } from './wallet';
import { getAppSettings } from './appSettings';
import type { UserProfile } from './auth-context';

// MVP bootstrap secret. Production: replace with Cloud Function + custom claims.
const ADMIN_SECRET = 'homesang-admin-2026';

export async function claimAdmin(uid: string, secret: string) {
  if (secret !== ADMIN_SECRET) {
    throw new Error('Secret ບໍ່ຖືກຕ້ອງ · Wrong secret');
  }
  const snap = await getDoc(doc(db, 'users', uid));
  const cur = snap.data() ?? {};
  const roles: string[] = Array.isArray(cur.roles) ? cur.roles : [];
  const nextRoles = roles.includes('admin') ? roles : [...roles, 'admin'];
  await updateDoc(doc(db, 'users', uid), {
    isSuperAdmin: true,
    roles: nextRoles,
    updatedAt: Date.now(),
  });
  void logAdminAction({
    action: 'update',
    collection: 'users',
    docId: uid,
    before: { isSuperAdmin: cur.isSuperAdmin ?? false, roles },
    after: { isSuperAdmin: true, roles: nextRoles },
  });
}

export interface AdminUser extends UserProfile {}

export function watchAllUsers(cb: (users: AdminUser[]) => void) {
  return onSnapshot(
    collection(db, 'users'),
    (snap) => {
      const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as AdminUser);
      users.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      cb(users);
    },
    (err) => {
      console.error('watchAllUsers:', err);
      cb([]);
    },
  );
}

export async function setUserStatus(
  uid: string,
  status: 'pending' | 'approved' | 'rejected' | 'suspended',
) {
  const snap = await getDoc(doc(db, 'users', uid));
  const before = snap.data()?.status;
  await updateDoc(doc(db, 'users', uid), { status, updatedAt: Date.now() });
  void logAdminAction({
    action: 'update',
    collection: 'users',
    docId: uid,
    before: { status: before },
    after: { status },
  });
  void logUserActivity(uid, 'status_change', { detail: status, actorUid: auth.currentUser?.uid });
}

export async function setUserRoles(uid: string, roles: string[]) {
  const snap = await getDoc(doc(db, 'users', uid));
  const before = snap.data()?.roles ?? [];
  await updateDoc(doc(db, 'users', uid), { roles, updatedAt: Date.now() });
  void logAdminAction({
    action: 'update',
    collection: 'users',
    docId: uid,
    before: { roles: before },
    after: { roles },
  });
  void logUserActivity(uid, 'role_change', { detail: (roles || []).join(', ') || '—', actorUid: auth.currentUser?.uid });
}

export async function toggleAdminRole(uid: string, makeAdmin: boolean) {
  const snap = await getDoc(doc(db, 'users', uid));
  const cur = snap.data() ?? {};
  const roles: string[] = Array.isArray(cur.roles) ? cur.roles : [];
  const next = makeAdmin
    ? roles.includes('admin')
      ? roles
      : [...roles, 'admin']
    : roles.filter((r) => r !== 'admin');
  const nextSuper = makeAdmin ? cur.isSuperAdmin ?? false : false;
  await updateDoc(doc(db, 'users', uid), {
    roles: next,
    isSuperAdmin: nextSuper,
    updatedAt: Date.now(),
  });
  void logAdminAction({
    action: 'update',
    collection: 'users',
    docId: uid,
    before: { roles, isSuperAdmin: cur.isSuperAdmin ?? false },
    after: { roles: next, isSuperAdmin: nextSuper },
  });
}

/**
 * Set a user's admin tier. super = isSuperAdmin + legacy 'admin' role;
 * cs/cp = the matching admin role; null = strip all admin access.
 */
export async function setAdminTier(uid: string, tier: 'super' | 'cs' | 'cp' | null) {
  const snap = await getDoc(doc(db, 'users', uid));
  const cur = snap.data() ?? {};
  const roles: string[] = Array.isArray(cur.roles) ? cur.roles : [];
  const base = roles.filter((r) => !['admin', 'cs_admin', 'cp_admin'].includes(r));
  let next = base;
  let isSuperAdmin = false;
  if (tier === 'super') { next = [...base, 'admin']; isSuperAdmin = true; }
  else if (tier === 'cs') next = [...base, 'cs_admin'];
  else if (tier === 'cp') next = [...base, 'cp_admin'];
  await updateDoc(doc(db, 'users', uid), { roles: next, isSuperAdmin, updatedAt: Date.now() });
  void logAdminAction({
    action: 'update',
    collection: 'users',
    docId: uid,
    before: { roles, isSuperAdmin: cur.isSuperAdmin ?? false },
    after: { roles: next, isSuperAdmin },
  });
}

export interface CatStat { key: string; count: number; sales?: number }
export interface MonthPoint { label: string; income: number; expense: number }

export interface DashboardMetrics {
  // users
  totalUsers: number;
  newUsers30d: number;
  technicians: number;
  shops: number;
  usersTechRider: number; // distinct technicians ∪ riders
  usersCorporate: number; // corporation / shop group
  // jobs
  totalJobs: number;
  totalBids: number;
  openJobs: number;
  inProgressJobs: number;
  completedJobs: number;
  completionRate: number; // 0..1
  jobsByStatus: Record<string, number>;
  jobsByCategory: CatStat[];
  // products
  totalProducts: number;
  productsSold: number; // total units sold
  productsByCategory: CatStat[]; // count + sales (soldCount × price)
  // orders
  totalOrders: number;
  ordersByStatus: Record<string, number>;
  usersByGroup: Record<string, number>;
  // revenue (kept for compat)
  jobsGmv: number;
  commission: number;
  ordersRevenue: number;
  techPayout: number;
  // finance overview
  gmvTotal: number; // job GMV + recognized order revenue
  income: { jobCommission: number; orderCommission: number; vaFees: number; total: number };
  expense: { broker: number; referral: number; loyalty: number; total: number };
  receivable: { codHeld: number; pendingVerify: number; total: number };
  payable: { pendingWithdraw: number; unconfirmedTips: number; total: number };
  monthly: MonthPoint[]; // last 6 months income vs expense
  // content / system counts
  content: { banners: number; learn: number; reels: number; posts: number; categories: number; shops: number; reviews: number };
  // items needing action
  track: { pendingVerify: number; codToRemit: number; pendingWithdraw: number; disputes: number };
}

const LAO_MONTH = ['ມ.ກ', 'ກ.ພ', 'ມີ.ນ', 'ເມ.ສ', 'ພຶ.ພ', 'ມິ.ຖ', 'ກ.ລ', 'ສ.ຫ', 'ກ.ຍ', 'ຕ.ລ', 'ພ.ຈ', 'ທ.ວ'];

const ms = (v: any): number => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : 0);
const isRecognized = (o: any): boolean => o.status !== 'cancelled' && (o.paymentVerified || o.status === 'completed');
const count = async (name: string): Promise<number> => {
  try { return (await getCountFromServer(collection(db, name))).data().count; } catch { return 0; }
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [usersSnap, jobsSnap, bidsSnap, ordersSnap, ridersSnap, productsSnap, tasksSnap, wdSnap, settings,
    cBanners, cLearn, cReels, cPosts, cCats, cShops, cReviews, cDisputes] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'jobs')),
    getDocs(collection(db, 'bids')),
    getDocs(collection(db, 'orders')),
    getDocs(collection(db, 'riders')),
    getDocs(collection(db, 'products')),
    getDocs(collection(db, 'deliveryTasks')),
    getDocs(query(collection(db, 'walletTransactions'), where('type', '==', 'withdrawal'))),
    getAppSettings(),
    count('banners'), count('learnClips'), count('reels'), count('posts'),
    count('categories'), count('shops'), count('reviews'), count('disputes'),
  ]);
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  const jobs = jobsSnap.docs.map((d) => d.data()) as any[];
  const orders = ordersSnap.docs.map((d) => d.data()) as any[];
  const products = productsSnap.docs.map((d) => d.data()) as any[];
  const tasks = tasksSnap.docs.map((d) => d.data()) as any[];
  const completed = jobs.filter((j) => j.status === 'completed');
  const recognized = orders.filter(isRecognized);

  // ===== revenue basics (kept) =====
  const jobsGmv = completed.reduce((s, j) => s + (typeof j.finalPrice === 'number' ? j.finalPrice : 0), 0);
  const ordersRevenue = recognized.reduce((s, o) => s + (typeof o.grandTotal === 'number' ? o.grandTotal : typeof o.total === 'number' ? o.total : 0), 0);
  const commission = completed.reduce((s, j) => s + (typeof j.finalPrice === 'number' ? Math.round(j.finalPrice * PLATFORM_FEE_RATE) : 0), 0);

  const tally = (arr: any[], key: (x: any) => string): Record<string, number> => {
    const m: Record<string, number> = {};
    arr.forEach((x) => { const k = key(x); m[k] = (m[k] ?? 0) + 1; });
    return m;
  };
  const groupOf = (u: any): string => {
    if (u.group) return u.group;
    const r: string[] = u.roles ?? [];
    if (u.isSuperAdmin || r.includes('admin') || r.includes('cs_admin') || r.includes('cp_admin')) return 'admin';
    if (r.includes('shop')) return 'corporation';
    if (r.includes('technician')) return 'technician';
    return 'general';
  };
  const cutoff = Date.now() - 30 * 86400000;

  // ===== users: distinct tech ∪ rider, corporation =====
  const techUids = new Set(users.filter((u) => (u.roles ?? []).includes('technician')).map((u) => u.id));
  ridersSnap.docs.forEach((d) => techUids.add(d.id));
  const usersCorporate = users.filter((u) => groupOf(u) === 'corporation').length;

  // ===== category breakdowns (sorted desc, top 6 + "ອື່ນໆ") =====
  const catRoll = (rows: { key: string; count: number; sales: number }[]): CatStat[] => {
    const m = new Map<string, { count: number; sales: number }>();
    rows.forEach((r) => { const c = m.get(r.key) ?? { count: 0, sales: 0 }; c.count += r.count; c.sales += r.sales; m.set(r.key, c); });
    const arr = [...m.entries()].map(([key, v]) => ({ key, count: v.count, sales: v.sales })).sort((a, b) => b.count - a.count);
    if (arr.length <= 6) return arr;
    const head = arr.slice(0, 5);
    const rest = arr.slice(5).reduce((a, r) => ({ key: 'ອື່ນໆ', count: a.count + r.count, sales: a.sales + r.sales }), { key: 'ອື່ນໆ', count: 0, sales: 0 });
    return [...head, rest];
  };
  const productsByCategory = catRoll(products.map((p) => ({
    key: p.categoryLao || p.category || 'ອື່ນໆ',
    count: 1,
    sales: (typeof p.soldCount === 'number' ? p.soldCount : 0) * (typeof p.price === 'number' ? p.price : 0),
  })));
  const jobsByCategory = catRoll(jobs.map((j) => ({ key: j.categoryLao || j.category || 'ອື່ນໆ', count: 1, sales: 0 })))
    .map(({ key, count }) => ({ key, count }));
  const productsSold = products.reduce((s, p) => s + (typeof p.soldCount === 'number' ? p.soldCount : 0), 0);

  // ===== finance: income / expense / receivable / payable =====
  const orderCommission = recognized.reduce((s, o) => s + (o.commission ?? 0), 0);
  const vaFees = recognized.reduce((s, o) => s + (o.platformFeeTotal ?? 0), 0);
  const broker = recognized.reduce((s, o) => s + (o.brokerCommission ?? 0), 0);
  const loyalty = recognized.reduce((s, o) => s + (o.pointsRedeemed ?? o.pointsDiscount ?? 0), 0);
  const referralCount = (await count('referrals'));
  const referral = referralCount * (settings.referralRewardKip ?? 0);
  const incomeTotal = commission + orderCommission + vaFees;
  const expenseTotal = broker + referral + loyalty;

  const codHeld = tasks.filter((t) => t.status === 'delivered' && !t.codRemitted).reduce((s, t) => s + (t.codAmount ?? 0), 0);
  const pendingVerifyOrders = orders.filter((o) => o.status === 'pending' && o.paymentMethod === 'bank_transfer' && !o.paymentVerified);
  const pendingVerify = pendingVerifyOrders.reduce((s, o) => s + (o.grandTotal ?? 0), 0);
  const withdrawals = wdSnap.docs.map((d) => d.data()).filter((w: any) => w.status === 'pending');
  const pendingWithdraw = withdrawals.reduce((s, w: any) => s + (w.amount ?? 0), 0);
  const unconfirmedTips = tasks.filter((t) => (t.tip ?? 0) > 0 && t.tipConfirmed !== true).reduce((s, t) => s + (t.tip ?? 0), 0);
  const codToRemit = tasks.filter((t) => t.status === 'delivered' && !t.codRemitted && (t.codAmount ?? 0) > 0).length;

  // ===== monthly income vs expense (last 6 months) =====
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: `${dt.getFullYear()}-${dt.getMonth()}`, label: LAO_MONTH[dt.getMonth()], income: 0, expense: 0 };
  });
  const bucket = (msVal: number) => { const dt = new Date(msVal); return months.find((m) => m.key === `${dt.getFullYear()}-${dt.getMonth()}`); };
  completed.forEach((j) => { const b = bucket(ms(j.completedAt ?? j.createdAt)); if (b) b.income += typeof j.finalPrice === 'number' ? Math.round(j.finalPrice * PLATFORM_FEE_RATE) : 0; });
  recognized.forEach((o) => {
    const b = bucket(ms(o.createdAt)); if (!b) return;
    b.income += (o.commission ?? 0) + (o.platformFeeTotal ?? 0);
    b.expense += (o.brokerCommission ?? 0) + (o.pointsRedeemed ?? o.pointsDiscount ?? 0);
  });

  return {
    totalUsers: users.length,
    newUsers30d: users.filter((u) => ms(u.createdAt) >= cutoff).length,
    technicians: users.filter((u) => (u.roles ?? []).includes('technician')).length,
    shops: users.filter((u) => (u.roles ?? []).includes('shop')).length,
    usersTechRider: techUids.size,
    usersCorporate,
    totalJobs: jobs.length,
    totalBids: bidsSnap.size,
    openJobs: jobs.filter((j) => j.status === 'open').length,
    inProgressJobs: jobs.filter((j) => ['assigned', 'in_progress'].includes(j.status)).length,
    completedJobs: completed.length,
    completionRate: jobs.length ? completed.length / jobs.length : 0,
    jobsByStatus: tally(jobs, (j) => j.status ?? 'open'),
    jobsByCategory,
    totalProducts: products.length,
    productsSold,
    productsByCategory,
    totalOrders: orders.length,
    ordersByStatus: tally(orders, (o) => o.status ?? 'pending'),
    usersByGroup: tally(users, groupOf),
    jobsGmv,
    commission,
    ordersRevenue,
    techPayout: jobsGmv - commission,
    gmvTotal: jobsGmv + ordersRevenue,
    income: { jobCommission: commission, orderCommission, vaFees, total: incomeTotal },
    expense: { broker, referral, loyalty, total: expenseTotal },
    receivable: { codHeld, pendingVerify, total: codHeld + pendingVerify },
    payable: { pendingWithdraw, unconfirmedTips, total: pendingWithdraw + unconfirmedTips },
    monthly: months.map(({ label, income, expense }) => ({ label, income, expense })),
    content: { banners: cBanners, learn: cLearn, reels: cReels, posts: cPosts, categories: cCats, shops: cShops, reviews: cReviews },
    track: { pendingVerify: pendingVerifyOrders.length, codToRemit, pendingWithdraw: withdrawals.length, disputes: cDisputes },
  };
}
