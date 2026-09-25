import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { type FavType, toggleFavorite, watchFavorite } from '@/lib/favorites';

export default function FavoriteButton({
  type,
  targetId,
  meta,
  size = 22,
}: {
  type: FavType;
  targetId: string;
  meta?: { name?: string; image?: string };
  size?: number;
}) {
  const { fbUser } = useAuth();
  const [fav, setFav] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fbUser) {
      setFav(false);
      return;
    }
    return watchFavorite(fbUser.uid, type, targetId, setFav);
  }, [fbUser, type, targetId]);

  const onPress = async () => {
    if (!fbUser) {
      router.push('/sign-in' as any);
      return;
    }
    setBusy(true);
    try {
      await toggleFavorite(fbUser.uid, type, targetId, meta);
    } catch (e) {
      console.error('toggleFavorite:', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable onPress={onPress} disabled={busy} hitSlop={8} style={styles.btn}>
      <Text style={{ fontSize: size }}>{fav ? '❤️' : '🤍'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.9)' },
});
