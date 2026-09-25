import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadImage } from '@/lib/storage';
import { useTT } from '@/lib/i18n';

export interface PhotoPickerProps {
  photos: string[];
  onChange: (urls: string[]) => void;
  pathPrefix: string; // e.g. `jobs/<uid>`
  max?: number;
  mode?: 'grid' | 'avatar' | 'avatarCompact' | 'avatarButtons' | 'avatarIcons';
  /** crop aspect ratio (native only), e.g. [1,1] for avatars */
  aspect?: [number, number];
  /** avatarCompact diameter (default 64) */
  size?: number;
}

export default function PhotoPicker({
  photos,
  onChange,
  pathPrefix,
  max = 5,
  mode = 'grid',
  aspect,
  size = 64,
}: PhotoPickerProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const tt = useTT();

  const isAvatar = mode === 'avatar' || mode === 'avatarCompact' || mode === 'avatarButtons' || mode === 'avatarIcons';

  // pick from camera or library, with crop/scale before upload
  const pick = async (source: 'camera' | 'library') => {
    setError('');
    try {
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true, // crop/scale (native)
        ...(aspect ? { aspect } : {}),
      };
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError(tt('photo','ບໍ່ໄດ້ສິດ ກ້ອງ'));
          return;
        }
        result = await ImagePicker.launchCameraAsync(opts);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(opts);
      }
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(true);
      const uri = result.assets[0].uri;
      const filename = `${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`;
      const url = await uploadImage(uri, `${pathPrefix}/${filename}`);
      if (isAvatar) onChange([url]);
      else onChange([...photos, url]);
    } catch (e: any) {
      console.error('PhotoPicker:', e);
      setError(e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  };

  const remove = (url: string) => onChange(photos.filter((p) => p !== url));

  // avatar with explicit camera / gallery buttons (admin editor pattern)
  if (mode === 'avatarButtons') {
    const a = photos[0];
    return (
      <View style={styles.abRow}>
        {a ? (
          <Image source={{ uri: a }} style={styles.abAvatar} />
        ) : (
          <View style={[styles.abAvatar, styles.avatarEmpty]}><Text style={{ fontSize: 28 }}>👤</Text></View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.abBtns}>
            <Pressable style={styles.abBtn} onPress={() => pick('camera')} disabled={uploading}>
              <Text style={styles.abBtnText}>{tt('photo','📷 ກ້ອງ')}</Text>
            </Pressable>
            <Pressable style={styles.abBtn} onPress={() => pick('library')} disabled={uploading}>
              <Text style={styles.abBtnText}>{tt('photo','🖼️ ແກເຣີຣີ')}</Text>
            </Pressable>
          </View>
          <Text style={styles.cropNote}>{uploading ? tt('photo','ກຳລັງອັບ...') : tt('photo','✂️ ຕັດ/ປັບສ່ວນ + auto-scale ກ່ອນ upload')}</Text>
          {error !== '' && <Text style={styles.error}>{error}</Text>}
        </View>
      </View>
    );
  }

  // compact: small avatar + two icon-only buttons (space-saving, fits a column)
  if (mode === 'avatarIcons') {
    const a = photos[0];
    return (
      <View style={styles.aiWrap}>
        {a ? (
          <Image source={{ uri: a }} style={styles.aiAvatar} />
        ) : (
          <View style={[styles.aiAvatar, styles.avatarEmpty]}><Text style={{ fontSize: 20 }}>👤</Text></View>
        )}
        <View style={styles.aiBtns}>
          <Pressable style={styles.aiBtn} onPress={() => pick('camera')} disabled={uploading}><Text style={styles.aiIcon}>📷</Text></Pressable>
          <Pressable style={styles.aiBtn} onPress={() => pick('library')} disabled={uploading}><Text style={styles.aiIcon}>🖼️</Text></Pressable>
        </View>
        {uploading && <Text style={styles.aiNote}>…</Text>}
        {error !== '' && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  if (mode === 'avatarCompact') {
    const a = photos[0];
    const d = size;
    return (
      <Pressable style={{ width: d, height: d, position: 'relative' }} onPress={() => pick('library')} disabled={uploading}>
        {a ? (
          <Image source={{ uri: a }} style={{ width: d, height: d, borderRadius: d / 2, borderWidth: 2, borderColor: '#e5e7eb' }} />
        ) : (
          <View style={[{ width: d, height: d, borderRadius: d / 2, borderWidth: 2, borderColor: '#e5e7eb' }, styles.avatarEmpty]}>
            <Text style={{ fontSize: d * 0.34 }}>👤</Text>
          </View>
        )}
        <View style={styles.pencilBadge}>
          <Text style={styles.pencilTxt}>{uploading ? '…' : '✏️'}</Text>
        </View>
      </Pressable>
    );
  }

  if (mode === 'avatar') {
    const avatar = photos[0];
    return (
      <View style={styles.avatarRow}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Text style={{ fontSize: 28 }}>👤</Text>
          </View>
        )}
        <View style={styles.abBtns}>
          <Pressable style={styles.avatarBtn} onPress={() => pick('camera')} disabled={uploading}>
            <Text style={styles.avatarBtnText}>{tt('photo','📷 ກ້ອງ')}</Text>
          </Pressable>
          <Pressable style={styles.avatarBtn} onPress={() => pick('library')} disabled={uploading}>
            <Text style={styles.avatarBtnText}>🖼️</Text>
          </Pressable>
        </View>
        {error !== '' && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.grid}>
        {photos.map((url) => (
          <View key={url} style={styles.thumbWrap}>
            <Image source={{ uri: url }} style={styles.thumb} />
            <Pressable style={styles.removeBtn} onPress={() => remove(url)}>
              <Text style={styles.removeText}>✕</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < max && (
          <>
            <Pressable style={styles.addBox} onPress={() => pick('camera')} disabled={uploading}>
              <Text style={styles.addIcon}>{uploading ? '⏳' : '📷'}</Text>
              <Text style={styles.addText}>{tt('photo','ກ້ອງ')}</Text>
            </Pressable>
            <Pressable style={styles.addBox} onPress={() => pick('library')} disabled={uploading}>
              <Text style={styles.addIcon}>{uploading ? '⏳' : '🖼️'}</Text>
              <Text style={styles.addText}>{tt('photo','ແກເຣີຣີ')}</Text>
            </Pressable>
          </>
        )}
      </View>
      <Text style={styles.note}>{tt('photo','✂️ ຕັດ/ປັບສ່ວນ + ບີບ auto ກ່ອນ upload')}</Text>
      {error !== '' && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 80, height: 80, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addBox: {
    width: 80,
    height: 80,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
  },
  addIcon: { fontSize: 24, color: '#9ca3af' },
  addText: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  note: { fontSize: 12, color: '#10b981', marginTop: 8 },
  error: { fontSize: 12, color: '#c00', marginTop: 6 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: '#e5e7eb' },
  avatarEmpty: { backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  avatarBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#EAF2FB',
    borderWidth: 1,
    borderColor: '#0066CC',
    borderRadius: 8,
  },
  avatarBtnText: { color: '#0066CC', fontSize: 13, fontWeight: '600' },
  avatarCWrap: { width: 64, height: 64, position: 'relative' },
  avatarC: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#e5e7eb' },
  pencilBadge: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  pencilTxt: { fontSize: 12 },
  // avatarButtons mode
  abRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  abAvatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: '#e5e7eb' },
  abBtns: { flexDirection: 'row', gap: 8 },
  abBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#0066CC', borderRadius: 8 },
  abBtnText: { color: '#0066CC', fontSize: 12, fontWeight: '600' },
  cropNote: { fontSize: 12, color: '#16a34a', marginTop: 6 },
  // avatarIcons mode (compact)
  aiWrap: { alignItems: 'center', gap: 6 },
  aiAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#e5e7eb' },
  aiBtns: { flexDirection: 'row', gap: 6 },
  aiBtn: { width: 34, height: 30, borderRadius: 8, backgroundColor: '#EAF2FB', borderWidth: 1, borderColor: '#0066CC', alignItems: 'center', justifyContent: 'center' },
  aiIcon: { fontSize: 15 },
  aiNote: { fontSize: 12, color: '#16a34a' },
});
