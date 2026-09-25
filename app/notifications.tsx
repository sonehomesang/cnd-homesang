import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import {
  type AppNotification,
  markAllRead,
  markRead,
  watchMyNotifications,
} from '@/lib/notifications';
import { ttStatic, useTT } from '@/lib/i18n';
import { colors, font, radius, shadow } from '@/lib/theme';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

const ICON: Record<string, string> = {
  bid: '📋',
  bid_accepted: '🎉',
  message: '💬',
  comment: '💭',
  workflow: '🛠️',
  like: '❤️',
};

function timeAgo(ms: number): string {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return ttStatic('time', 'ຫາກໍ່');
  if (m < 60) return `${m} ${ttStatic('time', 'ນທ')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${ttStatic('time', 'ຊມ')}`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ${ttStatic('time', 'ມື້')}`;
  return new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit' });
}

export default function NotificationsScreen() {
  const { fbUser, loading } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const tt = useTT();

  useEffect(() => {
    if (!loading && !fbUser) router.replace('/sign-in' as any);
  }, [fbUser, loading]);

  useEffect(() => {
    if (!fbUser) return;
    return watchMyNotifications(fbUser.uid, setItems);
  }, [fbUser]);

  // mark everything read shortly after the screen is viewed
  useEffect(() => {
    const unread = items.filter((n) => !n.read).map((n) => n.id);
    if (unread.length === 0) return;
    const t = setTimeout(() => markAllRead(unread), 900);
    return () => clearTimeout(t);
  }, [items]);

  const open = (n: AppNotification) => {
    if (!n.read) markRead(n.id);
    if (n.link) router.push(n.link as any);
  };

  if (loading || !fbUser) {
    return <View style={styles.center}><Text style={styles.muted}>{tt('notifications', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{tt('notifications', '🔔 ການແຈ້ງເຕືອນ')}</Text>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>{tt('notifications', 'ຍັງບໍ່ມີການແຈ້ງເຕືອນ')}</Text>
          </View>
        ) : (
          items.map((n) => (
            <Pressable key={n.id} style={[styles.row, !n.read && styles.rowUnread]} onPress={() => open(n)}>
              <Text style={styles.icon}>{ICON[n.type] ?? '🔔'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rTitle}>{n.title}</Text>
                {!!n.body && <Text style={styles.rBody} numberOfLines={2}>{n.body}</Text>}
                <Text style={styles.rTime}>{timeAgo(n.createdAt)}</Text>
              </View>
              {!n.read && <View style={styles.dot} />}
            </Pressable>
          ))
        )}
        <BackButton />
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 600 },
  center: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.text3 },
  title: { fontSize: font.xl, fontWeight: '700', color: colors.text, marginBottom: 14 },
  empty: { backgroundColor: colors.surface, padding: 32, borderRadius: radius.lg, alignItems: 'center', ...shadow.card },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: font.sm, color: colors.text2, marginTop: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: 8, ...shadow.card },
  rowUnread: { backgroundColor: '#EAF2FB' },
  icon: { fontSize: 22 },
  rTitle: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  rBody: { fontSize: font.sm, color: colors.text2, marginTop: 2 },
  rTime: { fontSize: font.xs, color: colors.text3, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
