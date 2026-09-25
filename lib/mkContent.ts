import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { stampMock } from './mock';

/**
 * MK Plan · Content calendar — the `mkContent` collection. A marketing post as it
 * moves from idea → script → AI-generated → review → scheduled → published, across
 * FB / TikTok. Gated to the 'marketing' role (see firestore.rules isMarketing()).
 */
export type MkPlatform = 'fb' | 'tiktok' | 'both';
export type MkFormat = 'reel' | 'photo' | 'text' | 'story';
export type MkStatus = 'idea' | 'script' | 'ai' | 'review' | 'scheduled' | 'published';

export interface MkContent {
  id: string;
  title: string;
  platform: MkPlatform;
  format: MkFormat;
  pillar?: string;      // content pillar (see MK_PILLARS)
  date: number;         // target / scheduled date (ms)
  status: MkStatus;
  caption?: string;
  assignee?: string;
  reach?: number;       // manual metric once published
  createdAt: number;
  updatedAt?: number;
  __mock?: boolean;
}

export const MK_PLATFORM_LABEL: Record<MkPlatform, string> = { fb: 'FB', tiktok: 'TikTok', both: 'FB + TikTok' };
export const MK_FORMAT_LABEL: Record<MkFormat, string> = { reel: 'Reel/ວີດີໂອ', photo: 'ຮູບ', text: 'ຂໍ້ຄວາມ', story: 'Story' };
export const MK_STATUS_LABEL: Record<MkStatus, string> = {
  idea: 'ໄອເດຍ', script: 'ຂຽນ script', ai: 'AI ສ້າງ', review: 'ກວດ', scheduled: 'ຄິວ', published: 'ເຜີຍແຜ່',
};
export const MK_STATUS_ORDER: MkStatus[] = ['idea', 'script', 'ai', 'review', 'scheduled', 'published'];
export const MK_PILLARS = ['ກ່ອນ-ຫຼັງ', 'ຊ່າງ ເດັ່ນ', 'ຮີວິວ', 'ຄວາມ ຮູ້', 'ລາຄາ', 'ຄວາມ ເຊື່ອ ໃຈ', 'ສິນຄ້າ', 'ໂປຣ/referral'];

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): MkContent {
  return {
    id, title: d.title ?? '', platform: d.platform ?? 'fb', format: d.format ?? 'reel',
    pillar: d.pillar, date: ms(d.date), status: d.status ?? 'idea', caption: d.caption,
    assignee: d.assignee, reach: d.reach, createdAt: ms(d.createdAt), updatedAt: d.updatedAt ? ms(d.updatedAt) : undefined, __mock: !!d.__mock,
  };
}
function strip<T extends Record<string, any>>(o: T): Partial<T> {
  const out: any = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v; return out;
}

export function watchMkContent(cb: (list: MkContent[]) => void) {
  return onSnapshot(query(collection(db, 'mkContent')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => a.date - b.date)),
    (e) => { console.error('watchMkContent:', e); cb([]); });
}

export type MkContentInput = Omit<MkContent, 'id' | 'createdAt' | 'updatedAt'>;

export async function createMkContent(input: MkContentInput) {
  await addDoc(collection(db, 'mkContent'), strip({ ...input, createdAt: serverTimestamp() }));
}
export async function updateMkContent(id: string, patch: Partial<MkContentInput>) {
  await updateDoc(doc(db, 'mkContent', id), strip({ ...patch, updatedAt: serverTimestamp() }) as any);
}
export async function setMkStatus(id: string, status: MkStatus) {
  await updateDoc(doc(db, 'mkContent', id), { status, updatedAt: serverTimestamp() });
}
export async function deleteMkContent(id: string) {
  await deleteDoc(doc(db, 'mkContent', id));
}

