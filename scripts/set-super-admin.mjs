// Grant super-admin to an existing account (signs in AS that user, then sets
// isSuperAdmin via the owner-write rule — no service account needed).
// Usage: node scripts/set-super-admin.mjs <phone8> <password>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const __d = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__d, '..', '.env.local'), 'utf8');
const g = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();

const PHONE8 = process.argv[2];
const PASSWORD = process.argv[3];
if (!PHONE8 || !PASSWORD) {
  console.error('usage: node scripts/set-super-admin.mjs <phone8> <password>');
  process.exit(1);
}
const email = `85620${PHONE8}@homesang.local`;

const app = initializeApp({
  apiKey: g('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: g('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: g('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
});
const auth = getAuth(app);
const db = getFirestore(app);

try {
  const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
  await setDoc(
    doc(db, 'users', cred.user.uid),
    { isSuperAdmin: true, updatedAt: serverTimestamp() },
    { merge: true },
  );
  console.log('OK — super admin set for ' + email + ' (uid ' + cred.user.uid + ')');
  process.exit(0);
} catch (e) {
  console.error('FAIL: ' + (e.code || e.message));
  process.exit(1);
}
