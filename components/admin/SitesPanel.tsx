import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { router } from 'expo-router';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { colors, font, radius } from '@/lib/theme';
import { useTT } from '@/lib/i18n';
import DynamicFields from '@/components/DynamicFields';
import {
  componentSurface,
  createSite,
  deleteSite,
  updateSite,
  watchAllSites,
  type RoomComponent,
  type Site,
  type SiteRoom,
} from '@/lib/sites';
import { watchSiteConfig, formatFieldValue, DEFAULT_SITE_CONFIG, type SiteConfig } from '@/lib/siteConfig';

interface MiniUser { uid: string; name: string; phone?: string }

function userLabel(d: any): string {
  return d?.name || [d?.firstName, d?.lastName].filter(Boolean).join(' ') || d?.phone || 'ຜູ້ໃຊ້';
}

/** Small client-side user search (loads a bounded slice once, filters locally). */
function UserSearch({ onPick, placeholder }: { onPick: (u: MiniUser) => void; placeholder: string }) {
  const tt = useTT();
  const [all, setAll] = useState<MiniUser[] | null>(null);
  const [term, setTerm] = useState('');
  useEffect(() => {
    getDocs(query(collection(db, 'users'), limit(400)))
      .then((snap) => setAll(snap.docs.map((d) => ({ uid: d.id, name: userLabel(d.data()), phone: (d.data() as any)?.phone }))))
      .catch(() => setAll([]));
  }, []);
  const results = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t || !all) return [];
    return all.filter((u) => u.name.toLowerCase().includes(t) || (u.phone ?? '').includes(t)).slice(0, 8);
  }, [term, all]);
  return (
    <View>
      <TextInput value={term} onChangeText={setTerm} placeholder={all ? placeholder : tt('admSites', 'ກຳລັງໂຫຼດ...')} placeholderTextColor="#999" style={styles.input} />
      {results.map((u) => (
        <Pressable key={u.uid} style={styles.searchRow} onPress={() => { onPick(u); setTerm(''); }}>
          <Text style={styles.searchName}>{u.name}</Text>
          {!!u.phone && <Text style={styles.searchPhone}>{u.phone}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

export default function SitesPanel() {
  const tt = useTT();
  const { fbUser, profile } = useAuth();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [cfg, setCfg] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [editing, setEditing] = useState<Site | 'new' | null>(null);

  useEffect(() => watchAllSites(setSites), []);
  useEffect(() => watchSiteConfig(setCfg), []);

  const adminName = profile?.name || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'admin';

  if (sites === null) return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.head}>
        <Text style={styles.h1}>{tt('admSites', '🏠 ຖານ ຂໍ້ມູນ ອາຄານ / ສະຖານທີ່')}</Text>
        <Pressable style={styles.addBtn} onPress={() => setEditing('new')}><Text style={styles.addBtnText}>{tt('admSites', '＋ ສ້າງ ໃໝ່')}</Text></Pressable>
      </View>
      <Text style={styles.sub}>{tt('admSites', 'ບັນທຶກ ອາຄານ + ຫ້ອງ ລະອຽດ · ຫ້ອງ ຖືກ ໃຊ້ ຕອນ ໂພສ ວຽກ (ຄຳນວນ BTU/ພື້ນທີ່)')}</Text>

      {sites.length === 0 && <Text style={styles.empty}>{tt('admSites', 'ຍັງ ບໍ່ ມີ ສະຖານທີ່ — ກົດ "＋ ສ້າງ ໃໝ່"')}</Text>}

      {sites.map((s) => {
        const bt = s.fields?.building?.buildingType;
        return (
          <Pressable key={s.id} style={styles.card} onPress={() => setEditing(s)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>🏠 {s.name}</Text>
              <Text style={styles.cardMeta}>{s.address || '—'} · 👤 {s.ownerName || '—'}</Text>
              <View style={styles.badges}>
                {!!bt && <Text style={styles.badge}>{bt}</Text>}
                <Text style={styles.badge}>{s.rooms.length} {tt('admSites', 'ຫ້ອງ')}</Text>
                {s.sharedWith.length > 0 && <Text style={styles.badge}>🔓 {s.sharedWith.length}</Text>}
              </View>
            </View>
            <Pressable style={styles.viewBtn} onPress={() => router.push(`/site/${s.id}` as any)}>
              <Text style={styles.viewBtnText}>{tt('admSites', 'ເບິ່ງ Dossier ›')}</Text>
            </Pressable>
          </Pressable>
        );
      })}

      {editing && (
        <SiteEditor
          site={editing === 'new' ? null : editing}
          cfg={cfg}
          adminUid={fbUser?.uid}
          adminName={adminName}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

function newRoom(cfg: SiteConfig): SiteRoom {
  return { id: `r${Date.now()}${Math.floor(Math.random() * 1000)}`, name: '', typeKey: cfg.roomTypes[0]?.key, fields: {}, components: [] };
}
function newComponent(cfg: SiteConfig): RoomComponent {
  return { id: `c${Date.now()}${Math.floor(Math.random() * 1000)}`, typeKey: cfg.componentTypes[0]?.key ?? 'other', fields: {} };
}

/** Site create/edit sheet. Pass `lockedOwner` (customer self-service) to fix the
 *  owner to that user and hide the owner search. */
export function SiteEditor({ site, cfg, adminUid, adminName, lockedOwner, onClose }: { site: Site | null; cfg: SiteConfig; adminUid?: string; adminName: string; lockedOwner?: { uid: string; name: string }; onClose: () => void }) {
  const tt = useTT();
  const [name, setName] = useState(site?.name ?? '');
  const [address, setAddress] = useState(site?.address ?? '');
  const [ownerId, setOwnerId] = useState(site?.ownerId ?? lockedOwner?.uid ?? '');
  const [ownerName, setOwnerName] = useState(site?.ownerName ?? lockedOwner?.name ?? '');
  const [fields, setFields] = useState<Record<string, Record<string, any>>>(site?.fields ?? {});
  const [rooms, setRooms] = useState<SiteRoom[]>(site?.rooms ?? []);
  const [sharedWith, setSharedWith] = useState<string[]>(site?.sharedWith ?? []);
  const [sharedNames, setSharedNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const setSection = (secKey: string, next: Record<string, any>) => setFields((prev) => ({ ...prev, [secKey]: next }));

  const save = async () => {
    if (!name.trim()) { setErr(tt('admSites', 'ຕ້ອງ ໃສ່ ຊື່ ສະຖານທີ່')); return; }
    if (!ownerId) { setErr(tt('admSites', 'ຕ້ອງ ເລືອກ ເຈົ້າຂອງ')); return; }
    setSaving(true); setErr('');
    try {
      const cleanRooms = rooms.filter((r) => r.name.trim());
      if (site) {
        await updateSite(site.id, { name: name.trim(), address: address.trim() || undefined, ownerId, ownerName, fields, rooms: cleanRooms, sharedWith }, adminName);
      } else {
        await createSite({ name: name.trim(), address: address.trim() || undefined, ownerId, ownerName, createdBy: adminUid, createdByName: adminName, fields, rooms: cleanRooms, sharedWith });
      }
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? String(e)); setSaving(false);
    }
  };

  const remove = async () => {
    if (!site) return;
    if (typeof window !== 'undefined' && !window.confirm(tt('admSites', 'ລຶບ ສະຖານທີ່ ນີ້?'))) return;
    setSaving(true);
    try { await deleteSite(site.id); onClose(); } catch (e: any) { setErr(e?.message ?? String(e)); setSaving(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHd}>
            <Text style={styles.sheetTitle}>{site ? tt('admSites', 'ແກ້ໄຂ ສະຖານທີ່') : tt('admSites', 'ສ້າງ ສະຖານທີ່ ໃໝ່')}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={styles.x}>✕</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40, gap: 4 }}>
            <Text style={styles.label}>{tt('admSites', 'ຊື່ ເອີ້ນ ສະຖານທີ່')}</Text>
            <TextInput value={name} onChangeText={setName} placeholder={tt('admSites', 'ບ້ານ ພັກ ຄຳແສນ')} placeholderTextColor="#999" style={styles.input} />
            <Text style={styles.label}>{tt('admSites', 'ທີ່ຢູ່')}</Text>
            <TextInput value={address} onChangeText={setAddress} placeholder={tt('admSites', 'ບ້ານ ເມືອງ ແຂວງ')} placeholderTextColor="#999" style={styles.input} />

            {!lockedOwner && (
              <>
                <Text style={styles.label}>{tt('admSites', 'ເຈົ້າຂອງ (ລູກຄ້າ)')}</Text>
                {ownerId ? (
                  <View style={styles.ownerChip}>
                    <Text style={styles.ownerName}>👤 {ownerName || ownerId}</Text>
                    <Pressable onPress={() => { setOwnerId(''); setOwnerName(''); }}><Text style={styles.clearOwner}>{tt('admSites', 'ປ່ຽນ')}</Text></Pressable>
                  </View>
                ) : (
                  <UserSearch placeholder={tt('admSites', 'ຄົ້ນ ຊື່ / ເບີ ໂທ')} onPick={(u) => { setOwnerId(u.uid); setOwnerName(u.name); }} />
                )}
              </>
            )}

            {/* dynamic sections */}
            {cfg.sections.map((sec) => (
              <View key={sec.key} style={styles.secCard}>
                <Text style={styles.secTitle}>{sec.icon ? sec.icon + ' ' : ''}{sec.label}</Text>
                <DynamicFields fields={sec.fields} values={fields[sec.key] ?? {}} onChange={(next) => setSection(sec.key, next)} />
              </View>
            ))}

            {/* rooms */}
            <View style={styles.secCard}>
              <View style={styles.head}>
                <Text style={styles.secTitle}>🚪 {tt('admSites', 'ຫ້ອງ')} ({rooms.length})</Text>
                <Pressable style={styles.smallBtn} onPress={() => setRooms((r) => [...r, newRoom(cfg)])}><Text style={styles.smallBtnText}>{tt('admSites', '＋ ຫ້ອງ')}</Text></Pressable>
              </View>
              {rooms.map((room, idx) => (
                <View key={room.id} style={styles.roomCard}>
                  <View style={styles.head}>
                    <TextInput
                      value={room.name}
                      onChangeText={(t) => setRooms((rs) => rs.map((r, i) => i === idx ? { ...r, name: t } : r))}
                      placeholder={tt('admSites', 'ຊື່ ຫ້ອງ (ເຊັ່ນ ຫ້ອງ ນອນ ໃຫຍ່)')}
                      placeholderTextColor="#999"
                      style={[styles.input, { flex: 1 }]}
                    />
                    <Pressable onPress={() => setRooms((rs) => rs.filter((_, i) => i !== idx))} hitSlop={8}><Text style={styles.del}>🗑</Text></Pressable>
                  </View>
                  <View style={[styles.chips, { marginTop: 6 }]}>
                    {cfg.roomTypes.map((rt) => {
                      const on = room.typeKey === rt.key;
                      return (
                        <Pressable key={rt.key} style={[styles.chip, on && styles.chipOn]} onPress={() => setRooms((rs) => rs.map((r, i) => i === idx ? { ...r, typeKey: rt.key } : r))}>
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{rt.icon ? rt.icon + ' ' : ''}{rt.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <DynamicFields fields={cfg.roomFields} values={room.fields} onChange={(next) => setRooms((rs) => rs.map((r, i) => i === idx ? { ...r, fields: next } : r))} />

                  {/* Phase 2 — room components (floor/wall/door/ceiling) */}
                  <View style={styles.head}>
                    <Text style={styles.compHead}>🧩 {tt('admSites', 'ອົງປະກອບ')} ({(room.components ?? []).length})</Text>
                    <Pressable style={styles.smallBtn} onPress={() => setRooms((rs) => rs.map((r, i) => i === idx ? { ...r, components: [...(r.components ?? []), newComponent(cfg)] } : r))}>
                      <Text style={styles.smallBtnText}>{tt('admSites', '＋ ອົງປະກອບ')}</Text>
                    </Pressable>
                  </View>
                  {(room.components ?? []).map((comp, ci) => {
                    const surf = componentSurface(comp.typeKey, room);
                    const setComp = (patch: Partial<RoomComponent>) => setRooms((rs) => rs.map((r, i) => i === idx ? { ...r, components: (r.components ?? []).map((c, j) => j === ci ? { ...c, ...patch } : c) } : r));
                    return (
                      <View key={comp.id} style={styles.compCard}>
                        <View style={styles.head}>
                          <View style={[styles.chips, { flex: 1 }]}>
                            {cfg.componentTypes.map((ct) => {
                              const on = comp.typeKey === ct.key;
                              return (
                                <Pressable key={ct.key} style={[styles.chip, on && styles.chipOn]} onPress={() => setComp({ typeKey: ct.key })}>
                                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{ct.icon ? ct.icon + ' ' : ''}{ct.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                          <Pressable onPress={() => setRooms((rs) => rs.map((r, i) => i === idx ? { ...r, components: (r.components ?? []).filter((_, j) => j !== ci) } : r))} hitSlop={8}><Text style={styles.del}>🗑</Text></Pressable>
                        </View>
                        {surf !== undefined && <Text style={styles.surfHint}>📐 {tt('admSites', 'ພື້ນທີ່ ຜິວ')} ~{surf} {tt('admSites', 'ຕ.ມ (auto ຈາກ ຂະໜາດ ຫ້ອງ)')}</Text>}
                        <DynamicFields fields={cfg.componentFields} values={comp.fields} onChange={(next) => setComp({ fields: next })} />
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* permission gate */}
            <View style={styles.secCard}>
              <Text style={styles.secTitle}>{tt('admSites', '🔒 ໃຜ ເຫັນ ໄດ້ (ເຈົ້າຂອງ ອະນຸຍາດ)')}</Text>
              <Text style={styles.hint}>{tt('admSites', 'ເຈົ້າຂອງ + admin ເຫັນ ສະເໝີ. ເພີ່ມ ຊ່າງ / ຄົນ ອື່ນ ທີ່ ໄດ້ ຮັບ ອະນຸຍາດ:')}</Text>
              {sharedWith.map((uid) => (
                <View key={uid} style={styles.ownerChip}>
                  <Text style={styles.ownerName}>🔓 {sharedNames[uid] || uid}</Text>
                  <Pressable onPress={() => setSharedWith((a) => a.filter((x) => x !== uid))}><Text style={styles.clearOwner}>{tt('admSites', 'ຖອດ')}</Text></Pressable>
                </View>
              ))}
              <UserSearch placeholder={tt('admSites', 'ເພີ່ມ ຄົນ ທີ່ ອະນຸຍາດ ໃຫ້ ເຫັນ')} onPick={(u) => { if (!sharedWith.includes(u.uid)) { setSharedWith((a) => [...a, u.uid]); setSharedNames((m) => ({ ...m, [u.uid]: u.name })); } }} />
            </View>

            {!!err && <Text style={styles.err}>❌ {err}</Text>}
            <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? tt('admSites', 'ກຳລັງ ບັນທຶກ...') : tt('admSites', '💾 ບັນທຶກ')}</Text>
            </Pressable>
            {site && <Pressable style={styles.delBtn} onPress={remove}><Text style={styles.delBtnText}>{tt('admSites', 'ລຶບ ສະຖານທີ່')}</Text></Pressable>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  h1: { fontSize: font.lg, fontWeight: '800', color: colors.text },
  sub: { fontSize: font.xs, color: colors.text2 },
  addBtn: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md },
  addBtnText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  empty: { color: colors.text2, fontSize: font.sm, paddingVertical: 20, textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, gap: 8 },
  cardTitle: { fontSize: font.md, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: font.xs, color: colors.text2, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  badge: { fontSize: 12, fontWeight: '700', color: '#3730a3', backgroundColor: '#eef2ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  viewBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.md, backgroundColor: '#eff6ff' },
  viewBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  // editor
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '94%' },
  sheetHd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  sheetTitle: { fontSize: font.md, fontWeight: '800', color: colors.text },
  x: { fontSize: 15, color: colors.text2 },
  label: { fontSize: font.xs, color: colors.text2, marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, fontSize: font.md, color: colors.text, backgroundColor: colors.surface },
  secCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, marginTop: 12, gap: 4 },
  secTitle: { fontSize: font.sm, fontWeight: '800', color: colors.text },
  hint: { fontSize: font.xs, color: colors.text2, marginVertical: 4 },
  roomCard: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: radius.md, padding: 10, marginTop: 8 },
  compHead: { fontSize: font.xs, fontWeight: '800', color: colors.text, marginTop: 8 },
  compCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: radius.md, padding: 8, marginTop: 6 },
  surfHint: { fontSize: 12, fontWeight: '700', color: '#1e40af', backgroundColor: '#eff6ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text2 },
  chipTextOn: { color: colors.white },
  smallBtn: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md },
  smallBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  del: { fontSize: 15 },
  ownerChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0f9ff', borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6 },
  ownerName: { fontSize: font.sm, fontWeight: '600', color: colors.text },
  clearOwner: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  searchRow: { paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  searchName: { fontSize: font.sm, color: colors.text, fontWeight: '600' },
  searchPhone: { fontSize: font.xs, color: colors.text2 },
  err: { color: colors.error, fontSize: font.sm, marginTop: 10 },
  saveBtn: { backgroundColor: colors.primary, padding: 14, borderRadius: radius.md, alignItems: 'center', marginTop: 18 },
  saveBtnText: { color: colors.white, fontWeight: '800', fontSize: font.md },
  delBtn: { padding: 12, alignItems: 'center', marginTop: 4 },
  delBtnText: { color: colors.error, fontSize: font.sm, fontWeight: '600' },
});
