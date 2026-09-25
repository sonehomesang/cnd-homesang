import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

// Two linked modules: short knowledge clips (topic 'trade') and safety content
// (topic 'safety'). Both live in ONE `learnClips` collection; the Safety screen
// simply filters topic==='safety', so a clip added as Safety appears in both the
// Home learn row and the Safety module — that's the cross-link.
export type ClipTopic = 'trade' | 'safety';
export type VideoSource = 'youtube' | 'facebook' | 'upload';

export interface LearnClip {
  id: string;
  title: string;
  topic: ClipTopic;
  videoType: VideoSource;
  videoUrl: string; // YouTube/FB link, or a Storage download URL for uploads
  thumbnail?: string;
  description?: string;
  durationLabel?: string; // e.g. "2:45"
  viewCount?: number;
  order?: number;
  active?: boolean;
  createdAt: number;
}

export const TOPIC_LABEL: Record<ClipTopic, { lao: string; icon: string }> = {
  trade: { lao: 'ທັກສະຊ່າງ', icon: '🔧' },
  safety: { lao: 'ຄວາມປອດໄພ', icon: '🦺' },
};

export const SOURCE_LABEL: Record<VideoSource, string> = {
  youtube: '▶ YouTube',
  facebook: '▶ Facebook',
  upload: '⬆ ອັບໂຫຼດ',
};

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function mapClip(id: string, data: any): LearnClip {
  const createdAt =
    data.createdAt instanceof Timestamp
      ? data.createdAt.toMillis()
      : typeof data.createdAt === 'number'
      ? data.createdAt
      : 0;
  return { id, ...data, createdAt } as LearnClip;
}

/** All active clips, newest-first (admin `order` wins when set). */
export function watchLearnClips(cb: (c: LearnClip[]) => void) {
  return onSnapshot(
    collection(db, 'learnClips'),
    (snap) => {
      const list = snap.docs.map((d) => mapClip(d.id, d.data())).filter((c) => c.active !== false);
      list.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchLearnClips:', e); cb([]); },
  );
}

// ===================== ADMIN CRUD =====================
export function watchAllLearnClips(cb: (c: LearnClip[]) => void) {
  return onSnapshot(
    collection(db, 'learnClips'),
    (snap) => {
      const list = snap.docs.map((d) => mapClip(d.id, d.data()));
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    (e) => { console.error('watchAllLearnClips:', e); cb([]); },
  );
}

export async function createLearnClip(input: Omit<LearnClip, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(
    collection(db, 'learnClips'),
    strip({ active: true, viewCount: 0, ...input, createdAt: serverTimestamp() }),
  );
  return ref.id;
}
export async function updateLearnClip(id: string, patch: Partial<LearnClip>) {
  await updateDoc(doc(db, 'learnClips', id), strip(patch as Record<string, unknown>));
}
export async function deleteLearnClip(id: string) {
  await deleteDoc(doc(db, 'learnClips', id));
}

// ===================== VIDEO EMBED HELPERS =====================
/** Guess the source of a pasted video link (YouTube vs Facebook). */
export function detectSource(url: string): 'youtube' | 'facebook' {
  const u = String(url).toLowerCase();
  return u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com') ? 'facebook' : 'youtube';
}

/** Extract an 11-char YouTube id from watch / youtu.be / shorts / embed URLs. */
export function youtubeId(url: string): string | null {
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

/** The URL to load in an <iframe> (youtube/facebook) or <video> (upload). */
export function embedSrc(clip: Pick<LearnClip, 'videoType' | 'videoUrl'>): string {
  if (clip.videoType === 'youtube') {
    const id = youtubeId(clip.videoUrl);
    return id ? `https://www.youtube.com/embed/${id}` : clip.videoUrl;
  }
  if (clip.videoType === 'facebook') {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(clip.videoUrl)}&show_text=false&width=560`;
  }
  return clip.videoUrl; // uploaded file — played directly
}

// ===================== SAMPLE SEED (admin only) =====================
// Public, license-free demo media so the modules are testable immediately.
// Admins edit/replace these with real content (or delete them).
const SAMPLE: Omit<LearnClip, 'id' | 'createdAt'>[] = [
  {
    title: 'ຕົວຢ່າງ: ຄວາມປອດໄພ ວຽກໄຟຟ້າ', topic: 'safety', videoType: 'upload',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    description: 'ຕົວຢ່າງ ຄລິບ ອັບໂຫຼດ — ປ່ຽນເປັນ ເນື້ອຫາ ຄວາມປອດໄພ ຈິງ ໄດ້ໃນ ຫຼັງບ້ານ.', durationLabel: '0:15', order: 1,
  },
  {
    title: 'ຕົວຢ່າງ: ທັກສະຊ່າງ (YouTube)', topic: 'trade', videoType: 'youtube',
    videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    description: 'ຕົວຢ່າງ ຄລິບ ຈາກ ລິ້ງ YouTube — ວາງລິ້ງ ຄລິບ ຄວາມຮູ້ ຈິງ ໄດ້ໃນ ຫຼັງບ້ານ.', durationLabel: '10:34', order: 2,
  },
  {
    title: 'ຕົວຢ່າງ: ໃຊ້ ເຄື່ອງມື ໃຫ້ຖືກ', topic: 'trade', videoType: 'upload',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    description: 'ຕົວຢ່າງ ຄລິບ ອັບໂຫຼດ.', durationLabel: '9:56', order: 3,
  },
];

export async function seedLearnClipsIfEmpty(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'learnClips'), limit(1)));
  if (!snap.empty) return 0;
  const batch = writeBatch(db);
  SAMPLE.forEach((c) => batch.set(doc(collection(db, 'learnClips')), strip({ active: true, viewCount: 0, ...c, createdAt: Date.now() })));
  await batch.commit();
  return SAMPLE.length;
}
