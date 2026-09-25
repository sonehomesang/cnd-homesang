import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { type Conversation, isConversationUnread, watchMyConversations } from '@/lib/chat';
import { ttStatic, useTT } from '@/lib/i18n';
import AppFooter from '@/components/AppFooter';
import BackButton from '@/components/BackButton';

function timeAgo(ms?: number): string {
  if (!ms) return '';
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return ttStatic('time', 'ຫາກໍ່');
  if (m < 60) return `${m} ${ttStatic('time', 'ນທ')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${ttStatic('time', 'ຊມ')}`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ${ttStatic('time', 'ມື້')}`;
  return new Date(ms).toLocaleDateString('lo-LA', { day: '2-digit', month: '2-digit' });
}

export default function MessagesScreen() {
  const { fbUser, loading } = useAuth();
  const [convos, setConvos] = useState<Conversation[]>([]);
  const tt = useTT();

  useEffect(() => {
    if (!loading && !fbUser) router.replace('/sign-in' as any);
  }, [fbUser, loading]);

  useEffect(() => {
    if (!fbUser) return;
    return watchMyConversations(fbUser.uid, setConvos);
  }, [fbUser]);

  if (loading || !fbUser) {
    return <View style={styles.center}><Text>{tt('messages', 'ກຳລັງໂຫຼດ...')}</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.wrap}>
        <Text style={styles.title}>{tt('messages', '💬 ຂໍ້ຄວາມ')}</Text>
        {convos.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>{tt('messages', 'ຍັງບໍ່ມີການສົນທະນາ')}</Text>
            <Text style={styles.emptyHint}>{tt('messages', 'ເລີ່ມຈາກໜ້າງານ ຫຼື ໂປຣໄຟລ໌ຊ່າງ')}</Text>
          </View>
        ) : (
          convos.map((c) => {
            const other = c.participants.find((p) => p !== fbUser.uid) ?? '';
            const name = c.names[other] ?? tt('messages', 'ຜູ້ໃຊ້');
            const img = c.images[other];
            const mine = c.lastSenderId === fbUser.uid;
            const unread = isConversationUnread(c, fbUser.uid);
            return (
              <Pressable key={c.id} style={styles.conv} onPress={() => router.push(`/chat/${c.id}` as any)}>
                {img ? (
                  <Image source={{ uri: img }} style={styles.av} />
                ) : (
                  <View style={[styles.av, styles.avEmpty]}><Text style={{ fontSize: 20 }}>🙂</Text></View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.cname, unread && styles.cnameUnread]} numberOfLines={1}>{name}</Text>
                  {!!c.lastMessage && (
                    <Text style={[styles.cmsg, unread && styles.cmsgUnread]} numberOfLines={1}>
                      {mine ? tt('messages', 'ເຈົ້າ: ') : ''}{c.lastMessage}
                    </Text>
                  )}
                  {!!c.jobTitle && <Text style={styles.ctx} numberOfLines={1}>📋 {c.jobTitle}</Text>}
                </View>
                <View style={styles.rightCol}>
                  <Text style={styles.ctime}>{timeAgo(c.lastAt)}</Text>
                  {unread && <View style={styles.dot} />}
                </View>
              </Pressable>
            );
          })
        )}
        <BackButton />
      </View>
      <View style={{ width: '100%', marginHorizontal: -8, marginTop: 16, marginBottom: -60 }}><AppFooter /></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { padding: 8, paddingBottom: 60, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 600 },
  center: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 15, fontWeight: 'bold', color: '#111', marginBottom: 14 },
  empty: { backgroundColor: '#fff', padding: 32, borderRadius: 12, alignItems: 'center' },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 14, color: '#374151', marginTop: 8, fontWeight: '600' },
  emptyHint: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  conv: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f3', borderRadius: 12, padding: 12, marginBottom: 8 },
  av: { width: 46, height: 46, borderRadius: 23 },
  avEmpty: { backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' },
  cname: { fontSize: 14, fontWeight: '600', color: '#111' },
  cnameUnread: { fontWeight: '800' },
  cmsg: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cmsgUnread: { color: '#111', fontWeight: '700' },
  ctx: { fontSize: 12, color: '#1e40af', marginTop: 2 },
  rightCol: { alignSelf: 'flex-start', alignItems: 'flex-end', gap: 6 },
  ctime: { fontSize: 12, color: '#9ca3af' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0066CC' },
});
