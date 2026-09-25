import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { PLATFORM_FEE_RATE } from './wallet';

/**
 * Growth / funnel metrics for the admin console — signups over time, MAU,
 * GMV & revenue per month, a members→orders funnel, split HomeSang vs CND.
 * All computed client-side from full-collection reads (like getDashboardMetrics);
 * fine at current data volume. NOTE: app-install/download counts are NOT in the
 * data model (no analytics integration) — the funnel top uses REGISTERED members
 * as the proxy, and MAU is "active in the last 30 days" from users.lastActiveAt.
 */
const ms = (v: any): number => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : 0);
const isRecognized = (o: any): boolean => o.status !== 'cancelled' && (o.paymentVerified || o.status === 'completed');
const LAO_MONTH = ['ມ.ກ', 'ກ.ພ', 'ມີ.ນ', 'ເມ.ສ', 'ພຶ.ພ', 'ມິ.ຖ', 'ກ.ລ', 'ສ.ຫ', 'ກ.ຍ', 'ຕ.ລ', 'ພ.ຈ', 'ທ.ວ'];
const num = (v: any): number => (typeof v === 'number' ? v : 0);

export interface MonthPoint { label: string; hs: number; cnd: number; }
export interface SignupPoint { label: string; value: number; }
export interface GrowthMetrics {
  totalUsers: number;
  newUsersThisMonth: number;
  newUsersPct: number;            // vs previous 30 days
  mau30d: number;                 // active in last 30 days
  technicians: number;
  ordersThisMonth: number;        // HomeSang goods orders + jobs created this month
  gmvThisMonth: number;           // HomeSang (kip)
  revenueThisMonth: number;       // HomeSang commission (kip)
  signupSeries: SignupPoint[];    // last 8 months
  gmvSeries: MonthPoint[];        // last 8 months (kip)
  funnel: { members: number; active: number; buyers: number; orders: number };
  cnd: { ordersThisMonth: number; gmvThisMonth: number; ordersTotal: number; couponUses: number };
  updatedAt: number;
}

export async function getGrowthMetrics(): Promise<GrowthMetrics> {
  const [usersSnap, ordersSnap, jobsSnap, cndOrdersSnap, cndCouponsSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'orders')),
    getDocs(collection(db, 'jobs')),
    getDocs(collection(db, 'cndOrders')),
    getDocs(collection(db, 'cndCoupons')),
  ]);
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  const orders = ordersSnap.docs.map((d) => d.data()) as any[];
  const jobs = jobsSnap.docs.map((d) => d.data()) as any[];
  const cndOrders = cndOrdersSnap.docs.map((d) => d.data()) as any[];

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const cutoff30 = Date.now() - 30 * 86400000;
  const cutoff60 = Date.now() - 60 * 86400000;

  // ===== users =====
  const totalUsers = users.length;
  const newUsersThisMonth = users.filter((u) => ms(u.createdAt) >= startOfMonth).length;
  const new30 = users.filter((u) => ms(u.createdAt) >= cutoff30).length;
  const newPrev30 = users.filter((u) => { const t = ms(u.createdAt); return t >= cutoff60 && t < cutoff30; }).length;
  const newUsersPct = newPrev30 > 0 ? Math.round(((new30 - newPrev30) / newPrev30) * 100) : (new30 > 0 ? 100 : 0);
  const mau30d = users.filter((u) => ms(u.lastActiveAt ?? u.lastLoginAt) >= cutoff30).length;
  const technicians = users.filter((u) => (u.roles ?? []).includes('technician')).length;

  // ===== HomeSang this-month GMV / revenue / order count =====
  const recognized = orders.filter(isRecognized);
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const inMonth = (t: number) => t >= startOfMonth;

  const ordersThisMonth =
    orders.filter((o) => inMonth(ms(o.createdAt))).length +
    jobs.filter((j) => inMonth(ms(j.createdAt))).length;

  const gmvThisMonth =
    recognized.filter((o) => inMonth(ms(o.createdAt))).reduce((s, o) => s + num(o.grandTotal), 0) +
    completedJobs.filter((j) => inMonth(ms(j.completedAt ?? j.createdAt))).reduce((s, j) => s + num(j.finalPrice), 0);

  const revenueThisMonth =
    recognized.filter((o) => inMonth(ms(o.createdAt))).reduce((s, o) => s + num(o.commission), 0) +
    completedJobs.filter((j) => inMonth(ms(j.completedAt ?? j.createdAt))).reduce((s, j) => s + Math.round(num(j.finalPrice) * PLATFORM_FEE_RATE), 0);

  // ===== funnel (this month) =====
  const buyerIds = new Set<string>();
  recognized.filter((o) => inMonth(ms(o.createdAt))).forEach((o) => { if (o.customerId) buyerIds.add(o.customerId); });
  jobs.filter((j) => inMonth(ms(j.createdAt)) && j.customerId).forEach((j) => buyerIds.add(j.customerId));
  const funnel = { members: totalUsers, active: mau30d, buyers: buyerIds.size, orders: ordersThisMonth };

  // ===== monthly series (last 8 months) =====
  const buckets = Array.from({ length: 8 }, (_, i) => {
    const dt = new Date(now.getFullYear(), now.getMonth() - (7 - i), 1);
    return { key: `${dt.getFullYear()}-${dt.getMonth()}`, label: LAO_MONTH[dt.getMonth()], signups: 0, hs: 0, cnd: 0 };
  });
  const bkey = (t: number) => { const dt = new Date(t); return `${dt.getFullYear()}-${dt.getMonth()}`; };
  const find = (t: number) => buckets.find((b) => b.key === bkey(t));
  users.forEach((u) => { const b = find(ms(u.createdAt)); if (b) b.signups += 1; });
  recognized.forEach((o) => { const b = find(ms(o.createdAt)); if (b) b.hs += num(o.grandTotal); });
  completedJobs.forEach((j) => { const b = find(ms(j.completedAt ?? j.createdAt)); if (b) b.hs += num(j.finalPrice); });
  cndOrders.filter((o) => o.status !== 'cancelled').forEach((o) => { const b = find(ms(o.createdAt)); if (b) b.cnd += num(o.total); });

  // ===== CND section =====
  const cndActive = cndOrders.filter((o) => o.status !== 'cancelled');
  const cnd = {
    ordersThisMonth: cndActive.filter((o) => inMonth(ms(o.createdAt))).length,
    gmvThisMonth: cndActive.filter((o) => inMonth(ms(o.createdAt))).reduce((s, o) => s + num(o.total), 0),
    ordersTotal: cndActive.length,
    couponUses: cndCouponsSnap.docs.reduce((s, d) => s + (num((d.data() as any).usedCount)), 0),
  };

  return {
    totalUsers,
    newUsersThisMonth,
    newUsersPct,
    mau30d,
    technicians,
    ordersThisMonth,
    gmvThisMonth,
    revenueThisMonth,
    signupSeries: buckets.map((b) => ({ label: b.label, value: b.signups })),
    gmvSeries: buckets.map((b) => ({ label: b.label, hs: b.hs, cnd: b.cnd })),
    funnel,
    cnd,
    updatedAt: Date.now(),
  };
}
