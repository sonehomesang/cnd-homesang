import { Pressable, StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTT } from '@/lib/i18n';
import { colors, font, shadow } from '@/lib/theme';

/**
 * Standard professional "back" button for the bottom of content pages.
 * A centered rounded pill (arrow + label) — replaces the old bare grey
 * "← ກັບຄືນ" text links so the affordance looks the same everywhere.
 * Falls back to the home tab when there is no navigation history.
 */
export default function BackButton({ label, onPress }: { label?: string; onPress?: () => void }) {
  const tt = useTT();
  return (
    <Pressable
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.push('/' as any)))}
      accessibilityRole="button">
      <Ionicons name="arrow-back" size={16} color={colors.primary} />
      <Text style={styles.txt}>{label ?? tt('common', 'ກັບຄືນ')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    alignSelf: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 999, paddingHorizontal: 22, paddingVertical: 11,
    marginTop: 18, marginBottom: 4,
    ...shadow.card,
  },
  pressed: { backgroundColor: colors.surface2 },
  txt: { color: colors.primary, fontSize: font.sm, fontWeight: '700' },
});
