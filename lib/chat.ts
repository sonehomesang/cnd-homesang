import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { notify } from './notifications';

export interface Conversation {
  id: string;
  participants: string[];
  names: Record<string, string>;
  images: Record<string, string | null>;
  jobId?: string;
  jobTitle?: string;
  lastMessage?: string;
  lastSenderId?: string;
  lastAt?: number;
  /** per-participant "last opened the thread" time — drives unread + read receipts */
  lastReadAt?: Record<string, number>;
  createdAt: number;
  updatedAt?: number;
}

/** Rich message kinds. Legacy messages have no `kind` (= plain text/image). */
export type MessageKind = 'quote' | 'counter';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  imageUrl?: string;
  // file attachment (document/other) — separate from imageUrl so it renders as a chip
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  kind?: MessageKind;
  // kind='quote' — a snapshot pointer to a bid version (the source of truth)
  bidId?: string;
  jobId?: string;
  quoteVersion?: number;
  quoteTotal?: number;
  quoteItemCount?: number;
  quoteStatus?: string; // BidStatus at post time
  // kind='counter' — a structured price the customer proposes back
  counterAmount?: number;
  counterBy?: 'customer' | 'tech';
  counterNote?: string;
  createdAt: number;
}

function tsToMs(v: any): number | undefined {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'number') return v;
  return undefined;
}

