import { useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_FEED_CONFIG, type FeedRankConfig } from './freshness';
import { type BnplConfig, DEFAULT_BNPL } from './bnpl';
import type { MemberDiscountRule } from './memberPricing';

/** Per-page visibility for a toggleable UI section: an `all` default plus
 *  optional per-page (pageKey → boolean) overrides. */
export type SectionVis = { all?: boolean } & Record<string, boolean>;

export interface AppSettings {
  appName: string;
  supportPhone: string; // used for the footer WhatsApp link (wa.me)
  supportEmail: string;
  supportLine: string; // Line ID or full add-friend URL (footer Line icon)
  supportTelegram: string; // Telegram @username or full t.me URL (footer Telegram icon)
  // "ຕິດຕາມ ພວກເຮົາ" social links — footer icons show only when the URL is set
  facebook: string;
  tiktok: string;
  youtube: string;
  // Per-page section visibility. sections[key][pageKey] overrides sections[key].all,
  // which overrides SECTION_DEFAULTS[key]. Read via sectionOn(settings, key, page).
  sections: Record<string, SectionVis>;
  announcement: string; // shown as a banner on home when non-empty
  platformFeePct: number; // informational; mirrors wallet PLATFORM_FEE_RATE
  vatPct: number; // VAT / tax % (reporting)
  referralRewardKip: number; // reward per successful referral (to the referrer)
  referralRefereeRewardKip: number; // welcome reward to the invited new friend (0 = off)
  brokerCommissionPct: number; // Y2: broker (ນາຍໜ້າ) affiliate commission % per attributed sale
  loyaltyEarnPct: number; // Y3: store-credit cashback % on delivered orders (0 = off); 1 point = 1 kip
  loyaltyMaxRedeemPct: number; // Y3: max % of an order's goods subtotal payable with points
  escrowAutoReleaseDays: number; // Y3: auto-confirm a delivered order after N days (0 = off)
  memberDiscounts: MemberDiscountRule[]; // global default member/group customer discounts
  minWithdrawalKip: number;
  vapidKey: string; // FCM web push public key (Firebase console → Cloud Messaging)
  logoUrl: string; // optional override for the bundled app logo
  searchRadiusKm: number; // default radius for "nearby" technicians / jobs
  radiusVisibilityEnabled: boolean; // ON = radius gates who you see; OFF = see everyone (km still shown)
  maintenanceMode: boolean; // when true, non-admins see a maintenance screen
  maintenanceMessage: string; // shown on the maintenance screen
  maintenancePreviewCode: string; // secret code a non-admin can enter to preview during maintenance
  maintenanceAllowedIps: string[]; // public IPs allowed to preview during maintenance
  feedRanking?: Record<string, FeedRankConfig>; // per-feed freshness ranking config (see lib/freshness)
  techTravelFreeKm: number; // quick-win 2: km a tech travels free before charging
  techTravelPerKm: number;  // quick-win 2: kip per km beyond the free radius (0 = off)
  techMinRating: number;    // quick-win 3: techs rated below this sink in search (0 = off)
  // refundable on-site survey fee (competitive quick-win)
  surveyFeeMode: 'off' | 'prepay' | 'agree'; // off / pay-up-front / agree-only
  surveyFeeAmount: number;  // kip charged for an on-site survey (0 = off)
  liabilityCapMultiplier: number; // T&C: max provider liability = N× the quote service fee
  // urgent / emergency job posting (instant-alert techs; no queue booking)
  urgentEnabled: boolean;
  urgentFeeKip: number; // extra fee for an urgent post (0 = free; deters overuse)
  // product BNPL / installment (ຜ່ອນ ສິນຄ້າ) — see lib/bnpl
  bnpl: BnplConfig;
  // go-live gate for the 🧪 sample/mock seeders (default ON; admin turns OFF at launch)
  mockEnabled: boolean;
  // technician onboarding: 'auto' = a new tech appears in the directory as soon as
  // they complete their profile (unverified, no badge); 'review' = hidden until an
  // admin opens/verifies them. (general→tech role upgrades always need admin.)
  techApprovalMode: 'auto' | 'review';
  // technician verification assessment — admin-defined so the criteria + pass bar
  // + tiers follow real standards (NFPA etc.), not hard-coded values.
  techAssessCriteria: { id: string; label: string; standard?: string }[];
  techAssessPassPct: number;   // test pass threshold (%) for new/graduate techs
  techAssessTiers: { key: string; label: string }[];
  // product / feed display density — admin-tunable so lists don't run too long
  homeJobCols: number;      // home "latest jobs": columns (1–2)
  homeJobCount: number;     // home "latest jobs": how many to show
  shopColsMobile: number;   // shop grid columns on phones (2–3)
  shopColsWide: number;     // shop grid columns on wide screens (3–6)
}

