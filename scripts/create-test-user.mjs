// One-off: create a test login account (synthetic email + password) so login
// can be tested without OTP. Run: node scripts/create-test-user.mjs [phone8] [password]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();

const config = {
  apiKey: get('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: get('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: get('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: get('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: get('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: get('EXPO_PUBLIC_FIREBASE_APP_ID'),
};

const PHONE8 = process.argv[2] || '10000001';
const PASSWORD = process.argv[3] || 'Homesang2026';
const fullDigits = '85620' + PHONE8; // matches app: phoneToEmail("+85620" + phone8)
const email = `${fullDigits}@homesang.local`;

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

let uid;
try {
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  uid = cred.user.uid;
  console.log('CREATED uid=' + uid);
} catch (e) {
  if (e.code === 'auth/email-already-in-use') {
    const cred = await signInWithEmailAndPassword(auth, email, PASSWORD);
    uid = cred.user.uid;
    console.log('EXISTS uid=' + uid + ' (re-using)');
  } else {
    console.error('AUTH ERR:', e.code || e.message);
    process.exit(1);
  }
}

const ref = doc(db, 'users', uid);
const snap = await getDoc(ref);
await setDoc(
  ref,
  {
    phone: '+' + fullDigits,
    firstName: 'ທົດສອບ',
    lastName: 'ແອັດມິນ',
    name: 'ທົດສອບ ແອັດມິນ',
    roles: ['customer', 'technician', 'shop'],
    isSuperAdmin: true,
    status: 'approved',
    language: 'lo',
    ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    updatedAt: serverTimestamp(),
  },
  { merge: true },
);

console.log('PROFILE ok');
console.log('--- LOGIN ---');
console.log('phone (8 digits): ' + PHONE8);
console.log('password: ' + PASSWORD);
console.log('email: ' + email);
process.exit(0);
