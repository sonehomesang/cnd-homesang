import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import PhotoPicker from '@/components/PhotoPicker';
import IconPicker from '@/components/IconPicker';
import RichTextEditor from '@/components/RichTextEditor';
import { htmlToPlain } from '@/lib/richtext';
import CategoryIcon, { emojiOnly } from '@/components/CategoryIcon';
import { auth } from '@/lib/firebase';
import { deleteRecord, fieldType, type RecordDoc, saveRecord } from '@/lib/records';
import { type Role, watchRoles } from '@/lib/rbac';
import { setAdminTier, setUserRoles } from '@/lib/admin';
import { type AdminTier, getAdminTier } from '@/lib/adminTier';
import { useServiceCategories } from '@/lib/categories';
import { type UserGroup, watchUserGroups } from '@/lib/userGroups';
import { addCategory, type Category, type Unit, updateCategory, watchCategories, watchUnits } from '@/lib/refdata';
import { type Shop, watchShops } from '@/lib/shop';
import { type AdminUser, watchAllUsers } from '@/lib/admin';
import { syncTechCard } from '@/lib/users';
import { useTT } from '@/lib/i18n';

const READONLY = ['id', 'createdAt', 'updatedAt', '_creationTime', 'locationUpdatedAt'];
// fields written immediately (not via Save) — excluded from the form payload
const LIVE_KEYS = ['roles', 'isSuperAdmin'];

// `number` fields that are really percentages / ratings (vatRate, commissionPct,
// rating…): keep RAW numeric entry so decimals aren't lost and no comma is added.
// Everything else numeric (stock, counts, days, order) is safe to thousands-group.
const RATE_LIKE = /pct|percent|rate|rating|ratio/i;
const isRateLike = (key: string, label = '') => RATE_LIKE.test(key) || label.includes('%');

// account type (group + sub-type) is the single source → derive RBAC roles + flag
function deriveAccountRoles(group: string, subTypes: string[]): { roles: string[]; isSuperAdmin: boolean } {
  const has = (k: string) => subTypes.includes(k);
  switch (group) {
    case 'admin':
      if (has('cp')) return { roles: ['cp_admin'], isSuperAdmin: false };
      if (has('cs')) return { roles: ['cs_admin'], isSuperAdmin: false };
      return { roles: ['admin'], isSuperAdmin: true }; // super (default)
    case 'general': return { roles: ['customer'], isSuperAdmin: false };
    case 'technician': return { roles: ['technician'], isSuperAdmin: false };
    // corporation = companies + shops only: sells goods (shop). NOT a technician
    // (individual service providers live in the separate 'technician' group).
    case 'corporation': return { roles: ['shop'], isSuperAdmin: false };
    // legacy fallbacks (pre-4-group docs)
    case 'company': return { roles: ['technician'], isSuperAdmin: false };
    case 'seller': return { roles: ['shop'], isSuperAdmin: false };
    default: return { roles: [], isSuperAdmin: false };
  }
}

const CARRIER_LABEL: Record<string, string> = { self: '🏪 ຮ້ານສົ່ງເອງ', external: '🚚 ຂົນສົ່ງ ພາຍນອກ' };

const TIER_OPTS: { value: AdminTier; label: string }[] = [
  { value: null, label: '–' },
  { value: 'cs', label: '🎧 CS' },
  { value: 'cp', label: '🗂️ CP' },
  { value: 'super', label: '👑 Super' },
];

export type FieldKind =
  | 'text' | 'textarea' | 'richtext' | 'number' | 'bool' | 'date'
  | 'chips' | 'images' | 'avatar' | 'readonly' | 'select' | 'latlng'
  | 'multiselect' | 'tier' | 'identity' | 'money' | 'commissionRules' | 'distanceRates'
  | 'productCategory' | 'productSubCategory' | 'shopDelivery';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  options?: { value: string; label: string }[]; // for select/multiselect
  source?: 'roles' | 'specialties' | 'userGroups' | 'subTypes' | 'productCategories' | 'shops' | 'units' | 'users'; // dynamic options for select/multiselect
  usersGroup?: string; // for source:'users' select — filter the list to this account group (e.g. 'corporation')
  aspect?: [number, number]; // for avatar/images
  compact?: boolean; // avatar: icon-only buttons (space-saving)
  flex?: number; // column weight when in a multi-field row (default 1)
}

export interface FieldGroup {
  key: string;
  label: string; // tab label
  fields: (FieldSpec | FieldSpec[])[]; // an array = one row, multiple columns
}

function fmtDate(ms: any): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Config-driven grouped record editor (admin). Each FieldGroup is a tab; an
 * extra ⚙️ advanced tab catches any record field not declared in the config
 * plus raw JSON + add-new-field, so full CRUD on every field is preserved.
 * Reuse across panels by passing a per-collection group config.
 */