export const DEFAULT_SETTINGS: AppSettings = {
  appName: 'HomeSang',
  supportPhone: '',
  supportEmail: '',
  supportLine: '',
  supportTelegram: '',
  facebook: '',
  tiktok: '',
  youtube: '',
  sections: {},
  announcement: '',
  platformFeePct: 10,
  vatPct: 0,
  referralRewardKip: 0,
  referralRefereeRewardKip: 0,
  brokerCommissionPct: 0,
  loyaltyEarnPct: 0,
  loyaltyMaxRedeemPct: 50,
  escrowAutoReleaseDays: 7,
  memberDiscounts: [],
  minWithdrawalKip: 50000,
  vapidKey: '',
  logoUrl: '',
  searchRadiusKm: 10,
  radiusVisibilityEnabled: false, // start OFF so everyone is visible during testing
  maintenanceMode: false,
  maintenanceMessage: 'ກຳລັງ ປັບປຸງ ລະບົບ ຊົ່ວຄາວ — ຈະ ກັບ ມາ ໄວໆ ນີ້ 🙏',
  maintenancePreviewCode: '',
  maintenanceAllowedIps: [],
  feedRanking: {},
  techTravelFreeKm: 0,
  techTravelPerKm: 0,
  techMinRating: 0,
  surveyFeeMode: 'off',
  surveyFeeAmount: 0,
  liabilityCapMultiplier: 2,
  urgentEnabled: false,
  urgentFeeKip: 0,
  bnpl: DEFAULT_BNPL,
  mockEnabled: true, // ON during build/testing; admin flips OFF for go-live
  homeJobCols: 2,
  homeJobCount: 4,
  shopColsMobile: 2,
  shopColsWide: 5,
  techApprovalMode: 'auto', // techs appear on completing profile; admin verifies later
  techAssessCriteria: [
    { id: 'c1', label: 'ໃຊ້ ອຸປະກອນ ປ້ອງ ກັນ ຄວາມ ປອດ ໄພ (PPE)', standard: 'NFPA 70E' },
    { id: 'c2', label: 'ຮູ້ ມາດ ຕະ ຖານ ໄຟຟ້າ / ປ້ອງ ກັນ ໄຟ ໄໝ້', standard: 'NFPA 70 / 921' },
    { id: 'c3', label: 'ຮັບ ຜິດ ຊອບ + ຮັບປະກັນ ວຽກ', standard: '' },
    { id: 'c4', label: 'ຄຸນ ນະ ພາບ ຜົນ ງານ ຜ່ານ ເກນ', standard: '' },
    { id: 'c5', label: 'ມາ ລະ ຍາດ + ກົງ ເວລາ', standard: '' },
  ],
  techAssessPassPct: 70,
  techAssessTiers: [
    { key: 'new', label: 'ໃໝ່' },
    { key: 'skilled', label: 'ຊຳ ນານ' },
    { key: 'expert', label: 'ຊ່ຽວ ຊານ' },
  ],
};

const REF = () => doc(db, 'settings', 'app');

// ── Toggleable sections ──────────────────────────────────────────────────────
// The sections an admin can show/hide, and the pages each one can appear on.
// Used to drive the back-office toggle grid AND the runtime sectionOn() check.
export const SECTION_PAGES: Record<string, string[]> = {
  home: ['home'],
  'find-tech': ['find-tech'],
  explore: ['explore'],
  shop: ['shop'],
  community: ['community'],
  'tech-profile': ['tech-profile'],
  'job-detail': ['job-detail'],
  product: ['product'],
};
// pages where the shared footer appears (footer sub-sections toggle per these)
export const FOOTER_PAGES = ['home', 'find-tech', 'explore', 'shop', 'community', 'tech-profile', 'job-detail', 'product'];

export const TOGGLEABLE_SECTIONS: { key: string; lao: string; pages: string[] }[] = [
  { key: 'homeCategories', lao: 'ໝວດບໍລິການ (ໜ້າຫຼັກ)', pages: ['home'] },
  { key: 'footerMenu', lao: 'Footer — ເມນູ ລິ້ງ', pages: FOOTER_PAGES },
  { key: 'footerContact', lao: 'Footer — ຕິດຕໍ່ ພວກເຮົາ', pages: FOOTER_PAGES },
  { key: 'footerSocial', lao: 'Footer — ຕິດຕາມ ພວກເຮົາ', pages: FOOTER_PAGES },
];

// default visibility when an admin hasn't set anything
const SECTION_DEFAULTS: Record<string, boolean> = {
  homeCategories: false, // hidden by default (owner request: home leads with jobs)
  footerMenu: false, // redundant with the ☰ burger menu
  footerContact: true,
  footerSocial: true,
};

/** Is a toggleable section shown on a given page? per-page → `all` → default. */
export function sectionOn(settings: AppSettings | null | undefined, key: string, page: string): boolean {
  const cfg = settings?.sections?.[key];
  if (cfg) {
    const per = cfg[page];
    if (typeof per === 'boolean') return per;
    if (typeof cfg.all === 'boolean') return cfg.all;
  }
  return SECTION_DEFAULTS[key] ?? true;
}

function merge(data: any): AppSettings {
  const d = data ?? {};
  // bnpl is a nested object — deep-merge so a stored config that predates a new
  // field still gets that field's default (a shallow spread would drop it).
  return {
    ...DEFAULT_SETTINGS,
    ...d,
    bnpl: { ...DEFAULT_BNPL, ...(d.bnpl ?? {}) },
  } as AppSettings;
}

export function watchAppSettings(cb: (s: AppSettings) => void) {
  return onSnapshot(
    REF(),
    (snap) => cb(merge(snap.exists() ? snap.data() : {})),
    (e) => { console.error('watchAppSettings:', e); cb(DEFAULT_SETTINGS); },
  );
}

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const snap = await getDoc(REF());
    return merge(snap.exists() ? snap.data() : {});
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveAppSettings(patch: Partial<AppSettings>) {
  await setDoc(REF(), { ...patch, updatedAt: Date.now() }, { merge: true });
}

/** Live full app settings (falls back to defaults until the doc loads). */
export function useAppSettings(): AppSettings {
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => watchAppSettings(setS), []);
  return s;
}

/** Live freshness-ranking config for one feed (falls back to the default). */
export function useFeedConfig(key: string): FeedRankConfig {
  const [cfg, setCfg] = useState<FeedRankConfig>(DEFAULT_FEED_CONFIG);
  useEffect(
    () => watchAppSettings((s) => setCfg(s.feedRanking?.[key] ?? DEFAULT_FEED_CONFIG)),
    [key],
  );
  return cfg;
}
