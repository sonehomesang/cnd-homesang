import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  type ClipTopic,
  type LearnClip,
  type VideoSource,
  createLearnClip,
  deleteLearnClip,
  detectSource,
  seedLearnClipsIfEmpty,
  SOURCE_LABEL,
  TOPIC_LABEL,
  updateLearnClip,
  watchAllLearnClips,
} from '@/lib/learnClips';
import { uploadVideo } from '@/lib/storage';
import PhotoPicker from '@/components/PhotoPicker';
import { useSectionPerms } from '@/lib/permissions-context';
import { useTT } from '@/lib/i18n';

interface Form {
  title: string; topic: ClipTopic; source: 'link' | 'upload';
  url: string; thumbnail?: string; durationLabel: string; description: string;
}
const BLANK: Form = { title: '', topic: 'trade', source: 'link', url: '', thumbnail: undefined, durationLabel: '', description: '' };

export default function LearnClipsPanel() {
  const { canEdit, canDelete } = useSectionPerms('cms');
  const tt = useTT();
  const [clips, setClips] = useState<LearnClip[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<Form>(BLANK);
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => watchAllLearnClips(setClips), []);

  const set = (patch: Partial<Form>) => { setMsg(''); setF((p) => ({ ...p, ...patch })); };
  const reset = () => { setEditId(null); setF(BLANK); setPct(0); };

  const startEdit = (c: LearnClip) => {
    setEditId(c.id);
    setF({ title: c.title, topic: c.topic, source: c.videoType === 'upload' ? 'upload' : 'link', url: c.videoUrl, thumbnail: c.thumbnail, durationLabel: c.durationLabel ?? '', description: c.description ?? '' });
  };

  const pickVideo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    setUploading(true); setPct(0); setMsg('');
    try {
      const url = await uploadVideo(res.assets[0].uri, `learnClips/${Date.now()}.mp4`, setPct);
      set({ url, source: 'upload' });
    } catch (e: any) { setMsg('❌ ' + (e?.message ?? String(e))); } finally { setUploading(false); }
  };

  const save = async () => {
    if (!f.title.trim()) { setMsg(tt('admLearn', 'ໃສ່ ຫົວຂໍ້')); return; }
    if (!f.url.trim()) { setMsg(tt('admLearn', 'ໃສ່ ລິ້ງ ຫຼື ອັບໂຫຼດ ວີດີໂອ')); return; }
    setSaving(true); setMsg('');
    const videoType: VideoSource = f.source === 'upload' ? 'upload' : detectSource(f.url);
    const data = { title: f.title.trim(), topic: f.topic, videoType, videoUrl: f.url.trim(), thumbnail: f.thumbnail, durationLabel: f.durationLabel.trim() || undefined, description: f.description.trim() || undefined };
    try {
      if (editId) await updateLearnClip(editId, data);
      else await createLearnClip(data);
      reset();
      setMsg(tt('admLearn', '✓ ບັນທຶກແລ້ວ'));
    } catch (e: any) { setMsg('❌ ' + (e?.message ?? String(e))); } finally { setSaving(false); }
  };

  const remove = (c: LearnClip) => {
    if (typeof confirm === 'function' && !confirm(tt('admLearn', 'ລຶບ ຄລິບ ນີ້?'))) return;
    deleteLearnClip(c.id).catch((e) => setMsg('❌ ' + (e?.message ?? String(e))));
  };

  const seed = async () => {
    try { const n = await seedLearnClipsIfEmpty(); setMsg(n ? tt('admLearn', '✓ ເພີ່ມ ຕົວຢ່າງ ') + n : tt('admLearn', 'ມີ ຄລິບ ຢູ່ແລ້ວ')); }
    catch (e: any) { setMsg('❌ ' + (e?.message ?? String(e))); }
  };

  return (
    <View>
      <Text style={styles.title}>{tt('admLearn', '📚 ຄວາມຮູ້ & ຄວາມປອດໄພ (ຄລິບ)')}</Text>
      <Text style={styles.sub}>{tt('admLearn', 'ຄລິບ ໝວດ "ຄວາມປອດໄພ" ຈະ ໂຜ່ ໃນ ໜ້າ Safety ອັດຕະໂນມັດ.')}</Text>

      {canEdit && (
        <View style={styles.card}>
          <Text style={styles.formHd}>{editId ? tt('admLearn', '✎ ແກ້ໄຂ ຄລິບ') : tt('admLearn', '➕ ເພີ່ມ ຄລິບ')}</Text>

          <Text style={styles.lbl}>{tt('admLearn', 'ຫົວຂໍ້')}</Text>
          <TextInput value={f.title} onChangeText={(v) => set({ title: v })} style={styles.inp} placeholder={tt('admLearn', 'ເຊັ່ນ: ຕໍ່ສາຍໄຟ ໃຫ້ປອດໄພ')} placeholderTextColor="#999" />

          <Text style={styles.lbl}>{tt('admLearn', 'ໝວດ')}</Text>
          <View style={styles.seg}>
            {(['trade', 'safety'] as ClipTopic[]).map((tp) => (
              <Pressable key={tp} style={[styles.segBtn, f.topic === tp && styles.segOn]} onPress={() => set({ topic: tp })}>
                <Text style={[styles.segT, f.topic === tp && styles.segTOn]}>{TOPIC_LABEL[tp].icon} {tt('admLearn', TOPIC_LABEL[tp].lao)}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.lbl}>{tt('admLearn', 'ແຫຼ່ງ ວີດີໂອ')}</Text>
          <View style={styles.seg}>
            <Pressable style={[styles.segBtn, f.source === 'link' && styles.segOn]} onPress={() => set({ source: 'link', url: f.source === 'link' ? f.url : '' })}>
              <Text style={[styles.segT, f.source === 'link' && styles.segTOn]}>{tt('admLearn', '🔗 ລິ້ງ')}</Text>
            </Pressable>
            <Pressable style={[styles.segBtn, f.source === 'upload' && styles.segOn]} onPress={() => set({ source: 'upload', url: f.source === 'upload' ? f.url : '' })}>
              <Text style={[styles.segT, f.source === 'upload' && styles.segTOn]}>{tt('admLearn', '⬆ ອັບໂຫຼດ')}</Text>
            </Pressable>
          </View>

          {f.source === 'link' ? (
            <TextInput value={f.url} onChangeText={(v) => set({ url: v })} style={styles.inp} placeholder={tt('admLearn', 'https://youtu.be/…  ຫຼື  fb.watch/…')} placeholderTextColor="#999" autoCapitalize="none" />
          ) : (
            <View>
              <Pressable style={[styles.upBtn, uploading && styles.btnOff]} onPress={pickVideo} disabled={uploading}>
                <Text style={styles.upT}>{uploading ? tt('admLearn', 'ກຳລັງອັບໂຫຼດ ') + pct + '%' : (f.url ? tt('admLearn', '✓ ອັບແລ້ວ — ປ່ຽນ ວີດີໂອ') : tt('admLearn', '⬆ ເລືອກ ວີດີໂອ (mp4)'))}</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.lbl}>{tt('admLearn', 'ຮູບປົກ (ບໍ່ບັງຄັບ)')}</Text>
          <PhotoPicker photos={f.thumbnail ? [f.thumbnail] : []} onChange={(urls) => set({ thumbnail: urls[0] })} pathPrefix="learnClips" mode="avatar" />

          <Text style={styles.lbl}>{tt('admLearn', 'ໄລຍະເວລາ (ບໍ່ບັງຄັບ)')}</Text>
          <TextInput value={f.durationLabel} onChangeText={(v) => set({ durationLabel: v })} style={styles.inp} placeholder="2:45" placeholderTextColor="#999" />

          <Text style={styles.lbl}>{tt('admLearn', 'ຄຳອະທິບາຍ')}</Text>
          <TextInput value={f.description} onChangeText={(v) => set({ description: v })} style={[styles.inp, styles.area]} multiline placeholder={tt('admLearn', 'ອະທິບາຍ ສັ້ນໆ...')} placeholderTextColor="#999" />

          {msg !== '' && <Text style={styles.msg}>{msg}</Text>}
          <View style={styles.actions}>
            <Pressable style={[styles.btn, saving && styles.btnOff]} onPress={save} disabled={saving}>
              <Text style={styles.btnT}>{saving ? tt('admLearn', 'ກຳລັງບັນທຶກ...') : tt('admLearn', '💾 ບັນທຶກ')}</Text>
            </Pressable>
            {editId && <Pressable style={styles.cancel} onPress={reset}><Text style={styles.cancelT}>{tt('admLearn', 'ຍົກເລີກ')}</Text></Pressable>}
          </View>
        </View>
      )}

      <View style={styles.listHd}>
        <Text style={styles.listTitle}>{tt('admLearn', 'ຄລິບ ທັງໝົດ')} ({clips.length})</Text>
        {canEdit && clips.length === 0 && (
          <Pressable style={styles.seedBtn} onPress={seed}><Text style={styles.seedT}>{tt('admLearn', '+ ຕົວຢ່າງ')}</Text></Pressable>
        )}
      </View>
      {clips.map((c) => (
        <View key={c.id} style={styles.rowItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle} numberOfLines={1}>{TOPIC_LABEL[c.topic].icon} {c.title}</Text>
            <Text style={styles.itemMeta}>{SOURCE_LABEL[c.videoType]}{c.durationLabel ? ` · ${c.durationLabel}` : ''}{c.active === false ? ' · ' + tt('admLearn', 'ປິດ') : ''}</Text>
          </View>
          {canEdit && <Pressable onPress={() => startEdit(c)} style={styles.iconBtn}><Text style={styles.icon}>✎</Text></Pressable>}
          {canDelete && <Pressable onPress={() => remove(c)} style={styles.iconBtn}><Text style={[styles.icon, { color: '#dc2626' }]}>🗑</Text></Pressable>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  card: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, marginBottom: 16, backgroundColor: '#fff' },
  formHd: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 6 },
  lbl: { fontSize: 12, color: '#374151', fontWeight: '600', marginTop: 12, marginBottom: 5 },
  inp: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 9, padding: 10, fontSize: 14, color: '#111', backgroundColor: '#fff' },
  area: { minHeight: 66, textAlignVertical: 'top' },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  segOn: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  segT: { fontSize: 12, color: '#475569', fontWeight: '600' },
  segTOn: { color: '#fff' },
  upBtn: { borderWidth: 2, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 10, padding: 16, alignItems: 'center' },
  upT: { fontSize: 13, color: '#0066CC', fontWeight: '600' },
  msg: { fontSize: 12, color: '#374151', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' },
  btn: { backgroundColor: '#0066CC', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center' },
  btnOff: { opacity: 0.6 },
  btnT: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancel: { paddingVertical: 12, paddingHorizontal: 14 },
  cancelT: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  listHd: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  listTitle: { fontSize: 14, fontWeight: '700', color: '#111' },
  seedBtn: { backgroundColor: '#EAF2FB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  seedT: { color: '#0066CC', fontSize: 12, fontWeight: '700' },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 11, marginBottom: 8 },
  itemTitle: { fontSize: 13, fontWeight: '600', color: '#111' },
  itemMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  iconBtn: { padding: 6 },
  icon: { fontSize: 15, color: '#0066CC' },
});
