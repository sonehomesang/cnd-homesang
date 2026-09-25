import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { computeValue, formatFieldValue, type FieldDef, type SiteConfig } from './siteConfig';

/** One room-component (floor/wall/door/...) described via componentFields. */
export interface RoomComponent {
  id: string;
  typeKey: string;
  /** keyed by componentFields[].key */
  fields: Record<string, any>;
}

/** Audit entry — who did what to the site record, when (Phase 4). */
export interface SiteChange { at: number; by?: string; byName?: string; action: string; detail?: string }

/** Site-level uploaded evidence (photo/doc) (Phase 4). */
export interface SiteEvidence { url: string; caption?: string; by?: string; byName?: string; at: number }

/** A single room measured against siteConfig.roomFields. */
export interface SiteRoom {
  id: string;
  name: string;
  typeKey?: string;
  /** keyed by roomFields[].key */
  fields: Record<string, any>;
  /** Phase 2: floor/wall/ceiling/door components inside this room */
  components?: RoomComponent[];
}

export interface Site {
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  /** the customer who owns this property */
  ownerId: string;
  ownerName?: string;
  /** optional link to a company/org (B2B) — org members can view it */
  orgId?: string;
  /** admin uid that created the record */
  createdBy?: string;
  createdByName?: string;
  updatedByName?: string;
  /** section-level custom data: sectionKey → { fieldKey → value } */
  fields: Record<string, Record<string, any>>;
  rooms: SiteRoom[];
  /** uids the OWNER authorized to view/record (techs, family...) */
  sharedWith: string[];
  /** append-only audit trail — who edited what, when (Phase 4) */
  changeLog?: SiteChange[];
  /** site-level uploaded evidence (Phase 4) */
  evidence?: SiteEvidence[];
  createdAt: number;
  updatedAt?: number;
}

export interface CreateSiteInput {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  ownerId: string;
  ownerName?: string;
  createdBy?: string;
  createdByName?: string;
  fields?: Record<string, Record<string, any>>;
  rooms?: SiteRoom[];
  sharedWith?: string[];
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Recursively drop undefined — Firestore rejects it even nested in rooms/fields. */
function deepStrip<T>(v: T): T {
  if (Array.isArray(v)) return v.map(deepStrip) as any;
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const [k, val] of Object.entries(v)) if (val !== undefined) o[k] = deepStrip(val as any);
    return o;
  }
  return v;
}

function mapSite(id: string, data: any): Site {
  const out: any = { id };
  for (const [k, v] of Object.entries(data ?? {})) {
    out[k] = v instanceof Timestamp ? v.toMillis() : v;
  }
  out.fields = out.fields ?? {};
  out.rooms = Array.isArray(out.rooms) ? out.rooms : [];
  out.sharedWith = Array.isArray(out.sharedWith) ? out.sharedWith : [];
  out.changeLog = Array.isArray(out.changeLog) ? out.changeLog : [];
  out.evidence = Array.isArray(out.evidence) ? out.evidence : [];
  if (typeof out.createdAt !== 'number') out.createdAt = Date.now();
  return out as Site;
}

// ---------- reads ----------

/** All sites (admin registry list). */
export function watchAllSites(cb: (sites: Site[]) => void) {
  return onSnapshot(
    query(collection(db, 'sites'), orderBy('createdAt', 'desc')),
    (snap) => cb(snap.docs.map((d) => mapSite(d.id, d.data()))),
    () => cb([]),
  );
}

/** Sites owned by a given customer (for the job-post picker + "my properties"). */
export function watchSitesForOwner(ownerId: string, cb: (sites: Site[]) => void) {
  return onSnapshot(
    query(collection(db, 'sites'), where('ownerId', '==', ownerId)),
    (snap) => cb(snap.docs.map((d) => mapSite(d.id, d.data()))),
    () => cb([]),
  );
}

export function watchSite(id: string, cb: (site: Site | null) => void) {
  return onSnapshot(
    doc(db, 'sites', id),
    (snap) => cb(snap.exists() ? mapSite(snap.id, snap.data()) : null),
    () => cb(null),
  );
}

export async function fetchSite(id: string): Promise<Site | null> {
  try {
    const snap = await getDoc(doc(db, 'sites', id));
    return snap.exists() ? mapSite(snap.id, snap.data()) : null;
  } catch {
    return null;
  }
}

// ---------- writes ----------

/** Build a changeLog entry without undefined keys (Firestore rejects them). */
function change(action: string, opts: { by?: string; byName?: string; detail?: string; at?: number }): SiteChange {
  const c: any = { at: opts.at ?? Date.now(), action };
  if (opts.by) c.by = opts.by;
  if (opts.byName) c.byName = opts.byName;
  if (opts.detail) c.detail = opts.detail;
  return c;
}

