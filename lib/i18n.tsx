import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

export type Lang = 'lo' | 'en' | 'th';

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'lo', label: 'ລາວ', flag: '🇱🇦' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'th', label: 'ไทย', flag: '🇹🇭' },
];

export interface TEntry {
  lo: string;
  en?: string;
  th?: string;
}

/**
 * Built-in default strings — the "hardcoded text" surfaced in the admin
 * Translations panel. Admin overrides (Firestore `translations/{key}`) win.
 * Lao is the source of truth; en/th fall back to lo when missing.
 */
export const DEFAULTS: Record<string, TEntry> = {
  // tabs
  'tab.home': { lo: 'ໜ້າຫຼັກ', en: 'Home', th: 'หน้าหลัก' },
  'tab.findTech': { lo: 'ຫາຊ່າງ', en: 'Find a pro', th: 'หาช่าง' },
  'tab.jobs': { lo: 'ຫາງານ', en: 'Find work', th: 'หางาน' },
  'tab.shop': { lo: 'ໂຮມຊ໊ອບ', en: 'Shop', th: 'ร้านค้า' },
  'tab.community': { lo: 'ໂຮມເພື່ອນ', en: 'Community', th: 'ชุมชน' },
  // home
  'home.hello': { lo: 'ສະບາຍດີ', en: 'Hello', th: 'สวัสดี' },
  'home.welcome': { lo: 'ຍິນດີຕ້ອນຮັບ', en: 'Welcome', th: 'ยินดีต้อนรับ' },
  'home.search': { lo: 'ຄົ້ນຫາ ສິນຄ້າ · ຮ້ານ · ງານ', en: 'Search products · shops · jobs', th: 'ค้นหา สินค้า · ร้าน · งาน' },
  'home.services': { lo: 'ໝວດບໍລິການ', en: 'Services', th: 'หมวดบริการ' },
  'home.nearbyTechs': { lo: 'ຊ່າງ ໃກ້ຕົວ', en: 'Nearby technicians', th: 'ช่างใกล้ตัว' },
  'home.map': { lo: '🗺️ ແຜນທີ່', en: '🗺️ Map', th: '🗺️ แผนที่' },
  'home.viewOnMap': { lo: 'ເບິ່ງຢູ່ແຜນທີ່', en: 'View on map', th: 'ดูบนแผนที่' },
  'home.nearbyOnMap': { lo: 'ຊ່າງ & ຮ້ານ ໃກ້ຕົວ', en: 'Nearby technicians & shops', th: 'ช่าง & ร้านใกล้ตัว' },
  'home.moreOnMap': { lo: 'ເບິ່ງເພີ່ມເຕີມ ເທິງແຜນທີ່', en: 'More on map', th: 'ดูเพิ่มเติมบนแผนที่' },
  'home.postJob': { lo: '＋ ໂພສງານໃໝ່', en: '+ Post a job', th: '+ โพสต์งานใหม่' },
  'home.myJobs': { lo: 'ງານຂອງຂ້ອຍ', en: 'My jobs', th: 'งานของฉัน' },
  // quick links
  'quick.messages': { lo: 'ຂໍ້ຄວາມ', en: 'Messages', th: 'ข้อความ' },
  'quick.income': { lo: 'ລາຍຮັບ', en: 'Earnings', th: 'รายได้' },
  'quick.orders': { lo: 'ການສັ່ງຊື້', en: 'Orders', th: 'คำสั่งซื้อ' },
  'quick.profile': { lo: 'ໂປຣໄຟລ໌', en: 'Profile', th: 'โปรไฟล์' },
  // pillars
  'pillar.tech': { lo: 'ໂຮມຊ່າງ', en: 'HomeTech', th: 'โฮมช่าง' },
  'pillar.tech.sub': { lo: 'ຈ້າງຊ່າງ ໃກ້ຕົວ ງ່າຍໆ', en: 'Hire nearby technicians', th: 'จ้างช่างใกล้ตัว' },
  'pillar.shop': { lo: 'ໂຮມຊ໊ອບ', en: 'HomeShop', th: 'โฮมช็อป' },
  'pillar.shop.sub': { lo: 'ວັດສະດຸ ສົ່ງເຖິງບ້ານ', en: 'Materials delivered', th: 'วัสดุส่งถึงบ้าน' },
  'pillar.friend': { lo: 'ໂຮມເພື່ອນ', en: 'HomeFriends', th: 'โฮมเพื่อน' },
  'pillar.friend.sub': { lo: 'ຊຸມຊົນ ຊ່າງ ແລະ ລູກຄ້າ', en: 'Community of pros & customers', th: 'ชุมชนช่างและลูกค้า' },
  // common
  'common.back': { lo: '← ກັບຄືນ', en: '← Back', th: '← กลับ' },
  'common.save': { lo: 'ບັນທຶກ', en: 'Save', th: 'บันทึก' },
  'common.cancel': { lo: 'ຍົກເລີກ', en: 'Cancel', th: 'ยกเลิก' },
  'common.loading': { lo: 'ກຳລັງໂຫຼດ...', en: 'Loading...', th: 'กำลังโหลด...' },
  'common.signOut': { lo: 'ອອກຈາກລະບົບ', en: 'Sign out', th: 'ออกจากระบบ' },
  // profile
  'profile.language': { lo: 'ພາສາ', en: 'Language', th: 'ภาษา' },
  // sign-in (keys match the tt('signin', …) hashes, so they always list)
  'signin.1inv6ev': { lo: 'ໄປ ໜ້າ ເວັບ ໂດຍ ບໍ່ ລ໋ອກອິນ', en: 'Browse without login', th: 'ดูโดยไม่ล็อกอิน' },
  'signin.1pif0gj': { lo: 'ເບີໂທ ຫຼື ອີເມລ', en: 'Phone or email', th: 'เบอร์โทร หรือ อีเมล' },
  'signin.y0og13': { lo: '020xxxxxxxx  ຫຼື  you@email.com', en: '020xxxxxxxx  or  you@email.com', th: '020xxxxxxxx  หรือ  you@email.com' },
  'signin.ktjmex': { lo: 'ລະຫັດຜ່ານ', en: 'Password', th: 'รหัสผ่าน' },
  'signin.1msb0m': { lo: 'ເຂົ້າລະບົບ ດ້ວຍລະຫັດຜ່ານ', en: 'Sign in with password', th: 'เข้าสู่ระบบด้วยรหัสผ่าน' },
  'signin.kr77q4': { lo: 'ລືມລະຫັດຜ່ານບໍ?', en: 'Forgot password?', th: 'ลืมรหัสผ่าน?' },
  'signin.15mff2r': { lo: '📱 ເຂົ້າລະບົບ ດ້ວຍ OTP', en: '📱 Sign in with OTP', th: '📱 เข้าสู่ระบบด้วย OTP' },
  'signin.1k6e20t': { lo: '📝 ລົງທະບຽນ', en: '📝 Register', th: '📝 ลงทะเบียน' },
  'signin.hlyhad': { lo: '⁎ ລົງທະບຽນ ດ້ວຍ ເບີໂທ + OTP ແມ່ນ ບໍ່ ໄດ້ ຕັ້ງ ລະຫັດຜ່ານ', en: '⁎ Register with phone + OTP sets no password', th: '⁎ ลงทะเบียนด้วยเบอร์ + OTP ไม่ได้ตั้งรหัสผ่าน' },
  'signin.1ikr77i': { lo: '⁎ ເຂົ້າ ດ້ວຍ OTP ລະຫັດ ໃຊ້ ໄດ້ ຄັ້ງ ດຽວ ຕ້ອງ ຂໍ ທຸກ ຄັ້ງ', en: '⁎ OTP code is one-time; request it each time', th: '⁎ รหัส OTP ใช้ครั้งเดียว ต้องขอทุกครั้ง' },
  'signin.1kxfoh2': { lo: 'ໃສ່ ລະຫັດ OTP 6 ໂຕ ທີ່ ສົ່ງ ໄປ', en: 'Enter the 6-digit OTP sent to', th: 'ใส่รหัส OTP 6 หลักที่ส่งไป' },
  'signin.1qfddj0': { lo: 'ກຳລັງ ກວດ...', en: 'Checking...', th: 'กำลังตรวจ...' },
  'signin.gsgcwz': { lo: 'ຢືນຢັນ', en: 'Confirm', th: 'ยืนยัน' },
  'signin.cdfu2w': { lo: '← ປ່ຽນ ເບີ / ຂໍ ລະຫັດ ໃໝ່', en: '← Change number / resend code', th: '← เปลี่ยนเบอร์ / ขอรหัสใหม่' },
};

