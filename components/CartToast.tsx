import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useCartToastSignal } from '@/lib/cart-context';
import { useTT } from '@/lib/i18n';
import { colors, radius, shadow } from '@/lib/theme';

/**
 * App-wide "✓ added to cart" toast. Rendered once at the root; shows whenever
 * addItem() fires (product detail, reels, quick-add on a card…), so every
 * add-to-cart gets the same clear success feedback. Tap → go to cart.
 * Reads the signal from a globalThis bus (see cart-context) so it works even
 * when Metro's web export duplicates the module across chunks.
 */
export default function CartToast() {
  const sig = useCartToastSignal();
  const tt = useTT();
  const [name, setName] = useState<string | null>(null);
  const timer = useRef<any>(null);
  useEffect(() => {
    if (!sig) return;
    setName(sig.name);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setName(null), 2500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [sig?.at]);
  if (!name) return null;
  return (
    <Pressable style={styles.toast} onPress={() => { setName(null); router.push('/cart' as any); }}>
      <Text style={styles.tx} numberOfLines={1}>✅ {tt('cart', 'ເພີ່ມ ໃສ່ ຕະກ້າ ແລ້ວ')} · {name}</Text>
      <Text style={styles.go}>{tt('cart', 'ເບິ່ງ ຕະກ້າ ›')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    // `fixed` on web lifts it above the navigator's stacking context (plain
    // absolute renders BEHIND the screen content). Native falls back to absolute.
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
    left: 12, right: 12, bottom: 78, zIndex: 9999,
    backgroundColor: '#1f2937', borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    maxWidth: 520, alignSelf: 'center', ...shadow.card, elevation: 24,
  },
  tx: { color: colors.white, fontSize: 14, fontWeight: '800', flexShrink: 1 },
  go: { color: '#fdba74', fontSize: 13, fontWeight: '800' },
});