export async function createSite(input: CreateSiteInput): Promise<string> {
  const ref = await addDoc(collection(db, 'sites'), {
    ...stripUndefined({
      name: input.name,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      ownerId: input.ownerId,
      ownerName: input.ownerName,
      createdBy: input.createdBy,
      createdByName: input.createdByName,
    }),
    fields: deepStrip(input.fields ?? {}),
    rooms: deepStrip(input.rooms ?? []),
    sharedWith: input.sharedWith ?? [],
    changeLog: [change('ສ້າງ ສະຖານທີ່', { by: input.createdBy, byName: input.createdByName })],
    evidence: [],
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSite(id: string, patch: Partial<Site>, byName?: string) {
  // diff against the current doc to record a human-readable audit entry
  const detail: string[] = [];
  try {
    const snap = await getDoc(doc(db, 'sites', id));
    if (snap.exists()) {
      const cur = mapSite(snap.id, snap.data());
      if (patch.name !== undefined && patch.name !== cur.name) detail.push('ຊື່');
      if (patch.address !== undefined && (patch.address ?? '') !== (cur.address ?? '')) detail.push('ທີ່ຢູ່');
      if (patch.fields !== undefined && JSON.stringify(patch.fields) !== JSON.stringify(cur.fields)) detail.push('ຂໍ້ມູນ ອາຄານ');
      if (patch.rooms !== undefined && JSON.stringify(patch.rooms) !== JSON.stringify(cur.rooms)) {
        const d = (patch.rooms?.length ?? 0) - cur.rooms.length;
        detail.push(d > 0 ? `ຫ້ອງ (+${d})` : d < 0 ? `ຫ້ອງ (${d})` : 'ຫ້ອງ');
      }
      if (patch.sharedWith !== undefined && JSON.stringify(patch.sharedWith) !== JSON.stringify(cur.sharedWith)) detail.push('ສິດ ເຫັນ');
    }
  } catch {}
  const clean: any = deepStrip(stripUndefined({ ...patch, updatedByName: byName } as any));
  clean.updatedAt = serverTimestamp();
  if (detail.length) clean.changeLog = arrayUnion(change('ແກ້ໄຂ', { byName, detail: detail.join(', ') }));
  await updateDoc(doc(db, 'sites', id), clean);
}

/** Attach a site-level evidence photo/doc + log it in the audit trail. */
export async function addSiteEvidence(id: string, ev: SiteEvidence) {
  const cleanEv: any = { url: ev.url, at: ev.at };
  if (ev.caption) cleanEv.caption = ev.caption;
  if (ev.by) cleanEv.by = ev.by;
  if (ev.byName) cleanEv.byName = ev.byName;
  await updateDoc(doc(db, 'sites', id), {
    evidence: arrayUnion(cleanEv),
    changeLog: arrayUnion(change('ເພີ່ມ ຫຼັກຖານ', { by: ev.by, byName: ev.byName, detail: ev.caption, at: ev.at })),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteSite(id: string) {
  await deleteDoc(doc(db, 'sites', id));
}

/** Grant / revoke a viewer (owner-controlled permission gate). */
export async function setSiteSharedWith(id: string, uids: string[]) {
  await updateDoc(doc(db, 'sites', id), { sharedWith: uids, updatedAt: serverTimestamp() });
}

// ---------- permission ----------

/**
 * Who may see a site's detailed data. Owner + admin always; anyone the owner
 * authorized via sharedWith. (Techs get added to sharedWith when the owner
 * grants access — see decision #2/#4.)
 */
export function canViewSite(site: Site | null, uid?: string | null, isAdmin = false): boolean {
  if (!site) return false;
  if (isAdmin) return true;
  if (!uid) return false;
  return site.ownerId === uid || site.sharedWith.includes(uid);
}

// ---------- room specs snapshot (for job posting) ----------

export interface RoomSpec { label: string; value: string }

/**
 * Snapshot a room's specs as label/value pairs so a posted job carries them to
 * the technician (dims, area, volume, wall, sun...). Computed fields resolved.
 */
export function roomSpecSnapshot(room: SiteRoom, roomFields: FieldDef[]): RoomSpec[] {
  return roomFields
    .map((f) => ({ label: f.label, value: formatFieldValue(f, room.fields ?? {}) }))
    .filter((r) => r.value !== '—');
}

/** area (ຕ.ມ) of a room if width×length known — for BOQ/quote hints. */
export function roomArea(room: SiteRoom, roomFields: FieldDef[]): number | undefined {
  const areaDef = roomFields.find((f) => f.key === 'area') ?? roomFields.find((f) => f.factors?.length === 2);
  if (!areaDef) return undefined;
  const v = computeValue(areaDef, room.fields ?? {});
  return typeof v === 'number' ? v : undefined;
}

export function siteConfigRoomFields(cfg: SiteConfig): FieldDef[] {
  return cfg.roomFields;
}

/**
 * Derive surface areas from a room's width/length/height so component work
 * (paint = wall+ceiling, tiling = floor) can be quantified for BOQ/quotes.
 * floor = w×l · wall = 2(w+l)×h · ceiling = w×l. Returns undefined when dims
 * are missing. Uses the default width/length/height keys.
 */
export function roomSurfaces(room: SiteRoom): { floor?: number; wall?: number; ceiling?: number } {
  const w = Number(room.fields?.width);
  const l = Number(room.fields?.length);
  const h = Number(room.fields?.height);
  const round = (n: number) => Math.round(n * 100) / 100;
  const floor = w > 0 && l > 0 ? round(w * l) : undefined;
  const wall = w > 0 && l > 0 && h > 0 ? round(2 * (w + l) * h) : undefined;
  return { floor, wall, ceiling: floor };
}

/** default surface (ຕ.ມ) a component type maps to, for the auto hint. */
export function componentSurface(typeKey: string, room: SiteRoom): number | undefined {
  const s = roomSurfaces(room);
  if (typeKey === 'floor') return s.floor;
  if (typeKey === 'wall') return s.wall;
  if (typeKey === 'ceiling') return s.ceiling;
  return undefined;
}
