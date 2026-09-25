import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { stampMock } from './mock';

/**
 * MK Plan · Partner CRM — the `mkPartners` collection. The recruitment pipeline
 * for technicians / shops / brokers: lead → contacted → talking → signed →
 * active (or lost). Ties to the GTM supply-seeding plan. Gated to the marketing
 * role (firestore.rules isMarketing()).
 */
export type MkPartnerType = 'tech' | 'shop' | 'broker';
export type MkPartnerStage = 'lead' | 'contacted' | 'talking' | 'signed' | 'active' | 'lost';

export interface MkPartner {
  id: string;
  name: string;
  type: MkPartnerType;
  stage: MkPartnerStage;
  phone?: string;
  area?: string;
  trade?: string;       // ຊ່າງ trade / ຮ້ານ kind
  note?: string;
  nextAction?: string;  // the next follow-up step
  owner?: string;       // team member handling it
  createdAt: number;
  updatedAt?: number;
  __mock?: boolean;
}

export const MK_PARTNER_TYPE_LABEL: Record<MkPartnerType, string> = { tech: '🔧 ຊ່າງ', shop: '🏪 ຮ້ານ', broker: '📣 ນາຍໜ້າ' };
export const MK_STAGE_LABEL: Record<MkPartnerStage, string> = {
  lead: 'ລາຍຊື່', contacted: 'ຕິດຕໍ່ ແລ້ວ', talking: 'ກຳລັງ ຄຸຍ', signed: 'ສະໝັກ ແລ້ວ', active: 'ໃຊ້ ງານ ຈິງ', lost: 'ບໍ່ ສຳເລັດ',
};
// pipeline order (lost sits outside the funnel)
export const MK_STAGE_FLOW: MkPartnerStage[] = ['lead', 'contacted', 'talking', 'signed', 'active'];
export const MK_STAGE_ALL: MkPartnerStage[] = [...MK_STAGE_FLOW, 'lost'];

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function map(id: string, d: any): MkPartner {
  return {
    id, name: d.name ?? '', type: d.type ?? 'tech', stage: d.stage ?? 'lead', phone: d.phone, area: d.area,
    trade: d.trade, note: d.note, nextAction: d.nextAction, owner: d.owner, createdAt: ms(d.createdAt), updatedAt: d.updatedAt ? ms(d.updatedAt) : undefined, __mock: !!d.__mock,
  };
}
function strip<T extends Record<string, any>>(o: T): Partial<T> {
  const out: any = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v; return out;
}

export function watchMkPartners(cb: (list: MkPartner[]) => void) {
  return onSnapshot(query(collection(db, 'mkPartners')),
    (s) => cb(s.docs.map((d) => map(d.id, d.data())).sort((a, b) => b.createdAt - a.createdAt)),
    (e) => { console.error('watchMkPartners:', e); cb([]); });
}

export type MkPartnerInput = Omit<MkPartner, 'id' | 'createdAt' | 'updatedAt'>;
export async function createMkPartner(input: MkPartnerInput) { await addDoc(collection(db, 'mkPartners'), strip({ ...input, createdAt: serverTimestamp() })); }
export async function updateMkPartner(id: string, patch: Partial<MkPartnerInput>) { await updateDoc(doc(db, 'mkPartners', id), strip({ ...patch, updatedAt: serverTimestamp() }) as any); }
export async function setMkPartnerStage(id: string, stage: MkPartnerStage) { await updateDoc(doc(db, 'mkPartners', id), { stage, updatedAt: serverTimestamp() }); }
export async function deleteMkPartner(id: string) { await deleteDoc(doc(db, 'mkPartners', id)); }

export async function seedMkPartnersSample(existing: number): Promise<number> {
  if (existing > 0) return 0;
  const items: MkPartnerInput[] = [
    { name: 'ອ້າຍ ສົມພອນ (ຊ່າງແອ)', type: 'tech', stage: 'active', trade: 'ແອ', area: 'ວຽງຈັນ · ໄຊເສດຖາ', phone: '2059xxxxxx', nextAction: 'ຂໍ ຮູບ ຜົນ ງານ ເພີ່ມ' },
    { name: 'ຮ້ານ ວັດສະດຸ ອານຸສາວະລີ', type: 'shop', stage: 'talking', trade: 'ວັດສະດຸ ກໍ່ສ້າງ', area: 'ວຽງຈັນ', phone: '021xxxxxx', nextAction: 'ນັດ ພົບ ຕັ້ງ ໜ້າ ຮ້ານ' },
    { name: 'ຊ່າງ ໄຟ ໂຊຊຽວ (FB)', type: 'tech', stage: 'contacted', trade: 'ໄຟຟ້າ', area: 'ວຽງຈັນ', nextAction: 'ໂທ ຕາມ' },
    { name: 'ຮ້ານ ອຸປະກອນ ໄຟຟ້າ ໂພນທັນ', type: 'shop', stage: 'lead', trade: 'ອຸປະກອນ ໄຟຟ້າ', area: 'ວຽງຈັນ', nextAction: 'ຫາ ເບີ ຕິດຕໍ່' },
    { name: 'KOL ຮີໂນເວດ ບ້ານ', type: 'broker', stage: 'lead', area: 'ອອນລາຍ', nextAction: 'ສົ່ງ ຂໍ້ ສະເໜີ ຄ່າ ແນະນຳ' },
  ];
  const batch = writeBatch(db);
  for (const it of items) batch.set(doc(collection(db, 'mkPartners')), strip(stampMock({ ...it, createdAt: serverTimestamp() })));
  await batch.commit();
  return items.length;
}