export default function GroupedRecordEditor({
  colName,
  record,
  groups,
  pathPrefix,
  canDelete,
  canEdit = true,
  canCreate = true,
  canTier,
  prefill,
  onClose,
}: {
  colName: string;
  record: RecordDoc | null;
  groups: FieldGroup[];
  pathPrefix?: string;
  canDelete?: boolean;
  canEdit?: boolean;
  canCreate?: boolean;
  canTier?: boolean; // show admin-tier control (super admins only)
  prefill?: Record<string, any>; // seed values when creating (record === null)
  onClose: () => void;
}) {
  const tt = useTT();
  // editing an existing record needs edit; a new one needs create
  const canSave = record ? canEdit : canCreate;
  const declaredKeys = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) {
      for (const row of g.fields) {
        const specs = Array.isArray(row) ? row : [row];
        for (const f of specs) {
          if (f.kind === 'latlng') { s.add('lat'); s.add('lng'); }
          else if (f.kind === 'identity') { ['firstName', 'lastName', 'gender', 'dob', 'image', 'email', 'phone', 'roles', 'name', 'specialties', 'isSuperAdmin'].forEach((k) => s.add(k)); }
          else if (f.kind === 'productCategory') { s.add('category'); s.add('categoryLao'); }
          else if (f.kind === 'productSubCategory') { s.add('subCategory'); }
          else s.add(f.key);
        }
      }
    }
    return s;
  }, [groups]);

  const init = useMemo(() => {
    const values: Record<string, any> = {};
    const jsonText: Record<string, string> = {};
    if (record) {
      for (const [k, v] of Object.entries(record)) {
        if (k === 'id') continue;
        const t = fieldType(v);
        if ((t === 'object' || (t === 'array' && !(v as any[]).every((x) => typeof x === 'string'))) && !declaredKeys.has(k)) {
          jsonText[k] = JSON.stringify(v, null, 2);
        } else {
          values[k] = v;
        }
      }
    } else if (prefill) {
      for (const [k, v] of Object.entries(prefill)) values[k] = v;
    }
    // users edited via the identity card use firstName/lastName; if a record only
    // has `name`, seed firstName so the admin can edit (and re-derive) the name
    if (colName === 'users' && values.name && !values.firstName && !values.lastName) {
      values.firstName = values.name;
    }
    // products authored before rich-text: seed the rich editor from the plain
    // description so existing content shows up (and isn't lost on save)
    if (values.description && !values.descriptionHtml) {
      values.descriptionHtml = String(values.description);
    }
    return { values, jsonText };
  }, [record, declaredKeys, prefill, colName]);

  const [values, setValues] = useState<Record<string, any>>(init.values);
  const [jsonText, setJsonText] = useState<Record<string, string>>(init.jsonText);
  const [adders, setAdders] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [tab, setTab] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // live-managed (write immediately): user roles + admin tier
  const [roleDocs, setRoleDocs] = useState<Role[]>([]);
  const [liveRoles, setLiveRoles] = useState<string[]>(Array.isArray(record?.roles) ? (record!.roles as string[]) : []);
  const [tierState, setTierState] = useState<AdminTier>(getAdminTier(record as any));
  const needsRoles = useMemo(
    () => groups.some((g) => g.fields.flat().some((f) => f.kind === 'multiselect' && f.source === 'roles')),
    [groups],
  );
  useEffect(() => {
    if (!needsRoles) return;
    return watchRoles(setRoleDocs);
  }, [needsRoles]);

  const roleOptions = roleDocs.filter((r) => r.type === 'user').map((r) => ({ value: r.name, label: `${r.icon ?? ''} ${r.nameLao}`.trim() }));
  const specialtyOptions = useServiceCategories().map((c) => ({ value: c.value as string, label: `${emojiOnly(c.icon)} ${c.lao}`.trim() }));

  const [groupDocs, setGroupDocs] = useState<UserGroup[]>([]);
  const needsGroups = useMemo(
    () => groups.some((g) => g.fields.flat().some((f) => f.source === 'userGroups' || f.source === 'subTypes' || f.kind === 'commissionRules')),
    [groups],
  );
  useEffect(() => {
    if (!needsGroups) return;
    return watchUserGroups(setGroupDocs);
  }, [needsGroups]);
  const groupOpts = groupDocs.filter((g) => g.active !== false).map((g) => ({ value: g.key, label: `${g.icon ?? ''} ${g.nameLao}`.trim() }));
  const subTypeOpts = (groupDocs.find((g) => g.key === values.group)?.subTypes ?? []).map((s) => ({ value: s.key, label: s.nameLao }));

  const [prodCatDocs, setProdCatDocs] = useState<Category[]>([]);
  const needsProdCats = useMemo(() => groups.some((g) => g.fields.flat().some((f) => f.source === 'productCategories' || f.kind === 'commissionRules' || f.kind === 'productCategory' || f.kind === 'productSubCategory')), [groups]);
  useEffect(() => {
    if (!needsProdCats) return;
    return watchCategories('product', setProdCatDocs);
  }, [needsProdCats]);
  const prodCatOpts = prodCatDocs.filter((c) => c.active !== false).map((c) => ({ value: c.id, label: `${emojiOnly(c.icon)} ${c.nameLao}`.trim() }));
  // quick add/edit product category (main + sub) inline from the product editor
  // — writes to the same `categories` collection as the ໝວດໝູ່ menu.
  const [showNewCat, setShowNewCat] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [newCat, setNewCat] = useState({ icon: '', lao: '', en: '' });
  const [newSub, setNewSub] = useState('');
  const [editSubKey, setEditSubKey] = useState<string | null>(null);
  const [editSubVal, setEditSubVal] = useState('');
  const saveProdCat = async () => {
    const lao = newCat.lao.trim();
    if (!lao) return;
    const en = newCat.en.trim() || lao;
    const icon = newCat.icon.trim() || '📦';
    if (editCatId) {
      await updateCategory(editCatId, { icon, nameLao: lao, nameEn: en });
    } else {
      await addCategory('product', icon, lao, en);
      set('subCategory', '');
    }
    set('category', en); set('categoryLao', lao);
    setNewCat({ icon: '', lao: '', en: '' }); setShowNewCat(false); setEditCatId(null);
  };
  const startEditCat = (c: Category) => {
    setNewCat({ icon: c.icon ?? '', lao: c.nameLao, en: c.nameEn }); setEditCatId(c.id); setShowNewCat(true);
  };
  const closeNewCat = () => { setShowNewCat(false); setEditCatId(null); setNewCat({ icon: '', lao: '', en: '' }); };
  const addProdSub = async (cat: Category) => {
    const lao = newSub.trim();
    if (!lao) return;
    const key = `sc_${Date.now().toString(36)}`;
    await updateCategory(cat.id, { subTypes: [...(cat.subTypes ?? []), { key, nameLao: lao }] });
    set('subCategory', key);
    setNewSub('');
  };
  const saveEditSub = async (cat: Category) => {
    if (!editSubKey) return;
    const val = editSubVal.trim();
    if (val) await updateCategory(cat.id, { subTypes: (cat.subTypes ?? []).map((s) => (s.key === editSubKey ? { ...s, nameLao: val } : s)) });
    setEditSubKey(null); setEditSubVal('');
  };

  const [unitDocs, setUnitDocs] = useState<Unit[]>([]);
  const needsUnits = useMemo(() => groups.some((g) => g.fields.flat().some((f) => f.source === 'units')), [groups]);
  useEffect(() => {
    if (!needsUnits) return;
    return watchUnits('product', setUnitDocs);
  }, [needsUnits]);
  const unitOpts = unitDocs.filter((u) => u.active !== false).map((u) => ({ value: u.nameLao, label: u.nameLao }));

  const [shopDocs, setShopDocs] = useState<Shop[]>([]);
  const needsShops = useMemo(() => groups.some((g) => g.fields.flat().some((f) => f.source === 'shops')), [groups]);
  useEffect(() => {
    if (!needsShops) return;
    return watchShops(setShopDocs);
  }, [needsShops]);
  const shopOpts = shopDocs.map((s) => ({ value: s.id, label: s.name }));

  const [userListDocs, setUserListDocs] = useState<AdminUser[]>([]);
  const needsUsers = useMemo(() => groups.some((g) => g.fields.flat().some((f) => f.source === 'users')), [groups]);
  useEffect(() => {
    if (!needsUsers) return;
    return watchAllUsers(setUserListDocs);
  }, [needsUsers]);
  const userListOpts = userListDocs.map((u) => ({ value: u.uid, label: `${u.name || u.firstName || u.phone || u.uid}` }));
  const [userSearch, setUserSearch] = useState<Record<string, string>>({});
  // users filtered to an account group (+ a search query) — for source:'users' dropdowns
  const userOptsFor = (groupKey?: string, q?: string) => {
    let list = userListDocs;
    if (groupKey) list = list.filter((u) => (u as any).group === groupKey || (groupKey === 'corporation' && ((u.roles ?? []) as string[]).includes('shop')));
    const query = (q ?? '').trim().toLowerCase();
    if (query) list = list.filter((u) => `${u.name ?? ''} ${u.firstName ?? ''} ${u.phone ?? ''}`.toLowerCase().includes(query));
    return list.map((u) => ({ value: u.uid, label: u.name || u.firstName || u.phone || u.uid }));
  };

  const toggleUserRole = (name: string) => {
    const next = liveRoles.includes(name) ? liveRoles.filter((r) => r !== name) : [...liveRoles, name];
    setLiveRoles(next);
    if (record?.id) setUserRoles(record.id, next);
  };
  const changeTier = (t: AdminTier) => {
    // mirror setAdminTier locally so the roles multiselect stays consistent
    const base = liveRoles.filter((r) => !['admin', 'cs_admin', 'cp_admin'].includes(r));
    const next = t === 'super' ? [...base, 'admin'] : t === 'cs' ? [...base, 'cs_admin'] : t === 'cp' ? [...base, 'cp_admin'] : base;
    setLiveRoles(next);
    setTierState(t);
    if (record?.id) setAdminTier(record.id, t);
  };

  const [detecting, setDetecting] = useState(false);
  const set = (k: string, v: any) => setValues((p) => ({ ...p, [k]: v }));
  const detectLoc = () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      setDetecting(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setValues((p) => ({ ...p, lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) }));
          setDetecting(false);
        },
        () => setDetecting(false),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }
  };
  const addChip = (k: string) => {
    const v = (adders[k] ?? '').trim();
    if (!v) return;
    set(k, [...(values[k] ?? []), v]);
    setAdders((p) => ({ ...p, [k]: '' }));
  };
  const rmChip = (k: string, i: number) => set(k, (values[k] ?? []).filter((_: any, idx: number) => idx !== i));

  const advancedKeys = record ? Object.keys(record).filter((k) => k !== 'id' && !declaredKeys.has(k) && !(k in jsonText)) : [];

  // admin uploads go under the acting admin's own folder so Storage owner
  // rules pass even when editing another user's record (pathPrefix kept for ref)
  void pathPrefix;
  const ppPrefix = `admin/${auth.currentUser?.uid ?? 'unknown'}/${colName}/${record?.id ?? 'new'}`;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(values)) {
        if (READONLY.includes(k) || LIVE_KEYS.includes(k)) continue; // roles/tier written live
        if (v !== undefined) out[k] = v;
      }
      for (const [k, txt] of Object.entries(jsonText)) {
        if (READONLY.includes(k)) continue;
        out[k] = JSON.parse(txt);
      }
      // keep the display `name` in sync with the edited first/last name
      if (values.firstName !== undefined || values.lastName !== undefined) {
        const combined = [values.firstName, values.lastName].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');
        if (combined) out.name = combined;
      }
      // account type drives RBAC: (re)derive roles + admin flag from group +
      // sub-types — but ONLY when the group or sub-types actually changed. Editing
      // any other field (email, shop link, location…) must never clobber an
      // existing user's roles / super-admin flag (that bug once demoted the owner).
      if (values.group) {
        const norm = (a: any) => JSON.stringify([...(Array.isArray(a) ? a : [])].sort());
        const groupChanged = (values.group ?? '') !== (record?.group ?? '');
        const subsChanged = norm(values.subTypes) !== norm(record?.subTypes);
        if (groupChanged || subsChanged) {
          const subs = Array.isArray(values.subTypes) ? values.subTypes : [];
          const d = deriveAccountRoles(values.group, subs);
          out.roles = d.roles;
          out.isSuperAdmin = d.isSuperAdmin;
        }
      }
      // keep the plain `description` (used on cards/search) in sync with the
      // rich-text body so both surfaces show the latest copy
      if (out.descriptionHtml !== undefined) out.description = htmlToPlain(String(out.descriptionHtml || ''));
      const savedId = await saveRecord(colName, record?.id ?? null, out);
      // keep the public technician card in sync (name/image/rating/specialties)
      if (colName === 'users' && savedId) { try { await syncTechCard(savedId); } catch { /* best-effort */ } }
      onClose();
    } catch (e: any) {
      setError(tt('admEditor','JSON ຜິດ ຫຼື error: ') + (e?.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!record) return;
    if (typeof confirm === 'function' && !confirm(tt('admEditor','ລົບ record ນີ້?'))) return;
    await deleteRecord(colName, record.id);
    onClose();
  };

  const renderField = (f: FieldSpec) => {
    if (f.kind === 'tier' && !canTier) return null;
    if (f.kind === 'identity') {
      return (
        <View key="identity" style={styles.idCard}>
          <View style={styles.idTop}>
            <PhotoPicker mode="avatarCompact" size={80} photos={values.image ? [values.image] : []} onChange={(u) => set('image', u[0])} pathPrefix={ppPrefix} aspect={[1, 1]} />
            <View style={styles.idInfo}>
              <View style={styles.row}>
                <TextInput value={String(values.firstName ?? '')} onChangeText={(x) => set('firstName', x)} placeholder={tt('admEditor','ຊື່')} placeholderTextColor="#999" style={[styles.in, { flex: 1 }]} />
                <TextInput value={String(values.lastName ?? '')} onChangeText={(x) => set('lastName', x)} placeholder={tt('admEditor','ນາມສະກຸນ')} placeholderTextColor="#999" style={[styles.in, { flex: 1 }]} />
              </View>
              <View style={styles.idChips}>
                {[{ v: 'male', l: tt('admEditor','ຊາຍ') }, { v: 'female', l: tt('admEditor','ຍິງ') }].map((o) => {
                  const on = values.gender === o.v;
                  return (
                    <Pressable key={o.v} style={[styles.opt, on && styles.optOn]} onPress={() => set('gender', o.v)}>
                      <Text style={[styles.optText, on && styles.optTextOn]}>{o.l}</Text>
                    </Pressable>
                  );
                })}
                {Platform.OS === 'web' ? (
                  // @ts-ignore web-only
                  <input type="date" value={fmtDate(values.dob)} onChange={(e: any) => set('dob', e.target.value ? Date.parse(e.target.value) : '')} style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 8, fontSize: 13, color: '#111', backgroundColor: '#fff', fontFamily: 'inherit' }} />
                ) : (
                  <TextInput value={fmtDate(values.dob)} onChangeText={(x) => set('dob', x ? Date.parse(x) : '')} placeholder={tt('admEditor','ປປປປ-ດດ-ວວ')} placeholderTextColor="#999" style={[styles.in, { width: 130 }]} />
                )}
              </View>
            </View>
          </View>
          <View style={styles.idMeta}>
            <Text style={styles.roleBadge} numberOfLines={1}>{(liveRoles.length ? liveRoles : [tt('admEditor','ຜູ້ໃຊ້')]).join(' · ')}</Text>
            <TextInput value={String(values.email ?? '')} onChangeText={(x) => set('email', x)} placeholder={tt('admEditor','✉️ ອີເມລ')} placeholderTextColor="#999" autoCapitalize="none" style={[styles.in, { flex: 1, minWidth: 140 }]} />
            <TextInput value={String(values.phone ?? '')} onChangeText={(x) => set('phone', x)} placeholder={tt('admEditor','📱 ເບີໂທ')} placeholderTextColor="#999" keyboardType="phone-pad" style={[styles.in, { flex: 1, minWidth: 120 }]} />
          </View>
        </View>
      );
    }
    if (f.kind === 'latlng') {
      return (
        <View key="latlng" style={styles.field}>
          <Text style={styles.lb}>{tt('admEditor','📍 ພິກັດຕຳແໜ່ງ')}</Text>
          <View style={styles.llRow}>
            {Platform.OS === 'web' && (
              <Pressable style={[styles.detectBtn, detecting && { opacity: 0.6 }]} onPress={detectLoc} disabled={detecting}>
                <Text style={styles.detectText} numberOfLines={1}>{detecting ? '...' : tt('admEditor','🎯 ກວດຫາ')}</Text>
              </Pressable>
            )}
            <TextInput value={String(values.lat ?? '')} onChangeText={(x) => set('lat', x === '' ? '' : Number(x))} placeholder="Latitude" placeholderTextColor="#999" keyboardType="numbers-and-punctuation" style={[styles.in, styles.llIn]} />
            <TextInput value={String(values.lng ?? '')} onChangeText={(x) => set('lng', x === '' ? '' : Number(x))} placeholder="Longitude" placeholderTextColor="#999" keyboardType="numbers-and-punctuation" style={[styles.in, styles.llIn]} />
          </View>
        </View>
      );
    }
    const v = values[f.key];
    const ro = f.kind === 'readonly' || READONLY.includes(f.key);
    return (
      <View key={f.key} style={styles.field}>
        <Text style={styles.lb}>{tt('admEditor', f.label)}</Text>
        {ro ? (
          <Text style={styles.roVal} numberOfLines={2}>{String(v ?? '—')}</Text>
        ) : f.kind === 'bool' ? (
          <Pressable style={[styles.toggle, v ? styles.tgOn : styles.tgOff]} onPress={() => set(f.key, !v)}><View style={styles.knob} /></Pressable>
        ) : f.kind === 'avatar' ? (
          <PhotoPicker mode={f.compact ? 'avatarIcons' : 'avatarButtons'} photos={v ? [v] : []} onChange={(u) => set(f.key, u[0])} pathPrefix={ppPrefix} aspect={f.aspect ?? [1, 1]} />
        ) : f.kind === 'images' ? (
          <PhotoPicker mode="grid" photos={Array.isArray(v) ? v : []} onChange={(u) => set(f.key, u)} pathPrefix={ppPrefix} max={12} />
        ) : f.kind === 'chips' ? (
          <>
            <View style={styles.chipWrap}>
              {(Array.isArray(v) ? v : []).map((it: string, i: number) => (
                <Pressable key={i} style={styles.chip} onPress={() => rmChip(f.key, i)}><Text style={styles.chipText}>{it} ✕</Text></Pressable>
              ))}
              {(!v || v.length === 0) && <Text style={styles.hint}>{tt('admEditor','ວ່າງ')}</Text>}
            </View>
            <View style={styles.row}>
              <TextInput value={adders[f.key] ?? ''} onChangeText={(x) => setAdders((p) => ({ ...p, [f.key]: x }))} placeholder={tt('admEditor','ເພີ່ມ')} placeholderTextColor="#999" style={[styles.in, { flex: 1 }]} />
              <Pressable style={styles.addBtn} onPress={() => addChip(f.key)}><Text style={styles.addBtnText}>+</Text></Pressable>
            </View>
          </>
        ) : f.kind === 'tier' ? (
          <View style={styles.chipWrap}>
            {TIER_OPTS.map((o) => {
              const on = tierState === o.value;
              return (
                <Pressable key={String(o.value)} style={[styles.opt, on && styles.optOn]} onPress={() => changeTier(o.value)}>
                  <Text style={[styles.optText, on && styles.optTextOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : f.kind === 'multiselect' ? (
          <View style={styles.chipWrap}>
            {(f.source === 'roles' ? roleOptions : f.source === 'specialties' ? specialtyOptions : f.source === 'subTypes' ? subTypeOpts : f.source === 'productCategories' ? prodCatOpts : (f.options ?? [])).map((o) => {
              const live = f.source === 'roles';
              const selected = live ? liveRoles : (Array.isArray(v) ? v : []);
              const on = selected.includes(o.value);
              return (
                <Pressable
                  key={o.value}
                  style={[styles.opt, on && styles.optOn]}
                  onPress={() => {
                    if (live) toggleUserRole(o.value);
                    else set(f.key, on ? selected.filter((x: string) => x !== o.value) : [...selected, o.value]);
                  }}>
                  <Text style={[styles.optText, on && styles.optTextOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : f.kind === 'select' && f.source === 'users' ? (
          // searchable dropdown (filtered to an account group) — for owner/user pickers
          <View>
            <View style={styles.ddCurrent}>
              <Text style={styles.ddCurrentText} numberOfLines={1}>{userListOpts.find((o) => o.value === v)?.label ?? tt('admEditor','— ຍັງ ບໍ່ ໄດ້ ເລືອກ —')}</Text>
              {!!v && <Pressable onPress={() => set(f.key, '')} hitSlop={8}><Text style={styles.ddClear}>✕</Text></Pressable>}
            </View>
            <TextInput
              value={userSearch[f.key] ?? ''}
              onChangeText={(x) => setUserSearch((p) => ({ ...p, [f.key]: x }))}
              placeholder={tt('admEditor','🔍 ຄົ້ນ ຊື່ / ເບີ ...')}
              placeholderTextColor="#999"
              style={styles.in}
            />
            {/* search-first: show rows only after the admin types (no full-list dump) */}
            {(userSearch[f.key] ?? '').trim() === '' ? (
              <Text style={styles.ddPrompt}>{tt('admEditor','🔍 ພິມ ຊື່ / ເບີ ເພື່ອ ຄົ້ນຫາ')}{f.usersGroup ? tt('admEditor',' (ສະເພາະ ກຸ່ມ ບໍລິສັດ-ຮ້ານຄ້າ)') : ''}</Text>
            ) : (
              <ScrollView style={styles.ddList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {userOptsFor(f.usersGroup, userSearch[f.key]).map((o) => {
                  const on = v === o.value;
                  return (
                    <Pressable key={o.value} style={[styles.ddRow, on && styles.ddRowOn]} onPress={() => { set(f.key, o.value); setUserSearch((p) => ({ ...p, [f.key]: '' })); }}>
                      <Text style={[styles.ddRowText, on && styles.ddRowTextOn]} numberOfLines={1}>{on ? '✓ ' : ''}{o.label}</Text>
                    </Pressable>
                  );
                })}
                {userOptsFor(f.usersGroup, userSearch[f.key]).length === 0 && (
                  <Text style={styles.hint}>{tt('admEditor','ບໍ່ ພົບ ຜູ້ໃຊ້')}{f.usersGroup ? tt('admEditor',' ໃນ ກຸ່ມ ນີ້') : ''}</Text>
                )}
              </ScrollView>
            )}
          </View>
        ) : f.kind === 'select' ? (
          <View style={styles.chipWrap}>
            {(f.source === 'userGroups' ? groupOpts : f.source === 'subTypes' ? subTypeOpts : f.source === 'shops' ? shopOpts : f.source === 'units' ? unitOpts : f.source === 'users' ? userListOpts : f.options ?? []).map((o) => {
              const on = v === o.value;
              return (
                <Pressable key={o.value} style={[styles.opt, on && styles.optOn]} onPress={() => { set(f.key, o.value); if (f.source === 'userGroups') set('subTypes', []); }}>
                  <Text style={[styles.optText, on && styles.optTextOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
            {f.source === 'subTypes' && subTypeOpts.length === 0 && <Text style={styles.hint}>{tt('admEditor','← ເລືອກ ກຸ່ມ ກ່ອນ')}</Text>}
            {f.source === 'userGroups' && groupOpts.length === 0 && <Text style={styles.hint}>{tt('admEditor','ກຳລັງໂຫຼດ ກຸ່ມ...')}</Text>}
            {f.source === 'shops' && shopOpts.length === 0 && <Text style={styles.hint}>{tt('admEditor','ຍັງບໍ່ມີ ຮ້ານ — ສ້າງ ຮ້ານ ກ່ອນ (＋ ສ້າງ ຮ້ານ)')}</Text>}
            {f.source === 'productCategories' && prodCatOpts.length === 0 && <Text style={styles.hint}>{tt('admEditor','ຍັງບໍ່ມີ ໝວດສິນຄ້າ — ສ້າງ ທີ່ 📂 ໝວດໝູ່')}</Text>}
          </View>
        ) : f.kind === 'productCategory' ? (
          <View>
            <View style={styles.chipWrap}>
              {prodCatDocs.filter((c) => c.active !== false).map((c) => {
                const on = values.category === c.nameEn;
                return (
                  <Pressable key={c.id} style={[styles.opt, on && styles.optOn]} onPress={() => { set('category', c.nameEn); set('categoryLao', c.nameLao); set('subCategory', ''); }}>
                    <Text style={[styles.optText, on && styles.optTextOn]}><CategoryIcon icon={c.icon} size={13} color={on ? '#fff' : '#374151'} /> {c.nameLao}</Text>
                  </Pressable>
                );
              })}
              <Pressable style={styles.addCatChip} onPress={() => (showNewCat ? closeNewCat() : setShowNewCat(true))}>
                <Text style={styles.addCatChipText}>{showNewCat && !editCatId ? tt('admEditor','✕ ຍົກເລີກ') : tt('admEditor','＋ ໝວດ ໃໝ່')}</Text>
              </Pressable>
              {(() => { const sel = prodCatDocs.find((c) => c.nameEn === values.category); return sel && !showNewCat ? (
                <Pressable style={styles.editCatChip} onPress={() => startEditCat(sel)}><Text style={styles.editCatChipText}>{tt('admEditor','✎ ແກ້ ໝວດ ນີ້')}</Text></Pressable>
              ) : null; })()}
            </View>
            {showNewCat && (
              <View style={styles.newCatBox}>
                <Text style={styles.newCatTitle}>{editCatId ? tt('admEditor','✎ ແກ້ ໝວດຫຼັກ') : tt('admEditor','＋ ໝວດຫຼັກ ໃໝ່')}</Text>
                <IconPicker value={newCat.icon} onPick={(ic) => setNewCat((p) => ({ ...p, icon: ic }))} />
                <View style={styles.row}>
                  <TextInput value={newCat.icon} onChangeText={(x) => setNewCat((p) => ({ ...p, icon: x }))} placeholder="📦" placeholderTextColor="#999" style={[styles.in, { width: 56, textAlign: 'center' }]} />
                  <TextInput value={newCat.lao} onChangeText={(x) => setNewCat((p) => ({ ...p, lao: x }))} placeholder={tt('admEditor','ຊື່ ໝວດ (ລາວ)')} placeholderTextColor="#999" style={[styles.in, { flex: 1 }]} />
                </View>
                <View style={styles.row}>
                  <TextInput value={newCat.en} onChangeText={(x) => setNewCat((p) => ({ ...p, en: x }))} placeholder={tt('admEditor','EN (ບໍ່ບັງຄັບ)')} placeholderTextColor="#999" style={[styles.in, { flex: 1 }]} />
                  <Pressable style={styles.addBtn} onPress={saveProdCat}><Text style={styles.addBtnText}>{editCatId ? '💾' : '＋'} {tt('admEditor','ບັນທຶກ')}</Text></Pressable>
                  {editCatId && <Pressable style={styles.cancelMini} onPress={closeNewCat}><Text style={styles.cancelMiniText}>✕</Text></Pressable>}
                </View>
                <Text style={styles.hint}>{tt('admEditor','ເກັບ ໃນ 📂 ໝວດໝູ່ ຄື ກັນ · ໂຊ ທຸກ ບ່ອນ ທັນທີ')}</Text>
              </View>
            )}
          </View>
        ) : f.kind === 'productSubCategory' ? (
          (() => {
            const cat = prodCatDocs.find((c) => c.nameEn === values.category);
            const subs = cat?.subTypes ?? [];
            return (
              <View>
                <View style={styles.chipWrap}>
                  {subs.map((s) => {
                    if (editSubKey === s.key && cat) {
                      return (
                        <View key={s.key} style={styles.addSubRow}>
                          <TextInput value={editSubVal} onChangeText={setEditSubVal} autoFocus placeholderTextColor="#999" style={[styles.in, { minWidth: 130 }]} onSubmitEditing={() => saveEditSub(cat)} />
                          <Pressable style={styles.addBtn} onPress={() => saveEditSub(cat)}><Text style={styles.addBtnText}>✓</Text></Pressable>
                          <Pressable style={styles.cancelMini} onPress={() => { setEditSubKey(null); setEditSubVal(''); }}><Text style={styles.cancelMiniText}>✕</Text></Pressable>
                        </View>
                      );
                    }
                    const on = values.subCategory === s.key;
                    return (
                      <View key={s.key} style={styles.subUnit}>
                        <Pressable style={[styles.opt, on && styles.optOn]} onPress={() => set('subCategory', s.key)}>
                          <Text style={[styles.optText, on && styles.optTextOn]}>{s.nameLao}</Text>
                        </Pressable>
                        <Pressable onPress={() => { setEditSubKey(s.key); setEditSubVal(s.nameLao); }} hitSlop={6}><Text style={styles.subEditIcon}>✎</Text></Pressable>
                      </View>
                    );
                  })}
                  {!values.category && <Text style={styles.hint}>{tt('admEditor','← ເລືອກ ໝວດຫຼັກ ກ່ອນ')}</Text>}
                </View>
                {values.category && cat && (
                  <View style={styles.addSubRow}>
                    <TextInput value={newSub} onChangeText={setNewSub} placeholder={tt('admEditor','＋ ໝວດຍ່ອຍ ໃໝ່')} placeholderTextColor="#999" style={[styles.in, { flex: 1 }]} onSubmitEditing={() => addProdSub(cat)} />
                    <Pressable style={styles.addBtn} onPress={() => addProdSub(cat)}><Text style={styles.addBtnText}>＋</Text></Pressable>
                  </View>
                )}
                {values.category && !cat && <Text style={styles.hint}>{tt('admEditor','ໝວດຫຼັກ ນີ້ ບໍ່ ພົບ — ບັນທຶກ ໝວດຫຼັກ ກ່ອນ')}</Text>}
              </View>
            );
          })()
        ) : f.kind === 'shopDelivery' ? (
          (() => {
            const shop = shopDocs.find((s) => s.id === values.shopId) as any;
            const carriers: string[] = shop?.deliveryCarriers ?? [];
            const selected: string[] = Array.isArray(v) ? v : [];
            return (
              <View style={styles.chipWrap}>
                {carriers.map((c) => {
                  const on = selected.includes(c);
                  return (
                    <Pressable key={c} style={[styles.opt, on && styles.optOn]} onPress={() => set(f.key, on ? selected.filter((x) => x !== c) : [...selected, c])}>
                      <Text style={[styles.optText, on && styles.optTextOn]}>{CARRIER_LABEL[c] ? tt('admEditor', CARRIER_LABEL[c]) : c}</Text>
                    </Pressable>
                  );
                })}
                {!values.shopId && <Text style={styles.hint}>{tt('admEditor','← ເລືອກ ຮ້ານ ກ່ອນ')}</Text>}
                {values.shopId && carriers.length === 0 && <Text style={styles.hint}>{tt('admEditor','ຮ້ານ ນີ້ ຍັງບໍ່ໄດ້ ຕັ້ງ ການຈັດສົ່ງ')}</Text>}
              </View>
            );
          })()
        ) : f.kind === 'date' ? (
          Platform.OS === 'web' ? (
            // @ts-ignore web-only input
            <input type="date" value={fmtDate(v)} onChange={(e: any) => set(f.key, e.target.value ? Date.parse(e.target.value) : '')} style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 9, fontSize: 14, color: '#111', backgroundColor: '#fff', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
          ) : (
            <TextInput value={fmtDate(v)} onChangeText={(x) => set(f.key, x ? Date.parse(x) : '')} placeholder={tt('admEditor','ປປປປ-ດດ-ວວ')} placeholderTextColor="#999" style={styles.in} />
          )
        ) : f.kind === 'commissionRules' ? (
          (() => {
            const rules: any[] = Array.isArray(v) ? v : [];
            // customer types = the app's user groups (excluding admin), + ທັງໝົດ
            const custOpts = [{ value: 'all', label: tt('admEditor','ທັງໝົດ') }, ...groupDocs.filter((g) => g.key !== 'admin' && g.active !== false).map((g) => ({ value: g.key, label: `${g.icon ?? ''} ${g.nameLao}`.trim() }))];
            const upd = (i: number, field: string, val: any) => set(f.key, rules.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
            const selStyle: any = { border: '1px solid #d1d5db', borderRadius: 8, padding: 7, fontSize: 13, color: '#111', backgroundColor: '#fff', fontFamily: 'inherit', flex: 1, minWidth: 0 };
            return (
              <View>
                {rules.map((r, i) => (
                  <View key={i} style={styles.ruleRow}>
                    {Platform.OS === 'web' ? (
                      <>
                        {/* @ts-ignore web select */}
                        <select value={r.category ?? ''} onChange={(e: any) => upd(i, 'category', e.target.value)} style={selStyle}>
                          <option value="">{tt('admEditor','ໝວດ: ທັງໝົດ')}</option>
                          {prodCatOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {/* @ts-ignore web select */}
                        <select value={r.customer ?? 'all'} onChange={(e: any) => upd(i, 'customer', e.target.value)} style={selStyle}>
                          {custOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </>
                    ) : (
                      <Text style={styles.hint}>{r.category || tt('admEditor','ທັງໝົດ')} · {r.customer || 'all'}</Text>
                    )}
                    <TextInput value={String(r.pct ?? '')} onChangeText={(x) => upd(i, 'pct', x === '' ? '' : Number(x))} placeholder="%" placeholderTextColor="#999" keyboardType="numeric" style={[styles.in, styles.rulePct]} />
                    <Pressable style={styles.ruleX} onPress={() => set(f.key, rules.filter((_, idx) => idx !== i))}><Text style={styles.ruleXText}>✕</Text></Pressable>
                  </View>
                ))}
                <Pressable style={styles.addRuleBtn} onPress={() => set(f.key, [...rules, { category: '', customer: 'all', pct: 0 }])}>
                  <Text style={styles.addRuleText}>{tt('admEditor','＋ ເພີ່ມ ອັດຕາ')}</Text>
                </Pressable>
                {rules.length === 0 && <Text style={styles.hint}>{tt('admEditor','ຍັງບໍ່ມີ — ກົດ ＋ ເພີ່ມ ອັດຕາ (ໝວດ × ລູກຄ້າ × %)')}</Text>}
              </View>
            );
          })()
        ) : f.kind === 'distanceRates' ? (
          (() => {
            const rates: any[] = Array.isArray(v) ? v : [];
            const upd = (i: number, field: string, val: any) => set(f.key, rates.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
            return (
              <View>
                {rates.map((r, i) => (
                  <View key={i} style={styles.ruleRow}>
                    <TextInput value={String(r.upToKm ?? '')} onChangeText={(x) => upd(i, 'upToKm', x === '' ? '' : Number(x))} placeholder={tt('admEditor','ເຖິງ (km)')} placeholderTextColor="#999" keyboardType="numeric" style={[styles.in, { flex: 1 }]} />
                    <TextInput value={r.fee === '' || r.fee == null ? '' : Number(r.fee).toLocaleString('en-US')} onChangeText={(x) => { const n = x.replace(/[^0-9]/g, ''); upd(i, 'fee', n === '' ? '' : Number(n)); }} placeholder={tt('admEditor','ຄ່າສົ່ງ (ກີບ)')} placeholderTextColor="#999" keyboardType="numeric" style={[styles.in, { flex: 1.3 }]} />
                    <Pressable style={styles.ruleX} onPress={() => set(f.key, rates.filter((_, idx) => idx !== i))}><Text style={styles.ruleXText}>✕</Text></Pressable>
                  </View>
                ))}
                <Pressable style={styles.addRuleBtn} onPress={() => set(f.key, [...rates, { upToKm: '', fee: 0 }])}><Text style={styles.addRuleText}>{tt('admEditor','＋ ເພີ່ມ ໄລຍະ')}</Text></Pressable>
                {rates.length === 0 && <Text style={styles.hint}>{tt('admEditor','ກົດ ＋ ເພີ່ມ — ໄລຍະ(km) × ຄ່າສົ່ງ')}</Text>}
              </View>
            );
          })()
        ) : f.kind === 'richtext' ? (
          <RichTextEditor value={String(v ?? '')} onChange={(html) => set(f.key, html)} placeholder={f.label} />
        ) : f.kind === 'money' ? (
          <TextInput
            value={v === '' || v == null ? '' : Number(v).toLocaleString('en-US')}
            onChangeText={(x) => { const n = x.replace(/[^0-9]/g, ''); set(f.key, n === '' ? '' : Number(n)); }}
            keyboardType="numeric"
            style={styles.in}
          />
        ) : f.kind === 'number' ? (
          isRateLike(f.key, f.label) ? (
            // percentage / rating — decimal-capable, never thousands-grouped
            <TextInput
              value={String(v ?? '')}
              onChangeText={(x) => set(f.key, x === '' ? '' : Number(x))}
              keyboardType="numeric"
              style={styles.in}
            />
          ) : (
            // money / quantity — group thousands live (mirrors the `money` kind)
            <TextInput
              value={v === '' || v == null ? '' : Number(v).toLocaleString('en-US')}
              onChangeText={(x) => { const n = x.replace(/[^0-9]/g, ''); set(f.key, n === '' ? '' : Number(n)); }}
              keyboardType="numeric"
              style={styles.in}
            />
          )
        ) : (
          <TextInput
            value={String(v ?? '')}
            onChangeText={(x) => set(f.key, x)}
            multiline={f.kind === 'textarea'}
            style={[styles.in, f.kind === 'textarea' && styles.area]}
          />
        )}
      </View>
    );
  };

  const TABS = [...groups.map((g) => tt('admEditor', g.label)), tt('admEditor','⚙️ ຂັ້ນສູງ')];
  const isAdv = tab === groups.length;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{record ? tt('admEditor','✎ ແກ້ໄຂ') : tt('admEditor','+ ສ້າງໃໝ່')} · {colName}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}><Text style={styles.closeTxt}>✕</Text></Pressable>
          </View>

          <View style={styles.tabBarWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
              {TABS.map((label, i) => (
                <Pressable key={i} style={[styles.tab, tab === i && styles.tabOn]} onPress={() => setTab(i)}>
                  <Text style={[styles.tabText, tab === i && styles.tabTextOn]} numberOfLines={1}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }}>
            {!isAdv && groups[tab]?.fields.map((row, ri) => {
              if (Array.isArray(row)) {
                return (
                  <View key={ri} style={styles.row}>
                    {row.map((f) => <View key={f.key} style={{ flex: f.flex ?? 1, minWidth: 0 }}>{renderField(f)}</View>)}
                  </View>
                );
              }
              return renderField(row);
            })}

            {isAdv && (
              <>
                <View style={styles.advNote}><Text style={styles.advNoteText}>{tt('admEditor','⚙️ field ທີ່ບໍ່ໄດ້ຈັດກຸ່ມ + JSON + ເພີ່ມ field ໃໝ່')}</Text></View>
                {advancedKeys.map((k) => {
                  const v = values[k];
                  const ro = READONLY.includes(k);
                  const t = fieldType(v);
                  return (
                    <View key={k} style={styles.field}>
                      <Text style={styles.lb}>{k} <Text style={styles.fType}>{ro ? 'read-only' : t}</Text></Text>
                      {ro ? <Text style={styles.roVal}>{String(v)}</Text>
                        : t === 'boolean' ? <Pressable style={[styles.toggle, v ? styles.tgOn : styles.tgOff]} onPress={() => set(k, !v)}><View style={styles.knob} /></Pressable>
                        : t === 'number' && !isRateLike(k) ? <TextInput value={v === '' || v == null ? '' : Number(v).toLocaleString('en-US')} onChangeText={(x) => { const n = x.replace(/[^0-9]/g, ''); set(k, n === '' ? '' : Number(n)); }} keyboardType="numeric" style={styles.in} />
                        : <TextInput value={String(v ?? '')} onChangeText={(x) => set(k, t === 'number' ? (x === '' ? '' : Number(x)) : x)} keyboardType={t === 'number' ? 'numeric' : 'default'} style={styles.in} />}
                    </View>
                  );
                })}
                {Object.keys(jsonText).map((k) => (
                  <View key={k} style={styles.field}>
                    <Text style={styles.lb}>{k} <Text style={styles.fType}>JSON</Text></Text>
                    <TextInput value={jsonText[k]} onChangeText={(x) => setJsonText((p) => ({ ...p, [k]: x }))} style={[styles.in, styles.json]} multiline />
                  </View>
                ))}
                <View style={styles.addFieldBox}>
                  <Text style={styles.lb}>{tt('admEditor','ເພີ່ມ field ໃໝ່')}</Text>
                  <View style={styles.row}>
                    <TextInput value={newKey} onChangeText={setNewKey} placeholder={tt('admEditor','ຊື່ field')} placeholderTextColor="#999" style={[styles.in, { flex: 1 }]} />
                    <TextInput value={newVal} onChangeText={setNewVal} placeholder={tt('admEditor','ຄ່າ')} placeholderTextColor="#999" style={[styles.in, { flex: 1 }]} />
                    <Pressable style={styles.addBtn} onPress={() => { if (newKey) { set(newKey, newVal); setNewKey(''); setNewVal(''); } }}><Text style={styles.addBtnText}>+</Text></Pressable>
                  </View>
                </View>
              </>
            )}

            {error !== '' && <Text style={styles.error}>❌ {error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            {canSave ? (
              <Pressable style={[styles.btn, styles.saveBtn]} onPress={save} disabled={saving}><Text style={styles.btnText}>{saving ? '...' : tt('admEditor','💾 ບັນທຶກ')}</Text></Pressable>
            ) : (
              <View style={[styles.btn, styles.roBadge]}><Text style={styles.roBadgeText}>{tt('admEditor','👁 ເບິ່ງ ຢ່າງ ດຽວ')}</Text></View>
            )}
            {record && canDelete && <Pressable style={[styles.btn, styles.delBtn]} onPress={del}><Text style={styles.delText}>{tt('admEditor','🗑️ ລົບ')}</Text></Pressable>}
            <Pressable style={[styles.btn, styles.cancel]} onPress={onClose}><Text style={styles.cancelText}>{tt('admEditor','ປິດ')}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef0f3' },
  title: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  closeTxt: { fontSize: 14, color: '#374151', fontWeight: '700' },
  tabBarWrap: { borderBottomWidth: 1, borderBottomColor: '#eef0f3' },
  tabBar: { gap: 4, paddingHorizontal: 12, paddingVertical: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' },
  tabOn: { backgroundColor: '#0066CC' },
  tabText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  tabTextOn: { color: '#fff' },
  body: { paddingHorizontal: 16, paddingTop: 6 },
  field: { marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  idCard: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 12, marginBottom: 12 },
  idTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  idInfo: { flex: 1, gap: 8 },
  idChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  idMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginTop: 10 },
  roleBadge: { fontSize: 12, fontWeight: '700', color: '#1d4ed8', backgroundColor: '#EAF2FB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  idPhone: { fontSize: 13, fontWeight: '600', color: '#111', marginLeft: 'auto' },
  lb: { fontSize: 12, color: '#4b5563', fontWeight: '600', marginBottom: 3 },
  subLb: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  ruleRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 },
  rulePct: { width: 64, textAlign: 'center' },
  ruleX: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  ruleXText: { color: '#dc2626', fontWeight: '700', fontSize: 13 },
  addRuleBtn: { borderWidth: 1, borderColor: '#0066CC', borderStyle: 'dashed', borderRadius: 8, paddingVertical: 9, alignItems: 'center', marginTop: 2 },
  addRuleText: { color: '#0066CC', fontSize: 13, fontWeight: '600' },
  llRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  llIn: { flex: 1, minWidth: 0 },
  detectBtn: { flex: 1.1, borderWidth: 1, borderColor: '#0066CC', backgroundColor: '#EAF2FB', borderRadius: 8, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  detectText: { color: '#0066CC', fontSize: 13, fontWeight: '600' },
  fType: { color: '#9ca3af', fontSize: 12, fontWeight: '400' },
  roVal: { fontSize: 12, color: '#9ca3af', padding: 9, backgroundColor: '#f3f4f6', borderRadius: 8, fontFamily: 'monospace' },
  in: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 9, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  area: { minHeight: 56, textAlignVertical: 'top' },
  json: { minHeight: 70, fontFamily: 'monospace', fontSize: 12, textAlignVertical: 'top' },
  toggle: { width: 44, height: 24, borderRadius: 12, padding: 2, flexDirection: 'row' },
  tgOn: { backgroundColor: '#16a34a', justifyContent: 'flex-end' },
  tgOff: { backgroundColor: '#cbd5e1', justifyContent: 'flex-start' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#bcd6f5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 12, color: '#0066CC', fontWeight: '600' },
  opt: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  optOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  optText: { fontSize: 12, color: '#374151' },
  optTextOn: { color: '#fff', fontWeight: '600' },
  addCatChip: { backgroundColor: '#ecfdf3', borderWidth: 1, borderColor: '#16a34a', borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  addCatChipText: { fontSize: 12, color: '#16a34a', fontWeight: '700' },
  editCatChip: { backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#0066CC', borderStyle: 'dashed', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  editCatChipText: { fontSize: 12, color: '#0066CC', fontWeight: '700' },
  newCatBox: { borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, gap: 8, marginTop: 8 },
  newCatTitle: { fontSize: 12, fontWeight: '700', color: '#111' },
  cancelMini: { backgroundColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center' },
  cancelMiniText: { color: '#6b7280', fontWeight: '700', fontSize: 13 },
  subUnit: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  subEditIcon: { fontSize: 13, color: '#0066CC', fontWeight: '700', paddingHorizontal: 2 },
  addSubRow: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' },
  ddCurrent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#bcd6f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 6 },
  ddCurrentText: { flex: 1, fontSize: 14, color: '#0066CC', fontWeight: '600' },
  ddClear: { fontSize: 14, color: '#dc2626', fontWeight: '700', paddingLeft: 8 },
  ddPrompt: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', paddingVertical: 8, paddingHorizontal: 2 },
  ddList: { maxHeight: 176, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, marginTop: 6, backgroundColor: '#fff' },
  ddRow: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  ddRowOn: { backgroundColor: '#EAF2FB' },
  ddRowText: { fontSize: 14, color: '#374151' },
  ddRowTextOn: { color: '#0066CC', fontWeight: '700' },
  addBtn: { backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 15 },
  hint: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic' },
  advNote: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 8, padding: 8, marginBottom: 10 },
  advNoteText: { fontSize: 12, color: '#9a3412' },
  addFieldBox: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12, marginTop: 4 },
  error: { color: '#c00', fontSize: 12, marginVertical: 8 },
  actions: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#eef0f3' },
  btn: { flex: 1, padding: 11, borderRadius: 8, alignItems: 'center' },
  saveBtn: { backgroundColor: '#0066CC' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  delBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dc2626' },
  delText: { color: '#dc2626', fontWeight: '600', fontSize: 13 },
  cancel: { backgroundColor: '#f3f4f6' },
  cancelText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  roBadge: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  roBadgeText: { color: '#6b7280', fontWeight: '600', fontSize: 13 },
});
