import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { updateUserProfile } from '@/lib/users';
import { useTT } from '@/lib/i18n';
import PhotoPicker from '@/components/PhotoPicker';
import { colors, font, radius, shadow, space } from '@/lib/theme';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

export default function PortfolioScreen() {
  const { fbUser, profile } = useAuth();
  const tt = useTT();
  const [photos, setPhotos] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = (profile as any)?.portfolio;
    if (Array.isArray(p)) setPhotos(p);
  }, [profile]);

  const persist = async (urls: string[]) => {
    setPhotos(urls);
    setSaved(false);
    setError('');
    if (!fbUser) return;
    try {
      await updateUserProfile(fbUser.uid, { portfolio: urls });
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  if (!fbUser) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{tt('portfolio','ກະລຸນາເຂົ້າສູ່ລະບົບ')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{tt('portfolio','ຜົນງານ ຂອງຂ້ອຍ')}</Text>
        <Text style={styles.sub}>
          {tt('portfolio','ເພີ່ມຮູບຜົນງານ ທີ່ຜ່ານມາ ເພື່ອໃຫ້ລູກຄ້າ ເຫັນ ແລະ ໄວ້ໃຈ. ຮູບຈະສະແດງ ໃນໂປຣໄຟລ໌ສາທາລະນະ.')}
        </Text>

        <View style={styles.card}>
          <PhotoPicker photos={photos} onChange={persist} pathPrefix={`portfolio/${fbUser.uid}`} max={12} />
        </View>

        {saved && <Text style={styles.saved}>{tt('portfolio','✓ ບັນທຶກແລ້ວ (')}{photos.length}{tt('portfolio',' ຮູບ)')}</Text>}
        {error !== '' && <Text style={styles.error}>❌ {error}</Text>}

        <BackButton />
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 640 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  muted: { color: colors.text3 },
  title: { fontSize: font.xl, fontWeight: '800', color: colors.text },
  sub: { fontSize: font.sm, color: colors.text2, marginTop: 6, lineHeight: 22 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, marginTop: space.lg, ...shadow.card },
  saved: { color: colors.accent, fontSize: font.sm, fontWeight: '600', marginTop: space.md },
  error: { color: colors.error, fontSize: font.sm, marginTop: space.md },
});
