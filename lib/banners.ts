import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export interface Banner {
  id: string;
  title?: string;
  subtitle?: string;
  image: string;
  link?: string;
  order?: number;
  active: boolean;
  startDate?: number;
  endDate?: number;
  createdAt: number;
}

function strip(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}
function toMillis(v: any): number {
  return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0;
}
function mapBanner(id: string, data: any): Banner {
  return { id, ...data, createdAt: toMillis(data.createdAt) } as Banner;
}

/** Active banners within their date window, ordered. */
export function watchActiveBanners(cb: (b: Banner[]) => void) {
  return onSnapshot(
    collection(db, 'banners'),
    (snap) => {
      const now = Date.now();
      const list = snap.docs
        .map((d) => mapBanner(d.id, d.data()))
        .filter((b) => b.active !== false && !!b.image)
        .filter((b) => (!b.startDate || now >= b.startDate) && (!b.endDate || now <= b.endDate));
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchActiveBanners:', e); cb([]); },
  );
}

export function watchAllBanners(cb: (b: Banner[]) => void) {
  return onSnapshot(
    collection(db, 'banners'),
    (snap) => {
      const list = snap.docs.map((d) => mapBanner(d.id, d.data()));
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchAllBanners:', e); cb([]); },
  );
}

export async function createBanner(input: Omit<Banner, 'id' | 'createdAt'>) {
  await addDoc(collection(db, 'banners'), strip({ ...input, createdAt: serverTimestamp() }));
}
export async function updateBanner(id: string, patch: Partial<Banner>) {
  await updateDoc(doc(db, 'banners', id), strip(patch as Record<string, unknown>));
}
export async function deleteBanner(id: string) {
  await deleteDoc(doc(db, 'banners', id));
}

const DEMO = [
  { title: '🎉 ໂພສງານ ຟຣີ!', subtitle: 'ເດືອນນີ້ ໂພສງານ ບໍ່ເສຍຄ່າ — ຫາຊ່າງ ໃກ້ຕົວ ໄດ້ທັນທີ', seed: 'promo-freepost', link: '/post-job', order: 1 },
  { title: '🛒 ຫຼຸດ ສູງສຸດ 20%', subtitle: 'ວັດສະດຸ ກໍ່ສ້າງ ສົ່ງເຖິງບ້ານ', seed: 'promo-sale', link: '/(tabs)/shop', order: 2 },
  { title: '🎁 ແນະນຳເພື່ອນ ຮັບເຄຣດິດ', subtitle: 'ຊວນເພື່ອນ ມາໃຊ້ HomeSang ຮັບລາງວັນ', seed: 'promo-referral', link: '/referral', order: 3 },
];

/** Seed demo banners when empty (admin only). */
export async function seedBannersIfEmpty(): Promise<number> {
  const snap = await getDocs(collection(db, 'banners'));
  if (!snap.empty) return 0;
  for (const d of DEMO) {
    await addDoc(
      collection(db, 'banners'),
      strip({
        title: d.title,
        subtitle: d.subtitle,
        image: `https://picsum.photos/seed/hs-${d.seed}/900/360`,
        link: d.link,
        order: d.order,
        active: true,
        createdAt: serverTimestamp(),
      }),
    );
  }
  return DEMO.length;
}