function nameOf(p: any): string {
  return p?.name || [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'ຜູ້ໃຊ້';
}

/** Deterministic id so the same pair always shares one conversation. */
export function conversationId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

function mapConversation(id: string, data: any): Conversation {
  return {
    id,
    participants: data.participants ?? [],
    names: data.names ?? {},
    images: data.images ?? {},
    jobId: data.jobId,
    jobTitle: data.jobTitle,
    lastMessage: data.lastMessage,
    lastSenderId: data.lastSenderId,
    lastAt: tsToMs(data.lastAt),
    lastReadAt: Object.fromEntries(
      Object.entries(data.lastReadAt ?? {}).map(([k, v]) => [k, tsToMs(v) ?? 0]),
    ),
    createdAt: tsToMs(data.createdAt) ?? Date.now(),
    updatedAt: tsToMs(data.updatedAt),
  };
}

/**
 * Find or create the 1-1 conversation between two users, populating each
 * participant's name/image from their user doc. Returns the conversation id.
 */
export async function getOrCreateConversation(
  meUid: string,
  otherUid: string,
  jobContext?: { jobId: string; jobTitle: string },
): Promise<string> {
  const id = conversationId(meUid, otherUid);
  const ref = doc(db, 'conversations', id);
  const [meSnap, otherSnap] = await Promise.all([
    getDoc(doc(db, 'users', meUid)),          // self — readable
    getDoc(doc(db, 'userCards', otherUid)),   // other — public card (name/image), not their private users doc
  ]);
  const me = meSnap.data() ?? {};
  const other = otherSnap.data() ?? {};
  const names = { [meUid]: nameOf(me), [otherUid]: nameOf(other) };
  const images = { [meUid]: me.image ?? null, [otherUid]: other.image ?? null };

  const existing = await getDoc(ref);
  if (existing.exists()) {
    await updateDoc(ref, { names, images, updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, {
      participants: [meUid, otherUid],
      names,
      images,
      ...(jobContext ? { jobId: jobContext.jobId, jobTitle: jobContext.jobTitle } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return id;
}

/** Mark a thread read for `uid` (call when the chat screen is open). */
export async function markConversationRead(conversationId: string, uid: string) {
  try {
    await updateDoc(doc(db, 'conversations', conversationId), { [`lastReadAt.${uid}`]: serverTimestamp() });
  } catch { /* best-effort */ }
}

/** True when the thread has a newer message than `uid` last read, from someone else. */
export function isConversationUnread(c: Conversation, uid: string): boolean {
  if (!c.lastAt || c.lastSenderId === uid) return false;
  return c.lastAt > (c.lastReadAt?.[uid] ?? 0);
}

export function watchMyConversations(uid: string, cb: (c: Conversation[]) => void) {
  const q = query(collection(db, 'conversations'), where('participants', 'array-contains', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => mapConversation(d.id, d.data()));
      list.sort((a, b) => (b.lastAt ?? b.createdAt) - (a.lastAt ?? a.createdAt));
      cb(list);
    },
    (e) => {
      console.error('watchMyConversations:', e);
      cb([]);
    },
  );
}

export function watchConversation(id: string, cb: (c: Conversation | null) => void) {
  return onSnapshot(doc(db, 'conversations', id), (snap) => {
    cb(snap.exists() ? mapConversation(snap.id, snap.data()) : null);
  });
}

export function watchMessages(conversationId: string, cb: (m: Message[]) => void) {
  const q = query(collection(db, 'messages'), where('conversationId', '==', conversationId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data: any = d.data();
        return {
          id: d.id,
          conversationId: data.conversationId,
          senderId: data.senderId,
          text: data.text ?? '',
          imageUrl: data.imageUrl,
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          fileSize: data.fileSize,
          kind: data.kind,
          bidId: data.bidId,
          jobId: data.jobId,
          quoteVersion: data.quoteVersion,
          quoteTotal: data.quoteTotal,
          quoteItemCount: data.quoteItemCount,
          quoteStatus: data.quoteStatus,
          counterAmount: data.counterAmount,
          counterBy: data.counterBy,
          counterNote: data.counterNote,
          createdAt: tsToMs(data.createdAt) ?? Date.now(),
        } as Message;
      });
      list.sort((a, b) => a.createdAt - b.createdAt); // oldest first
      cb(list);
    },
    (e) => {
      console.error('watchMessages:', e);
      cb([]);
    },
  );
}

export async function sendMessage(conversationId: string, senderId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const batch = writeBatch(db);
  const mRef = doc(collection(db, 'messages'));
  batch.set(mRef, { conversationId, senderId, text: trimmed, createdAt: serverTimestamp() });
  batch.update(doc(db, 'conversations', conversationId), {
    lastMessage: trimmed,
    lastSenderId: senderId,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  await notifyOther(conversationId, senderId, trimmed.slice(0, 60));
}

/** Send an image message (uploaded URL). */
export async function sendImageMessage(conversationId: string, senderId: string, imageUrl: string) {
  if (!imageUrl) return;
  const batch = writeBatch(db);
  const mRef = doc(collection(db, 'messages'));
  batch.set(mRef, { conversationId, senderId, text: '', imageUrl, createdAt: serverTimestamp() });
  batch.update(doc(db, 'conversations', conversationId), {
    lastMessage: '📷 ຮູບ',
    lastSenderId: senderId,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  await notifyOther(conversationId, senderId, '📷 ຮູບ');
}

/**
 * Post an itemized quote into the chat as an interactive CARD (not plain text).
 * The card is a snapshot pointer to a bid version — the bid stays the source of
 * truth, so tapping "view full" / "accept" always acts on live data.
 */
export async function sendQuoteCard(
  conversationId: string,
  senderId: string,
  q: { bidId: string; jobId?: string; version: number; total: number; itemCount: number; status: string },
) {
  const preview = `🧾 ໃບສະເໜີ v${q.version} · ${q.total.toLocaleString('en-US')} ກີບ`;
  const batch = writeBatch(db);
  const mRef = doc(collection(db, 'messages'));
  batch.set(mRef, {
    conversationId,
    senderId,
    text: '',
    kind: 'quote',
    bidId: q.bidId,
    ...(q.jobId ? { jobId: q.jobId } : {}),
    quoteVersion: q.version,
    quoteTotal: q.total,
    quoteItemCount: q.itemCount,
    quoteStatus: q.status,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'conversations', conversationId), {
    lastMessage: preview,
    lastSenderId: senderId,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  await notifyOther(conversationId, senderId, preview);
}

/** Post a structured counter-offer (a proposed grand total) into the chat. */
export async function sendCounterOffer(
  conversationId: string,
  senderId: string,
  by: 'customer' | 'tech',
  amount: number,
  opts: { bidId?: string; jobId?: string; note?: string } = {},
) {
  const preview = `💬 ຂໍ ຕໍ່ ລາຄາ ${amount.toLocaleString('en-US')} ກີບ`;
  const batch = writeBatch(db);
  const mRef = doc(collection(db, 'messages'));
  batch.set(mRef, {
    conversationId,
    senderId,
    text: '',
    kind: 'counter',
    counterAmount: amount,
    counterBy: by,
    ...(opts.bidId ? { bidId: opts.bidId } : {}),
    ...(opts.jobId ? { jobId: opts.jobId } : {}),
    ...(opts.note?.trim() ? { counterNote: opts.note.trim() } : {}),
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'conversations', conversationId), {
    lastMessage: preview,
    lastSenderId: senderId,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  await notifyOther(conversationId, senderId, preview);
}

/** Send a file/document attachment (uploaded URL + name + byte size). */
export async function sendFileMessage(
  conversationId: string,
  senderId: string,
  file: { url: string; name: string; size?: number },
) {
  if (!file.url) return;
  const preview = `📎 ${file.name}`;
  const batch = writeBatch(db);
  const mRef = doc(collection(db, 'messages'));
  batch.set(mRef, {
    conversationId,
    senderId,
    text: '',
    fileUrl: file.url,
    fileName: file.name,
    ...(file.size ? { fileSize: file.size } : {}),
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'conversations', conversationId), {
    lastMessage: preview,
    lastSenderId: senderId,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  await notifyOther(conversationId, senderId, preview);
}

async function notifyOther(conversationId: string, senderId: string, preview: string) {
  try {
    const convSnap = await getDoc(doc(db, 'conversations', conversationId));
    const conv: any = convSnap.data();
    const other = (conv?.participants ?? []).find((p: string) => p !== senderId);
    await notify(other, {
      type: 'message',
      title: `💬 ${conv?.names?.[senderId] ?? 'ຂໍ້ຄວາມ'}`,
      body: preview,
      link: `/chat/${conversationId}`,
    });
  } catch {
    /* best-effort */
  }
}
