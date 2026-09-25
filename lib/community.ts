import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { notify } from './notifications';

export type PostType = 'text' | 'sell';

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorImage?: string;
  content: string;
  images?: string[];
  type: PostType;
  price?: number;
  contact?: string;
  // Y2 Slice A — product-linked shoppable post (denormalized snapshot)
  productId?: string;
  productName?: string;
  productImage?: string;
  productPrice?: number;
  productUnit?: string;
  shopId?: string;
  likeCount: number;
  commentCount: number;
  createdAt: number;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorImage?: string;
  content: string;
  createdAt: number;
}

export interface CreatePostInput {
  authorId: string;
  authorName: string;
  authorImage?: string;
  content: string;
  images?: string[];
  type: PostType;
  price?: number;
  contact?: string;
  productId?: string;
  productName?: string;
  productImage?: string;
  productPrice?: number;
  productUnit?: string;
  shopId?: string;
}

function strip(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

function mapTs(id: string, data: any): any {
  const out: any = { id };
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = v instanceof Timestamp ? v.toMillis() : v;
  }
  if (typeof out.createdAt !== 'number') out.createdAt = Date.now();
  return out;
}

// ============ FEED ============
export function watchFeed(cb: (posts: Post[]) => void) {
  return onSnapshot(
    query(collection(db, 'posts'), limit(300)),
    (snap) => {
      const posts = snap.docs.map((d) => mapTs(d.id, d.data()) as Post);
      posts.sort((a, b) => b.createdAt - a.createdAt);
      cb(posts);
    },
    (e) => {
      console.error('watchFeed:', e);
      cb([]);
    },
  );
}

export function watchPost(postId: string, cb: (post: Post | null) => void) {
  return onSnapshot(doc(db, 'posts', postId), (snap) => {
    cb(snap.exists() ? (mapTs(snap.id, snap.data()) as Post) : null);
  });
}

export async function createPost(input: CreatePostInput): Promise<string> {
  const ref = await addDoc(
    collection(db, 'posts'),
    strip({
      ...input,
      likeCount: 0,
      commentCount: 0,
      createdAt: serverTimestamp(),
    }),
  );
  return ref.id;
}

export async function deletePost(postId: string) {
  await deleteDoc(doc(db, 'posts', postId));
}

// ============ LIKES ============
function likeId(postId: string, uid: string) {
  return `${postId}_${uid}`;
}

/** Toggle the current user's like on a post; keeps likeCount in sync. */
export async function toggleLike(postId: string, uid: string) {
  const likeRef = doc(db, 'postLikes', likeId(postId, uid));
  const snap = await getDoc(likeRef);
  const batch = writeBatch(db);
  if (snap.exists()) {
    batch.delete(likeRef);
    batch.update(doc(db, 'posts', postId), { likeCount: increment(-1) });
  } else {
    batch.set(likeRef, { postId, uid, createdAt: serverTimestamp() });
    batch.update(doc(db, 'posts', postId), { likeCount: increment(1) });
  }
  await batch.commit();
}

/** Stream the set of post ids the user has liked. */
export function watchMyLikes(uid: string, cb: (likedIds: Set<string>) => void) {
  const q = query(collection(db, 'postLikes'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => cb(new Set(snap.docs.map((d) => (d.data() as any).postId))),
    (e) => {
      console.error('watchMyLikes:', e);
      cb(new Set());
    },
  );
}

/** Stream whether the user likes one specific post (for the detail screen). */
export function watchLike(postId: string, uid: string, cb: (liked: boolean) => void) {
  return onSnapshot(doc(db, 'postLikes', likeId(postId, uid)), (snap) =>
    cb(snap.exists()),
  );
}

// ============ COMMENTS ============
export function watchComments(postId: string, cb: (comments: Comment[]) => void) {
  const q = query(collection(db, 'comments'), where('postId', '==', postId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapTs(d.id, d.data()) as Comment);
      list.sort((a, b) => a.createdAt - b.createdAt); // oldest first
      cb(list);
    },
    (e) => {
      console.error('watchComments:', e);
      cb([]);
    },
  );
}

export async function addComment(
  postId: string,
  author: { authorId: string; authorName: string; authorImage?: string },
  content: string,
) {
  const batch = writeBatch(db);
  const cRef = doc(collection(db, 'comments'));
  batch.set(
    cRef,
    strip({ postId, ...author, content, createdAt: serverTimestamp() }),
  );
  batch.update(doc(db, 'posts', postId), { commentCount: increment(1) });
  await batch.commit();

  // notify the post author (not when commenting on your own post)
  try {
    const postSnap = await getDoc(doc(db, 'posts', postId));
    const post: any = postSnap.data();
    if (post?.authorId && post.authorId !== author.authorId) {
      await notify(post.authorId, {
        type: 'comment',
        title: 'ມີຄອມເມັນໃໝ່ໃນໂພສຂອງເຈົ້າ',
        body: `${author.authorName}: ${content.slice(0, 50)}`,
        link: `/community/${postId}`,
      });
    }
  } catch {
    /* best-effort */
  }
}

// ============ MOCK SEED (admin only) ============
const MOCK_POSTS: Omit<CreatePostInput, never>[] = [
  {
    authorId: 'mock-tech-1',
    authorName: 'ທ. ສົມຈິດ',
    content: 'ຫາກໃຜຕ້ອງການຊ່າງໄຟ ແຖວ ໂພນທັນ ຕິດຕໍ່ໄດ້ ວ່າງ ສຸກ-ເສົາ 👍',
    type: 'text',
  },
  {
    authorId: 'mock-cust-2',
    authorName: 'ນາງ ມາລາ',
    content: 'ໃຜມີຊ່າງແອ ດີໆ ແນະນຳແດ່ ເດີ້ ຮ້ອນຫຼາຍ 😅',
    type: 'text',
  },
  {
    authorId: 'mock-tech-3',
    authorName: 'ທ. ບຸນມີ',
    content: 'ສາຍໄຟ THW 2.5mm ມ້ວນ 100m ມືສອງ ສະພາບດີ 90% ຂາຍຖືກ',
    type: 'sell',
    price: 350000,
    contact: '020 5555 5555',
  },
  {
    authorId: 'mock-tech-2',
    authorName: 'ທ. ຄຳ',
    content: 'ຮັບເໝົາທາສີບ້ານ ລາຄາກັນເອງ ມີຮູບຜົນງານ ສົ່ງໃຫ້ເບິ່ງໄດ້',
    type: 'text',
  },
];

/** Seed a few demo posts when the feed is empty (run by an admin only). */
export async function seedCommunityIfEmpty(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'posts'), limit(1)));
  if (!snap.empty) return 0;
  const batch = writeBatch(db);
  for (const p of MOCK_POSTS) {
    batch.set(
      doc(collection(db, 'posts')),
      strip({ ...p, likeCount: 0, commentCount: 0, createdAt: serverTimestamp() }),
    );
  }
  await batch.commit();
  return MOCK_POSTS.length;
}