const LANG_KEY = 'hs_lang';

function readLang(): Lang {
  if (Platform.OS !== 'web') return 'lo';
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'lo' || v === 'en' || v === 'th') return v;
  } catch {
    /* ignore */
  }
  return 'lo';
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
  catalog: Record<string, TEntry>;
}

const I18nContext = createContext<I18nValue>({
  lang: 'lo',
  setLang: () => {},
  t: (k, f) => f ?? DEFAULTS[k]?.lo ?? k,
  catalog: DEFAULTS,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang());
  const [overrides, setOverrides] = useState<Record<string, TEntry>>({});

  // live admin overrides from Firestore
  useEffect(() => {
    return onSnapshot(
      collection(db, 'translations'),
      (snap) => {
        const o: Record<string, TEntry> = {};
        snap.docs.forEach((d) => {
          const x: any = d.data();
          o[d.id] = { lo: x.lo ?? '', en: x.en, th: x.th };
        });
        setOverrides(o);
      },
      (e) => { console.error('translations:', e); setOverrides({}); },
    );
  }, []);

  const catalog = useMemo(() => {
    const merged: Record<string, TEntry> = { ...DEFAULTS };
    for (const [k, v] of Object.entries(overrides)) {
      merged[k] = { ...merged[k], ...v, lo: v.lo || merged[k]?.lo || '' };
    }
    return merged;
  }, [overrides]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (Platform.OS === 'web') {
      try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
    }
  };

  const t = useMemo(() => {
    return (key: string, fallback?: string): string => {
      const e = catalog[key];
      if (!e) return fallback ?? key;
      return (e[lang] && e[lang]!.trim()) || e.lo || fallback || key;
    };
  }, [catalog, lang]);

  // Keep the module-level snapshot fresh so ttStatic() (non-hook) translates
  // with the current language/catalog. Assigned during render so children that
  // call ttStatic see up-to-date values on the same pass (incl. after a lang switch).
  liveLang = lang;
  liveCatalog = catalog;

  const value = useMemo(() => ({ lang, setLang, t, catalog }), [lang, t, catalog]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext).t;
}