/** Seed the approved 30-day content plan (idempotent-ish: skips if items exist). */
export async function seedMkContentSample(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const base = new Date(); base.setDate(1); const y = base.getFullYear(), mo = base.getMonth();
  const D = (day: number) => new Date(y, mo, day).getTime();
  const items: MkContentInput[] = [
    { title: '"ໂຮມຊ່າງ ຄື ຫຍັງ?" ແນະນຳ 30ວິ', platform: 'both', format: 'reel', pillar: 'ຄວາມ ເຊື່ອ ໃຈ', date: D(1), status: 'published' },
    { title: 'ປ້າຍ "ຊ່າງ ຢືນຢັນ" ໝາຍ ຄວາມ ວ່າ', platform: 'fb', format: 'photo', pillar: 'ຄວາມ ເຊື່ອ ໃຈ', date: D(2), status: 'published' },
    { title: 'escrow — ຈ່າຍ ຢ່າງ ໃດ ໃຫ້ ປອດໄພ', platform: 'tiktok', format: 'reel', pillar: 'ຄວາມ ເຊື່ອ ໃຈ', date: D(3), status: 'published' },
    { title: 'ໂພສ ງານ ຟຣີ ເດືອນ ນີ້', platform: 'fb', format: 'text', pillar: 'ໂປຣ/referral', date: D(4), status: 'scheduled' },
    { title: '3 ຂັ້ນຕອນ ຫາ ຊ່າງ', platform: 'fb', format: 'reel', pillar: 'ຄວາມ ຮູ້', date: D(5), status: 'ai' },
    { title: 'ກ່ອນ-ຫຼັງ ລ້າງ ແອ', platform: 'both', format: 'reel', pillar: 'ກ່ອນ-ຫຼັງ', date: D(8), status: 'review' },
    { title: 'ຊ່າງ ເດັ່ນ ປະຈຳ ອາທິດ', platform: 'fb', format: 'photo', pillar: 'ຊ່າງ ເດັ່ນ', date: D(9), status: 'script' },
    { title: 'ຮີວິວ ຈິງ ຈາກ ລູກຄ້າ', platform: 'fb', format: 'photo', pillar: 'ຮີວິວ', date: D(10), status: 'idea' },
    { title: 'ກ່ອນ-ຫຼັງ ງານ ໄຟຟ້າ', platform: 'tiktok', format: 'reel', pillar: 'ກ່ອນ-ຫຼັງ', date: D(11), status: 'idea' },
    { title: 'ວຽກ ດ່ວນ? ຫາ ຊ່າງ ໄດ້ ທັນທີ', platform: 'fb', format: 'reel', pillar: 'ຄວາມ ຮູ້', date: D(12), status: 'idea' },
    { title: 'ວິທີ ເລືອກ ຊ່າງໄຟ ບໍ່ ໃຫ້ ຖືກ ໂກງ', platform: 'both', format: 'reel', pillar: 'ຄວາມ ຮູ້', date: D(15), status: 'idea' },
    { title: 'ຄ່າ ລ້າງ ແອ ໂດຍ ປຣະມານ', platform: 'fb', format: 'photo', pillar: 'ລາຄາ', date: D(16), status: 'idea' },
    { title: 'ສັນຢານ ໄຟ ຮົ່ວ ຕ້ອງ ລະວັງ', platform: 'tiktok', format: 'reel', pillar: 'ຄວາມ ຮູ້', date: D(17), status: 'idea' },
    { title: 'ຮັບປະກັນ + ເອກະສານ ສົ່ງ ມອບ', platform: 'fb', format: 'reel', pillar: 'ຄວາມ ເຊື່ອ ໃຈ', date: D(18), status: 'idea' },
    { title: 'ແນະນຳ ເພື່ອນ ໄດ້ ລາງວັນ', platform: 'both', format: 'reel', pillar: 'ໂປຣ/referral', date: D(22), status: 'idea' },
    { title: 'ຜ່ອນ ສິນຄ້າ 0% ໄດ້ ແລ້ວ (BNPL)', platform: 'tiktok', format: 'reel', pillar: 'ສິນຄ້າ', date: D(24), status: 'idea' },
    { title: 'ສະຫຼຸບ ເດືອນ + ໂຫຼດ ແອັບ', platform: 'fb', format: 'reel', pillar: 'ໂປຣ/referral', date: D(26), status: 'idea' },
  ];
  const batch = writeBatch(db);
  for (const it of items) batch.set(doc(collection(db, 'mkContent')), strip(stampMock({ ...it, createdAt: serverTimestamp() })));
  await batch.commit();
  return items.length;
}

/** The planned 30-day posting calendar (REAL content, not mock) — 22 posts
 *  starting today, status 'idea' so the team advances each through the pipeline.
 *  Deduped by title. Mirrors the Content Calendar artifact. */
