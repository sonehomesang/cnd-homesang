import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import PhotoPicker from '@/components/PhotoPicker';
import {
  type Banner,
  createBanner,
  deleteBanner,
  seedBannersIfEmpty,
  updateBanner,
  watchAllBanners,
} from '@/lib/banners';
import { useTT } from '@/lib/i18n';
import { useSectionPerms } from '@/lib/permissions-context';

export default function BannersPanel() {
  const { canCreate, canEdit, canDelete } = useSectionPerms('banners');
  const tt = useTT();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [img, setImg] = useState<string[]>([]);
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    seedBannersIfEmpty().catch(() => {});
    return watchAllBanners(setBanners);
  }, []);

  const add = async () => {
    if (!img[0]) return;
    setSaving(true);
    try {
      await createBanner({
        title: title || undefined,
        subtitle: subtitle || undefined,
        image: img[0],
        link: link || undefined,
        active: true,
        order: banners.length + 1,
      });
      setTitle(''); setSubtitle(''); setImg([]); setLink('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>🖼️ {tt('admBanners','ປ້າຍ')} · Banners</Text>
      <Text style={styles.sub}>{tt('admBanners','ປ້າຍໂປຣໂມຊັນ ສະແດງໜ້າຫຼັກ + landing')}</Text>

      {canCreate && (
      <View style={styles.form}>
        <Text style={styles.label}>{tt('admBanners','ຮູບປ້າຍ *')}</Text>
        <PhotoPicker photos={img} onChange={setImg} pathPrefix="banners/admin" max={1} />
        <TextInput value={title} onChangeText={setTitle} placeholder={tt('admBanners','ຫົວຂໍ້')} placeholderTextColor="#999" style={styles.input} />
        <TextInput value={subtitle} onChangeText={setSubtitle} placeholder={tt('admBanners','ຄຳບັນຍາຍ')} placeholderTextColor="#999" style={styles.input} />
        <TextInput value={link} onChangeText={setLink} placeholder={tt('admBanners','ລິ້ງ (ເຊັ່ນ /(tabs)/shop)')} placeholderTextColor="#999" style={styles.input} />
        <Pressable style={[styles.btn, (!img[0] || saving) && styles.btnOff]} onPress={add} disabled={!img[0] || saving}>
          <Text style={styles.btnText}>{saving ? '...' : tt('admBanners','＋ ເພີ່ມປ້າຍ')}</Text>
        </Pressable>
      </View>
      )}

      {banners.map((b) => (
        <View key={b.id} style={styles.row}>
          <Image source={{ uri: b.image }} style={styles.thumb} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bTitle}>{b.title || tt('admBanners','(ບໍ່ມີຫົວຂໍ້)')}</Text>
            <Text style={styles.bSub} numberOfLines={1}>{b.subtitle || b.link || '—'}</Text>
            <Text style={[styles.badge, b.active ? styles.on : styles.off]}>{b.active ? tt('admBanners','ເປີດ') : tt('admBanners','ປິດ')}</Text>
          </View>
          <View style={styles.actions}>
            {canEdit && <Pressable style={[styles.mini, { backgroundColor: b.active ? '#16a34a' : '#64748b' }]} onPress={() => updateBanner(b.id, { active: !b.active })}>
              <Text style={styles.miniText}>{b.active ? tt('admBanners','ເປີດ') : tt('admBanners','ປິດ')}</Text>
            </Pressable>}
            {canDelete && <Pressable style={[styles.mini, { backgroundColor: '#dc2626' }]} onPress={() => deleteBanner(b.id)}>
              <Text style={styles.miniText}>{tt('admBanners','ລົບ')}</Text>
            </Pressable>}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 14 },
  form: { borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 12, marginBottom: 16, gap: 8 },
  label: { fontSize: 12, color: '#6b7280' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 14, color: '#111' },
  btn: { backgroundColor: '#0066CC', borderRadius: 8, padding: 12, alignItems: 'center' },
  btnOff: { backgroundColor: '#A8CAEE' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 10, padding: 10, marginBottom: 8 },
  thumb: { width: 80, height: 44, borderRadius: 6, backgroundColor: '#f3f4f6' },
  bTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  bSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  badge: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', marginTop: 4, alignSelf: 'flex-start' },
  on: { backgroundColor: '#d1fae5', color: '#065f46' },
  off: { backgroundColor: '#fee2e2', color: '#991b1b' },
  actions: { gap: 4 },
  mini: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  miniText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
