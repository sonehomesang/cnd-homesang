import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  // note: `query`/`where` no longer needed — the backfill now scans all users
} from 'firebase/firestore';
import { db } from './firebase';
import { publicArea } from './format';

// Vientiane-ish coordinates spread
const around = (i: number) => ({
  lat: 17.96 + (Math.sin(i * 1.3) * 0.06),
  lng: 102.6 + (Math.cos(i * 1.7) * 0.06),
});

const avatar = (k: string) => `https://i.pravatar.cc/150?u=hs-${k}`;

const CUSTOMERS = [
  ['ສົມພອນ', 'ວົງສະຫວັນ', '2055510001'],
  ['ນາງ ມະນີ', 'ໄຊຍະວົງ', '2055510002'],
  ['ບຸນທະວີ', 'ສຸພານຸວົງ', '2055510003'],
  ['ນາງ ດາວີ', 'ພົມມະຈັນ', '2055510004'],
  ['ຄຳໃບ', 'ສີສຸພັນ', '2055510005'],
  ['ນາງ ແສງດາ', 'ວິໄລພອນ', '2055510006'],
  ['ໄຊຊະນະ', 'ຈັນທະລາ', '2055510007'],
  ['ນາງ ພອນ', 'ກິ່ງສະຫວ່າງ', '2055510008'],
];

// [first, last, phone, specialties[], rating, reviewCount, bio]
const TECHS: [string, string, string, string[], number, number, string][] = [
  ['ສົມຊາຍ', 'ກໍ່ສ້າງດີ', '2077720001', ['electrical'], 4.8, 23, 'ຊ່າງໄຟຟ້າ ປະສົບການ 10 ປີ ຮັບເໝົາທຸກປະເພດ'],
  ['ບຸນມີ', 'ໄຟຟ້າດີ', '2077720002', ['electrical', 'aircon'], 4.5, 11, 'ຕິດຕັ້ງ-ສ້ອມແປງ ໄຟຟ້າ ແລະ ແອ'],
  ['ທອງສຸກ', 'ປະປາ', '2077720003', ['plumbing'], 4.9, 41, 'ຊ່າງປະປາ ມືອາຊີບ ບໍລິການ 24 ຊມ'],
  ['ວິໄຊ', 'ຊ່າງແອ', '2077720004', ['aircon'], 4.6, 18, 'ລ້າງ-ສ້ອມ-ຕິດຕັ້ງ ແອ ທຸກຍີ່ຫໍ້'],
  ['ຄຳຫຼ້າ', 'ຊ່າງໄມ້', '2077720005', ['carpenter'], 4.7, 29, 'ເຟີນິເຈີ ໄມ້ ສັ່ງເຮັດຕາມແບບ'],
  ['ສີທອງ', 'ທາສີ', '2077720006', ['painter'], 4.3, 7, 'ທາສີ ເຮືອນ-ອາຄານ ໃນ-ນອກ'],
  ['ພູວົງ', 'ກໍ່ສ້າງ', '2077720007', ['construction'], 4.8, 33, 'ຮັບເໝົາກໍ່ສ້າງ ຕໍ່ເຕີມ ປັບປຸງ'],
  ['ນາງ ລັດດາ', 'ສະອາດດີ', '2077720008', ['cleaning'], 4.9, 52, 'ບໍລິການທຳຄວາມສະອາດ ເຮືອນ-ຫ້ອງການ'],
];

export async function seedMockUsersIfEmpty(): Promise<number> {
  const marker = await getDoc(doc(db, 'users', 'mock-tech-1'));
  if (marker.exists()) return 0;

  const batch = writeBatch(db);
  let n = 0;

  CUSTOMERS.forEach(([first, last, phone], i) => {
    const { lat, lng } = around(i);
    batch.set(doc(db, 'users', `mock-cust-${i + 1}`), {
      firstName: first,
      lastName: last,
      name: `${first} ${last}`,
      phone: `+85620${phone.slice(2)}`,
      roles: ['customer'],
      status: 'approved',
      language: 'lo',
      image: avatar(`cust-${i}`),
      lat,
      lng,
      createdAt: Date.now() - i * 86400000,
      creationMethod: 'seed',
    });
    n++;
  });

  TECHS.forEach(([first, last, phone, specialties, rating, reviewCount, bio], i) => {
    const { lat, lng } = around(i + 3);
    batch.set(doc(db, 'users', `mock-tech-${i + 1}`), {
      firstName: first,
      lastName: last,
      name: `${first} ${last}`,
      phone: `+85620${phone.slice(2)}`,
      roles: ['customer', 'technician'],
      status: 'approved',
      language: 'lo',
      image: avatar(`tech-${i}`),
      specialties,
      rating,
      reviewCount,
      bio,
      lat,
      lng,
      createdAt: Date.now() - i * 86400000,
      creationMethod: 'seed',
    });
    n++;
  });

  await batch.commit();
  return n;
}

/**
 * Mirror every technician's public-safe fields into the world-readable
 * `techCards` collection (idempotent — safe to run repeatedly). Lets logged-out
 * visitors browse technicians without exposing the private `users` docs. Admin
 * only (reads all users); auto-runs from the admin Users panel.
 */
export async function backfillTechCards(): Promise<number> {
  // ONE admin pass over EVERY user (admin can read all): populate the public
  // projections so nothing needs to read another person's private users doc.
  //   • userCards   — everyone (name/image/referralCode)
  //   • techCards   — technicians (public showcase, coarse area)
  //   • techContact — technicians (full service address, signed-in read)
  const snap = await getDocs(collection(db, 'users'));
  // keep in step with syncTechCard() — public-safe only, never phone/email/address
  const safe = ['image', 'rating', 'reviewCount', 'specialties', 'roleDescription',
    'portfolio', 'workSchedule', 'lat', 'lng', 'createdAt'] as const;
  const batch = writeBatch(db);
  let n = 0; // technician cards written (return value kept for the admin panel)
  snap.forEach((d) => {
    const u = d.data() as any;
    const name = u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || 'ຜູ້ໃຊ້';

    // userCards — for EVERY user
    const uc: Record<string, unknown> = { uid: d.id, name, updatedAt: Date.now() };
    if (u.image !== undefined) uc.image = u.image;
    if (u.referralCode !== undefined) uc.referralCode = u.referralCode;
    batch.set(doc(db, 'userCards', d.id), uc, { merge: true });

    if (!(u.roles ?? []).includes('technician')) return;
    // techCards — technician public showcase (coarse area only)
    const card: Record<string, unknown> = { uid: d.id, name, updatedAt: Date.now() };
    for (const k of safe) if (u[k] !== undefined) card[k] = u[k];
    card.area = publicArea(u.address);   // district/province only
    card.address = deleteField();        // scrub any full address published earlier
    batch.set(doc(db, 'techCards', d.id), card, { merge: true });
    // techContact — technician full service address (signed-in read)
    const contact: Record<string, unknown> = { uid: d.id, updatedAt: Date.now() };
    if (u.address !== undefined) contact.address = u.address;
    if (u.lat !== undefined) contact.lat = u.lat;
    if (u.lng !== undefined) contact.lng = u.lng;
    batch.set(doc(db, 'techContact', d.id), contact, { merge: true });
    n++;
  });
  if (snap.size) await batch.commit();
  return n;
}