// ===================== RUNTIME STRING REGISTRY =====================
// Strings wrapped with useTT()(page, lo) auto-register here the moment they
// render, so the admin Translations panel can list + override every hardcoded
// string WITHOUT a dev pre-defining a key. The Lao source is the fallback; a DB
// override (translations/{key}) wins. Migrating a screen = wrapping its strings.
export interface RegEntry { page: string; lo: string; }
const registry = new Map<string, RegEntry>();
const regListeners = new Set<() => void>();

function slug(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export function ttKey(page: string, lo: string): string { return `${page}.${slug(lo)}`; }
export function getRegistry(): Map<string, RegEntry> { return registry; }
export function onRegistry(fn: () => void): () => void { regListeners.add(fn); return () => { regListeners.delete(fn); }; }

/**
 * Bulk-register known source strings (e.g. a statically-extracted seed) so the
 * admin Translations panel lists them ALL immediately — even strings behind rare
 * UI branches that would otherwise not register until that exact screen renders.
 * Idempotent; never overwrites a string already seen at runtime.
 */
export function registerStrings(entries: { page: string; lo: string }[]): void {
  let added = false;
  for (const e of entries) {
    const key = ttKey(e.page, e.lo);
    if (!registry.has(key)) { registry.set(key, { page: e.page, lo: e.lo }); added = true; }
  }
  if (added) scheduleNotify();
}

let notifyScheduled = false;
function scheduleNotify() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  setTimeout(() => { notifyScheduled = false; regListeners.forEach((f) => f()); }, 0);
}

/**
 * Page-scoped translate for hardcoded UI strings. Registers the source string so
 * the admin can edit it. Returns the override for the current language, else the
 * corrected Lao override, else the Lao source text.
 */
export function useTT() {
  const { catalog, lang } = useContext(I18nContext);
  return (page: string, lo: string): string => {
    const key = ttKey(page, lo);
    if (!registry.has(key)) { registry.set(key, { page, lo }); scheduleNotify(); }
    const e = catalog[key];
    if (e) return (e[lang] && e[lang]!.trim()) || (e.lo && e.lo.trim()) || lo;
    return lo;
  };
}

// Module-level snapshot of the live catalog + language, kept current by
// I18nProvider. Lets NON-hook code (module-scope helper functions and label
// maps defined outside components) translate via ttStatic().
let liveLang: Lang = 'lo';
let liveCatalog: Record<string, TEntry> = DEFAULTS;

/**
 * Non-hook variant of useTT() for module-scope helpers/maps that cannot call a
 * React hook (e.g. `const money = (n) => `${n} ${ttStatic('common','ກີບ')}``).
 * Registers the source string like useTT so the admin panel lists it, and
 * returns the current-language override, else the corrected Lao, else the source.
 * Components that render ttStatic output re-run it on language change because
 * they subscribe to the I18n context for their own useTT() calls.
 */
export function ttStatic(page: string, lo: string): string {
  const key = ttKey(page, lo);
  if (!registry.has(key)) { registry.set(key, { page, lo }); scheduleNotify(); }
  const e = liveCatalog[key];
  if (e) return (e[liveLang] && e[liveLang]!.trim()) || (e.lo && e.lo.trim()) || lo;
  return lo;
}

export function useLang() {
  const { lang, setLang } = useContext(I18nContext);
  return { lang, setLang, langs: LANGS };
}

export function useCatalog() {
  return useContext(I18nContext).catalog;
}
