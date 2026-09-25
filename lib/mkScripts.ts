import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { stampMock } from './mock';
import type { MkPlatform } from './mkContent';

/**
 * MK Plan · AI video scripts — the `mkScripts` collection. Each is a shootable
 * script (scene breakdown) PLUS an AI Prompt the team pastes into an AI video
 * generator. Gated to the marketing role (firestore.rules isMarketing()).
 */
export type MkScriptStatus = 'draft' | 'ready' | 'generated';
export interface MkScene { label: string; desc: string }
export interface MkScript {
  id: string;
  title: string;
  platform: MkPlatform;
  durationSec: number;
  hook?: string;
  scenes: MkScene[];
  aiPrompt: string;
  status: MkScriptStatus;
  contentId?: string; // optional link to a mkContent item
  createdAt: number;
  updatedAt?: number;
  __mock?: boolean;
}

export const MK_SCRIPT_STATUS_LABEL: Record<MkScriptStatus, string> = { draft: 'ຮ່າງ', ready: 'ພ້ອມ', generated: 'AI ສ້າງ ແລ້ວ' };
export const MK_SCRIPT_STATUS_ORDER: MkScriptStatus[] = ['draft', 'ready', 'generated'];

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): MkScript {
  return {
    id, title: d.title ?? '', platform: d.platform ?? 'fb', durationSec: Number(d.durationSec) || 30,
    hook: d.hook, scenes: Array.isArray(d.scenes) ? d.scenes : [], aiPrompt: d.aiPrompt ?? '',
    status: d.status ?? 'draft', contentId: d.contentId, createdAt: ms(d.createdAt), updatedAt: d.updatedAt ? ms(d.updatedAt) : undefined, __mock: !!d.__mock,
  };
}
function strip<T extends Record<string, any>>(o: T): Partial<T> {
  const out: any = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v; return out;
}

