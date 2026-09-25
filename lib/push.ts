import { Platform } from 'react-native';
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { app, db } from './firebase';

/** Whether web push is even possible in this browser. */
export function pushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window
  );
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Request permission, register the SW, get an FCM token and store it on the
 * user doc. Returns the token, or null if blocked/unsupported.
 * Requires a VAPID key (from admin AppSettings).
 */
export async function enablePush(uid: string, vapidKey: string): Promise<string | null> {
  if (!pushSupported()) throw new Error('ບຣາວເຊີ ນີ້ ບໍ່ຮອງຮັບ ການແຈ້ງເຕືອນ');
  if (!vapidKey) throw new Error('ຍັງບໍ່ໄດ້ຕັ້ງ VAPID key (admin → ຕັ້ງຄ່າ)');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('ການແຈ້ງເຕືອນ ຖືກປະຕິເສດ');

  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const { getMessaging, getToken } = await import('firebase/messaging');
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
  if (!token) return null;

  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token), updatedAt: Date.now() });
  return token;
}

export async function disablePush(uid: string) {
  if (!pushSupported()) return;
  try {
    const { getMessaging, getToken, deleteToken } = await import('firebase/messaging');
    const messaging = getMessaging(app);
    const token = await getToken(messaging).catch(() => null);
    if (token) {
      await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) });
      await deleteToken(messaging).catch(() => {});
    }
  } catch {
    /* best-effort */
  }
}

/** Foreground messages → call back so the app can show an in-app toast/badge. */
export async function onForegroundPush(cb: (title: string, body: string, link?: string) => void) {
  if (!pushSupported()) return () => {};
  const { getMessaging, onMessage } = await import('firebase/messaging');
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    const n = payload.notification || {};
    cb(n.title || 'HomeSang', n.body || '', (payload.data as any)?.link);
  });
}
