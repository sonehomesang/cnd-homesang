import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { type CmsContent, DEFAULT_CMS, watchCms } from '@/lib/cms';
import { useTT } from '@/lib/i18n';
import Brand from '@/components/Brand';
import { colors, font, space } from '@/lib/theme';

const W = 224;

export default function AppDrawer({
  visible,
  onClose,
  logoUrl,
}: {
  visible: boolean;
  onClose: () => void;
  isAdmin?: boolean; // accepted for API compatibility; admin entry lives on the profile screen now
  logoUrl?: string;
}) {
  const tt = useTT();
  const [cms, setCms] = useState<CmsContent>(DEFAULT_CMS);
  const x = useRef(new Animated.Value(-W)).current;

  useEffect(() => watchCms(setCms), []);
  useEffect(() => {
    Animated.timing(x, { toValue: visible ? 0 : -W, duration: 200, useNativeDriver: true }).start();
  }, [visible, x]);

  const go = (url: string) => {
    onClose();
    setTimeout(() => router.push(url as any), 60);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.panel, { transform: [{ translateX: x }] }]}>
        <View style={styles.head}>
          <Brand logoUrl={logoUrl} size={30} />
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingVertical: 6 }}>
          <Item icon="🏠" label={tt('drawer', 'ໜ້າຫຼັກ')} onPress={() => go('/')} />
          <Item icon="🛵" label={tt('drawer', 'ໄຮເດີ້ ຈັດສົ່ງ (ຫາລາຍໄດ້)')} onPress={() => go('/rider')} accent />
          <Item icon="🤝" label={tt('drawer', 'ນາຍໜ້າ (ແຊຣ໌ ຫາເງິນ)')} onPress={() => go('/broker')} accent />
          <Item icon="🎬" label={tt('drawer', 'ວິດີໂອ ຂາຍ')} onPress={() => go('/reels')} />
          {cms.footerLinks.map((l) => (
            <Item key={l.url} icon="📄" label={l.label} onPress={() => go(l.url)} />
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function Item({ icon, label, onPress, accent }: { icon: string; label: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable style={styles.item} onPress={onPress}>
      <Text style={styles.itemIcon}>{icon}</Text>
      <Text style={[styles.itemLabel, accent && styles.itemAccent]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  // height wraps the menu items (capped so it never exceeds the screen), width fits the longest row
  panel: { position: 'absolute', top: 0, left: 0, maxHeight: '88%', width: W, backgroundColor: colors.surface, borderBottomRightRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 2, height: 0 }, elevation: 8 },
  scroll: { flexShrink: 1 },
  head: { paddingHorizontal: space.lg, paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemIcon: { fontSize: 15, width: 22, textAlign: 'center' },
  itemLabel: { fontSize: font.md, color: colors.text },
  itemAccent: { color: colors.primary, fontWeight: '700' },
});
