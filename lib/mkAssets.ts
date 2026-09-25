import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { stampMock } from './mock';

/**
 * MK Plan · Media & docs library — the `mkAssets` collection. Brand assets,
 * before/after images (uploaded), video/doc/plan LINKS (YouTube/FB/Drive/artifact
 * URLs). Gated to the marketing role (firestore.rules isMarketing()).
 */
export type MkAssetType = 'image' | 'video' | 'doc' | 'link';

export interface MkAsset {
  id: string;
  title: string;
  type: MkAssetType;
  url: string;      // uploaded Storage URL (image) or an external link
  thumb?: string;   // optional preview image for non-image assets
  tag?: string;
  note?: string;
  createdAt: number;
  __mock?: boolean;
}

export const MK_ASSET_LABEL: Record<MkAssetType, string> = { image: 'ຮູບ', video: 'ວີດີໂອ', doc: 'ເອກະສານ', link: 'ລິ້ງ' };
export const MK_ASSET_ICON: Record<MkAssetType, string> = { image: '🖼️', video: '🎬', doc: '📄', link: '🔗' };
export const MK_ASSET_TYPES: MkAssetType[] = ['image', 'video', 'doc', 'link'];

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): MkAsset {
  return { id, title: d.title ?? '', type: d.type ?? 'link', url: d.url ?? '', thumb: d.thumb, tag: d.tag, note: d.note, createdAt: ms(d.createdAt), __mock: !!d.__mock };
}
function strip<T extends Record<string, any>>(o: T): Partial<T> {
  const out: any = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v; return out;
}

export function watchMkAssets(cb: (list: MkAsset[]) => void) {
  return onSnapshot(query(collection(db, 'mkAssets')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchMkAssets:', e); cb([]); });
}

export type MkAssetInput = Omit<MkAsset, 'id' | 'createdAt'>;
export async function createMkAsset(input: MkAssetInput) { await addDoc(collection(db, 'mkAssets'), strip({ ...input, createdAt: serverTimestamp() })); }
export async function updateMkAsset(id: string, patch: Partial<MkAssetInput>) { await updateDoc(doc(db, 'mkAssets', id), strip({ ...patch }) as any); }
export async function deleteMkAsset(id: string) { await deleteDoc(doc(db, 'mkAssets', id)); }

export async function seedMkAssetsSample(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const items: MkAssetInput[] = [
    { title: 'ຊຸດ ໂລໂກ້ & ສີ ແບຣນດ໌ HomeSang', type: 'doc', url: 'https://homesang.pro', tag: 'brand' },
    { title: 'ຄລິບ ກ່ອນ-ຫຼັງ ລ້າງ ແອ', type: 'video', url: 'https://homesang.pro', tag: 'ກ່ອນ-ຫຼັງ' },
    { title: 'ແຜນ GTM ການ ຕະຫຼາດ', type: 'doc', url: 'https://homesang.pro', tag: 'plan' },
    { title: 'Playbook ຮັບ ສະໝັກ ຊ່າງ', type: 'link', url: 'https://homesang.pro', tag: 'playbook' },
    { title: 'ຄລັງ ຮູບ ຜົນ ງານ ຊ່າງ', type: 'link', url: 'https://homesang.pro', tag: 'portfolio' },
  ];
  const batch = writeBatch(db);
  for (const it of items) batch.set(doc(collection(db, 'mkAssets')), strip(stampMock({ ...it, createdAt: serverTimestamp() })));
  await batch.commit();
  return items.length;
}

/** The 5 marketing-campaign documents (shareable claude.ai pages) as REAL asset
 *  links, so the team can open them from MK Plan → Media. Deduped by title.
 *  NOTE: those artifact pages are private — the owner must SHARE each (from the
 *  page's share menu) before teammates can open them. */
export async function seedMkMarketingDocs(existingTitles: string[]): Promise<number> {
  const items: MkAssetInput[] = [
    { title: '📣 ສູນ ຕະຫຼາດ (Marketing Hub)', type: 'link', url: 'https://claude.ai/code/artifact/b2ebd8c1-d7ae-435c-82a6-5e52883d5532', tag: 'ເອກະສານ', note: 'ໜ້າ ຫຼັກ ລວມ ໝົດ — ເລີ່ມ ບ່ອນ ນີ້' },
    { title: '🎬 Production Kit (7 ວີດີໂອ)', type: 'link', url: 'https://claude.ai/code/artifact/6a0f6192-dab7-467a-b7a6-cb2a4857788b', tag: 'ເອກະສານ', note: 'ບົດ ຜະລິດ ຄົບ — shot list/VO/prompt' },
    { title: '🤖 ຄູ່ມື AI ສ້າງ ວີດີໂອ', type: 'link', url: 'https://claude.ai/code/artifact/51a629d4-2e6d-479c-9dea-13f8b852181b', tag: 'ເອກະສານ', note: 'ເລືອກ ເຄຣື່ອງມືອ + ຂັ້ນຕອນ' },
    { title: '🎞️ Storyboard 7 ເລື່ອງ', type: 'link', url: 'https://claude.ai/code/artifact/92229ff7-0bee-4ba5-9b5d-528f651d66a4', tag: 'ເອກະສານ', note: 'ພາບ ລວມ ຊຸດ' },
    { title: '📅 ຕາຕະລາງ ໂພສ 30 ວັນ', type: 'link', url: 'https://claude.ai/code/artifact/f7c7c50b-bb27-4baf-b963-3ebab7221a6e', tag: 'ເອກະສານ', note: 'ແຜນ ລົງ ໂພສ' },
  ];
  const have = new Set(existingTitles);
  const toAdd = items.filter((i) => !have.has(i.title));
  if (toAdd.length === 0) return 0;
  const batch = writeBatch(db);
  for (const it of toAdd) batch.set(doc(collection(db, 'mkAssets')), strip({ ...it, createdAt: serverTimestamp() }));
  await batch.commit();
  return toAdd.length;
}
