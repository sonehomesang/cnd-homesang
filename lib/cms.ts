import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface CmsLink {
  label: string;
  url: string; // internal route (/legal/terms) or external (https://…)
}

export interface CmsPartner {
  name: string;
  logoUrl: string;
  url?: string; // optional link when tapped
}

export interface CmsContent {
  footerNote: string;
  footerLinks: CmsLink[];
  partners: CmsPartner[];
}

export const DEFAULT_CMS: CmsContent = {
  footerNote: '© 2026 HomeSang',
  footerLinks: [
    { label: 'ຂໍ້ກຳນົດ', url: '/legal/terms' },
    { label: 'ຄວາມເປັນສ່ວນຕົວ', url: '/legal/privacy' },
  ],
  partners: [],
};

const REF = () => doc(db, 'settings', 'cms');

function merge(data: any): CmsContent {
  return {
    footerNote: data?.footerNote ?? DEFAULT_CMS.footerNote,
    footerLinks: Array.isArray(data?.footerLinks) && data.footerLinks.length
      ? data.footerLinks
      : DEFAULT_CMS.footerLinks,
    partners: Array.isArray(data?.partners) ? data.partners : [],
  };
}

export function watchCms(cb: (c: CmsContent) => void) {
  return onSnapshot(
    REF(),
    (snap) => cb(merge(snap.exists() ? snap.data() : {})),
    (e) => { console.error('watchCms:', e); cb(DEFAULT_CMS); },
  );
}

export async function saveCms(content: CmsContent) {
  await setDoc(REF(), { ...content, updatedAt: Date.now() }, { merge: true });
}
