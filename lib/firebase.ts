import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
// auto-detect long polling: fixes Firestore hanging on mobile / restricted
// networks where QUIC/WebChannel streaming is blocked (ERR_QUIC_PROTOCOL_ERROR)
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  // drop undefined fields instead of throwing (writes stay clean without every
  // call having to strip() first — matches how the app already builds payloads)
  ignoreUndefinedProperties: true,
});
export const storage = getStorage(app);
// callable Cloud Functions live in asia-southeast1 (see functions/src/index.ts)
export const functions = getFunctions(app, 'asia-southeast1');