export function watchMkScripts(cb: (list: MkScript[]) => void) {
  return onSnapshot(query(collection(db, 'mkScripts')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchMkScripts:', e); cb([]); });
}

export type MkScriptInput = Omit<MkScript, 'id' | 'createdAt' | 'updatedAt'>;
export async function createMkScript(input: MkScriptInput) {
  await addDoc(collection(db, 'mkScripts'), strip({ ...input, createdAt: serverTimestamp() }));
}
export async function updateMkScript(id: string, patch: Partial<MkScriptInput>) {
  await updateDoc(doc(db, 'mkScripts', id), strip({ ...patch, updatedAt: serverTimestamp() }) as any);
}
export async function deleteMkScript(id: string) { await deleteDoc(doc(db, 'mkScripts', id)); }

export async function seedMkScriptsSample(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const items: MkScriptInput[] = [
    {
      title: 'ກ່ອນ-ຫຼັງ ລ້າງ ແອ', platform: 'both', durationSec: 30, status: 'ready',
      hook: 'ແອ ບໍ່ ເຢັນ? ຢ່າ ຟ້າວ ຊື້ ໃໝ່!',
      scenes: [
        { label: '0-5 ວິ', desc: 'ໃກ້ໆ ຝຸ່ນ ໜາ ໃນ ແອ + text "ແອ ບໍ່ ເຢັນ?"' },
        { label: '5-20 ວິ', desc: 'ຊ່າງ ລ້າງ ຂັ້ນຕອນ (timelapse)' },
        { label: '20-30 ວິ', desc: 'ແອ ສະອາດ + ເຢັນ + CTA "ຫາ ຊ່າງແອ ໃນ ໂຮມຊ່າງ"' },
      ],
      aiPrompt: 'Create a 30-sec vertical before/after video: dirty aircon filter closeup → technician cleaning (timelapse) → clean cool aircon. Lao captions, upbeat music, HomeSang blue/orange branding, CTA end card "homesang.pro".',
    },
    {
      title: 'ວິທີ ເລືອກ ຊ່າງໄຟ ບໍ່ ໃຫ້ ຖືກ ໂກງ', platform: 'fb', durationSec: 40, status: 'draft',
      hook: 'ຈ້າງ ຊ່າງໄຟ ຢ່າ ຟ້າວ! ✋ ກວດ 5 ຢ່າງ ນີ້ ກ່ອນ',
      scenes: [
        { label: 'Hook', desc: '"ຈ້າງ ຊ່າງໄຟ ຢ່າ ຟ້າວ! ກວດ 5 ຢ່າງ"' },
        { label: 'ເນື້ອຫາ', desc: '5 ຈຸດ: ປ້າຍ ຢືນຢັນ · ຮີວິວ · ໃບ ສະເໜີ · ຮັບປະກັນ · escrow' },
        { label: 'ປິດ', desc: '"ໂຮມຊ່າງ ມີ ໃຫ້ ໝົດ — ໂພສ ຟຣີ"' },
      ],
      aiPrompt: 'Talking-head explainer, 40s vertical, 5 quick tips with on-screen Lao text overlays + icons, calm trustworthy tone, HomeSang branding, end CTA card "homesang.pro".',
    },
  ];
  const batch = writeBatch(db);
  for (const it of items) batch.set(doc(collection(db, 'mkScripts')), strip(stampMock({ ...it, createdAt: serverTimestamp() })));
  await batch.commit();
  return items.length;
}

/** Ready-to-use ad scripts (REAL content, NOT mock) — inserted once, deduped by
 *  title so a second click won't duplicate. These are production-ready TikTok/FB
 *  ad scripts for HomeSang; the team edits/uses them directly. */
export async function seedMkAdScripts(existingTitles: string[]): Promise<number> {
  const items: MkScriptInput[] = [
    {
      title: 'ໄຟ ດັບ ກາງ ຄືນ ຫາ ຊ່າງ ບໍ່ ໄດ້?', platform: 'both', durationSec: 25, status: 'ready',
      hook: 'ໄຟ ດັບ 3 ທຸ່ມ... ໂທ ຫາ ຊ່າງ ຄົນ ໃດ ດີ? 😰',
      scenes: [
        { label: '0-3 ວິ', desc: 'ຄົນ ຖື ໄຟ ສາຍ ຢູ່ ໃນ ຄວາມ ມືດ ໜ້າ ກັງວົນ · text "ໄຟ ດັບ ກາງ ຄືນ?"' },
        { label: '3-15 ວິ', desc: 'ເປີດ ແອັບ ໂຮມຊ່າງ → ໂພສ "ໄຟ ຮົ່ວ ດ່ວນ" → ຊ່າງ ໃກ້ ຕົວ ຕອບ ທັນທີ · text "ໂພສ ດ່ວນ → ຊ່າງ ໃກ້ ຕົວ ຮັບ ທັນທີ"' },
        { label: '15-25 ວິ', desc: 'ຊ່າງ ມາ ຮອດ ໄຟ ຕິດ ຄອບຄົວ ຍິ້ມ · CTA "ໂຮມຊ່າງ — ຫາ ຊ່າງ ໄດ້ 24 ຊົ່ວໂມງ · homesang.pro"' },
      ],
      aiPrompt: "Vertical 9:16 video, 25s. A worried person in a dark house at night holding a phone flashlight → opens a clean mobile app, taps 'urgent electrician', a nearby technician replies instantly → technician arrives, lights turn on, happy family. Warm cinematic lighting, Lao on-screen captions, subtle tension→relief music, HomeSang blue (#0066CC) + orange (#F47B20) branding, end card 'homesang.pro'.",
    },
    {
      title: 'ກ່ອນ-ຫຼັງ: ຫ້ອງ ນ້ຳ ຮົ່ວ', platform: 'both', durationSec: 30, status: 'ready',
      hook: 'ທໍ່ ຮົ່ວ ແບບ ນີ້... ຢ່າ ຟ້າວ ທຸບ ກະເບື້ອງ! ✋',
      scenes: [
        { label: '0-5 ວິ', desc: 'ໃກ້ໆ ນ້ຳ ຮົ່ວ ຊຶມ ຝາ ຮອຍ ດ່າງ · text "ນ້ຳ ຮົ່ວ · ຝາ ຂຶ້ນ ຣາ"' },
        { label: '5-22 ວິ', desc: 'ຊ່າງ ປະປາ ກວດ → ຊ່ອມ (timelapse) · text "ຊ່າງ ປະປາ ຢືນຢັນ · ມີ ຮັບປະກັນ"' },
        { label: '22-30 ວິ', desc: 'ຫ້ອງ ນ້ຳ ແຫ້ງ ສະອາດ · CTA "ໂພສ ງານ ຟຣີ — ຊ່າງ ສະເໜີ ລາຄາ ໃຫ້ ເລືອກ · homesang.pro"' },
      ],
      aiPrompt: "Vertical 9:16, 30s before/after. Closeup of water-stained wall & leaking pipe → a professional plumber inspects and repairs (timelapse) → clean dry bathroom. Documentary style, Lao captions, upbeat music, 'verified' trust badges, HomeSang branding, CTA end card 'homesang.pro'.",
    },
    {
      title: 'ຈ້າງ ຊ່າງ ຜ່ານ ເນັດ ຢ້ານ ຖືກ ໂກງ?', platform: 'fb', durationSec: 35, status: 'ready',
      hook: 'ຈ່າຍ ເງິນ ກ່ອນ... ແລ້ວ ຊ່າງ ຫາຍ ໄປ? 😤 ບໍ່ ຕ້ອງ ຢ້ານ ອີກ.',
      scenes: [
        { label: '0-3 ວິ', desc: 'ໜ້າ ຈໍ ໂອນ ເງິນ + ເຄຣື່ອງຫມາຢ ຄຳ ຖາມ · text "ຈ່າຍ ກ່ອນ = ສ່ຽງ?"' },
        { label: '3-25 ວິ', desc: 'ອະທິບາຢ escrow: ເງິນ ຄ້າງ ໄວ້ → ວຽກ ສຳ ເລັດ ຄ່ອຍ ປ່ອຍ ໃຫ້ ຊ່າງ · text "ເງິນ ຄ້າງ ໃນ ລະບົບ · ວຽກ ຈົບ ຄ່ອຍ ຈ່າຍ"' },
        { label: '25-35 ວິ', desc: 'ລູກຄ້າ + ຊ່າງ ຈັບ ມື ດາວ 5 ດວງ · CTA "ຈ່າຍ ຜ່ານ QR ປອດໄພ — ໂຮມຊ່າງ · homesang.pro"' },
      ],
      aiPrompt: "Vertical 9:16, 35s explainer. A person hesitant to pay upfront (question marks) → animated diagram: money held safely in escrow, released to the technician only after job completion → happy customer and technician, 5-star rating. Clean flat-motion-graphic style, Lao captions, reassuring music, HomeSang branding, QR + 'homesang.pro' end card.",
    },
    {
      title: 'ໂພສ ງານ ຟຣີ 3 ຂັ້ນ ຕອນ', platform: 'tiktok', durationSec: 20, status: 'ready',
      hook: 'ຫາ ຊ່າງ ໃນ 3 ຂັ້ນ ຕອນ — ຟຣີ! 👇',
      scenes: [
        { label: '0-2 ວິ', desc: 'Hook + ໂຊ ໜ້າ ແອັບ · text "ຫາ ຊ່າງ ໃນ 3 ຂັ້ນ ຕອນ — ຟຣີ!"' },
        { label: '2-16 ວິ', desc: 'screen-record 3 ຈັງຫວະ ໄວໆ: "1. ໂພສ ວຽກ + ຮູບ" → "2. ຊ່າງ ໃກ້ ຕົວ ສະເໜີ ລາຄາ" → "3. ເລືອກ + ຈ້າງ"' },
        { label: '16-20 ວິ', desc: 'CTA "ເດືອນ ນີ້ ໂພສ ຟຣີ! ໂຫຼດ ເລີຍ · homesang.pro"' },
      ],
      aiPrompt: "Vertical 9:16, 20s fast-paced screen-recording style. Three quick app steps with big Lao number overlays (1 post job + photo, 2 nearby technicians send quotes, 3 pick & hire). Energetic TikTok-style transitions, trending-style beat, HomeSang branding, bold 'FREE this month' end card 'homesang.pro'.",
    },
  ];
  const have = new Set(existingTitles);
  const toAdd = items.filter((i) => !have.has(i.title));
  if (toAdd.length === 0) return 0;
  const batch = writeBatch(db);
  for (const it of toAdd) batch.set(doc(collection(db, 'mkScripts')), strip({ ...it, createdAt: serverTimestamp() }));
  await batch.commit();
  return toAdd.length;
}

/** Supply-side recruitment ad scripts — bring technicians / shops / brokers onto
 *  HomeSang. Bounhome invites them. REAL content, deduped by title. */
export async function seedMkRecruitScripts(existingTitles: string[]): Promise<number> {
  const B = "Bounhome: a warm, trustworthy Lao man, 35-50, neat short hair, friendly confident smile, wearing a clean HomeSang polo shirt (blue #0066CC with orange trim) and a tidy tool belt";
  const items: MkScriptInput[] = [
    {
      title: 'ຮັບ ສະໝັກ ຊ່າງ — ຫາ ລູກຄ້າ ຟຣີ', platform: 'both', durationSec: 25, status: 'ready',
      hook: 'ເປັນ ຊ່າງ ແຕ່ ວຽກ ບໍ່ ຕໍ່ ເນື່ອງ? 🔧 ຮັບ ວຽກ ໃກ້ ຕົວ ໄດ້ ຟຣີ',
      scenes: [
        { label: '0-4 ວິ', desc: 'ຊ່າງ ນັ່ງ ຫວ່າງ ລໍ ວຽກ ໜ້າ ເບື່ອ · text "ວຽກ ບໍ່ ຕໍ່ ເນື່ອງ?"' },
        { label: '4-16 ວິ', desc: 'ບຸນໂຮມ ຊວນ "ມາ ຢູ່ ໂຮມຊ່າງ" → ໄດ້ ວຽກ ໃກ້ ຕົວ ຜ່ານ ແອັບ · text "ຮັບ ວຽກ ໃກ້ ຕົວ · ບໍ່ ເສຍ ຄ່າ ສະໝັກ"' },
        { label: '16-25 ວິ', desc: 'ຊ່າງ ໄດ້ ວຽກ ຫຼາຍ ຂຶ້ນ ຍິ້ມ · CTA "ສະໝັກ ເປັນ ຊ່າງ ໂຮມຊ່າງ · homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 25s. A Lao handyman sitting idle waiting for work, looking bored → ${B}, invites him to join HomeSang; he receives nearby jobs through a clean app → busier, earning more, smiling. Encouraging tone, Lao captions, HomeSang branding, end card 'homesang.pro'.`,
    },
    {
      title: 'ປ້າຍ ຢືນຢັນ = ລູກຄ້າ ໄວ້ ໃຈ', platform: 'both', durationSec: 20, status: 'ready',
      hook: 'ຢາກ ໃຫ້ ລູກຄ້າ ໄວ້ ໃຈ ຫຼາຍ ຂຶ້ນ? ✅ ຮັບ ປ້າຍ "ຊ່າງ ຢືນຢັນ"',
      scenes: [
        { label: '0-3 ວິ', desc: 'ລູກຄ້າ ລັງເລ ບໍ່ ກ້າ ຈ້າງ ຊ່າງ ແປລກ ໜ້າ · text "ລູກຄ້າ ບໍ່ ກ້າ ຈ້າງ?"' },
        { label: '3-14 ວິ', desc: 'ຊ່າງ ຮັບ ປ້າຍ "ຢືນຢັນ" ໃນ ໂຮມຊ່າງ (ຢືນຢັນ ຕົວ ຕົນ + ຝີມືອ) → ລູກຄ້າ ໄວ້ ໃຈ ຈ້າງ · text "ປ້າຍ ຢືນຢັນ = ໜ້າ ເຊື່ອຖື"' },
        { label: '14-20 ວິ', desc: 'ບຸນໂຮມ ໂຊ ປ້າຍ ຢືນຢັນ ຢ່າງ ພາກ ພູມ · CTA "ສະໝັກ ຢືນຢັນ ຕົວ ຕົນ · homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 20s. A customer hesitant to hire an unknown technician → the technician earns a 'verified' badge on HomeSang (identity + skill verified) → the customer confidently hires him. ${B}, proudly shows his verified badge. Trust-building tone, Lao captions, HomeSang branding, end card 'homesang.pro'.`,
    },
    {
      title: 'ຮ້ານ ວັດສະດຸ — ຂາຍ ເຖິງ ບ້ານ ລູກຄ້າ', platform: 'both', durationSec: 25, status: 'ready',
      hook: 'ມີ ຮ້ານ ວັດສະດຸ ກໍ່ ສ້າງ? 🏪 ຂາຍ ອອນລາຍ ສົ່ງ ເຖິງ ບ້ານ ໃນ ໂຮມຊ່າງ',
      scenes: [
        { label: '0-4 ວິ', desc: 'ຮ້ານ ວັດສະດຸ ນັ່ງ ລໍ ລູກຄ້າ ຍ່າງ ເຂົ້າ · text "ຂາຍ ໜ້າ ຮ້ານ ຢ່າງ ດຽວ?"' },
        { label: '4-16 ວິ', desc: 'ເອົາ ຮ້ານ ຂຶ້ນ ໂຮມຊ່າງ → ລູກຄ້າ ສັ່ງ ອອນລາຍ → ຈັດ ສົ່ງ ເຖິງ ບ້ານ · text "ຂາຍ ອອນລາຍ · ສົ່ງ ເຖິງ ບ້ານ · ຮັບ ອໍເດີ ຫຼາຍ ຂຶ້ນ"' },
        { label: '16-25 ວິ', desc: 'ຮ້ານ ຂາຍ ໄດ້ ຫຼາຍ ຂຶ້ນ ຍິ້ມ · CTA "ເອົາ ຮ້ານ ຂຶ້ນ ໂຮມຊ່າງ · homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 25s. A Lao hardware/building-materials shop owner waiting for walk-in customers → lists the shop on HomeSang; customers order online and products are delivered to homes → more orders, happy shop owner. Upbeat business tone, Lao captions, HomeSang branding, end card 'homesang.pro'.`,
    },
    {
      title: 'ນາຍໜ້າ — ແນະນຳ ຮັບ ຄ່າ ຄອມມິຊຊັ່ນ', platform: 'tiktok', durationSec: 20, status: 'ready',
      hook: 'ຮູ້ຈັກ ຄົນ ຢາກ ຫາ ຊ່າງ ຫຼື ຊື້ ຂອງ? 🤝 ແນະນຳ ຮັບ ຄ່າ ຄອມມິຊຊັ່ນ',
      scenes: [
        { label: '0-3 ວິ', desc: 'ຄົນ ໜຸ່ມ ຖື ໂທ, ໝູ່ ຖາມ ຫາ ຊ່າງ · text "ຮູ້ຈັກ ຄົນ ຫາ ຊ່າງ?"' },
        { label: '3-14 ວິ', desc: 'ແ ຊຣ໌ ລິ້ງ ໂຮມຊ່າງ (referral code) → ໝູ່ ໃຊ້ ງານ → ໄດ້ ຄ່າ ຄອມມິຊຊັ່ນ · text "ແນະນຳ → ໄດ້ ຄ່າ ຕອບ ແທນ"' },
        { label: '14-20 ວິ', desc: 'ຄົນ ໜຸ່ມ ໄດ້ ລາຍ ໄດ້ ເສີມ ຍິ້ມ · CTA "ເປັນ ນາຍໜ້າ ໂຮມຊ່າງ · homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 20s. A young Lao person whose friends keep asking where to find a technician → shares a HomeSang referral link; friends use it and they earn commission → happy with extra income. Energetic tone, Lao captions, HomeSang branding, end card 'homesang.pro'.`,
    },
    {
      title: 'ຊ່າງ ຮຸ່ນ ໃໝ່ — ເສີມ ລາຍ ໄດ້ ຍືດຫຢຸ່ນ', platform: 'both', durationSec: 25, status: 'ready',
      hook: 'ມີ ຝີມືອ ຢາກ ຫາ ລາຍ ໄດ້ ເສີມ? 💪 ຮັບ ວຽກ ຕອນ ວ່າງ ໃນ ໂຮມຊ່າງ',
      scenes: [
        { label: '0-4 ວິ', desc: 'ໜຸ່ມ ຮຸ່ນ ໃໝ່ ມີ ຝີມືອ ຊ່າງ ແຕ່ ບໍ່ ຮູ້ ຫາ ວຽກ ຈາກ ໃສ · text "ມີ ຝີມືອ ແຕ່ ບໍ່ ມີ ວຽກ?"' },
        { label: '4-16 ວິ', desc: 'ບຸນໂຮມ ຊວນ → ຮັບ ວຽກ ຕອນ ວ່າງ ຜ່ານ ແອັບ (ຍືດຫຢຸ່ນ) · text "ຮັບ ວຽກ ຕອນ ວ່າງ · ເລືອກ ເອງ ໄດ້"' },
        { label: '16-25 ວິ', desc: 'ໄດ້ ລາຍ ໄດ້ ເສີມ, ສ້າງ ຜົນ ງານ · CTA "ສະໝັກ ເປັນ ຊ່າງ · homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 25s. A skilled young Lao person who doesn't know where to find work → ${B}, invites them; they pick up flexible jobs on their own schedule through the app → earning extra income, building a portfolio. Motivating tone, Lao captions, HomeSang branding, end card 'homesang.pro'.`,
    },
  ];
  const have = new Set(existingTitles);
  const toAdd = items.filter((i) => !have.has(i.title));
  if (toAdd.length === 0) return 0;
  const batch = writeBatch(db);
  for (const it of toAdd) batch.set(doc(collection(db, 'mkScripts')), strip({ ...it, createdAt: serverTimestamp() }));
  await batch.commit();
  return toAdd.length;
}

// Signature brand character — pasted into every AI prompt so the same person
// appears across the whole "ບ້ານ ໃຜ ກໍ່ ເປັນ" series.
const BOUNHOME = "Bounhome: a warm, trustworthy Lao man, 35-50, neat short hair, friendly confident smile, wearing a clean HomeSang polo shirt (blue #0066CC with orange trim) and a tidy tool belt — calm, professional, reassuring";

/** The "ບ້ານ ໃຜ ກໍ່ ເປັນ" story campaign — 1 anchor + 6 persona vignettes, all
 *  featuring the brand character Bounhome. REAL content (not mock), deduped by
 *  title. */
export async function seedMkStorySeries(existingTitles: string[]): Promise<number> {
  const items: MkScriptInput[] = [
    {
      title: 'ບ້ານ ໃຜ ກໍ່ ເປັນ (Anchor)', platform: 'fb', durationSec: 40, status: 'ready',
      hook: 'ບ້ານ ໃຜ ກໍ່ ມີ ບັນຫາ... ແຕ່ ຫາ ຊ່າງ ດີ ບໍ່ ໄດ້',
      scenes: [
        { label: '0-4 ວິ', desc: 'ຕັດ ໄວໆ: ບ້ານ ຫຼາຍ ແບບ + ຄົນ ຫຼາຍ ລຸ້ນ, ບັນຫາ ໄຟ ດັບ/ນ້ຳ ຮົ່ວ/ຊັກໂຄຣກ ຕັນ/ຫຼັງຄາ ຮົ່ວ · text "ບ້ານ ໃຜ ກໍ່ ມີ ບັນຫາ..."' },
        { label: '4-14 ວິ', desc: 'ຄົນ ໂທ ຫາ ຊ່າງ ວົນ ໄປ ມາ ໜ້າ ເບື່ອ · text "ໂທ ຊ່າງ → ບໍ່ ວ່າງ · ຕິດຕໍ່ ບໍ່ ໄດ້ · ຄ່າ ແພງ · ສີມື ບໍ່ ໄດ້"' },
        { label: '14-24 ວິ', desc: 'ເລື່ອນ FB/TikTok ເຫັນ ປ້າຍ ຮ້ານ ໂຮມມາທ → ແຕະ → ໂຮມຊ່າງ · text "ບັງເອີນ ເຫັນ ໃນ ເນັດ..."' },
        { label: '24-36 ວິ', desc: 'ໂພສ ວຽກ → ຊ່າງ ຢືນຢັນ ຫຼາຍ ຄົນ ສະເໜີ ລາຄາ → ເລືອກ ບຸນໂຮມ ເຮັດ ວຽກ ດີ · text "ຊ່າງ ຢືນຢັນ · ລາຄາ ຊັດເຈນ · ຮັບປະກັນ"' },
        { label: '36-40 ວິ', desc: 'ບ້ານ ຮຽບຮ້ອຍ ຄອບຄຣັວ ຍິ້ມ · CTA "ໂຮມຊ່າງ — ຫາ ຊ່າງ ມືອອາຊີພ ໄດ້ ທຸກ ບ້ານ · homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 40s. Fast opening montage of varied Lao homes and people of all ages facing household problems (power outage, water leak, clogged toilet, leaking roof). A frustrated person makes repeated failed phone calls looking for a repairman. Then, scrolling social media, they spot a hardware-store (Homemart) ad and tap into a clean app → posts a job → several verified technicians send clear quotes → picks ${BOUNHOME} → quality repair done → tidy home, happy family. Warm relatable documentary tone, Lao on-screen captions, hopeful build-up music, HomeSang blue (#0066CC)+orange (#F47B20) branding, end card 'homesang.pro'.`,
    },
    {
      title: 'ໜຸ່ມ ເຊົ່າ ຄອນໂດ — ປລັກ ໄຟ ມີ ຄວັນ', platform: 'tiktok', durationSec: 20, status: 'ready',
      hook: 'ຢູ່ ຄອນໂດ ຄົນ ດຽວ... ປລັກ ໄຟ ມີ ຄວັນ 😱 ຫາ ຊ່າງ ຈາກ ໃສ?',
      scenes: [
        { label: '0-3 ວິ', desc: 'ສາວ/ໜຸ່ມ ຕົກໃຈ ປລັກ ໄຟ ມີ ຄວັນ · text "ປລັກ ໄໝ້?!"' },
        { label: '3-12 ວິ', desc: 'ເລື່ອນ TikTok ເຫັນ ໂຮມຊ່າງ → ໂພສ ດ່ວນ · text "ໂພສ → ຊ່າງ ໃກ້ ຕົວ ຮັບ ທັນທີ"' },
        { label: '12-20 ວິ', desc: 'ບຸນໂຮມ ມາ ໄວ ຍິ້ມ ໃຫ້ ໝັ້ນ ໃຈ ສ້ອມ → ປລັກ ໃໝ່ ປອດໄພ · CTA "ຊ່າງ ຢືນຢັນ · ໄວ · ປອດໄພ · homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 20s. A young Lao renter alone in a condo panics as a wall outlet smokes → scrolls TikTok, sees the app, posts an urgent request → ${BOUNHOME}, arrives quickly with a reassuring smile and fixes it → safe new outlet, relieved renter. Fast TikTok pace, Lao captions, HomeSang branding, end card 'homesang.pro'.`,
    },
    {
      title: 'ພໍ່ ບ້ານ ຈັດ ສັນ — ຊັກໂຄຣກ ຕັນ', platform: 'fb', durationSec: 30, status: 'ready',
      hook: 'ຊັກໂຄຣກ ຕັນ ຕອນ ເຊົ້າ... ຊ່າງ ຄິດ ຄ່າ 500,000?! 😳',
      scenes: [
        { label: '0-4 ວິ', desc: 'ພໍ່ ບ້ານ ຫງຸດຫງິດ ຊັກໂຄຣກ ຕັນ · ຊ່າງ ເກົ່າ ຮຽກ ຄ່າ ແພງ · text "ຄ່າ ແພງ ບໍ່ ສົມ ເຫດ?"' },
        { label: '4-20 ວິ', desc: 'ເປີດ FB ເຫັນ ໂຮມຊ່າງ → ໂພສ → ຊ່າງ ຫຼາຍ ຄົນ ສະເໜີ ລາຄາ ຊັດເຈນ ໃຫ້ ປຽບທຽບ · text "ໂຮມຊ່າງ — ຊ່າງ ສະເໜີ ລາຄາ ໃຫ້ ເລືອກ"' },
        { label: '20-30 ວິ', desc: 'ເລືອກ ບຸນໂຮມ → ແກ້ ຈົບ ຮຽບຮ້ອຍ · CTA "ໂປຣ່ງໃສ · ຮັບປະກັນ · homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 30s. A Lao father in a suburban home frustrated by a clogged toilet; an old repairman quotes an unfair high price → he opens Facebook, finds the app, posts the job → multiple verified technicians send clear fair quotes to compare → he picks ${BOUNHOME}, who fixes it cleanly. Relatable tone, Lao captions, HomeSang branding, end card 'homesang.pro'.`,
    },
    {
      title: 'ຄົນ ເຖົ້າ — ຫຼັງຄາ ຮົ່ວ ໜ້າ ຝົນ', platform: 'fb', durationSec: 30, status: 'ready',
      hook: 'ຝົນ ຕົກ ທຸກ ຄືນ ຫຼັງຄາ ຮົ່ວ... ໂທ ຊ່າງ ໃຜ ກໍ່ ບໍ່ ວ່າງ 😔',
      scenes: [
        { label: '0-5 ວິ', desc: 'ຄົນ ເຖົ້າ ເອົາ ຖັງ ຮອງ ນ້ຳ ຮົ່ວ · text "ໂທ ຊ່າງ ບໍ່ ວ່າງ?"' },
        { label: '5-18 ວິ', desc: 'ໄປ ຮ້ານ ໂຮມມາທ ຊື້ ຂອງ ເຫັນ ປ້າຍ ໂຮມຊ່າງ (ສະແກນ) → ລູກ ຊ່ວຍ ໂພສ · text "ເຫັນ ປ້າຍ ທີ່ ຮ້ານ ໂຮມມາທ → ສະແກນ → ຫາ ຊ່າງ ຢືນຢັນ"' },
        { label: '18-30 ວິ', desc: 'ບຸນໂຮມ ມາ ຊ່ອມ ຫຼັງຄາ ເວົ້າ ຈາ ອ່ອນ ໂຍນ → ບ້ານ ແຫ້ງ ສະບາຍ · CTA "homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 30s. An elderly Lao person places a bucket under a leaking roof during rain; can't reach any repairman → at a hardware store (Homemart) they notice a HomeSang ad poster ('find a technician — scan') → a family member helps post the job → ${BOUNHOME}, arrives kind and patient, repairs the roof → dry cozy home. Warm gentle tone, Lao captions, HomeSang + hardware-store bridge, end card 'homesang.pro'.`,
    },
    {
      title: 'ແມ່ ບ້ານ ເຮັດ ວຽກ — ບໍ່ ມີ ເວລາ ຫາ ຊ່າງ', platform: 'both', durationSec: 25, status: 'ready',
      hook: 'ບ້ານ ຮົກ, ໄຟ ເສຍ, ກັອກ ນ້ຳ ຮົ່ວ... ແຕ່ ບໍ່ ມີ ເວລາ ຫາ ຊ່າງ 😮‍💨',
      scenes: [
        { label: '0-4 ວິ', desc: 'ແມ່ ບ້ານ ຫຍຸ້ງ ວຽກ ຫຼາຍ ບັນຫາ ໃນ ບ້ານ · text "ບໍ່ ມີ ເວລາ?"' },
        { label: '4-16 ວິ', desc: 'ພິມ Google "ຊ່າງ ໃກ້ ຂ້ອຍ" ເຫັນ ໂຮມຊ່າງ → ໂພສ ຄັ້ງ ດຽວ ຫຼາຍ ວຽກ · text "ໂພສ ຄັ້ງ ດຽວ → ຈົບ ຫຼາຍ ວຽກ"' },
        { label: '16-25 ວິ', desc: 'ບຸນໂຮມ + ທີມ ຈັດການ ໃຫ້ ໝົດ → ບ້ານ ສະອາດ · CTA "ໄວ້ ໃຈ ໄດ້ · ຮັບປະກັນ · homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 25s. A busy Lao working woman overwhelmed by a messy home with several small problems (broken light, leaking tap) → Googles 'technician near me', finds the app, posts one request covering multiple jobs → ${BOUNHOME}, and team handle everything → clean tidy home. Upbeat efficient tone, Lao captions, HomeSang branding, end card 'homesang.pro'.`,
    },
    {
      title: 'ຄູ່ ໃໝ່ ຍ້າຍ ເຂົ້າ ບ້ານ ໃໝ່ — ຕິດຕັ້ງ ຫຼາຍ ຢ່າງ', platform: 'fb', durationSec: 25, status: 'ready',
      hook: 'ຍ້າຍ ເຂົ້າ ບ້ານ ໃໝ່... ຕ້ອງ ຕິດ ແອ, ນ້ຳ ຮ້ອນ, ຜ້າ ມ່ານ — ຫາ ຊ່າງ ຈາກ ໃສ? 🏠',
      scenes: [
        { label: '0-4 ວິ', desc: 'ຄູ່ ໜຸ່ມ ຢືນ ກາງ ບ້ານ ໃໝ່ ໂຫຼ່ງໆ ບໍ່ ຮູ້ຈັກ ຊ່າງ ໃນ ພື້ນ ທີ່ · text "ບ້ານ ໃໝ່ · ຊ່າງ ໃໝ່ ບໍ່ ຮູ້ຈັກ?"' },
        { label: '4-16 ວິ', desc: 'ເປີດ ໂຮມຊ່າງ → ໂພສ · text "ໂຮມຊ່າງ — ຊ່າງ ຢືນຢັນ ໃກ້ ຕົວ"' },
        { label: '16-25 ວິ', desc: 'ບຸນໂຮມ ມາ ຕິດຕັ້ງ ໃຫ້ ຄົບ → ບ້ານ ພຣ້ອມ ຢູ່, ຄູ່ ຮັກ ຍິ້ມ · CTA "ຕິດຕັ້ງ ຄົບ ຈົບ ບ່ອນ ດຽວ · homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 25s. A young Lao couple stands in their empty new house, unsure who to hire for installs (aircon, water heater, curtains) → opens the app, posts the job → ${BOUNHOME}, installs everything neatly → move-in-ready home, happy couple. Fresh hopeful tone, Lao captions, HomeSang branding, end card 'homesang.pro'.`,
    },
    {
      title: 'ຜູ້ ຈັດການ ອາຄານ — ຄຸມ ຫຼາຍ ຫ້ອງ (B2B)', platform: 'both', durationSec: 30, status: 'ready',
      hook: 'ດູ ຄອນໂດ 30 ຫ້ອງ... ວຽກ ສ້ອມ ບໍ່ ຂາດ. ຄຸມ ຊ່າງ ຫຼາຍ ຄົນ ວຸ້ນ ໄປ ໝົດ 😵',
      scenes: [
        { label: '0-5 ວິ', desc: 'ຜູ້ຈັດກາຣ ອາຄານ ຮັບ ໂທ ຮ້ອງ ຮຽນ ຫຼາຍ ຫ້ອງ · text "ຄຸມ ຫຼາຍ ຫ້ອງ ວຸ້ນ?"' },
        { label: '5-20 ວິ', desc: 'ເປີດ ໂຮມຊ່າງ ໜ້າ ບໍລິສັທ → ຊ່າງ ປະຈຳ (ບຸນໂຮມ) + ໃບ ບິນ ລວມ · text "ໂຮມຊ່າງ ສຳ ລັບ ອາຄານ — ຊ່າງ ປະຈຳ + ໃບ ບິນ ລວມ"' },
        { label: '20-30 ວິ', desc: 'ຈັດການ ທຸກ ຫ້ອງ ໃນ ບ່ອນ ດຽວ, ຜູ້ຈັດກາຣ ໃຈ ເຢັນ · CTA "ບຳຣຸງ ປະຈຳ ອັດຕະໂນມັດ · homesang.pro"' },
      ],
      aiPrompt: `Vertical 9:16, 30s. A Lao building/condo manager overwhelmed by repair calls from many units → opens the app's company dashboard showing a preferred technician (${BOUNHOME}) and consolidated invoicing → all units managed in one place, calm organized manager. Professional B2B tone, Lao captions, HomeSang branding, end card 'homesang.pro'.`,
    },
  ];
  const have = new Set(existingTitles);
  const toAdd = items.filter((i) => !have.has(i.title));
  if (toAdd.length === 0) return 0;
  const batch = writeBatch(db);
  for (const it of toAdd) batch.set(doc(collection(db, 'mkScripts')), strip({ ...it, createdAt: serverTimestamp() }));
  await batch.commit();
  return toAdd.length;
}
