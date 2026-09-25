import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

/** A reusable delivery address saved on the user's account/profile. */
export interface SavedAddress {
  id: string;
  label?: string;        // ບ້ານ / ຫ້ອງການ / ອື່ນໆ
  address: string;       // full free-text address
  lat?: number;
  lng?: number;
  recipientName?: string;
  phone?: string;
}

/** Persist the full saved-address list on the user doc. Firestore rejects any
 * `undefined` field, so strip empty keys from each address before writing. */
export async function saveUserAddresses(uid: string, addresses: SavedAddress[]) {
  const clean = addresses.map((a) => {
    const o: Record<string, unknown> = { id: a.id, address: a.address };
    if (a.label) o.label = a.label;
    if (a.lat != null) o.lat = a.lat;
    if (a.lng != null) o.lng = a.lng;
    if (a.recipientName) o.recipientName = a.recipientName;
    if (a.phone) o.phone = a.phone;
    return o;
  });
  await updateDoc(doc(db, 'users', uid), { savedAddresses: clean, updatedAt: Date.now() });
}

/** Stable-ish local id for a new saved address. */
export function newAddressId(): string {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