export async function seedMkContentCalendar(existingTitles: string[]): Promise<number> {
  const t = new Date(); t.setHours(9, 0, 0, 0);
  const DAY = 86400000;
  const at = (off: number) => t.getTime() + off * DAY;
  const rows: [number, MkPlatform, MkFormat, string, string][] = [
    [0, 'fb', 'reel', 'ຄວາມ ເຊື່ອ ໃຈ', '★ ບ້ານ ໃຜ ກໍ່ ເປັນ (Anchor)'],
    [1, 'tiktok', 'reel', 'ຄວາມ ຮູ້', '3 ຂັ້ນຕອນ ຫາ ຊ່າງ ໃນ ແອັບ'],
    [3, 'tiktok', 'reel', 'ໂຄສະນາ', 'ໂຄສະນາ 1 · ປລັກ ໄຟ ມີ ຄວັນ'],
    [4, 'fb', 'reel', 'ຄວາມ ເຊື່ອ ໃຈ', 'ປ້າຍ "ຊ່າງ ຢືນຢັນ" ໝາຍ ຄວາມ ວ່າ?'],
    [5, 'both', 'reel', 'ຮັບສະໝັກ', 'ຮັບ ສະໝັກ ຊ່າງ — ຫາ ລູກຄ້າ ຟຣີ'],
    [7, 'fb', 'reel', 'ໂຄສະນາ', 'ໂຄສະນາ 2 · ຊັກໂຄຣກ ຕັນ'],
    [8, 'tiktok', 'reel', 'ຄວາມ ຮູ້', 'ເລືອກ ຊ່າງໄຟ ບໍ່ ໃຫ້ ຖືກ ໂກງ'],
    [10, 'both', 'reel', 'ກ່ອນ-ຫຼັງ', 'ກ່ອນ-ຫຼັງ · ລ້າງ ແອ'],
    [11, 'tiktok', 'reel', 'ໂຄສະນາ', 'ໂຄສະນາ 4 · ບໍ່ ມີ ເວລາ ຫາ ຊ່າງ'],
    [12, 'fb', 'photo', 'ຮີວິວ', 'ຮີວິວ ຈິງ ຈາກ ລູກຄ້າ'],
    [14, 'fb', 'reel', 'ໂຄສະນາ', 'ໂຄສະນາ 3 · ຫຼັງຄາ ຮົ່ວ (ໂຍງ ໂຮມມາທ)'],
    [15, 'tiktok', 'reel', 'ຄວາມ ຮູ້', 'ສັນຢານ ໄຟ ຮົ່ວ ຕ້ອງ ລະວັງ'],
    [17, 'fb', 'photo', 'ຊ່າງ ເດັ່ນ', 'ຊ່າງ ເດັ່ນ ປະຈຳ ອາທິດ'],
    [18, 'fb', 'reel', 'ໂຄສະນາ', 'ໂຄສະນາ 5 · ຍ້າຍ ເຂົ້າ ບ້ານ ໃໝ່'],
    [19, 'both', 'reel', 'ຮັບສະໝັກ', 'ຮ້ານ ວັດສະດຸ ຂາຍ ອອນລາຍ'],
    [21, 'both', 'reel', 'ໂຄສະນາ', 'ໂຄສະນາ 6 · ຄຸມ ຫຼາຍ ຫ້ອງ (B2B)'],
    [22, 'fb', 'reel', 'ຄວາມ ຮູ້', 'escrow — ຈ່າຍ ຢ່າງ ໃດ ໃຫ້ ປອດໄພ'],
    [24, 'both', 'reel', 'ກ່ອນ-ຫຼັງ', 'ກ່ອນ-ຫຼັງ · ປະປາ / ທາສີ'],
    [25, 'tiktok', 'reel', 'ໂປຣ/referral', 'ໂພສ ຟຣີ ເດືອນ ນີ້ · 3 ຂັ້ນຕອນ'],
    [26, 'both', 'reel', 'ຮັບສະໝັກ', 'ນາຍໜ້າ ຮັບ ຄອມມິຊຊັ່ນ'],
    [28, 'both', 'reel', 'ໂປຣ/referral', 'Boost ຄລິບ ດີ ສຸດ + ຮີວິວ ລວມ'],
    [29, 'both', 'reel', 'ຄວາມ ຮູ້', 'ສະຫຼຸບ ເດືອນ + CTA ໂຫຼດ ແອັບ'],
  ];
  const have = new Set(existingTitles);
  const items: MkContentInput[] = rows
    .filter((r) => !have.has(r[4]))
    .map(([off, platform, format, pillar, title]) => ({ title, platform, format, pillar, date: at(off), status: 'idea' as MkStatus }));
  if (items.length === 0) return 0;
  const batch = writeBatch(db);
  for (const it of items) batch.set(doc(collection(db, 'mkContent')), strip({ ...it, createdAt: serverTimestamp() }));
  await batch.commit();
  return items.length;
}
