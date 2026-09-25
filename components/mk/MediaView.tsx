import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import PhotoPicker from '@/components/PhotoPicker';
import { useTT } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import { isMock } from '@/lib/mock';
import MockBadge from '@/components/MockBadge';
import {
  type MkAsset, type MkAssetInput, type MkAssetType,
  MK_ASSET_ICON, MK_ASSET_LABEL, MK_ASSET_TYPES,
  createMkAsset, deleteMkAsset, seedMkMarketingDocs, updateMkAsset, watchMkAssets,
} from '@/lib/mkAssets';

const blank = (): MkAssetInput => ({ title: '', type: 'image', url: '', thumb: '', tag: '', note: '' });

export default function MediaView() {
  const tt = useTT();
  const [items, setItems] = useState<MkAsset[]>([]);
  const [filter, setFilter] = useState<MkAssetType | 'all'>('all');
  const [editing, setEditing] = useState<MkAsset | null>(null);
  const [draft, setDraft] = useState<MkAssetInput | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => watchMkAssets(setItems), []);
  const shown = useMemo(() => (filter === 'all' ? items : items.filter((i) => i.type === filter)), [items, filter]);

  const openNew = () => { setEditing(null); setDraft(blank()); };
  const openEdit = (a: MkAsset) => { setEditing(a); setDraft({ ...a }); };
  const close = () => { setDraft(null); setEditing(null); };
  const open = (a: MkAsset) => { if (a.url && Platform.OS === 'web') { try { window.open(a.url, '_blank'); } catch { /* ignore */ } } };
  const save = async () => {
    if (!draft || !draft.title.trim() || !draft.url.trim()) return;
    setBusy(true);
    try { if (editing) await updateMkAsset(editing.id, draft); else await createMkAsset(draft); close(); }
    catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); }
  };
  const remove = async () => { if (!editing) return; setBusy(true); try { await deleteMkAsset(editing.id); close(); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };
  const seedDocs = async () => { setBusy(true); try { const n = await seedMkMarketingDocs(items.map((i) => i.title)); alert(n > 0 ? `${tt('mk', 'ໃສ່ ລິ້ງ ເອກະສານ ແລ້ວ')} (+${n})` : tt('mk', 'ມີ ຄົບ ແລ້ວ')); } catch (e: any) { alert(e?.message ?? String(e)); } finally { setBusy(false); } };

  return (
    <View style={{ gap: 12 }}>
      <Pressable style={[styles.docSeed, busy && { opacity: 0.5 }]} disabled={busy} onPress={seedDocs}>
        <Text style={styles.docSeedTx}>📄 {tt('mk', 'ໃສ່ ລິ້ງ ເອກະສານ ການ ຕະຫຼາດ (5)')}</Text>
      </Pressable>
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flex: 1 }}>
          {(['all', ...MK_ASSET_TYPES] as const).map((f) => (
            <Pressable key={f} style={[styles.fchip, filter === f && styles.fchipOn]} onPress={() => setFilter(f)}>
              <Text style={[styles.fchipTx, filter === f && styles.fchipTxOn]}>{f === 'all' ? tt('mk', 'ໝົດ') : `${MK_ASSET_ICON[f]} ${tt('mk', MK_ASSET_LABEL[f])}`}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable style={styles.addBtn} onPress={openNew}><Text style={styles.addTx}>+ {tt('mk', 'ເພີ່ມ')}</Text></Pressable>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}><Text style={{ fontSize: 34 }}>📁</Text><Text style={styles.emptyT}>{tt('mk', 'ຍັງ ບໍ່ ມີ ໄຟລ໌ / ລິ້ງ — ກົດ + ເພີ່ມ (ອັບ ຮູບ ຫຼື ວາງ ລິ້ງ ວີດີໂອ/ເອກະສານ)')}</Text></View>
      ) : (
        <View style={styles.grid}>
          {shown.map((a) => (
            <Pressable key={a.id} style={styles.tile} onPress={() => open(a)}>
              <View style={styles.thumb}>
                {a.type === 'image' || a.thumb ? <Image source={{ uri: a.thumb || a.url }} style={styles.thumbImg} resizeMode="cover" /> : <Text style={styles.thumbIcon}>{MK_ASSET_ICON[a.type]}</Text>}
                <Text style={styles.typeBadge}>{MK_ASSET_ICON[a.type]}</Text>
              </View>
              <Text style={styles.tileTitle} numberOfLines={1}>{a.title}</Text>
              {isMock(a) && <MockBadge small />}
              <View style={styles.tileFoot}>
                {!!a.tag && <Text style={styles.tag} numberOfLines={1}>{a.tag}</Text>}
                <Pressable onPress={() => openEdit(a)} hitSlop={8}><Text style={styles.editDot}>✏️</Text></Pressable>
              </View>
            </Pressable>
          ))}
          {shown.length === 0 && <Text style={styles.noneTx}>{tt('mk', 'ບໍ່ ມີ ໃນ ໝວດ ນີ້')}</Text>}
        </View>
      )}

      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={styles.modalHead}><Text style={styles.modalTitle}>{editing ? tt('mk', 'ແກ້ ໄຟລ໌') : tt('mk', 'ເພີ່ມ ໄຟລ໌ / ລິ້ງ')}</Text><Pressable onPress={close} hitSlop={8}><Text style={styles.x}>✕</Text></Pressable></View>
            {draft && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <Field label={tt('mk', 'ຊື່')}><TextInput style={styles.input} value={draft.title} onChangeText={(t) => setDraft({ ...draft, title: t })} placeholder={tt('mk', 'ເຊັ່ນ ກ່ອນ-ຫຼັງ ລ້າງ ແອ #1')} placeholderTextColor="#9ca3af" /></Field>
                <Field label={tt('mk', 'ປະເພດ')}>
                  <View style={styles.seg}>
                    {MK_ASSET_TYPES.map((tp) => <Pressable key={tp} style={[styles.segItem, draft.type === tp && styles.segItemOn]} onPress={() => setDraft({ ...draft, type: tp })}><Text style={[styles.segTx, draft.type === tp && styles.segTxOn]}>{MK_ASSET_ICON[tp]} {tt('mk', MK_ASSET_LABEL[tp])}</Text></Pressable>)}
                  </View>
                </Field>
                {draft.type === 'image' ? (
                  <Field label={tt('mk', 'ອັບ ຮູບ')}>
                    <PhotoPicker photos={draft.url ? [draft.url] : []} onChange={(u) => setDraft({ ...draft, url: u[0] ?? '' })} pathPrefix="mk/assets" max={1} />
                  </Field>
                ) : (
                  <>
                    <Field label={tt('mk', 'ລິ້ງ (URL)')}><TextInput style={styles.input} value={draft.url} onChangeText={(t) => setDraft({ ...draft, url: t })} placeholder="https://..." placeholderTextColor="#9ca3af" autoCapitalize="none" /></Field>
                    <Field label={tt('mk', 'ຮູບ ປົກ (URL, ບໍ່ ບັງຄັບ)')}><TextInput style={styles.input} value={draft.thumb} onChangeText={(t) => setDraft({ ...draft, thumb: t })} placeholder="https://... (thumbnail)" placeholderTextColor="#9ca3af" autoCapitalize="none" /></Field>
                  </>
                )}
                <Field label={tt('mk', 'ປ້າຍ (tag, ບໍ່ ບັງຄັບ)')}><TextInput style={styles.input} value={draft.tag} onChangeText={(t) => setDraft({ ...draft, tag: t })} placeholder={tt('mk', 'ເຊັ່ນ ແອ · ກ່ອນ-ຫຼັງ')} placeholderTextColor="#9ca3af" /></Field>
                <Field label={tt('mk', 'ໝາຍເຫດ')}><TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} value={draft.note} onChangeText={(t) => setDraft({ ...draft, note: t })} multiline placeholderTextColor="#9ca3af" /></Field>
                <Pressable style={[styles.saveBtn, (busy || !draft.title.trim() || !draft.url.trim()) && { opacity: 0.5 }]} disabled={busy || !draft.title.trim() || !draft.url.trim()} onPress={save}><Text style={styles.saveTx}>{busy ? tt('mk', 'ກຳລັງ ບັນທຶກ...') : tt('mk', 'ບັນທຶກ')}</Text></Pressable>
                {editing && <Pressable style={styles.delBtn} onPress={remove}><Text style={styles.delTx}>🗑 {tt('mk', 'ລຶບ')}</Text></Pressable>}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ gap: 6 }}><Text style={styles.flabel}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fchip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  fchipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  fchipTx: { fontSize: 12, fontWeight: '700', color: colors.text2 },
  fchipTxOn: { color: '#fff' },
  docSeed: { alignSelf: 'flex-start', backgroundColor: '#e7f0fb', borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 13 },
  docSeedTx: { color: colors.primary, fontWeight: '800', fontSize: 12.5 },
  addBtn: { backgroundColor: colors.secondary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  addTx: { color: '#fff', fontWeight: '800', fontSize: 13 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 50 },
  emptyT: { fontSize: 14, fontWeight: '700', color: colors.text2, textAlign: 'center', maxWidth: 340 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { width: 158, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' },
  thumb: { height: 104, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: '100%', height: '100%' },
  thumbIcon: { fontSize: 38 },
  typeBadge: { position: 'absolute', top: 6, left: 6, fontSize: 13, backgroundColor: 'rgba(255,255,255,.9)', borderRadius: 6, paddingHorizontal: 4, overflow: 'hidden' },
  tileTitle: { fontSize: 13, fontWeight: '700', color: colors.text, paddingHorizontal: 9, paddingTop: 8 },
  tileFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingBottom: 9, paddingTop: 4 },
  tag: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.text3 },
  editDot: { fontSize: 12 },
  noneTx: { textAlign: 'center', color: colors.text3, fontSize: 13, padding: 20, width: '100%' },
  // modal
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  x: { fontSize: 15, color: colors.text2, fontWeight: '700' },
  flabel: { fontSize: 12.5, fontWeight: '700', color: colors.text2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 11, fontSize: 14, color: colors.text, backgroundColor: colors.surface },
  seg: { flexDirection: 'row', gap: 6 },
  segItem: { flexGrow: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  segItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  segTx: { fontSize: 12, fontWeight: '700', color: colors.text2 },
  segTxOn: { color: '#fff' },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 11, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveTx: { color: '#fff', fontWeight: '800', fontSize: 15 },
  delBtn: { alignItems: 'center', paddingVertical: 10 },
  delTx: { color: colors.error, fontWeight: '700', fontSize: 13 },
});
